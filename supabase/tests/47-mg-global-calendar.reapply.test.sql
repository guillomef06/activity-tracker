-- =============================================================================
-- Second application of migration 47 must be refused by the guard (plan S10).
-- LOCAL REHEARSAL DATABASE ONLY, AFTER migration 47 is applied.
--
-- Applies the migration file again inside a transaction. The guard (a) raises
-- "calendar_entries already exists"; the transaction is aborted, the migration's
-- COMMIT becomes a ROLLBACK and the fingerprint of the database must be identical
-- before and after. If the guard failed, the migration would try to re-create
-- objects and the assertion below (or the first error) would show it.
--
-- Parameter (psql variable):  migration_file  path of the migration INSIDE the container
-- Driven by supabase/tests/rehearsal/run-guard-negatives.sh (which checks the first ERROR line).
-- =============================================================================
\set ON_ERROR_STOP on

DO $t$
BEGIN
  IF to_regclass('public.calendar_entries') IS NULL THEN
    RAISE EXCEPTION 'PRECONDITION: migration 47 is not applied; this test runs AFTER it';
  END IF;
END $t$;

CREATE TEMP TABLE reapply_before AS
  SELECT (SELECT count(*) FROM public.calendar_entries) AS entries,
         (SELECT count(*) FROM public.mg_events) AS events,
         (SELECT string_agg(jobname || ':' || md5(command), ',' ORDER BY jobname) FROM cron.job) AS jobs,
         (SELECT count(*) FROM pg_policy WHERE polrelid IN ('public.mg_events'::regclass, 'public.calendar_entries'::regclass)) AS policies,
         (SELECT count(*) FROM pg_proc WHERE pronamespace = 'public'::regnamespace) AS functions,
         (SELECT string_agg(e::text, ',') FROM unnest(enum_range(NULL::public.mg_event_status)) e) AS enum_labels,
         (SELECT string_agg(id::text || starts_at, ',' ORDER BY id) FROM public.calendar_entries) AS entries_fp;

BEGIN;
\echo --- applying the migration a second time, expecting the guard to abort ---
\set ON_ERROR_STOP off
\i :migration_file
\set ON_ERROR_STOP on
ROLLBACK;

DO $t$
DECLARE b record; a record;
BEGIN
  SELECT * INTO b FROM reapply_before;
  SELECT (SELECT count(*) FROM public.calendar_entries) AS entries,
         (SELECT count(*) FROM public.mg_events) AS events,
         (SELECT string_agg(jobname || ':' || md5(command), ',' ORDER BY jobname) FROM cron.job) AS jobs,
         (SELECT count(*) FROM pg_policy WHERE polrelid IN ('public.mg_events'::regclass, 'public.calendar_entries'::regclass)) AS policies,
         (SELECT count(*) FROM pg_proc WHERE pronamespace = 'public'::regnamespace) AS functions,
         (SELECT string_agg(e::text, ',') FROM unnest(enum_range(NULL::public.mg_event_status)) e) AS enum_labels,
         (SELECT string_agg(id::text || starts_at, ',' ORDER BY id) FROM public.calendar_entries) AS entries_fp
    INTO a;
  IF a IS DISTINCT FROM b THEN
    RAISE EXCEPTION 'ASSERT FAILED: the database changed during the refused second application';
  END IF;
  IF a.entries <> 29 THEN RAISE EXCEPTION 'ASSERT FAILED: expected 29 entries, got %', a.entries; END IF;
  IF (SELECT count(*) FROM cron.job WHERE jobname = 'mg-create-events') <> 1 THEN
    RAISE EXCEPTION 'ASSERT FAILED: expected exactly one mg-create-events job';
  END IF;
  RAISE NOTICE 'PASS reapply: second application refused, database unchanged';
END $t$;
