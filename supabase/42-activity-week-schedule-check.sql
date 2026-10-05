-- ============================================
-- Migration 42: Enforce the season schedule on `activities`
-- ============================================
-- Until now the season schedule (31-season-schedule.sql) was only enforced by
-- the Angular UI. `activities` is writable through RLS alone, so a stale page
-- left open across the weekly reset (Monday 00:00 UTC), a modified client or a
-- wrong device clock could record an activity in a week that does not offer it
-- (prod incident: 'desolate desert' recorded 39 minutes after the reset, for the
-- week that no longer scheduled it).
--
-- Rules enforced on every INSERT, and on UPDATE when activity_type or date change
-- (so editing points/position of an existing row is never blocked):
--   1. `date` is exactly Monday 00:00:00 UTC. The unique key is
--      (user_id, activity_type, date): without normalisation the same activity
--      could be logged several times in one week at different timestamps.
--   2. `date` is not in a future week (server clock, UTC).
--   3. A season covers `date`.
--   4. activity_type is 'legion' (implicit every week) or is scheduled for that
--      week in season_activities.
--
-- Applies to everyone who can write to `activities`, admins and super admins
-- included (retroactive entry, Excel import): they may pick any past week, but
-- only with an activity that week actually scheduled. There is deliberately NO
-- lower bound on how far back a date may go.
--
-- Not retroactive: existing rows are not re-validated.
-- Note: a batch upsert (Excel import) is a single statement, so one rejected row
-- rejects the whole batch.
-- ============================================

CREATE OR REPLACE FUNCTION check_activity_matches_season_schedule()
RETURNS TRIGGER AS $$
DECLARE
  v_activity_date DATE;
  v_season_id UUID;
  v_season_start DATE;
  v_week_index INT;
BEGIN
  IF TG_OP = 'UPDATE'
     AND NEW.activity_type IS NOT DISTINCT FROM OLD.activity_type
     AND NEW.date IS NOT DISTINCT FROM OLD.date THEN
    RETURN NEW;
  END IF;

  IF NEW.date <> (date_trunc('week', NEW.date AT TIME ZONE 'UTC') AT TIME ZONE 'UTC') THEN
    RAISE EXCEPTION 'Activity date must be a Monday at 00:00:00 UTC (got %)', NEW.date
      USING ERRCODE = '23514';
  END IF;

  IF NEW.date > (date_trunc('week', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC') THEN
    RAISE EXCEPTION 'Activity date % is in a future week', NEW.date
      USING ERRCODE = '23514';
  END IF;

  v_activity_date := (NEW.date AT TIME ZONE 'UTC')::date;

  SELECT id, start_date INTO v_season_id, v_season_start
  FROM activity_seasons
  WHERE v_activity_date BETWEEN start_date AND end_date;

  IF v_season_id IS NULL THEN
    RAISE EXCEPTION 'No season covers the activity date %', v_activity_date
      USING ERRCODE = '23514';
  END IF;

  IF NEW.activity_type <> 'legion' THEN
    v_week_index := ((v_activity_date - v_season_start) / 7) + 1;

    IF NOT EXISTS (
      SELECT 1 FROM season_activities
      WHERE season_id = v_season_id
        AND week_index = v_week_index
        AND activity_type = NEW.activity_type
    ) THEN
      RAISE EXCEPTION 'Activity "%" is not scheduled for week % of the season (week of %)',
        NEW.activity_type, v_week_index, v_activity_date
        USING ERRCODE = '23514';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

DROP TRIGGER IF EXISTS trigger_check_activity_matches_season_schedule ON activities;
CREATE TRIGGER trigger_check_activity_matches_season_schedule
  BEFORE INSERT OR UPDATE ON activities
  FOR EACH ROW EXECUTE FUNCTION check_activity_matches_season_schedule();

-- ============================================
-- DONE
-- ============================================

-- ============================================
-- ROLLBACK (not executed — for reference only)
-- ============================================
-- DROP TRIGGER IF EXISTS trigger_check_activity_matches_season_schedule ON activities;
-- DROP FUNCTION IF EXISTS check_activity_matches_season_schedule();
