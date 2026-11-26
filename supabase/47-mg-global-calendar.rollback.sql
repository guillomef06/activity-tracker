-- ============================================
-- Rollback of migration 47: Global calendar driving MG creation
-- ============================================
-- NOT auto-run. Delivered with the migration (plan.md "Rollback", R1/R2).
--
-- Two levels, selected by ONE line below (default 'soft'):
--   soft  Stop using the feature, keep the data. Restores the legacy parity cron job,
--         removes the guard trigger, restores the INSERT/DELETE policies and the table
--         privileges of mg_events, drops the five calendar functions.
--         Kept: calendar_entries, mg_events.calendar_entry_id, the date CHECKs and
--         UNIQUE constraints (all compatible with the legacy job), the enum value.
--   full  soft + removes the calendar completely: mg_events constraints / index /
--         column calendar_entry_id, table calendar_entries, its trigger function and
--         type calendar_entry_type.
-- The enum label 'cancelled' can never be dropped from mg_event_status without
-- recreating the type; it stays in both levels (harmless).
--
-- BEFORE RUNNING
--   1. Re-capture the production text of the 'mg-create-events' job that existed BEFORE
--      migration 47 (it is no longer in cron.job; use the Part D snapshot of research.md
--      or the Supabase migration history) and diff it against the text embedded below.
--      The text below is the PRODUCTION text (delimiter $inner$), never the one of
--      26-mg-event.sql (nested $$).
--   2. Any event with status 'cancelled' must be reviewed first (the legacy UI does
--      not know that status). This script aborts while one exists: set it to a
--      status chosen by the product owner, then re-run.
--   3. After the Monday 00:00 UTC run, events created from the calendar remain valid
--      (same shape); the legacy job will then use its parity rule again.
-- ============================================

BEGIN;

-- Level selector: 'soft' or 'full'
SELECT set_config('mg47.rollback_level', 'soft', true);

-- ============================================
-- A. SOFT LEVEL
-- ============================================

DO $do$
DECLARE
  v_count INTEGER;
BEGIN
  -- 'cancelled' is committed at this point, so it can be evaluated here
  SELECT count(*) INTO v_count FROM public.mg_events WHERE status = 'cancelled';
  IF v_count > 0 THEN
    RAISE EXCEPTION 'MG47_ROLLBACK: % cancelled mg_events row(s) must be reviewed first', v_count;
  END IF;

  IF to_regclass('public.calendar_entries') IS NULL THEN
    RAISE EXCEPTION 'MG47_ROLLBACK: calendar_entries not found; migration 47 does not seem applied';
  END IF;
END
$do$;

-- A.1 Legacy creation job (same name and schedule), production text
DO $do$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'mg-create-events') THEN
    PERFORM cron.unschedule('mg-create-events');
  END IF;
END
$do$;

SELECT cron.schedule(
  'mg-create-events',
  '0 0 * * 1',
  $cron$
  DO $inner$
  DECLARE
    v_reference_date DATE := '2026-01-05'::DATE;
    v_current_monday DATE := date_trunc('week', CURRENT_DATE)::DATE;
    v_week_offset    INTEGER;
    v_mg_start       DATE;
    v_mg_end         DATE;
    v_reg_open       DATE;
    v_reg_close      DATE;
    v_server         RECORD;
  BEGIN
    v_week_offset := (v_current_monday - v_reference_date) / 7;
    IF v_week_offset % 2 <> 1 THEN
      RETURN;
    END IF;
    v_mg_start   := v_current_monday + 7;
    v_mg_end     := v_mg_start + 6;
    v_reg_open   := v_current_monday;
    v_reg_close  := v_current_monday + 3;
    FOR v_server IN SELECT id FROM public.servers LOOP
      INSERT INTO public.mg_events (server_id, start_date, end_date, registration_open_at, registration_close_at, status)
      VALUES (v_server.id, v_mg_start, v_mg_end, v_reg_open, v_reg_close, 'registration_open')
      ON CONFLICT DO NOTHING;
    END LOOP;
  END;
  $inner$;
  $cron$
);

-- A.2 Guard trigger
DROP TRIGGER IF EXISTS trg_mg_events_guard ON public.mg_events;
DROP FUNCTION IF EXISTS public.mg_events_guard();

