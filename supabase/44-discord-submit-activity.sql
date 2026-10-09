-- ============================================
-- Migration 44: Submit an activity on behalf of a linked Discord user
-- ============================================
-- Single entrypoint the Discord bot path calls (through an Edge Function that
-- holds the service role + a bot secret — see the bot repo). This is the ONE place
-- "is this submission shaped correctly?" is answered, reusing the exact same point
-- math and schedule rules as the web app:
--   * identity        → discord_links (must be verifiably linked; see migration 43)
--   * week → date     → Monday 00:00 UTC of the week containing p_week_date, matching
--                       the web UI (getWeekStart) and the activities trigger (42)
--   * participation   → server_activity_settings.participation_mode: NULL position,
--                       fixed participation_points
--   * ranked          → position required (1..500); points via calculate_activity_points
--   * schedule/date   → NOT re-implemented here: the BEFORE trigger from migration 42
--                       (check_activity_matches_season_schedule) enforces Monday-00:00,
--                       no-future-week, a season covering the date, and the activity
--                       being scheduled that week. We catch its exception → clean reject.
--
-- Returns JSONB: { ok: true, action, points, activity_type, week_start } on success,
-- or { ok: false, reason, message } on any rejection — never raises to the caller.
--
-- v1 scope: self-submission only (one discord id → one activity). Admin-on-behalf
-- and batch are deliberately out of scope; this signature leaves room to add them
-- later as separate, admin-gated paths.
--
-- Depends on: 42 (activities schedule trigger), 43 (discord_links),
--             24 (calculate_activity_points), 10/24 (server_activity_settings).
-- ============================================

CREATE OR REPLACE FUNCTION submit_activity_for_discord(
  p_discord_id TEXT,
  p_activity   TEXT,
  p_rank       INTEGER,     -- nullable; ignored for participation activities
  p_week_date  DATE         -- any date within the target week
)
RETURNS JSONB AS $$
DECLARE
  v_user_id    UUID;
  v_server_id  UUID;
  v_week_start TIMESTAMPTZ;
  v_participation BOOLEAN := FALSE;
  v_part_points   INTEGER := 0;
  v_position   INTEGER;
  v_points     INTEGER;
  v_action     TEXT;
  v_existing   UUID;
BEGIN
  -- 1. identity --------------------------------------------------------------
  SELECT dl.user_id, up.server_id
    INTO v_user_id, v_server_id
  FROM public.discord_links dl
  JOIN public.user_profiles up ON up.id = dl.user_id
  WHERE dl.discord_user_id = p_discord_id;

  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_linked',
      'message', 'This Discord account is not linked to an Activity Tracker account.');
  END IF;
  IF v_server_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'no_server',
      'message', 'Your account is not attached to a server.');
  END IF;

  -- 2. week → canonical Monday 00:00 UTC (same rule as the app + trigger 42) --
  v_week_start := date_trunc('week', p_week_date::timestamptz AT TIME ZONE 'UTC') AT TIME ZONE 'UTC';

  -- 3. participation vs ranked ----------------------------------------------
  SELECT participation_mode, participation_points
    INTO v_participation, v_part_points
  FROM public.server_activity_settings
  WHERE server_id = v_server_id AND activity_type = p_activity;

  IF COALESCE(v_participation, FALSE) THEN
    v_position := NULL;
    v_points   := v_part_points;
  ELSE
    IF p_rank IS NULL THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'rank_required',
        'message', format('%s needs a rank (1-500).', p_activity));
    END IF;
    IF p_rank < 1 OR p_rank > 500 THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'rank_out_of_range',
        'message', 'Rank must be between 1 and 500.');
    END IF;
    v_position := p_rank;
    v_points   := public.calculate_activity_points(v_server_id, p_activity, p_rank);
  END IF;

  -- 4. upsert (trigger 42 validates season/date/schedule; its raise → reject) -
  SELECT id INTO v_existing
  FROM public.activities
  WHERE user_id = v_user_id AND activity_type = p_activity AND date = v_week_start;
  v_action := CASE WHEN v_existing IS NULL THEN 'inserted' ELSE 'updated' END;

  INSERT INTO public.activities (user_id, activity_type, position, points, date)
  VALUES (v_user_id, p_activity, v_position, v_points, v_week_start)
  ON CONFLICT (user_id, activity_type, date)
    DO UPDATE SET position = EXCLUDED.position,
                  points   = EXCLUDED.points,
                  updated_at = NOW();

  RETURN jsonb_build_object(
    'ok', true,
    'action', v_action,
    'activity_type', p_activity,
    'position', v_position,
    'points', v_points,
    'week_start', to_char(v_week_start AT TIME ZONE 'UTC', 'YYYY-MM-DD')
  );

