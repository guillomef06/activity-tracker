-- ============================================
-- Migration 47: Global calendar driving MG creation
-- ============================================
-- Spec:     specs/003-mg-global-calendar (plan.md, research.md D-01..D-21,
--           data-model.md, contracts/client-functions.md, contracts/internal-functions.md)
-- Tables:   calendar_entries (NEW), mg_events (calendar_entry_id + constraints + guard trigger)
-- Enums:    calendar_entry_type (NEW: 'mg', 'pvp'), mg_event_status += 'cancelled'
-- Functions (SECURITY DEFINER, owner postgres, search_path fixed):
--   client RPC (authenticated, super admin checked inside):
--     create_mg_calendar_entries(date[]), shift_mg_calendar_entry(uuid, date),
--     cancel_mg_calendar_entry(uuid)
--   internal (nobody but the owner / pg_cron):
--     mg_create_events_for_entry(uuid, uuid), mg_create_events_from_calendar(timestamptz)
--   trigger functions (SECURITY INVOKER): mg_events_guard(), calendar_entries_audit()
-- pg_cron:  'mg-create-events' is replaced (same name, same schedule) by a job that calls
--           mg_create_events_from_calendar(). The 3 transition jobs and the Discord
--           dispatcher are NOT touched.
-- Security: mg_events keeps only ONE client write: the selection publication
--           (registration_closed -> selection_published). INSERT/DELETE policies are
--           dropped and the matching table privileges revoked from anon/authenticated.
--
-- NOT auto-applied to prod. Apply manually in the Supabase SQL editor, as ONE script,
-- no later than Friday 2026-11-27 and never around Sunday 23:59 / Monday 00:00 UTC.
-- The migration is deliberately NOT re-runnable: step 0 aborts when calendar_entries
-- already exists. Rollback: 47-mg-global-calendar.rollback.sql.
--
-- Internal order (research D-01), all inside one BEGIN/COMMIT:
--   0 pre-flight guard   1 enum value   2 calendar table   3 mg_events changes
--   4 functions          5 seed         6 backfill + link   7 one-off creation run
--   8 cron swap          9 final assertions
--
-- 'cancelled' (ADD VALUE inside the transaction, research D-02): the new label is never
-- evaluated before COMMIT. Only LANGUAGE plpgsql bodies mention it (their SQL is not
-- analysed at CREATE time); no CHECK, index predicate, policy, default or data statement
-- of this file uses it. Do not "simplify" a function to LANGUAGE sql.
--
-- Deviations from the plan (justified where they occur):
--   DEV-1 mg_events_guard compares "all other columns" through to_jsonb(NEW/OLD)
--         instead of an explicit column list (section 3).
--   DEV-2 calendar_entries_audit leaves FK "ON DELETE SET NULL" cascades untouched
--         (pg_trigger_depth() > 1) (section 2).
--   DEV-3 the seed list is held once in a temporary table shared by the pre-flight
--         guard and the seed (section 0).
--   DEV-4 NULL / non-finite arguments of shift/cancel are reported as
--         MG_CAL_NOT_FOUND / MG_CAL_NOT_MONDAY (the contract is silent).
-- ============================================

BEGIN;

-- ============================================
-- 0. PRE-FLIGHT GUARD
-- ============================================

-- DEV-3: single source of the 13 seeded opening Mondays (MG starts 2026-12-07 .. 2027-05-24).
CREATE TEMP TABLE mg47_seed_openings (opening DATE PRIMARY KEY) ON COMMIT DROP;

INSERT INTO mg47_seed_openings (opening) VALUES
  ('2026-11-30'), ('2026-12-14'), ('2026-12-28'), ('2027-01-11'), ('2027-01-25'),
  ('2027-02-08'), ('2027-02-22'), ('2027-03-08'), ('2027-03-22'), ('2027-04-05'),
  ('2027-04-19'), ('2027-05-03'), ('2027-05-17');

DO $do$
DECLARE
  v_today          DATE := (now() AT TIME ZONE 'UTC')::DATE;
  v_count          INTEGER;
  v_ids            TEXT;
BEGIN
  -- (a) the migration is not re-runnable (it seeds and swaps a cron job)
  IF to_regclass('public.calendar_entries') IS NOT NULL THEN
    RAISE EXCEPTION 'MG47_PREFLIGHT: calendar_entries already exists; migration 47 was already applied';
  END IF;

  -- (b) a super admin must exist (the calendar is written by one)
  SELECT count(*) INTO v_count FROM public.user_profiles WHERE role = 'super_admin';
  IF v_count = 0 THEN
    RAISE EXCEPTION 'MG47_PREFLIGHT: no super_admin profile exists';
  END IF;

  -- (c) every existing event must satisfy the new date-shape CHECK constraints
  SELECT count(*), string_agg(e.id::TEXT, ', ' ORDER BY e.start_date)
    INTO v_count, v_ids
  FROM public.mg_events e
  WHERE NOT (
    extract(isodow FROM e.start_date) = 1
    AND e.end_date = e.start_date + 6
    AND e.registration_close_at = e.start_date - 4
    AND e.registration_open_at <= e.start_date - 7
  );
  IF v_count > 0 THEN
    RAISE EXCEPTION 'MG47_PREFLIGHT: % mg_events row(s) violate the date shape (ids: %)', v_count, v_ids;
  END IF;

  -- (d) no duplicate (server_id, start_date)
  SELECT count(*) INTO v_count FROM (
    SELECT 1 FROM public.mg_events GROUP BY server_id, start_date HAVING count(*) > 1
  ) d;
  IF v_count > 0 THEN
    RAISE EXCEPTION 'MG47_PREFLIGHT: % duplicated (server_id, start_date) pair(s) in mg_events', v_count;
  END IF;

  -- (e) no stray far-future event (e2e/demo leftover) that the backfill would turn into a bogus entry
  SELECT count(*), string_agg(e.id::TEXT, ', ' ORDER BY e.start_date)
    INTO v_count, v_ids
  FROM public.mg_events e
  WHERE e.start_date > v_today + 14;
  IF v_count > 0 THEN
    RAISE EXCEPTION 'MG47_PREFLIGHT: % mg_events row(s) start after today + 14 days (ids: %)', v_count, v_ids;
  END IF;

  -- (f) historical Mondays and seeded starts must be at least 14 days apart
  SELECT count(*) INTO v_count FROM (
    SELECT d, lag(d) OVER (ORDER BY d) AS previous_d
    FROM (
      SELECT start_date AS d FROM public.mg_events
      UNION
      SELECT opening + 7 FROM mg47_seed_openings
    ) all_starts
  ) gaps
  WHERE d - previous_d < 14;
  IF v_count > 0 THEN
    RAISE EXCEPTION 'MG47_PREFLIGHT: % pair(s) of MG starts (existing events + seed) are less than 14 days apart', v_count;
  END IF;

  -- (g) exactly one creation job must exist (otherwise the swap is ambiguous)
  SELECT count(*) INTO v_count FROM cron.job WHERE jobname = 'mg-create-events';
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'MG47_PREFLIGHT: expected exactly one mg-create-events cron job, found %', v_count;
  END IF;