-- A.3 Policies and privileges of mg_events as before migration 47 (migration 35 definitions;
--     Supabase default grants to anon / authenticated)
DROP POLICY IF EXISTS "Admins can insert MG events" ON public.mg_events;
CREATE POLICY "Admins can insert MG events" ON public.mg_events
  FOR INSERT WITH CHECK (
    is_super_admin((select auth.uid()))
    OR (server_id = get_user_server_id((select auth.uid())) AND is_user_admin((select auth.uid())))
  );

DROP POLICY IF EXISTS "Admins can delete MG events" ON public.mg_events;
CREATE POLICY "Admins can delete MG events" ON public.mg_events
  FOR DELETE USING (
    is_super_admin((select auth.uid()))
    OR (server_id = get_user_server_id((select auth.uid())) AND is_user_admin((select auth.uid())))
  );

GRANT INSERT, DELETE, TRUNCATE ON public.mg_events TO anon, authenticated;
GRANT UPDATE ON public.mg_events TO anon;

-- A.4 Calendar functions (the audit trigger function goes with the table at 'full' level)
DROP FUNCTION IF EXISTS public.create_mg_calendar_entries(date[]);
DROP FUNCTION IF EXISTS public.shift_mg_calendar_entry(uuid, date);
DROP FUNCTION IF EXISTS public.cancel_mg_calendar_entry(uuid);
DROP FUNCTION IF EXISTS public.mg_create_events_from_calendar(timestamptz);
DROP FUNCTION IF EXISTS public.mg_create_events_for_entry(uuid, uuid);

-- ============================================
-- B. FULL LEVEL (only when the selector above says 'full')
-- ============================================

DO $do$
BEGIN
  IF current_setting('mg47.rollback_level', true) = 'full' THEN
    ALTER TABLE public.mg_events
      DROP CONSTRAINT IF EXISTS uq_mg_events_server_calendar_entry,
      DROP CONSTRAINT IF EXISTS uq_mg_events_server_start_date,
      DROP CONSTRAINT IF EXISTS ck_mg_events_start_monday,
      DROP CONSTRAINT IF EXISTS ck_mg_events_end_date,
      DROP CONSTRAINT IF EXISTS ck_mg_events_close_date,
      DROP CONSTRAINT IF EXISTS ck_mg_events_open_date,
      DROP CONSTRAINT IF EXISTS fk_mg_events_calendar_entry;
    DROP INDEX IF EXISTS public.idx_mg_events_calendar_entry_id;
    ALTER TABLE public.mg_events DROP COLUMN IF EXISTS calendar_entry_id;
    DROP TABLE IF EXISTS public.calendar_entries;
    DROP FUNCTION IF EXISTS public.calendar_entries_audit();
    DROP TYPE IF EXISTS public.calendar_entry_type;
  END IF;
END
$do$;

-- ============================================
-- C. ASSERTIONS
-- ============================================

DO $do$
DECLARE
  v_count INTEGER;
BEGIN
  SELECT count(*) INTO v_count FROM cron.job
  WHERE jobname = 'mg-create-events' AND active AND schedule = '0 0 * * 1'
    AND command LIKE '%v_reference_date%';
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'MG47_ROLLBACK: legacy mg-create-events job not restored (found %)', v_count;
  END IF;

  SELECT count(*) INTO v_count FROM pg_policies
  WHERE schemaname = 'public' AND tablename = 'mg_events'
    AND policyname IN ('Admins can insert MG events', 'Admins can delete MG events');
  IF v_count <> 2 THEN
    RAISE EXCEPTION 'MG47_ROLLBACK: mg_events INSERT/DELETE policies not restored';
  END IF;

  SELECT count(*) INTO v_count FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname IN ('create_mg_calendar_entries', 'shift_mg_calendar_entry', 'cancel_mg_calendar_entry',
                      'mg_create_events_from_calendar', 'mg_create_events_for_entry', 'mg_events_guard');
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'MG47_ROLLBACK: % calendar function(s) remain', v_count;
  END IF;

  IF current_setting('mg47.rollback_level', true) = 'full'
     AND to_regclass('public.calendar_entries') IS NOT NULL THEN
    RAISE EXCEPTION 'MG47_ROLLBACK: calendar_entries still present at full level';
  END IF;
END
$do$;

COMMIT;