EXCEPTION
  -- The schedule trigger (42) and any CHECK raise ERRCODE 23514; surface its
  -- human message as a clean rejection rather than a 500 to the bot.
  WHEN check_violation THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_for_week', 'message', SQLERRM);
  WHEN others THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'error', 'message', SQLERRM);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Only the service role (used by the Edge Function) may call this. NOT anon/authenticated:
-- the web app writes activities directly under its own auth.uid(); this path is the bot's.
REVOKE ALL ON FUNCTION submit_activity_for_discord(TEXT, TEXT, INTEGER, DATE) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION submit_activity_for_discord(TEXT, TEXT, INTEGER, DATE) TO service_role;

COMMENT ON FUNCTION submit_activity_for_discord IS
  'Bot submission entrypoint: resolve a linked Discord id → user, validate + score an activity for the given week, upsert into activities. Returns JSONB {ok,...}. service_role only.';

-- ============================================
-- Read helpers for Discord slash-command autocomplete (service_role only).
-- open_weeks: the weeks of the season covering `now` the user can submit for.
-- week_activities: activity types offered in a given week (+ 'legion', implicit).
-- ============================================

CREATE OR REPLACE FUNCTION discord_open_weeks(p_discord_id TEXT)
RETURNS JSONB AS $$
DECLARE
  v_user_id   UUID;
  v_season    RECORD;
  v_result    JSONB := '[]'::jsonb;
  v_now_week  DATE;
  v_idx       INT;
BEGIN
  SELECT user_id INTO v_user_id FROM public.discord_links WHERE discord_user_id = p_discord_id;
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_linked');
  END IF;

  v_now_week := (date_trunc('week', now() AT TIME ZONE 'UTC'))::date;

  SELECT id, start_date, end_date INTO v_season
  FROM public.activity_seasons
  WHERE v_now_week BETWEEN start_date AND end_date;

  IF v_season.id IS NULL THEN
    RETURN jsonb_build_object('ok', true, 'weeks', '[]'::jsonb);
  END IF;

  -- weeks from season start through the current week (no future weeks)
  FOR v_idx IN 1 .. (((v_now_week - v_season.start_date) / 7) + 1) LOOP
    v_result := v_result || jsonb_build_object(
      'week_index', v_idx,
      'monday', to_char(v_season.start_date + (v_idx - 1) * 7, 'YYYY-MM-DD'),
      'is_current', (v_season.start_date + (v_idx - 1) * 7) = v_now_week
    );
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'weeks', v_result);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION discord_week_activities(p_week_date DATE)
RETURNS JSONB AS $$
DECLARE
  v_season RECORD;
  v_week   DATE;
  v_idx    INT;
  v_types  TEXT[];
BEGIN
  v_week := (date_trunc('week', p_week_date::timestamptz AT TIME ZONE 'UTC'))::date;

  SELECT id, start_date INTO v_season
  FROM public.activity_seasons
  WHERE v_week BETWEEN start_date AND end_date;

  IF v_season.id IS NULL THEN
    RETURN jsonb_build_object('ok', true, 'activities', jsonb_build_array('legion'));
  END IF;

  v_idx := ((v_week - v_season.start_date) / 7) + 1;

  SELECT array_agg(activity_type ORDER BY activity_type) INTO v_types
  FROM public.season_activities
  WHERE season_id = v_season.id AND week_index = v_idx;

  -- 'legion' is implicit every week
  RETURN jsonb_build_object('ok', true,
    'activities', to_jsonb(ARRAY['legion'] || COALESCE(v_types, ARRAY[]::TEXT[])));
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION discord_open_weeks(TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION discord_week_activities(DATE) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION discord_open_weeks(TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION discord_week_activities(DATE) TO service_role;

-- ============================================
-- DONE
-- ============================================

-- ============================================
-- ROLLBACK (not executed — for reference only)
-- ============================================
-- DROP FUNCTION IF EXISTS submit_activity_for_discord(TEXT, TEXT, INTEGER, DATE);
-- DROP FUNCTION IF EXISTS discord_open_weeks(TEXT);
-- DROP FUNCTION IF EXISTS discord_week_activities(DATE);
