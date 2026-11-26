-- =============================================================================
-- Negative test of the migration 47 PRE-FLIGHT GUARD (plan S10, quickstart Q2).
-- LOCAL REHEARSAL DATABASE ONLY, BEFORE migration 47 is applied.
--
-- It corrupts the data inside a transaction, tries to apply the migration file in
-- that same transaction and checks that the guard aborted and that NOTHING
-- remains (no calendar table, enum untouched, old cron job text, policies intact).
-- The migration's own COMMIT turns into a ROLLBACK because the transaction is
-- aborted by the guard. If the guard failed to abort, the migration would commit
-- on the disposable database and the final assertions fail loudly (re-create the
-- container afterwards).
--
-- Parameters (psql variables):
--   migration_file  path of the migration INSIDE the container (docker cp it first)
--   corrupt         one SQL statement that makes the data invalid for the guard
--
-- Normally driven by supabase/tests/rehearsal/run-guard-negatives.sh, which also
-- checks the first ERROR line (MG47_PREFLIGHT: ...).
-- =============================================================================
\set ON_ERROR_STOP on

DO $t$
BEGIN
  IF to_regclass('public.calendar_entries') IS NOT NULL THEN
    RAISE EXCEPTION 'PRECONDITION: migration 47 already applied; this test runs BEFORE it';
  END IF;
END $t$;

CREATE FUNCTION pg_temp.assert_pristine(p_label text) RETURNS void LANGUAGE plpgsql AS $f$
BEGIN
  IF to_regclass('public.calendar_entries') IS NOT NULL THEN RAISE EXCEPTION 'ASSERT FAILED (%): calendar_entries exists', p_label; END IF;
  IF EXISTS (SELECT 1 FROM pg_enum WHERE enumtypid = 'public.mg_event_status'::regtype AND enumlabel = 'cancelled') THEN
    RAISE EXCEPTION 'ASSERT FAILED (%): enum value cancelled exists', p_label; END IF;
  IF to_regprocedure('public.create_mg_calendar_entries(date[])') IS NOT NULL THEN RAISE EXCEPTION 'ASSERT FAILED (%): function created', p_label; END IF;
  IF (SELECT md5(command) FROM cron.job WHERE jobname = 'mg-create-events') IS DISTINCT FROM '4209ee55b5f1f1050cc54d5719e241a2' THEN
    RAISE EXCEPTION 'ASSERT FAILED (%): the mg-create-events job text changed', p_label; END IF;
  IF (SELECT count(*) FROM cron.job) <> 5 THEN RAISE EXCEPTION 'ASSERT FAILED (%): cron job count changed', p_label; END IF;
  IF (SELECT count(*) FROM pg_policy WHERE polrelid = 'public.mg_events'::regclass) <> 4 THEN
    RAISE EXCEPTION 'ASSERT FAILED (%): mg_events policies changed', p_label; END IF;
  IF EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid = 'public.mg_events'::regclass AND NOT tgisinternal) THEN
    RAISE EXCEPTION 'ASSERT FAILED (%): trigger created on mg_events', p_label; END IF;
  IF NOT has_table_privilege('authenticated', 'public.mg_events', 'INSERT') THEN
    RAISE EXCEPTION 'ASSERT FAILED (%): mg_events privileges changed', p_label; END IF;
END $f$;

SELECT pg_temp.assert_pristine('before');
CREATE TEMP TABLE neg_before AS
  SELECT (SELECT count(*) FROM public.mg_events) AS events,
         (SELECT string_agg(id::text || start_date || end_date, ',' ORDER BY id) FROM public.mg_events) AS fingerprint;

BEGIN;
:corrupt;
\echo --- applying the migration on corrupted data, expecting the guard to abort ---
\set ON_ERROR_STOP off
\i :migration_file
\set ON_ERROR_STOP on
ROLLBACK;

SELECT pg_temp.assert_pristine('after');
DO $t$
DECLARE b record;
BEGIN
  SELECT * INTO b FROM neg_before;
  IF (SELECT count(*) FROM public.mg_events) <> b.events
     OR (SELECT string_agg(id::text || start_date || end_date, ',' ORDER BY id) FROM public.mg_events) IS DISTINCT FROM b.fingerprint THEN
    RAISE EXCEPTION 'ASSERT FAILED: mg_events data changed (the corruption must have been rolled back)';
  END IF;
  RAISE NOTICE 'PASS guard-negative: migration refused, database unchanged';
END $t$;