END
$do$;

-- ============================================
-- 1. ENUM VALUE (never evaluated before COMMIT, see header)
-- ============================================

ALTER TYPE mg_event_status ADD VALUE IF NOT EXISTS 'cancelled';

-- ============================================
-- 2. CALENDAR TABLE
-- ============================================

CREATE TYPE calendar_entry_type AS ENUM ('mg', 'pvp');

CREATE TABLE calendar_entries (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type          calendar_entry_type NOT NULL,
  title         TEXT,
  starts_at     TIMESTAMPTZ NOT NULL,
  ends_at       TIMESTAMPTZ NOT NULL,
  all_day       BOOLEAN NOT NULL DEFAULT FALSE,
  cancelled_at  TIMESTAMPTZ,
  cancelled_by  UUID REFERENCES user_profiles(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by    UUID REFERENCES user_profiles(id) ON DELETE SET NULL,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by    UUID REFERENCES user_profiles(id) ON DELETE SET NULL,

  CONSTRAINT uq_calendar_entries_type_starts_at UNIQUE (type, starts_at),
  CONSTRAINT ck_calendar_entries_ends_after_start CHECK (ends_at > starts_at),

  -- FR-004: evaluated in UTC whatever the session time zone
  CONSTRAINT ck_calendar_entries_mg_shape CHECK (
    type <> 'mg' OR (
      all_day
      AND extract(isodow FROM (starts_at AT TIME ZONE 'UTC')) = 1
      AND date_trunc('day', starts_at AT TIME ZONE 'UTC') = (starts_at AT TIME ZONE 'UTC')
      AND (ends_at AT TIME ZONE 'UTC') = (starts_at AT TIME ZONE 'UTC') + INTERVAL '7 days'
    )
  ),

  CONSTRAINT ck_calendar_entries_title CHECK (
    (type = 'mg' AND (title IS NULL OR char_length(title) <= 100))
    OR (type <> 'mg' AND title IS NOT NULL AND char_length(btrim(title)) BETWEEN 1 AND 100)
  ),

  -- Only MG rows can carry the cancellation mark (set by cancel_mg_calendar_entry)
  CONSTRAINT ck_calendar_entries_cancel_mg_only CHECK (
    type = 'mg' OR (cancelled_at IS NULL AND cancelled_by IS NULL)
  ),

  -- FR-004a: two non-cancelled MG starts must be at least 14 days apart.
  -- Half-open [start, start + 14) ranges overlap iff the starts are < 14 days apart.
  -- Built ONLY from immutable pieces (constant-zone AT TIME ZONE, timestamp::date,
  -- date + integer, daterange constructor): "starts_at + interval" on timestamptz is
  -- STABLE and would be refused in an index expression (research D-03).
  -- Non-deferrable on purpose: shift_mg_calendar_entry orders its writes instead.
  CONSTRAINT ex_calendar_entries_mg_min_gap EXCLUDE USING gist (
    daterange(
      ((starts_at AT TIME ZONE 'UTC')::DATE),
      ((starts_at AT TIME ZONE 'UTC')::DATE + 14)
    ) WITH &&
  ) WHERE (type = 'mg' AND cancelled_at IS NULL)
);

CREATE INDEX idx_calendar_entries_created_by   ON calendar_entries(created_by);
CREATE INDEX idx_calendar_entries_updated_by   ON calendar_entries(updated_by);
CREATE INDEX idx_calendar_entries_cancelled_by ON calendar_entries(cancelled_by);

-- ─── audit trigger (FR-006) ───────────────────────────────────────────────

CREATE FUNCTION calendar_entries_audit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $fn$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.created_at := now();
    NEW.created_by := auth.uid();
    NEW.updated_at := now();
    NEW.updated_by := auth.uid();
  ELSIF pg_trigger_depth() = 1 THEN
    -- DEV-2: depth > 1 means the update comes from a referential action
    -- (user_profiles ON DELETE SET NULL). Re-stamping created_by / updated_by there
    -- would undo the SET NULL (or point updated_by at the user being deleted) and
    -- make the profile deletion fail on the foreign key.
    NEW.created_at := OLD.created_at;
    NEW.created_by := OLD.created_by;
    NEW.updated_at := now();
    NEW.updated_by := auth.uid();
  END IF;
  RETURN NEW;
END;
$fn$;

CREATE TRIGGER trg_calendar_entries_audit
  BEFORE INSERT OR UPDATE ON calendar_entries
  FOR EACH ROW EXECUTE FUNCTION calendar_entries_audit();

-- ─── RLS and grants ───────────────────────────────────────────────────────
-- MG rows are written only by the three definer functions (owner postgres, RLS not
-- forced, so they bypass the policies by design); clients can write non-MG rows only.

ALTER TABLE calendar_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read calendar entries"
  ON calendar_entries FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Super admins can insert non-MG calendar entries"
  ON calendar_entries FOR INSERT
  TO authenticated
  WITH CHECK (
    (select auth.uid()) IS NOT NULL
    AND is_super_admin((select auth.uid()))
    AND type <> 'mg'
  );

CREATE POLICY "Super admins can update non-MG calendar entries"
  ON calendar_entries FOR UPDATE
  TO authenticated
  USING (
    (select auth.uid()) IS NOT NULL
    AND is_super_admin((select auth.uid()))
    AND type <> 'mg'
  )
  WITH CHECK (
    (select auth.uid()) IS NOT NULL
    AND is_super_admin((select auth.uid()))
    AND type <> 'mg'
  );

CREATE POLICY "Super admins can delete non-MG calendar entries"
  ON calendar_entries FOR DELETE
  TO authenticated
  USING (
    (select auth.uid()) IS NOT NULL
    AND is_super_admin((select auth.uid()))
    AND type <> 'mg'
  );

REVOKE ALL ON calendar_entries FROM PUBLIC, anon;
REVOKE TRUNCATE, REFERENCES, TRIGGER ON calendar_entries FROM authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON calendar_entries TO authenticated;

-- ============================================
-- 3. mg_events CHANGES
-- ============================================

ALTER TABLE mg_events
  ADD COLUMN calendar_entry_id UUID;

ALTER TABLE mg_events
  ADD CONSTRAINT fk_mg_events_calendar_entry
    FOREIGN KEY (calendar_entry_id) REFERENCES calendar_entries(id) ON DELETE RESTRICT;

-- The composite unique below leads with server_id, so it does not serve FK lookups.
CREATE INDEX idx_mg_events_calendar_entry_id ON mg_events(calendar_entry_id);

ALTER TABLE mg_events
  ADD CONSTRAINT uq_mg_events_server_calendar_entry UNIQUE (server_id, calendar_entry_id),
  ADD CONSTRAINT uq_mg_events_server_start_date UNIQUE (server_id, start_date),
  ADD CONSTRAINT ck_mg_events_start_monday CHECK (extract(isodow FROM start_date) = 1),
  ADD CONSTRAINT ck_mg_events_end_date CHECK (end_date = start_date + 6),
  ADD CONSTRAINT ck_mg_events_close_date CHECK (registration_close_at = start_date - 4),
  ADD CONSTRAINT ck_mg_events_open_date CHECK (registration_open_at <= start_date - 7);

-- ─── guard trigger (FR-030, research D-06) ────────────────────────────────
-- MUST stay SECURITY INVOKER: current_user is then the role of the caller. Client DML
-- runs as authenticated/anon, our definer functions as postgres, pg_cron / SQL editor
-- / migrations as postgres, the service key as service_role. A SECURITY DEFINER guard
-- would see 'postgres' always and silently disable itself.
-- DEV-1: "every other column unchanged" is tested on the row as jsonb minus the two
-- columns the publication may write, so a column added later is frozen by default.

CREATE FUNCTION mg_events_guard()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $fn$
BEGIN
  IF current_user NOT IN ('authenticated', 'anon') THEN
    RETURN NEW;
  END IF;

  IF OLD.status = 'registration_closed'
     AND NEW.status = 'selection_published'
     AND NEW.selection_published_at IS NOT NULL
     AND (to_jsonb(NEW) - 'status' - 'selection_published_at')
         = (to_jsonb(OLD) - 'status' - 'selection_published_at')
  THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'MG_EVENT_FORBIDDEN' USING ERRCODE = '42501';
END;
$fn$;

CREATE TRIGGER trg_mg_events_guard
  BEFORE UPDATE ON mg_events
  FOR EACH ROW EXECUTE FUNCTION mg_events_guard();

-- ─── clients can no longer insert or delete events ────────────────────────

DROP POLICY "Admins can insert MG events" ON mg_events;
DROP POLICY "Admins can delete MG events" ON mg_events;

REVOKE INSERT, DELETE, TRUNCATE ON mg_events FROM anon, authenticated;
REVOKE UPDATE ON mg_events FROM anon;

-- ============================================
-- 4. FUNCTIONS (plpgsql only, see header)
-- ============================================
-- Error model: RAISE EXCEPTION '<MG_CAL_CODE>' USING ERRCODE, DETAIL = json. PostgREST
-- exposes the code as "message"; clients key on it only.

-- ─── 4.1 internal: events of one entry ────────────────────────────────────

CREATE FUNCTION mg_create_events_for_entry(p_entry_id UUID, p_server_id UUID DEFAULT NULL)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
SET timezone = 'UTC'
AS $fn$
DECLARE
  v_start DATE;
  v_count INTEGER;
BEGIN
  -- Row lock first (FR-031): serialises with shift / cancel.
  SELECT (ce.starts_at AT TIME ZONE 'UTC')::DATE
    INTO v_start
  FROM calendar_entries ce
  WHERE ce.id = p_entry_id
    AND ce.type = 'mg'
    AND ce.cancelled_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN 0;
  END IF;

  -- No conflict target: covers uq_mg_events_server_calendar_entry and
  -- uq_mg_events_server_start_date, hence idempotent. The time window is checked by the caller.
  INSERT INTO mg_events (
    server_id, start_date, end_date, registration_open_at, registration_close_at,
    status, calendar_entry_id
  )
  SELECT c.server_id, v_start, v_start + 6, v_start - 7, v_start - 4,
         'registration_open', p_entry_id
  FROM server_mg_config c
  WHERE p_server_id IS NULL OR c.server_id = p_server_id
  ON CONFLICT DO NOTHING;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$fn$;

-- ─── 4.2 internal: body of the cron job ───────────────────────────────────
-- Eligibility is timestamp-based (research D-09): from the opening Monday until the
-- Thursday 23:58 UTC that precedes the close cron (23:59), so a late run can never
-- create an event that no cron would close.

CREATE FUNCTION mg_create_events_from_calendar(p_now TIMESTAMPTZ DEFAULT now())
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
SET timezone = 'UTC'
AS $fn$
DECLARE
  v_now   TIMESTAMPTZ := COALESCE(p_now, now());
  v_entry UUID;
  v_total INTEGER := 0;
BEGIN
  FOR v_entry IN
    SELECT ce.id
    FROM calendar_entries ce
    WHERE ce.type = 'mg'
      AND ce.cancelled_at IS NULL
      AND (ce.starts_at AT TIME ZONE 'UTC')::DATE - 7 <= (v_now AT TIME ZONE 'UTC')::DATE
      AND v_now < ((((ce.starts_at AT TIME ZONE 'UTC')::DATE - 4)::TIMESTAMP
                    + INTERVAL '23 hours 59 minutes') AT TIME ZONE 'UTC')
    ORDER BY ce.starts_at
    FOR UPDATE OF ce
  LOOP
    v_total := v_total + mg_create_events_for_entry(v_entry);
  END LOOP;
  RETURN v_total;
END;
$fn$;

-- ─── 4.3 client: create entries from opening Mondays ──────────────────────

CREATE FUNCTION create_mg_calendar_entries(p_opening_mondays DATE[])
RETURNS TABLE (opening_monday DATE, mg_start DATE, outcome TEXT, entry_id UUID)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
SET timezone = 'UTC'
AS $fn$
DECLARE
  v_today DATE := (now() AT TIME ZONE 'UTC')::DATE;
  v_max_batch CONSTANT INTEGER := 13;
  v_date  DATE;
  v_start_ts TIMESTAMPTZ;
BEGIN
  IF is_super_admin((select auth.uid())) IS NOT TRUE THEN
    RAISE EXCEPTION 'MG_CAL_FORBIDDEN' USING ERRCODE = '42501';
  END IF;

  -- whole-call input validation: nothing written on failure
  IF p_opening_mondays IS NULL OR cardinality(p_opening_mondays) = 0 THEN
    RAISE EXCEPTION 'MG_CAL_INVALID_INPUT' USING ERRCODE = 'MG001', DETAIL = '{"reason":"empty_array"}';
  END IF;
  IF cardinality(p_opening_mondays) > v_max_batch THEN
    RAISE EXCEPTION 'MG_CAL_INVALID_INPUT' USING ERRCODE = 'MG001', DETAIL = '{"reason":"too_many"}';
  END IF;
  IF EXISTS (SELECT 1 FROM unnest(p_opening_mondays) AS u(d) WHERE u.d IS NULL OR NOT isfinite(u.d)) THEN
    RAISE EXCEPTION 'MG_CAL_INVALID_INPUT' USING ERRCODE = 'MG001', DETAIL = '{"reason":"null_element"}';
  END IF;
  IF (SELECT count(DISTINCT u.d) FROM unnest(p_opening_mondays) AS u(d)) <> cardinality(p_opening_mondays) THEN
    RAISE EXCEPTION 'MG_CAL_INVALID_INPUT' USING ERRCODE = 'MG001', DETAIL = '{"reason":"duplicate"}';
  END IF;

  FOR v_date IN SELECT u.d FROM unnest(p_opening_mondays) AS u(d) ORDER BY u.d LOOP
    opening_monday := v_date;
    mg_start       := v_date + 7;
    entry_id       := NULL;
    v_start_ts     := (mg_start::TIMESTAMP AT TIME ZONE 'UTC');

    -- precedence: not_monday > already_exists > opening_passed > too_close > created
    IF extract(isodow FROM v_date) <> 1 THEN
      outcome := 'rejected_not_monday';
    ELSIF EXISTS (SELECT 1 FROM calendar_entries ce WHERE ce.type = 'mg' AND ce.starts_at = v_start_ts) THEN
      outcome := 'already_exists';
      SELECT ce.id INTO entry_id
      FROM calendar_entries ce WHERE ce.type = 'mg' AND ce.starts_at = v_start_ts;
    ELSIF v_date <= v_today THEN
      outcome := 'rejected_opening_passed';
    ELSIF EXISTS (
      SELECT 1 FROM calendar_entries ce
      WHERE ce.type = 'mg' AND ce.cancelled_at IS NULL
        AND abs((ce.starts_at AT TIME ZONE 'UTC')::DATE - mg_start) < 14
    ) THEN
      outcome := 'rejected_too_close';
    ELSE
      -- own savepoint: a race with a concurrent create maps to an outcome, never a raw SQL error
      BEGIN
        INSERT INTO calendar_entries (type, starts_at, ends_at, all_day)
        VALUES ('mg', v_start_ts, ((mg_start + 7)::TIMESTAMP AT TIME ZONE 'UTC'), TRUE)
        RETURNING id INTO entry_id;
        outcome := 'created';
      EXCEPTION
        WHEN exclusion_violation THEN
          outcome := 'rejected_too_close';
          entry_id := NULL;
        WHEN unique_violation THEN
          outcome := 'already_exists';
          SELECT ce.id INTO entry_id
          FROM calendar_entries ce WHERE ce.type = 'mg' AND ce.starts_at = v_start_ts;
      END;
    END IF;

    RETURN NEXT;
  END LOOP;
END;
$fn$;

-- ─── 4.4 client: shift an entry and every following one ───────────────────
-- Lock order everywhere: selected entry, following entries ascending, then the
-- selected entry's events by id (research D-05). All checks run before any write.
-- Writes are ordered last-to-first when postponing, first-to-last when advancing, so the
-- non-deferrable exclusion / unique constraints never see a transient violation (D-03).

CREATE FUNCTION shift_mg_calendar_entry(p_entry_id UUID, p_new_opening_monday DATE)
RETURNS TABLE (entry_id UUID, old_start DATE, new_start DATE, events_updated INTEGER)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
SET timezone = 'UTC'
AS $fn$
DECLARE
  v_today        DATE := (now() AT TIME ZONE 'UTC')::DATE;
  v_min_gap      CONSTANT INTEGER := 14;
  v_sel_starts   TIMESTAMPTZ;
  v_sel_cancel   TIMESTAMPTZ;
  v_sel_start    DATE;
  v_offset       INTEGER;
  v_opened       BOOLEAN;
  v_ids          UUID[];
  v_olds         DATE[];
  v_count        INTEGER;
  v_pos          INTEGER;
  v_step         INTEGER;
  v_new          DATE;
  v_other_id     UUID;
  v_other_date   DATE;
  v_events       INTEGER := 0;
BEGIN
  IF is_super_admin((select auth.uid())) IS NOT TRUE THEN
    RAISE EXCEPTION 'MG_CAL_FORBIDDEN' USING ERRCODE = '42501';
  END IF;

  -- selected entry, locked first (DEV-4: NULL id is simply "not found")
  SELECT ce.starts_at, ce.cancelled_at
    INTO v_sel_starts, v_sel_cancel
  FROM calendar_entries ce
  WHERE ce.id = p_entry_id AND ce.type = 'mg'
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'MG_CAL_NOT_FOUND' USING ERRCODE = 'MG002',
      DETAIL = jsonb_build_object('entry_id', p_entry_id)::TEXT;
  END IF;
  IF v_sel_cancel IS NOT NULL THEN
    RAISE EXCEPTION 'MG_CAL_NOT_SHIFTABLE' USING ERRCODE = 'MG007', DETAIL = '{"reason":"cancelled"}';
  END IF;

  -- DEV-4: NULL / non-finite target date is reported as "not a Monday"
  IF p_new_opening_monday IS NULL
     OR NOT isfinite(p_new_opening_monday)
     OR extract(isodow FROM p_new_opening_monday) IS DISTINCT FROM 1 THEN
    RAISE EXCEPTION 'MG_CAL_NOT_MONDAY' USING ERRCODE = 'MG003',
      DETAIL = jsonb_build_object('date', p_new_opening_monday)::TEXT;
  END IF;

  v_sel_start := (v_sel_starts AT TIME ZONE 'UTC')::DATE;
  v_offset    := (p_new_opening_monday + 7) - v_sel_start;
  IF v_offset = 0 THEN
    RAISE EXCEPTION 'MG_CAL_INVALID_INPUT' USING ERRCODE = 'MG001', DETAIL = '{"reason":"zero_offset"}';
  END IF;

  -- remaining locks: following entries ascending, then the selected entry's events
  PERFORM 1
  FROM calendar_entries ce
  WHERE ce.type = 'mg' AND ce.cancelled_at IS NULL AND ce.starts_at > v_sel_starts
  ORDER BY ce.starts_at
  FOR UPDATE;

  PERFORM 1 FROM mg_events ev WHERE ev.calendar_entry_id = p_entry_id ORDER BY ev.id FOR UPDATE;

  -- read-only entry
  IF v_sel_starts <= now() OR EXISTS (
    SELECT 1 FROM mg_events ev
    WHERE ev.calendar_entry_id = p_entry_id AND ev.status IN ('ongoing', 'finished')
  ) THEN
    RAISE EXCEPTION 'MG_CAL_NOT_SHIFTABLE' USING ERRCODE = 'MG007', DETAIL = '{"reason":"read_only"}';
  END IF;

  v_opened := (v_sel_start - 7) <= v_today;
  IF v_opened THEN
    IF EXISTS (
      SELECT 1 FROM mg_events ev
      WHERE ev.calendar_entry_id = p_entry_id AND ev.status <> 'registration_open'
    ) THEN
      RAISE EXCEPTION 'MG_CAL_NOT_SHIFTABLE' USING ERRCODE = 'MG007', DETAIL = '{"reason":"event_not_open"}';
    END IF;
    IF v_offset < 0 THEN
      RAISE EXCEPTION 'MG_CAL_NOT_SHIFTABLE' USING ERRCODE = 'MG007', DETAIL = '{"reason":"must_move_later"}';
    END IF;
  END IF;

  -- moved set: the selected entry (position 1) and every following non-cancelled MG entry
  SELECT array_agg(m.id ORDER BY m.starts_at),
         array_agg((m.starts_at AT TIME ZONE 'UTC')::DATE ORDER BY m.starts_at)
    INTO v_ids, v_olds
  FROM calendar_entries m
  WHERE m.type = 'mg' AND m.cancelled_at IS NULL AND m.starts_at >= v_sel_starts;
  v_count := cardinality(v_ids);

  -- opening rules: followers must not be opened; entries not yet opened keep a future opening
  FOR v_pos IN 1..v_count LOOP
    v_new := v_olds[v_pos] + v_offset;
    IF v_pos > 1 AND (v_olds[v_pos] - 7) <= v_today THEN
      RAISE EXCEPTION 'MG_CAL_NOT_SHIFTABLE' USING ERRCODE = 'MG007', DETAIL = '{"reason":"following_entry_opened"}';
    END IF;
    IF (v_pos > 1 OR NOT v_opened) AND (v_new - 7) <= v_today THEN
      RAISE EXCEPTION 'MG_CAL_OPENING_PASSED' USING ERRCODE = 'MG004',
        DETAIL = jsonb_build_object('entry_id', v_ids[v_pos], 'opening', v_new - 7)::TEXT;
    END IF;
  END LOOP;

  -- final positions against NON-moved entries (kept cancelled entries included for equality)
  FOR v_pos IN 1..v_count LOOP
    v_new := v_olds[v_pos] + v_offset;

    SELECT ce.id INTO v_other_id
    FROM calendar_entries ce
    WHERE ce.type = 'mg'
      AND ce.starts_at = (v_new::TIMESTAMP AT TIME ZONE 'UTC')
      AND ce.id <> ALL (v_ids)
    LIMIT 1;
    IF FOUND THEN
      RAISE EXCEPTION 'MG_CAL_ALREADY_EXISTS' USING ERRCODE = 'MG005',
        DETAIL = jsonb_build_object('entry_id', v_ids[v_pos], 'date', v_new)::TEXT;
    END IF;

    SELECT ce.id, (ce.starts_at AT TIME ZONE 'UTC')::DATE INTO v_other_id, v_other_date
    FROM calendar_entries ce
    WHERE ce.type = 'mg' AND ce.cancelled_at IS NULL
      AND ce.id <> ALL (v_ids)
      AND abs((ce.starts_at AT TIME ZONE 'UTC')::DATE - v_new) < v_min_gap
    LIMIT 1;
    IF FOUND THEN
      RAISE EXCEPTION 'MG_CAL_TOO_CLOSE' USING ERRCODE = 'MG006',
        DETAIL = jsonb_build_object('entry_id', v_ids[v_pos], 'date', v_new,
                                    'other_entry_id', v_other_id, 'other_date', v_other_date)::TEXT;
    END IF;
  END LOOP;

  -- opened selected entry: no foreign event of an affected server may already sit on the new date
  IF v_opened AND EXISTS (
    SELECT 1 FROM mg_events x
    WHERE x.start_date = v_olds[1] + v_offset
      AND x.calendar_entry_id IS DISTINCT FROM p_entry_id
      AND x.server_id IN (SELECT ev.server_id FROM mg_events ev WHERE ev.calendar_entry_id = p_entry_id)
  ) THEN
    RAISE EXCEPTION 'MG_CAL_NOT_SHIFTABLE' USING ERRCODE = 'MG007', DETAIL = '{"reason":"event_date_conflict"}';
  END IF;

  -- writes: last to first when postponing, first to last when advancing
  FOR v_step IN 1..v_count LOOP
    v_pos := CASE WHEN v_offset > 0 THEN v_count - v_step + 1 ELSE v_step END;
    v_new := v_olds[v_pos] + v_offset;
    BEGIN
      UPDATE calendar_entries
      SET starts_at = (v_new::TIMESTAMP AT TIME ZONE 'UTC'),
          ends_at   = ((v_new + 7)::TIMESTAMP AT TIME ZONE 'UTC')
      WHERE id = v_ids[v_pos];
    EXCEPTION
      WHEN exclusion_violation THEN
        RAISE EXCEPTION 'MG_CAL_TOO_CLOSE' USING ERRCODE = 'MG006',
          DETAIL = jsonb_build_object('entry_id', v_ids[v_pos], 'date', v_new)::TEXT;
      WHEN unique_violation THEN
        RAISE EXCEPTION 'MG_CAL_ALREADY_EXISTS' USING ERRCODE = 'MG005',
          DETAIL = jsonb_build_object('entry_id', v_ids[v_pos], 'date', v_new)::TEXT;
    END;
  END LOOP;

  IF v_opened THEN
    -- registration_open_at, status, registrations and selections stay untouched
    BEGIN
      UPDATE mg_events
      SET start_date = v_olds[1] + v_offset,
          end_date = v_olds[1] + v_offset + 6,
          registration_close_at = v_olds[1] + v_offset - 4
      WHERE calendar_entry_id = p_entry_id;
      GET DIAGNOSTICS v_events = ROW_COUNT;
    EXCEPTION
      WHEN unique_violation THEN
        RAISE EXCEPTION 'MG_CAL_NOT_SHIFTABLE' USING ERRCODE = 'MG007', DETAIL = '{"reason":"event_date_conflict"}';
    END;
  END IF;

  FOR v_pos IN 1..v_count LOOP
    entry_id       := v_ids[v_pos];
    old_start      := v_olds[v_pos];
    new_start      := v_olds[v_pos] + v_offset;
    events_updated := CASE WHEN v_pos = 1 THEN v_events ELSE 0 END;
    RETURN NEXT;
  END LOOP;
END;
$fn$;

-- ─── 4.5 client: cancel (delete when never opened, otherwise mark) ────────

CREATE FUNCTION cancel_mg_calendar_entry(p_entry_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
SET timezone = 'UTC'
AS $fn$
DECLARE
  v_starts    TIMESTAMPTZ;
  v_cancelled TIMESTAMPTZ;
BEGIN
  IF is_super_admin((select auth.uid())) IS NOT TRUE THEN
    RAISE EXCEPTION 'MG_CAL_FORBIDDEN' USING ERRCODE = '42501';
  END IF;

  SELECT ce.starts_at, ce.cancelled_at
    INTO v_starts, v_cancelled
  FROM calendar_entries ce
  WHERE ce.id = p_entry_id AND ce.type = 'mg'
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'MG_CAL_NOT_FOUND' USING ERRCODE = 'MG002',
      DETAIL = jsonb_build_object('entry_id', p_entry_id)::TEXT;
  END IF;

  -- events locked so a cron UPDATE at the same instant waits and re-checks its WHERE
  PERFORM 1 FROM mg_events ev WHERE ev.calendar_entry_id = p_entry_id ORDER BY ev.id FOR UPDATE;

  IF v_cancelled IS NOT NULL THEN
    RAISE EXCEPTION 'MG_CAL_NOT_CANCELLABLE' USING ERRCODE = 'MG008', DETAIL = '{"reason":"already_cancelled"}';
  END IF;
  IF v_starts <= now() THEN
    RAISE EXCEPTION 'MG_CAL_NOT_CANCELLABLE' USING ERRCODE = 'MG008', DETAIL = '{"reason":"read_only"}';
  END IF;
  IF EXISTS (
    SELECT 1 FROM mg_events ev
    WHERE ev.calendar_entry_id = p_entry_id AND ev.status IN ('ongoing', 'finished')
  ) THEN
    RAISE EXCEPTION 'MG_CAL_NOT_CANCELLABLE' USING ERRCODE = 'MG008', DETAIL = '{"reason":"event_ongoing_or_finished"}';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM mg_events ev WHERE ev.calendar_entry_id = p_entry_id) THEN
    DELETE FROM calendar_entries WHERE id = p_entry_id;
    RETURN 'deleted';
  END IF;

  -- registrations and selections stay for the audit; nobody is notified
  UPDATE calendar_entries
  SET cancelled_at = now(), cancelled_by = auth.uid()
  WHERE id = p_entry_id;

  UPDATE mg_events
  SET status = 'cancelled'
  WHERE calendar_entry_id = p_entry_id;

  RETURN 'cancelled';
END;
$fn$;

-- ─── 4.6 privileges (pattern of migrations 34 / 37 / 38) ──────────────────
-- Explicit PUBLIC revoke: the default PUBLIC grant is what made migration 34 a no-op.
-- Supabase default privileges also grant anon / authenticated / service_role.

REVOKE EXECUTE ON FUNCTION public.create_mg_calendar_entries(date[]) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.shift_mg_calendar_entry(uuid, date) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.cancel_mg_calendar_entry(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_mg_calendar_entries(date[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.shift_mg_calendar_entry(uuid, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_mg_calendar_entry(uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.mg_create_events_for_entry(uuid, uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.mg_create_events_from_calendar(timestamptz) FROM PUBLIC, anon, authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.mg_events_guard() FROM PUBLIC, anon, authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.calendar_entries_audit() FROM PUBLIC, anon, authenticated, service_role;

-- ============================================
-- 5. SEED (13 entries, created_by NULL, FR-018)
-- ============================================
-- Plain INSERT: a conflict on a fresh table is a bug and must abort the migration.

INSERT INTO calendar_entries (type, starts_at, ends_at, all_day)
SELECT 'mg',
       ((s.opening + 7)::TIMESTAMP AT TIME ZONE 'UTC'),
       ((s.opening + 14)::TIMESTAMP AT TIME ZONE 'UTC'),
       TRUE
FROM mg47_seed_openings s
ORDER BY s.opening;

-- ============================================
-- 6. BACKFILL AND LINK
-- ============================================
-- One MG entry per distinct existing start_date not already covered by the seed
-- (seed first, so an event the legacy job created late for 2026-12-07 links to it).

INSERT INTO calendar_entries (type, starts_at, ends_at, all_day)
SELECT 'mg',
       (h.start_date::TIMESTAMP AT TIME ZONE 'UTC'),
       ((h.start_date + 7)::TIMESTAMP AT TIME ZONE 'UTC'),
       TRUE
FROM (SELECT DISTINCT e.start_date FROM mg_events e) h
WHERE NOT EXISTS (
  SELECT 1 FROM calendar_entries ce
  WHERE ce.type = 'mg' AND ce.starts_at = (h.start_date::TIMESTAMP AT TIME ZONE 'UTC')
)
ORDER BY h.start_date;

UPDATE mg_events e
SET calendar_entry_id = ce.id
FROM calendar_entries ce
WHERE ce.type = 'mg'
  AND ce.starts_at = (e.start_date::TIMESTAMP AT TIME ZONE 'UTC')
  AND e.calendar_entry_id IS NULL;

-- ============================================
-- 7. ONE-OFF CREATION RUN
-- ============================================
-- Idempotent. Creates nothing when applied before Monday 2026-11-30; on a late
-- application it creates only the missing events of opted-in servers.

DO $do$
BEGIN
  PERFORM public.mg_create_events_from_calendar();
END
$do$;

-- ============================================
-- 8. CRON SWAP (same name, same schedule)
-- ============================================
-- The command is a plain statement: no nested dollar quoting. The close / start / end
-- jobs and the Discord dispatcher are not touched.

DO $do$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'mg-create-events') THEN
    PERFORM cron.unschedule('mg-create-events');
  END IF;
  PERFORM cron.schedule(
    'mg-create-events',
    '0 0 * * 1',
    'SELECT public.mg_create_events_from_calendar();'
  );
END
$do$;

-- ============================================
-- 9. FINAL ASSERTIONS (any failure aborts and rolls back everything)
-- ============================================

DO $do$
DECLARE
  v_count INTEGER;
  v_fn    RECORD;
BEGIN
  -- exactly one creation job, active, new command; no other job inserts events
  SELECT count(*) INTO v_count FROM cron.job
  WHERE jobname = 'mg-create-events' AND active
    AND schedule = '0 0 * * 1'
    AND command = 'SELECT public.mg_create_events_from_calendar();';
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'MG47_ASSERT: expected one active new mg-create-events job, found %', v_count;
  END IF;
  SELECT count(*) INTO v_count FROM cron.job
  WHERE jobname <> 'mg-create-events' AND command ILIKE '%INSERT INTO%mg_events%';
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'MG47_ASSERT: another cron job still inserts mg_events (%)', v_count;
  END IF;

  -- the 13 seeded entries exist
  SELECT count(*) INTO v_count FROM calendar_entries ce
  WHERE ce.type = 'mg'
    AND ce.starts_at IN (
      SELECT ((s.opening + 7)::TIMESTAMP AT TIME ZONE 'UTC') FROM mg47_seed_openings s
    );
  IF v_count <> 13 THEN
    RAISE EXCEPTION 'MG47_ASSERT: expected 13 seeded entries, found %', v_count;
  END IF;

  -- every event is linked to an entry of its own start date
  SELECT count(*) INTO v_count FROM mg_events WHERE calendar_entry_id IS NULL;
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'MG47_ASSERT: % mg_events row(s) left unlinked', v_count;
  END IF;
  SELECT count(*) INTO v_count
  FROM mg_events e JOIN calendar_entries ce ON ce.id = e.calendar_entry_id
  WHERE (ce.starts_at AT TIME ZONE 'UTC')::DATE <> e.start_date;
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'MG47_ASSERT: % mg_events row(s) linked to an entry of another date', v_count;
  END IF;

  -- the enum label exists (catalog lookup: evaluating the label itself is forbidden before COMMIT)
  SELECT count(*) INTO v_count FROM pg_enum en JOIN pg_type t ON t.oid = en.enumtypid
  WHERE t.typname = 'mg_event_status' AND en.enumlabel = 'cancelled';
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'MG47_ASSERT: enum label cancelled missing';
  END IF;

  -- no INSERT / DELETE policy left on mg_events; no trigger on server_mg_config; guard enabled
  SELECT count(*) INTO v_count FROM pg_policies
  WHERE schemaname = 'public' AND tablename = 'mg_events' AND cmd IN ('INSERT', 'DELETE', 'ALL');
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'MG47_ASSERT: % INSERT/DELETE/ALL policy(ies) remain on mg_events', v_count;
  END IF;
  SELECT count(*) INTO v_count FROM pg_trigger
  WHERE tgrelid = 'public.server_mg_config'::regclass AND NOT tgisinternal
    AND tgname NOT LIKE 'update_server_mg_config_updated_at';
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'MG47_ASSERT: unexpected trigger on server_mg_config';
  END IF;
  SELECT count(*) INTO v_count FROM pg_trigger
  WHERE tgrelid = 'public.mg_events'::regclass AND tgname = 'trg_mg_events_guard' AND tgenabled = 'O';
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'MG47_ASSERT: guard trigger missing or disabled';
  END IF;

  -- function matrix: privileges, security mode, fixed search_path
  FOR v_fn IN
    SELECT t.fn, t.client_callable, t.definer
    FROM (VALUES
      ('public.create_mg_calendar_entries(date[])'::regprocedure, TRUE, TRUE),
      ('public.shift_mg_calendar_entry(uuid, date)'::regprocedure, TRUE, TRUE),
      ('public.cancel_mg_calendar_entry(uuid)'::regprocedure, TRUE, TRUE),
      ('public.mg_create_events_for_entry(uuid, uuid)'::regprocedure, FALSE, TRUE),
      ('public.mg_create_events_from_calendar(timestamptz)'::regprocedure, FALSE, TRUE),
      ('public.mg_events_guard()'::regprocedure, FALSE, FALSE),
      ('public.calendar_entries_audit()'::regprocedure, FALSE, FALSE)
    ) AS t(fn, client_callable, definer)
  LOOP
    IF has_function_privilege('anon', v_fn.fn, 'EXECUTE')
       OR has_function_privilege('authenticated', v_fn.fn, 'EXECUTE') <> v_fn.client_callable
       OR (NOT v_fn.client_callable AND has_function_privilege('service_role', v_fn.fn, 'EXECUTE'))
       OR EXISTS (
         SELECT 1 FROM pg_proc p, aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) a
         WHERE p.oid = v_fn.fn AND a.grantee = 0 AND a.privilege_type = 'EXECUTE'
       )
    THEN
      RAISE EXCEPTION 'MG47_ASSERT: wrong EXECUTE privileges on %', v_fn.fn;
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM pg_proc p
      WHERE p.oid = v_fn.fn
        AND p.prosecdef = v_fn.definer
        AND p.proconfig @> ARRAY['search_path=public, pg_temp']
        AND p.proowner NOT IN (SELECT oid FROM pg_roles WHERE rolname IN ('authenticated', 'anon'))
    ) THEN
      RAISE EXCEPTION 'MG47_ASSERT: wrong security mode / search_path / owner on %', v_fn.fn;
    END IF;
  END LOOP;

  -- direct client writes on the tables
  IF has_table_privilege('authenticated', 'public.mg_events', 'INSERT')
     OR has_table_privilege('authenticated', 'public.mg_events', 'DELETE')
     OR has_table_privilege('anon', 'public.mg_events', 'UPDATE')
     OR has_table_privilege('anon', 'public.calendar_entries', 'SELECT') THEN
    RAISE EXCEPTION 'MG47_ASSERT: unexpected client table privileges';
  END IF;
END
$do$;

COMMIT;

-- ============================================
-- DONE. Post-checks: specs/003-mg-global-calendar/quickstart.md (Q8).
-- ROLLBACK: 47-mg-global-calendar.rollback.sql (not executed here).
-- ============================================
