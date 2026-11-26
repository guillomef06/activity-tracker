-- =============================================================================
-- SQL tests S1-S12 of migration 47-mg-global-calendar.sql
-- Spec 003-mg-global-calendar, plan layer 1, quickstart Q3.
--
-- !!! LOCAL REHEARSAL DATABASE ONLY, NEVER PRODUCTION !!!
-- The script creates fixture auth.users / user_profiles / servers rows, deletes
-- calendar and event rows and impersonates roles. Everything happens in ONE
-- transaction that always ends in ROLLBACK (each scenario also runs inside its
-- own SAVEPOINT that is rolled back, so scenarios do not influence each other).
--
-- Preconditions (see supabase/tests/rehearsal/README.md):
--   1. bootstrap.sql loaded, snapshot.local.sql loaded (production-shaped data);
--   2. the one-row data fix PO-1 executed (Wednesday demo event a734f6ab-... on
--      2026-08-03), otherwise the migration refuses to apply;
--   3. 47-mg-global-calendar.sql applied (and, optionally, nothing else).
--
-- Run (Git Bash):  export MSYS_NO_PATHCONV=1
--   docker exec -i at-mg-1b psql -U postgres -v ON_ERROR_STOP=1 < supabase/tests/47-mg-global-calendar.test.sql
-- Expected output: one "NOTICE: PASS Sxx" per scenario, then "ALL SCENARIOS PASSED".
-- Any failure raises "ASSERT FAILED: ..." and stops the script (non-zero exit).
--
-- Time handling: the client functions use now() on purpose (not injectable), so
-- their scenarios build fixtures relative to the current UTC Monday (M(n)).
-- The internal creation function is driven through its p_now parameter.
-- Impersonation sets BOTH legacy GUC request.jwt.claim.sub (read by auth.uid()
-- in the local image) and request.jwt.claims (read by newer versions).
--
-- Not covered here (manual two-session steps, README "Two-session scenarios"):
-- lock serialisation (FR-031, US3.11). Not reachable by construction (left as
-- TODO): shift check "following entry already opened" (a follower is always
-- >= 14 days later than an opened selected entry).
-- Second application / invalid-row guard: see the two sibling *.test.sql files.
-- =============================================================================
\set ON_ERROR_STOP on
SET client_min_messages = notice;

BEGIN;
-- The session time zone is deliberately NOT forced: run the script under several zones
-- (PGOPTIONS='-c timezone=Asia/Tokyo') to prove time zone independence (V1).

-- ---------------------------------------------------------------------------
-- Preconditions
-- ---------------------------------------------------------------------------
DO $t$
BEGIN
  IF to_regclass('public.calendar_entries') IS NULL THEN
    RAISE EXCEPTION 'PRECONDITION: migration 47 is not applied (public.calendar_entries missing)';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.mg_events WHERE id = 'a734f6ab-98f4-4814-b952-5b3269023401') THEN
    RAISE EXCEPTION 'PRECONDITION: production snapshot not loaded (event a734f6ab-... missing)';
  END IF;
END $t$;

-- ---------------------------------------------------------------------------
-- Helpers (pg_temp: session-local, vanish with the connection)
-- ---------------------------------------------------------------------------
CREATE FUNCTION pg_temp.ok(p_cond boolean, p_msg text) RETURNS void LANGUAGE plpgsql AS $f$
BEGIN
  IF p_cond IS NOT TRUE THEN RAISE EXCEPTION 'ASSERT FAILED: %', p_msg; END IF;
END $f$;

CREATE FUNCTION pg_temp.eq(p_actual text, p_expected text, p_msg text) RETURNS void LANGUAGE plpgsql AS $f$
BEGIN
  IF p_actual IS DISTINCT FROM p_expected THEN
    RAISE EXCEPTION 'ASSERT FAILED: % (expected [%], got [%])', p_msg, p_expected, p_actual;
  END IF;
END $f$;

-- Executes one statement (optionally as a client role). Returns 'OK:<rows>' or
-- 'ERR:<sqlstate>:<message>[|<detail>]'. Role switch is undone before returning.
CREATE FUNCTION pg_temp.run(p_sql text, p_uid uuid DEFAULT NULL, p_role text DEFAULT 'postgres') RETURNS text
LANGUAGE plpgsql AS $f$
DECLARE n bigint; st text; msg text; det text; res text;
BEGIN
  IF p_role <> 'postgres' THEN
    PERFORM set_config('request.jwt.claim.sub', coalesce(p_uid::text, ''), true);
    PERFORM set_config('request.jwt.claims',
      CASE WHEN p_uid IS NULL THEN '' ELSE json_build_object('sub', p_uid, 'role', p_role)::text END, true);
    EXECUTE format('SET LOCAL ROLE %I', p_role);
  END IF;
  BEGIN
    EXECUTE p_sql;
    GET DIAGNOSTICS n = ROW_COUNT;
    res := 'OK:' || n;
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS st = RETURNED_SQLSTATE, msg = MESSAGE_TEXT, det = PG_EXCEPTION_DETAIL;
    res := 'ERR:' || st || ':' || msg || coalesce('|' || det, '');
  END;
  RESET ROLE;
  PERFORM set_config('request.jwt.claim.sub', '', true);
  PERFORM set_config('request.jwt.claims', '', true);
  RETURN res;
END $f$;

-- Same, for a query returning one value (single row, single column) as text.
CREATE FUNCTION pg_temp.val(p_sql text, p_uid uuid DEFAULT NULL, p_role text DEFAULT 'postgres') RETURNS text
LANGUAGE plpgsql AS $f$
DECLARE v text; st text; msg text; det text;
BEGIN
  IF p_role <> 'postgres' THEN
    PERFORM set_config('request.jwt.claim.sub', coalesce(p_uid::text, ''), true);
    PERFORM set_config('request.jwt.claims',
      CASE WHEN p_uid IS NULL THEN '' ELSE json_build_object('sub', p_uid, 'role', p_role)::text END, true);
    EXECUTE format('SET LOCAL ROLE %I', p_role);
  END IF;
  BEGIN
    EXECUTE p_sql INTO v;
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS st = RETURNED_SQLSTATE, msg = MESSAGE_TEXT, det = PG_EXCEPTION_DETAIL;
    v := 'ERR:' || st || ':' || msg || coalesce('|' || det, '');
  END;
  RESET ROLE;
  PERFORM set_config('request.jwt.claim.sub', '', true);
  PERFORM set_config('request.jwt.claims', '', true);
  RETURN v;
END $f$;

-- Asserts that r is an error carrying the given stable code (message) and,
-- optionally, a "reason" in the DETAIL json.
CREATE FUNCTION pg_temp.err(p_r text, p_code text, p_reason text DEFAULT NULL, p_msg text DEFAULT '') RETURNS void
LANGUAGE plpgsql AS $f$
BEGIN
  IF p_r IS NULL OR p_r NOT LIKE 'ERR:%:' || p_code || '%' THEN
    RAISE EXCEPTION 'ASSERT FAILED: % (expected error %, got [%])', p_msg, p_code, p_r;
  END IF;
  IF p_reason IS NOT NULL AND p_r !~ ('"reason"\s*:\s*"' || p_reason || '"') THEN
    RAISE EXCEPTION 'ASSERT FAILED: % (expected reason %, got [%])', p_msg, p_reason, p_r;
  END IF;
END $f$;

-- Identities and fixtures
CREATE FUNCTION pg_temp.u_sa()   RETURNS uuid LANGUAGE sql IMMUTABLE AS $f$ SELECT 'aaaaaaaa-0000-0000-0000-000000000001'::uuid $f$;
CREATE FUNCTION pg_temp.u_adm()  RETURNS uuid LANGUAGE sql IMMUTABLE AS $f$ SELECT 'aaaaaaaa-0000-0000-0000-000000000002'::uuid $f$;  -- admin of server A
CREATE FUNCTION pg_temp.u_mem()  RETURNS uuid LANGUAGE sql IMMUTABLE AS $f$ SELECT 'aaaaaaaa-0000-0000-0000-000000000003'::uuid $f$;  -- member of server A
CREATE FUNCTION pg_temp.u_memb() RETURNS uuid LANGUAGE sql IMMUTABLE AS $f$ SELECT 'aaaaaaaa-0000-0000-0000-000000000004'::uuid $f$;  -- member of server B
CREATE FUNCTION pg_temp.u_admb() RETURNS uuid LANGUAGE sql IMMUTABLE AS $f$ SELECT 'aaaaaaaa-0000-0000-0000-000000000005'::uuid $f$;  -- admin of server B
CREATE FUNCTION pg_temp.s_a()    RETURNS uuid LANGUAGE sql IMMUTABLE AS $f$ SELECT 'bbbbbbbb-0000-0000-0000-000000000001'::uuid $f$;
CREATE FUNCTION pg_temp.s_b()    RETURNS uuid LANGUAGE sql IMMUTABLE AS $f$ SELECT 'bbbbbbbb-0000-0000-0000-000000000002'::uuid $f$;

CREATE FUNCTION pg_temp.mk_user(p_id uuid, p_server uuid, p_role text, p_tag text) RETURNS void LANGUAGE plpgsql AS $f$
BEGIN
  INSERT INTO auth.users (id) VALUES (p_id);
  INSERT INTO public.user_profiles (id, server_id, display_name, username, role, recovery_question_id, recovery_answer_hash)
  VALUES (p_id, p_server, 'test-' || p_tag, 'test-' || p_tag, p_role, 1, 'x');
END $f$;

CREATE FUNCTION pg_temp.mk_server(p_name text) RETURNS uuid LANGUAGE plpgsql AS $f$
DECLARE v_id uuid := gen_random_uuid();
BEGIN
  INSERT INTO public.servers (id, name) VALUES (v_id, p_name);
  RETURN v_id;
END $f$;

-- Monday (UTC) of the current week + n weeks. M(0) <= today, M(1) > today.
CREATE FUNCTION pg_temp.m(p_n int) RETURNS date LANGUAGE sql STABLE AS
$f$ SELECT date_trunc('week', now() AT TIME ZONE 'UTC')::date + 7 * p_n $f$;

CREATE FUNCTION pg_temp.wipe() RETURNS void LANGUAGE plpgsql AS $f$
BEGIN
  DELETE FROM public.mg_events WHERE true;
  DELETE FROM public.calendar_entries WHERE true;
END $f$;

-- MG entry whose MG start (Monday) is p_start.
CREATE FUNCTION pg_temp.mk_start(p_start date, p_cancelled boolean DEFAULT false) RETURNS uuid LANGUAGE plpgsql AS $f$
DECLARE v_id uuid;
BEGIN
  INSERT INTO public.calendar_entries (type, starts_at, ends_at, all_day, cancelled_at)
  VALUES ('mg', (p_start::timestamp AT TIME ZONE 'UTC'), ((p_start + 7)::timestamp AT TIME ZONE 'UTC'), true,
          CASE WHEN p_cancelled THEN now() END)
  RETURNING id INTO v_id;
  RETURN v_id;
END $f$;

-- MG entry given by its OPENING Monday (MG start = opening + 7).
CREATE FUNCTION pg_temp.mk_entry(p_opening date, p_cancelled boolean DEFAULT false) RETURNS uuid LANGUAGE sql AS
$f$ SELECT pg_temp.mk_start(p_opening + 7, p_cancelled) $f$;

CREATE FUNCTION pg_temp.mk_event(p_server uuid, p_entry uuid, p_start date, p_status text) RETURNS uuid LANGUAGE plpgsql AS $f$
DECLARE v_id uuid;
BEGIN
  INSERT INTO public.mg_events (server_id, start_date, end_date, registration_open_at, registration_close_at, status, calendar_entry_id)
  VALUES (p_server, p_start, p_start + 6, p_start - 7, p_start - 4, p_status::public.mg_event_status, p_entry)
  RETURNING id INTO v_id;
  RETURN v_id;
END $f$;

CREATE FUNCTION pg_temp.starts(p_with_cancelled boolean DEFAULT false) RETURNS text LANGUAGE sql AS
$f$ SELECT coalesce(string_agg(((starts_at AT TIME ZONE 'UTC')::date)::text, ',' ORDER BY starts_at), '')
    FROM public.calendar_entries WHERE type = 'mg' AND (p_with_cancelled OR cancelled_at IS NULL) $f$;

CREATE FUNCTION pg_temp.ins_mg(p_start date) RETURNS text LANGUAGE sql AS
$f$ SELECT pg_temp.run(format($q$INSERT INTO public.calendar_entries (type, starts_at, ends_at, all_day)
       VALUES ('mg', %L, %L, true)$q$, p_start::text || ' 00:00:00+00', (p_start + 7)::text || ' 00:00:00+00')) $f$;

CREATE FUNCTION pg_temp.create_call(p_uid uuid, p_role text, p_dates date[]) RETURNS text LANGUAGE sql AS
$f$ SELECT pg_temp.val(format($q$SELECT coalesce(string_agg(outcome, ',' ORDER BY opening_monday), '<none>')
       FROM public.create_mg_calendar_entries(%L::date[])$q$, p_dates), p_uid, p_role) $f$;

CREATE FUNCTION pg_temp.shift_call(p_uid uuid, p_entry uuid, p_new_opening date) RETURNS text LANGUAGE sql AS
$f$ SELECT pg_temp.val(format($q$SELECT coalesce(string_agg(old_start || '>' || new_start || ':' || events_updated, ',' ORDER BY old_start), '<none>')
       FROM public.shift_mg_calendar_entry(%L, %L)$q$, p_entry, p_new_opening), p_uid, 'authenticated') $f$;

CREATE FUNCTION pg_temp.cancel_call(p_uid uuid, p_entry uuid) RETURNS text LANGUAGE sql AS
$f$ SELECT pg_temp.val(format($q$SELECT public.cancel_mg_calendar_entry(%L)$q$, p_entry), p_uid, 'authenticated') $f$;

-- Fixtures shared by the scenarios (rolled back with everything else)
DO $t$
BEGIN
  INSERT INTO public.servers (id, name) VALUES (pg_temp.s_a(), 'T-SRV-A'), (pg_temp.s_b(), 'T-SRV-B');
  PERFORM pg_temp.mk_user(pg_temp.u_sa(),   NULL,           'super_admin', 'sa');
  PERFORM pg_temp.mk_user(pg_temp.u_adm(),  pg_temp.s_a(),  'admin',       'adm');
  PERFORM pg_temp.mk_user(pg_temp.u_mem(),  pg_temp.s_a(),  'member',      'mem');
  PERFORM pg_temp.mk_user(pg_temp.u_memb(), pg_temp.s_b(),  'member',      'memb');
  PERFORM pg_temp.mk_user(pg_temp.u_admb(), pg_temp.s_b(),  'admin',       'admb');
END $t$;

-- =============================================================================
-- S1. Structure and MG shape CHECK under three session time zones
-- =============================================================================
SAVEPOINT s1;
DO $t$
DECLARE tz text; r text; c text;
BEGIN
  -- named constraints (data-model.md section 1 and 2)
  FOREACH c IN ARRAY ARRAY['uq_calendar_entries_type_starts_at', 'ck_calendar_entries_ends_after_start',
    'ck_calendar_entries_mg_shape', 'ck_calendar_entries_title', 'ck_calendar_entries_cancel_mg_only',
    'ex_calendar_entries_mg_min_gap'] LOOP
    PERFORM pg_temp.ok(EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.calendar_entries'::regclass AND conname = c),
      'calendar_entries constraint ' || c || ' exists');
  END LOOP;
  PERFORM pg_temp.ok((SELECT contype = 'x' FROM pg_constraint WHERE conname = 'ex_calendar_entries_mg_min_gap'),
    'ex_calendar_entries_mg_min_gap is an exclusion constraint');
  PERFORM pg_temp.ok((SELECT NOT condeferrable FROM pg_constraint WHERE conname = 'ex_calendar_entries_mg_min_gap'),
    'exclusion constraint is not deferrable');
  FOREACH c IN ARRAY ARRAY['uq_mg_events_server_calendar_entry', 'uq_mg_events_server_start_date', 'ck_mg_events_start_monday',
    'ck_mg_events_end_date', 'ck_mg_events_close_date', 'ck_mg_events_open_date'] LOOP
    PERFORM pg_temp.ok(EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.mg_events'::regclass AND conname = c),
      'mg_events constraint ' || c || ' exists');
  END LOOP;
  PERFORM pg_temp.ok((SELECT confdeltype = 'r' FROM pg_constraint
    WHERE conrelid = 'public.mg_events'::regclass AND contype = 'f' AND confrelid = 'public.calendar_entries'::regclass),
    'mg_events.calendar_entry_id FK is ON DELETE RESTRICT');
  FOREACH c IN ARRAY ARRAY['idx_mg_events_calendar_entry_id', 'idx_calendar_entries_created_by',
    'idx_calendar_entries_updated_by', 'idx_calendar_entries_cancelled_by'] LOOP
    PERFORM pg_temp.ok(EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = c), 'index ' || c || ' exists');
  END LOOP;
  PERFORM pg_temp.eq((SELECT string_agg(enumlabel, ',' ORDER BY enumsortorder) FROM pg_enum
    WHERE enumtypid = 'public.calendar_entry_type'::regtype), 'mg,pvp', 'calendar_entry_type labels');

  FOREACH tz IN ARRAY ARRAY['America/Los_Angeles', 'Asia/Tokyo', 'UTC'] LOOP
    PERFORM set_config('timezone', tz, true);
    PERFORM pg_temp.wipe();
    r := pg_temp.run($q$INSERT INTO public.calendar_entries (type, starts_at, ends_at, all_day)
      VALUES ('mg', '2030-01-07 00:00:00+00', '2030-01-14 00:00:00+00', true)$q$);
    PERFORM pg_temp.eq(r, 'OK:1', 'valid Monday 00:00 UTC accepted under ' || tz);
    PERFORM pg_temp.wipe();
    r := pg_temp.run($q$INSERT INTO public.calendar_entries (type, starts_at, ends_at, all_day)
      VALUES ('mg', '2030-01-08 00:00:00+00', '2030-01-15 00:00:00+00', true)$q$);
    PERFORM pg_temp.ok(r LIKE 'ERR:23514:%ck_calendar_entries_mg_shape%', 'non-Monday refused under ' || tz || ' [' || r || ']');
    r := pg_temp.run($q$INSERT INTO public.calendar_entries (type, starts_at, ends_at, all_day)
      VALUES ('mg', '2030-01-07 01:00:00+00', '2030-01-14 01:00:00+00', true)$q$);
    PERFORM pg_temp.ok(r LIKE 'ERR:23514:%ck_calendar_entries_mg_shape%', 'non-midnight refused under ' || tz || ' [' || r || ']');
    -- Monday 00:00 in Los Angeles is Monday 08:00 UTC: must not pass for the UTC shape rule
    r := pg_temp.run($q$INSERT INTO public.calendar_entries (type, starts_at, ends_at, all_day)
      VALUES ('mg', '2030-01-07 08:00:00+00', '2030-01-14 08:00:00+00', true)$q$);
    PERFORM pg_temp.ok(r LIKE 'ERR:23514:%', 'local-midnight (non UTC) refused under ' || tz || ' [' || r || ']');
    r := pg_temp.run($q$INSERT INTO public.calendar_entries (type, starts_at, ends_at, all_day)
      VALUES ('mg', '2030-01-07 00:00:00+00', '2030-01-13 00:00:00+00', true)$q$);
    PERFORM pg_temp.ok(r LIKE 'ERR:23514:%ck_calendar_entries_mg_shape%', 'wrong length refused under ' || tz || ' [' || r || ']');
    r := pg_temp.run($q$INSERT INTO public.calendar_entries (type, starts_at, ends_at, all_day)
      VALUES ('mg', '2030-01-07 00:00:00+00', '2030-01-14 00:00:00+00', false)$q$);
    PERFORM pg_temp.ok(r LIKE 'ERR:23514:%ck_calendar_entries_mg_shape%', 'all_day = false refused for mg under ' || tz || ' [' || r || ']');
  END LOOP;
  PERFORM set_config('timezone', 'UTC', true);

  -- non-MG rules
  PERFORM pg_temp.wipe();
  PERFORM pg_temp.eq(pg_temp.run($q$INSERT INTO public.calendar_entries (type, title, starts_at, ends_at)
    VALUES ('pvp', 'War', '2030-01-09 20:00:00+00', '2030-01-09 22:00:00+00')$q$), 'OK:1', 'pvp with title and free times accepted');
  r := pg_temp.run($q$INSERT INTO public.calendar_entries (type, starts_at, ends_at)
    VALUES ('pvp', '2030-01-10 20:00:00+00', '2030-01-10 22:00:00+00')$q$);
  PERFORM pg_temp.ok(r LIKE 'ERR:23514:%ck_calendar_entries_title%', 'pvp without title refused [' || r || ']');
  r := pg_temp.run($q$INSERT INTO public.calendar_entries (type, title, starts_at, ends_at)
    VALUES ('pvp', '   ', '2030-01-10 20:00:00+00', '2030-01-10 22:00:00+00')$q$);
  PERFORM pg_temp.ok(r LIKE 'ERR:23514:%ck_calendar_entries_title%', 'pvp with blank title refused [' || r || ']');
  r := pg_temp.run(format($q$INSERT INTO public.calendar_entries (type, title, starts_at, ends_at)
    VALUES ('pvp', %L, '2030-01-10 20:00:00+00', '2030-01-10 22:00:00+00')$q$, repeat('x', 101)));
  PERFORM pg_temp.ok(r LIKE 'ERR:23514:%ck_calendar_entries_title%', 'pvp with 101-char title refused [' || r || ']');
  r := pg_temp.run($q$INSERT INTO public.calendar_entries (type, title, starts_at, ends_at)
    VALUES ('pvp', 'x', '2030-01-10 22:00:00+00', '2030-01-10 22:00:00+00')$q$);
  PERFORM pg_temp.ok(r LIKE 'ERR:23514:%ck_calendar_entries_ends_after_start%', 'ends_at must be after starts_at [' || r || ']');
  r := pg_temp.run($q$INSERT INTO public.calendar_entries (type, title, starts_at, ends_at)
    VALUES ('pvp', 'again', '2030-01-09 20:00:00+00', '2030-01-09 23:00:00+00')$q$);
  PERFORM pg_temp.ok(r LIKE 'ERR:23505:%uq_calendar_entries_type_starts_at%', '(type, starts_at) unique [' || r || ']');
  r := pg_temp.run($q$INSERT INTO public.calendar_entries (type, title, starts_at, ends_at, cancelled_at)
    VALUES ('pvp', 'c', '2030-01-11 20:00:00+00', '2030-01-11 22:00:00+00', now())$q$);
  PERFORM pg_temp.ok(r LIKE 'ERR:23514:%ck_calendar_entries_cancel_mg_only%', 'cancelled_at only for mg [' || r || ']');
  RAISE NOTICE 'PASS S1';
END $t$;
ROLLBACK TO SAVEPOINT s1;

-- =============================================================================
-- S2. 14-day rule (exclusion constraint)
-- =============================================================================
SAVEPOINT s2;
DO $t$
DECLARE tz text; a date := date '2030-01-07'; r text;
BEGIN
  PERFORM pg_temp.ok(extract(isodow FROM a) = 1, 'fixture date is a Monday');
  FOREACH tz IN ARRAY ARRAY['America/Los_Angeles', 'Asia/Tokyo', 'UTC'] LOOP
    PERFORM set_config('timezone', tz, true);
    PERFORM pg_temp.wipe();
    PERFORM pg_temp.mk_start(a);
    r := pg_temp.ins_mg(a + 7);
    PERFORM pg_temp.ok(r LIKE 'ERR:23P01:%ex_calendar_entries_mg_min_gap%', '+7 days refused under ' || tz || ' [' || r || ']');
    r := pg_temp.ins_mg(a - 7);
    PERFORM pg_temp.ok(r LIKE 'ERR:23P01:%ex_calendar_entries_mg_min_gap%', '-7 days refused under ' || tz || ' [' || r || ']');
    PERFORM pg_temp.ok(pg_temp.ins_mg(a + 13) LIKE 'ERR:%', '+13 days refused under ' || tz);
    PERFORM pg_temp.ok(pg_temp.ins_mg(a + 8) LIKE 'ERR:%', '+8 days refused under ' || tz);
    PERFORM pg_temp.eq(pg_temp.ins_mg(a + 14), 'OK:1', '+14 days accepted under ' || tz);
    PERFORM pg_temp.eq(pg_temp.ins_mg(a - 14), 'OK:1', '-14 days accepted under ' || tz);
  END LOOP;
  PERFORM set_config('timezone', 'UTC', true);

  -- cancelled entries do not count
  PERFORM pg_temp.wipe();
  PERFORM pg_temp.mk_start(a, true);
  PERFORM pg_temp.eq(pg_temp.ins_mg(a + 7), 'OK:1', 'cancelled entry ignored by the 14-day rule');
  r := pg_temp.run(format($q$UPDATE public.calendar_entries SET cancelled_at = NULL
    WHERE starts_at = %L$q$, a::text || ' 00:00:00+00'));
  PERFORM pg_temp.ok(r LIKE 'ERR:23P01:%', 'un-cancelling into a conflict is refused [' || r || ']');

  -- pvp unaffected, even on the same timestamp as an mg entry
  PERFORM pg_temp.wipe();
  PERFORM pg_temp.mk_start(a);
  PERFORM pg_temp.eq(pg_temp.run($q$INSERT INTO public.calendar_entries (type, title, starts_at, ends_at)
    VALUES ('pvp', 'near', '2030-01-08 20:00:00+00', '2030-01-08 21:00:00+00')$q$), 'OK:1', 'pvp one day after an mg entry');
  PERFORM pg_temp.eq(pg_temp.run($q$INSERT INTO public.calendar_entries (type, title, starts_at, ends_at)
    VALUES ('pvp', 'same', '2030-01-07 00:00:00+00', '2030-01-07 01:00:00+00')$q$), 'OK:1', 'pvp on the same timestamp as an mg entry');

  -- direct UPDATE by postgres is refused too (seed and backfill are protected the same way)
  PERFORM pg_temp.wipe();
  PERFORM pg_temp.mk_start(a);
  PERFORM pg_temp.mk_start(a + 14);
  r := pg_temp.run(format($q$UPDATE public.calendar_entries SET starts_at = %L, ends_at = %L
    WHERE starts_at = %L$q$, (a + 7)::text || ' 00:00:00+00', (a + 14)::text || ' 00:00:00+00', (a + 14)::text || ' 00:00:00+00'));
  PERFORM pg_temp.ok(r LIKE 'ERR:23P01:%', 'direct update into a conflict refused [' || r || ']');
  RAISE NOTICE 'PASS S2';
END $t$;
ROLLBACK TO SAVEPOINT s2;

-- =============================================================================
-- S3. create_mg_calendar_entries
-- =============================================================================
SAVEPOINT s3;
DO $t$
DECLARE r text; ev0 bigint; n0 bigint; e record; ds date[]; i int;
BEGIN
  PERFORM pg_temp.wipe();
  -- identity checks
  PERFORM pg_temp.err(pg_temp.create_call(pg_temp.u_adm(), 'authenticated', ARRAY[pg_temp.m(3)]), 'MG_CAL_FORBIDDEN', NULL, 'admin refused');
  PERFORM pg_temp.err(pg_temp.create_call(pg_temp.u_mem(), 'authenticated', ARRAY[pg_temp.m(3)]), 'MG_CAL_FORBIDDEN', NULL, 'member refused');
  r := pg_temp.create_call(NULL, 'anon', ARRAY[pg_temp.m(3)]);
  PERFORM pg_temp.ok(r LIKE 'ERR:42501:%', 'anonymous refused [' || r || ']');
  r := pg_temp.create_call(NULL, 'authenticated', ARRAY[pg_temp.m(3)]);   -- authenticated role without a user id
  PERFORM pg_temp.err(r, 'MG_CAL_FORBIDDEN', NULL, 'missing JWT subject is not super admin');
  PERFORM pg_temp.eq(pg_temp.starts(true), '', 'nothing written by refused calls');

  -- the five outcomes, precedence, per-date isolation, ascending self-interaction
  PERFORM pg_temp.mk_entry(pg_temp.m(-2));                 -- past entry: its date reports already_exists, not opening_passed
  PERFORM pg_temp.mk_entry(pg_temp.m(4));                  -- existing future entry
  ds := ARRAY[pg_temp.m(-3) + 2, pg_temp.m(-2), pg_temp.m(0), pg_temp.m(2), pg_temp.m(3), pg_temp.m(4), pg_temp.m(5), pg_temp.m(6)];
  r := pg_temp.create_call(pg_temp.u_sa(), 'authenticated', ds);
  PERFORM pg_temp.eq(r,
    'rejected_not_monday,already_exists,rejected_opening_passed,created,rejected_too_close,already_exists,rejected_too_close,created',
    'outcomes and precedence');
  PERFORM pg_temp.eq(pg_temp.starts(),
    (pg_temp.m(-2) + 7)::text || ',' || (pg_temp.m(2) + 7)::text || ',' || (pg_temp.m(4) + 7)::text || ',' || (pg_temp.m(6) + 7)::text,
    'only created dates were added');
  -- shape of a created row and its audit columns (written as the super admin)
  SELECT * INTO e FROM public.calendar_entries WHERE starts_at = ((pg_temp.m(2) + 7)::timestamp AT TIME ZONE 'UTC');
  PERFORM pg_temp.ok(e.type = 'mg' AND e.all_day AND e.title IS NULL AND e.cancelled_at IS NULL, 'created row: mg, all_day, no title, not cancelled');
  PERFORM pg_temp.ok(e.ends_at = e.starts_at + interval '168 hours', 'created row: ends_at = starts_at + 7 days');
  PERFORM pg_temp.ok(e.created_by = pg_temp.u_sa() AND e.updated_by = pg_temp.u_sa(), 'created row: audit users = caller');
  PERFORM pg_temp.ok(e.created_at IS NOT NULL AND e.updated_at IS NOT NULL, 'created row: audit timestamps set');
  -- entry ids in the result
  PERFORM pg_temp.eq(pg_temp.val(format($q$SELECT string_agg((entry_id IS NULL)::text, ',' ORDER BY opening_monday)
    FROM public.create_mg_calendar_entries(%L::date[])$q$, ARRAY[pg_temp.m(-3) + 2, pg_temp.m(-2), pg_temp.m(8)]),
    pg_temp.u_sa(), 'authenticated'), 'true,false,false', 'entry_id null only for rejected dates (created and existing carry an id)');
  PERFORM pg_temp.eq(pg_temp.val(format($q$SELECT string_agg(mg_start::text, ',' ORDER BY opening_monday)
    FROM public.create_mg_calendar_entries(%L::date[])$q$, ARRAY[pg_temp.m(8), pg_temp.m(10)]),
    pg_temp.u_sa(), 'authenticated'), (pg_temp.m(8) + 7)::text || ',' || (pg_temp.m(10) + 7)::text, 'mg_start = opening + 7 (both already exist now)');

  -- ascending processing: the input order must not matter
  PERFORM pg_temp.wipe();
  r := pg_temp.create_call(pg_temp.u_sa(), 'authenticated', ARRAY[pg_temp.m(8), pg_temp.m(6)]);
  PERFORM pg_temp.eq(r, 'created,created', 'M and M+14 (descending input) both created');
  PERFORM pg_temp.wipe();
  r := pg_temp.create_call(pg_temp.u_sa(), 'authenticated', ARRAY[pg_temp.m(10), pg_temp.m(9)]);
  PERFORM pg_temp.eq(r, 'created,rejected_too_close', 'M and M+7 (descending input): the earlier date wins');

  -- input validation: whole call refused, nothing written
  PERFORM pg_temp.wipe();
  SELECT count(*) INTO n0 FROM public.calendar_entries;
  PERFORM pg_temp.err(pg_temp.create_call(pg_temp.u_sa(), 'authenticated', ARRAY[]::date[]), 'MG_CAL_INVALID_INPUT', 'empty_array', 'empty array');
  PERFORM pg_temp.err(pg_temp.create_call(pg_temp.u_sa(), 'authenticated', NULL), 'MG_CAL_INVALID_INPUT', NULL, 'NULL array');
  PERFORM pg_temp.err(pg_temp.create_call(pg_temp.u_sa(), 'authenticated', ARRAY[pg_temp.m(3), NULL]::date[]), 'MG_CAL_INVALID_INPUT', 'null_element', 'NULL element');
  PERFORM pg_temp.err(pg_temp.create_call(pg_temp.u_sa(), 'authenticated', ARRAY[pg_temp.m(3), pg_temp.m(3)]), 'MG_CAL_INVALID_INPUT', 'duplicate', 'duplicate date');
  ds := ARRAY[]::date[];
  FOR i IN 0..13 LOOP ds := ds || (pg_temp.m(3) + 14 * i); END LOOP;   -- 14 elements
  PERFORM pg_temp.err(pg_temp.create_call(pg_temp.u_sa(), 'authenticated', ds), 'MG_CAL_INVALID_INPUT', 'too_many', '14 elements');
  PERFORM pg_temp.eq((SELECT count(*) FROM public.calendar_entries)::text, n0::text, 'invalid calls wrote nothing');
  ds := ARRAY[]::date[];
  FOR i IN 0..12 LOOP ds := ds || (pg_temp.m(3) + 14 * i); END LOOP;   -- 13 elements: allowed
  PERFORM pg_temp.eq(replace(pg_temp.create_call(pg_temp.u_sa(), 'authenticated', ds), 'created,', ''), 'created', '13 elements accepted');

  -- creating entries never creates events
  PERFORM pg_temp.wipe();
  PERFORM pg_temp.eq((SELECT count(*) FROM public.mg_events)::text, '0', 'no events before');
  PERFORM pg_temp.create_call(pg_temp.u_sa(), 'authenticated', ARRAY[pg_temp.m(2)]);
  PERFORM pg_temp.eq((SELECT count(*) FROM public.mg_events)::text, '0', 'creating an entry creates no event');
  RAISE NOTICE 'PASS S3';
END $t$;
ROLLBACK TO SAVEPOINT s3;

-- =============================================================================
-- S4. Internal creation function: simulated Monday 2026-11-30 (p_now), PO-5
-- =============================================================================
SAVEPOINT s4;
DO $t$
DECLARE
  srv uuid[]; i int; seed uuid; r text; cfg_servers text;
  fn constant text := 'SELECT public.mg_create_events_from_calendar(%L::timestamptz)::text';
BEGIN
  SELECT id INTO STRICT seed FROM public.calendar_entries WHERE type = 'mg' AND starts_at = '2026-12-07 00:00:00+00';
  DELETE FROM public.mg_events WHERE start_date >= '2026-12-01';
  DELETE FROM public.server_mg_config WHERE true;
  FOR i IN 1..8 LOOP srv[i] := pg_temp.mk_server('T4-' || i); END LOOP;
  FOR i IN 1..3 LOOP INSERT INTO public.server_mg_config (server_id) VALUES (srv[i]); END LOOP;

  PERFORM pg_temp.eq(pg_temp.val(format(fn, '2026-11-29 23:59:59+00')), '0', 'Sunday 23:59:59: nothing yet');
  PERFORM pg_temp.eq(pg_temp.val(format(fn, '2026-11-30 00:00:00+00')), '3', 'Monday 2026-11-30 00:00 UTC creates 3 events');
  PERFORM pg_temp.eq((SELECT count(*) FROM public.mg_events WHERE start_date = '2026-12-07' AND server_id = ANY (srv))::text, '3', '3 events on 2026-12-07 for the fixture servers');
  PERFORM pg_temp.eq((SELECT count(*) FROM public.mg_events WHERE server_id = ANY (srv[4:8]))::text, '0', 'no event for the 5 servers without config');
  PERFORM pg_temp.eq((SELECT string_agg(DISTINCT status::text || '|' || start_date || '|' || end_date || '|' || registration_open_at || '|' || registration_close_at, ';')
    FROM public.mg_events WHERE server_id = ANY (srv)), 'registration_open|2026-12-07|2026-12-13|2026-11-30|2026-12-03', 'dates and status of created events');
  PERFORM pg_temp.eq((SELECT count(*) FROM public.mg_events WHERE server_id = ANY (srv) AND calendar_entry_id = seed)::text, '3', 'events linked to the entry');
  PERFORM pg_temp.eq(pg_temp.val(format(fn, '2026-11-30 00:00:00+00')), '0', 'second call: idempotent');
  PERFORM pg_temp.eq(pg_temp.val(format(fn, '2026-11-30 00:00:00+00')), '0', 'third call: idempotent');
  PERFORM pg_temp.eq((SELECT count(*) FROM public.mg_events WHERE server_id = ANY (srv))::text, '3', 'row count unchanged');

  -- no automatic catch-up: a server configured afterwards gets nothing until a manual run
  INSERT INTO public.server_mg_config (server_id) VALUES (srv[4]);
  PERFORM pg_temp.eq((SELECT count(*) FROM public.mg_events WHERE server_id = srv[4])::text, '0', 'no catch-up for a server enabling MG later');
  PERFORM pg_temp.eq(pg_temp.val(format(fn, '2026-12-02 12:00:00+00')), '1', 'manual run on Wednesday creates the missing event of the new server');
  DELETE FROM public.server_mg_config WHERE server_id = srv[4];

  -- window edges (PO-5): creation until Thursday 23:58 UTC, never after
  DELETE FROM public.mg_events WHERE start_date >= '2026-12-01';
  PERFORM pg_temp.eq(pg_temp.val(format(fn, '2026-12-02 12:00:00+00')), '3', 'Wednesday run creates');
  DELETE FROM public.mg_events WHERE start_date >= '2026-12-01';
  PERFORM pg_temp.eq(pg_temp.val(format(fn, '2026-12-03 23:58:00+00')), '3', 'Thursday 23:58 creates');
  DELETE FROM public.mg_events WHERE start_date >= '2026-12-01';
  PERFORM pg_temp.eq(pg_temp.val(format(fn, '2026-12-03 23:59:00+00')), '0', 'Thursday 23:59 does not create (PO-5)');
  PERFORM pg_temp.eq(pg_temp.val(format(fn, '2026-12-04 00:00:00+00')), '0', 'Friday does not create');
  PERFORM pg_temp.eq(pg_temp.val(format(fn, '2026-12-07 00:00:00+00')), '0', 'MG Monday does not create the already-started MG');

  -- a pre-existing unlinked event on (server, start_date) is left alone (late application case)
  PERFORM pg_temp.mk_event(srv[1], NULL, date '2026-12-07', 'registration_open');
  PERFORM pg_temp.eq(pg_temp.val(format(fn, '2026-11-30 00:00:00+00')), '2', 'unlinked pre-existing event: only the 2 others are created');
  PERFORM pg_temp.ok((SELECT calendar_entry_id IS NULL FROM public.mg_events WHERE server_id = srv[1] AND start_date = '2026-12-07'),
    'the function does not link or modify the pre-existing event');

  -- cancelled entry skipped
  DELETE FROM public.mg_events WHERE start_date >= '2026-12-01';
  UPDATE public.calendar_entries SET cancelled_at = now() WHERE id = seed;
  PERFORM pg_temp.eq(pg_temp.val(format(fn, '2026-11-30 00:00:00+00')), '0', 'cancelled entry skipped');

  -- empty calendar: 0 and no error
  DELETE FROM public.calendar_entries WHERE type = 'mg' AND starts_at >= '2026-12-01';
  PERFORM pg_temp.eq(pg_temp.val(format(fn, '2026-11-30 00:00:00+00')), '0', 'empty (exhausted) calendar returns 0');
  RAISE NOTICE 'PASS S4';
END $t$;
ROLLBACK TO SAVEPOINT s4;

-- =============================================================================
-- S5. shift_mg_calendar_entry
-- =============================================================================
SAVEPOINT s5;
DO $t$
DECLARE
  e1 uuid; e2 uuid; e3 uuid; ec uuid; ep uuid; eo uuid; ea uuid; eb uuid;
  r text; ds date[]; i int; expected text; before_list text; s1 date; ps date;
BEGIN
  -- (a) not opened: entry + followers move, no event touched, ordered writes avoid transient violations
  PERFORM pg_temp.wipe();
  e1 := pg_temp.mk_entry(pg_temp.m(2)); e2 := pg_temp.mk_entry(pg_temp.m(4)); e3 := pg_temp.mk_entry(pg_temp.m(6));
  PERFORM pg_temp.err(pg_temp.shift_call(pg_temp.u_adm(), e1, pg_temp.m(3)), 'MG_CAL_FORBIDDEN', NULL, 'admin cannot shift');
  PERFORM pg_temp.err(pg_temp.shift_call(pg_temp.u_mem(), e1, pg_temp.m(3)), 'MG_CAL_FORBIDDEN', NULL, 'member cannot shift');
  r := pg_temp.val(format($q$SELECT public.shift_mg_calendar_entry(%L, %L)$q$, e1, pg_temp.m(3)), NULL, 'anon');
  PERFORM pg_temp.ok(r LIKE 'ERR:42501:%', 'anon cannot shift [' || r || ']');
  r := pg_temp.shift_call(pg_temp.u_sa(), e1, pg_temp.m(3));
  expected := format('%s>%s:0,%s>%s:0,%s>%s:0',
    pg_temp.m(2) + 7, pg_temp.m(3) + 7, pg_temp.m(4) + 7, pg_temp.m(5) + 7, pg_temp.m(6) + 7, pg_temp.m(7) + 7);
  PERFORM pg_temp.eq(r, expected, 'cascade +1 week: one row per moved entry, no event updated');
  PERFORM pg_temp.eq(pg_temp.starts(), format('%s,%s,%s', pg_temp.m(3) + 7, pg_temp.m(5) + 7, pg_temp.m(7) + 7), 'new starts');
  PERFORM pg_temp.eq((SELECT count(*) FROM public.calendar_entries WHERE updated_by = pg_temp.u_sa())::text, '3', 'audit: every moved row has updated_by = caller');
  PERFORM pg_temp.ok((SELECT bool_and(ends_at = starts_at + interval '168 hours' AND all_day) FROM public.calendar_entries), 'moved rows keep a valid shape');

  -- (b) 13 entries by +1 week, then advance by -1 week (opposite write order)
  PERFORM pg_temp.wipe();
  FOR i IN 0..12 LOOP PERFORM pg_temp.mk_entry(pg_temp.m(2) + 14 * i); END LOOP;
  SELECT id INTO e1 FROM public.calendar_entries ORDER BY starts_at LIMIT 1;
  SELECT string_agg(((pg_temp.m(2) + 7 + 14 * k) + 7)::text, ',' ORDER BY k) INTO expected FROM generate_series(0, 12) k;
  r := pg_temp.val(format($q$SELECT count(*)::text FROM public.shift_mg_calendar_entry(%L, %L)$q$, e1, pg_temp.m(3)), pg_temp.u_sa(), 'authenticated');
  PERFORM pg_temp.eq(r, '13', 'cascade of 13 entries returns 13 rows');
  PERFORM pg_temp.eq(pg_temp.starts(), expected, '13 entries moved +1 week without violation');
  r := pg_temp.val(format($q$SELECT count(*)::text FROM public.shift_mg_calendar_entry(%L, %L)$q$, e1, pg_temp.m(2)), pg_temp.u_sa(), 'authenticated');
  PERFORM pg_temp.eq(r, '13', 'advance: 13 rows');
  SELECT string_agg(((pg_temp.m(2) + 14 * k) + 7)::text, ',' ORDER BY k) INTO expected FROM generate_series(0, 12) k;
  PERFORM pg_temp.eq(pg_temp.starts(), expected, 'advance by -1 week of unopened entries without violation');

  -- (c) collision with a kept cancelled entry (never moved, always a constraint)
  PERFORM pg_temp.wipe();
  e1 := pg_temp.mk_entry(pg_temp.m(2));
  s1 := pg_temp.m(2) + 7;
  ec := pg_temp.mk_start(s1 + 21, true);
  r := pg_temp.shift_call(pg_temp.u_sa(), e1, s1 + 14);   -- final start = s1 + 21 = cancelled entry
  PERFORM pg_temp.err(r, 'MG_CAL_ALREADY_EXISTS', NULL, 'target equals a kept cancelled entry');
  PERFORM pg_temp.eq(pg_temp.starts(true), format('%s,%s', s1, s1 + 21), 'nothing moved after refusal');

  -- (d) too close to a non-moved earlier entry; exactly 14 days accepted
  PERFORM pg_temp.wipe();
  ep := pg_temp.mk_entry(pg_temp.m(3));
  ps := pg_temp.m(3) + 7;
  e1 := pg_temp.mk_entry(pg_temp.m(7));
  r := pg_temp.shift_call(pg_temp.u_sa(), e1, ps);        -- final start = ps + 7
  PERFORM pg_temp.err(r, 'MG_CAL_TOO_CLOSE', NULL, 'less than 14 days from a non-moved entry');
  PERFORM pg_temp.eq(pg_temp.starts(), format('%s,%s', ps, pg_temp.m(7) + 7), 'nothing moved after too_close');
  r := pg_temp.shift_call(pg_temp.u_sa(), e1, ps + 7);    -- final start = ps + 14
  PERFORM pg_temp.eq(r, format('%s>%s:0', pg_temp.m(7) + 7, ps + 14), 'exactly 14 days accepted');

  -- (e) input errors
  PERFORM pg_temp.wipe();
  e1 := pg_temp.mk_entry(pg_temp.m(2));
  PERFORM pg_temp.err(pg_temp.shift_call(pg_temp.u_sa(), e1, pg_temp.m(0)), 'MG_CAL_OPENING_PASSED', NULL, 'new opening not after today');
  PERFORM pg_temp.err(pg_temp.shift_call(pg_temp.u_sa(), e1, pg_temp.m(3) + 1), 'MG_CAL_NOT_MONDAY', NULL, 'target not a Monday');
  PERFORM pg_temp.err(pg_temp.shift_call(pg_temp.u_sa(), e1, pg_temp.m(2)), 'MG_CAL_INVALID_INPUT', 'zero_offset', 'zero offset');
  PERFORM pg_temp.err(pg_temp.shift_call(pg_temp.u_sa(), gen_random_uuid(), pg_temp.m(3)), 'MG_CAL_NOT_FOUND', NULL, 'unknown entry');
  INSERT INTO public.calendar_entries (type, title, starts_at, ends_at)
    VALUES ('pvp', 'not mg', (pg_temp.m(5) + 2)::timestamp AT TIME ZONE 'UTC', (pg_temp.m(5) + 3)::timestamp AT TIME ZONE 'UTC');
  PERFORM pg_temp.err(pg_temp.shift_call(pg_temp.u_sa(), (SELECT id FROM public.calendar_entries WHERE type = 'pvp'), pg_temp.m(3)),
    'MG_CAL_NOT_FOUND', NULL, 'non-mg entry is not shiftable here');
  PERFORM pg_temp.eq(pg_temp.starts(), (pg_temp.m(2) + 7)::text, 'nothing moved after input errors');

  -- (f) read-only, cancelled
  PERFORM pg_temp.wipe();
  e1 := pg_temp.mk_start(pg_temp.m(0));                   -- started this week (starts_at <= now)
  PERFORM pg_temp.err(pg_temp.shift_call(pg_temp.u_sa(), e1, pg_temp.m(5)), 'MG_CAL_NOT_SHIFTABLE', 'read_only', 'started entry');
  PERFORM pg_temp.wipe();
  e1 := pg_temp.mk_entry(pg_temp.m(0));                   -- opened, starts next Monday, with an ongoing event
  PERFORM pg_temp.mk_event(pg_temp.s_a(), e1, pg_temp.m(1), 'ongoing');
  PERFORM pg_temp.err(pg_temp.shift_call(pg_temp.u_sa(), e1, pg_temp.m(1)), 'MG_CAL_NOT_SHIFTABLE', 'read_only', 'entry with an ongoing event');
  PERFORM pg_temp.wipe();
  e1 := pg_temp.mk_entry(pg_temp.m(3), true);
  PERFORM pg_temp.err(pg_temp.shift_call(pg_temp.u_sa(), e1, pg_temp.m(5)), 'MG_CAL_NOT_SHIFTABLE', 'cancelled', 'cancelled entry');

  -- (g) opened entry: only events registration_open, only later, registrations kept, dates updated
  PERFORM pg_temp.wipe();
  eo := pg_temp.mk_entry(pg_temp.m(0));                   -- opened (opening <= today), starts M(1)
  e2 := pg_temp.mk_entry(pg_temp.m(2));                   -- follower, starts M(1) + 14
  ea := pg_temp.mk_event(pg_temp.s_a(), eo, pg_temp.m(1), 'registration_open');
  eb := pg_temp.mk_event(pg_temp.s_b(), eo, pg_temp.m(1), 'registration_open');
  INSERT INTO public.mg_registrations (mg_event_id, user_id) VALUES (ea, pg_temp.u_mem()), (eb, pg_temp.u_memb());
  r := pg_temp.shift_call(pg_temp.u_sa(), eo, pg_temp.m(1));   -- one week later
  PERFORM pg_temp.eq(r, format('%s>%s:2,%s>%s:0', pg_temp.m(1), pg_temp.m(2), pg_temp.m(1) + 14, pg_temp.m(2) + 14),
    'opened shift: events_updated = 2 on the selected entry only, follower moved too');
  PERFORM pg_temp.eq((SELECT string_agg(DISTINCT start_date || '|' || end_date || '|' || registration_open_at || '|' || registration_close_at || '|' || status, ';')
    FROM public.mg_events WHERE calendar_entry_id = eo),
    format('%s|%s|%s|%s|registration_open', pg_temp.m(2), pg_temp.m(2) + 6, pg_temp.m(0), pg_temp.m(2) - 4),
    'events: new start/end/close, opening date and status unchanged');
  PERFORM pg_temp.eq((SELECT count(*) FROM public.mg_registrations WHERE mg_event_id IN (ea, eb))::text, '2', 'registrations kept');
  PERFORM pg_temp.eq((SELECT count(*) FROM public.calendar_entries WHERE updated_by = pg_temp.u_sa())::text, '2', 'audit on the two moved rows');

  -- (h) opened entry: refusals leave everything unchanged
  PERFORM pg_temp.wipe();
  eo := pg_temp.mk_entry(pg_temp.m(0));
  ea := pg_temp.mk_event(pg_temp.s_a(), eo, pg_temp.m(1), 'registration_open');
  PERFORM pg_temp.err(pg_temp.shift_call(pg_temp.u_sa(), eo, pg_temp.m(-1)), 'MG_CAL_NOT_SHIFTABLE', 'must_move_later', 'opened entry cannot move earlier');
  UPDATE public.mg_events SET status = 'registration_closed' WHERE id = ea;
  PERFORM pg_temp.err(pg_temp.shift_call(pg_temp.u_sa(), eo, pg_temp.m(1)), 'MG_CAL_NOT_SHIFTABLE', 'event_not_open', 'event already closed');
  PERFORM pg_temp.eq((SELECT start_date::text || '|' || status FROM public.mg_events WHERE id = ea), pg_temp.m(1)::text || '|registration_closed', 'event untouched after refusal');
  PERFORM pg_temp.eq(pg_temp.starts(), (pg_temp.m(1))::text, 'entry untouched after refusal');
  UPDATE public.mg_events SET status = 'registration_open' WHERE id = ea;
  PERFORM pg_temp.mk_event(pg_temp.s_a(), NULL, pg_temp.m(2), 'finished');   -- foreign event of an affected server on the target date
  PERFORM pg_temp.err(pg_temp.shift_call(pg_temp.u_sa(), eo, pg_temp.m(1)), 'MG_CAL_NOT_SHIFTABLE', 'event_date_conflict', 'foreign event on the target date');

  -- (i) atomicity: a failure on the last written entry rolls everything back
  PERFORM pg_temp.wipe();
  e1 := pg_temp.mk_entry(pg_temp.m(2)); e2 := pg_temp.mk_entry(pg_temp.m(4)); e3 := pg_temp.mk_entry(pg_temp.m(6));
  before_list := pg_temp.starts();
  EXECUTE format($q$CREATE FUNCTION public.zz_test_fail() RETURNS trigger LANGUAGE plpgsql AS $b$
    BEGIN
      IF NEW.id = %L AND NEW.starts_at <> OLD.starts_at THEN RAISE EXCEPTION 'forced failure'; END IF;
      RETURN NEW;
    END $b$$q$, e1);
  CREATE TRIGGER trg_zz_test_fail BEFORE UPDATE ON public.calendar_entries FOR EACH ROW EXECUTE FUNCTION public.zz_test_fail();
  r := pg_temp.shift_call(pg_temp.u_sa(), e1, pg_temp.m(3));
  PERFORM pg_temp.ok(r LIKE 'ERR:P0001:forced failure%', 'unexpected failure propagates unchanged [' || r || ']');
  PERFORM pg_temp.eq(pg_temp.starts(), before_list, 'atomicity: the entries written before the failure are rolled back');
  DROP TRIGGER trg_zz_test_fail ON public.calendar_entries;
  DROP FUNCTION public.zz_test_fail();

  RAISE NOTICE 'TODO S5: shift check "following_entry_opened" is unreachable by construction (followers open >= 14 days after an opened entry)';
  RAISE NOTICE 'PASS S5';
END $t$;
ROLLBACK TO SAVEPOINT s5;

-- =============================================================================
-- S6. cancel_mg_calendar_entry
-- =============================================================================
SAVEPOINT s6;
DO $t$
DECLARE e1 uuid; ev uuid; ev2 uuid; r text; en record;
BEGIN
  -- never opened: physical delete, date reusable
  PERFORM pg_temp.wipe();
  e1 := pg_temp.mk_entry(pg_temp.m(3));
  PERFORM pg_temp.err(pg_temp.cancel_call(pg_temp.u_adm(), e1), 'MG_CAL_FORBIDDEN', NULL, 'admin cannot cancel');
  r := pg_temp.val(format($q$SELECT public.cancel_mg_calendar_entry(%L)$q$, e1), NULL, 'anon');
  PERFORM pg_temp.ok(r LIKE 'ERR:42501:%', 'anon cannot cancel [' || r || ']');
  PERFORM pg_temp.err(pg_temp.cancel_call(pg_temp.u_sa(), gen_random_uuid()), 'MG_CAL_NOT_FOUND', NULL, 'unknown entry');
  PERFORM pg_temp.eq(pg_temp.cancel_call(pg_temp.u_sa(), e1), 'deleted', 'never-opened entry is physically deleted');
  PERFORM pg_temp.eq(pg_temp.starts(true), '', 'row is gone');
  PERFORM pg_temp.eq(pg_temp.create_call(pg_temp.u_sa(), 'authenticated', ARRAY[pg_temp.m(3)]), 'created', 'the date of a deleted entry is reusable');

  -- opened with no opted-in server (no event ever generated): deleted as well
  PERFORM pg_temp.wipe();
  e1 := pg_temp.mk_entry(pg_temp.m(0));
  PERFORM pg_temp.eq(pg_temp.cancel_call(pg_temp.u_sa(), e1), 'deleted', 'opened entry without any event is deleted');

  -- opened with events: kept as cancelled, events cancelled, registrations kept, date not reusable
  PERFORM pg_temp.wipe();
  e1 := pg_temp.mk_entry(pg_temp.m(0));
  ev := pg_temp.mk_event(pg_temp.s_a(), e1, pg_temp.m(1), 'registration_open');
  ev2 := pg_temp.mk_event(pg_temp.s_b(), e1, pg_temp.m(1), 'registration_closed');
  INSERT INTO public.mg_registrations (mg_event_id, user_id) VALUES (ev, pg_temp.u_mem());
  PERFORM pg_temp.eq(pg_temp.cancel_call(pg_temp.u_sa(), e1), 'cancelled', 'entry with events is marked cancelled');
  SELECT * INTO en FROM public.calendar_entries WHERE id = e1;
  PERFORM pg_temp.ok(en.cancelled_at IS NOT NULL AND en.cancelled_by = pg_temp.u_sa() AND en.updated_by = pg_temp.u_sa(), 'cancelled_at/by and audit set');
  PERFORM pg_temp.eq((SELECT string_agg(status::text, ',' ORDER BY id) FROM public.mg_events WHERE calendar_entry_id = e1), 'cancelled,cancelled', 'events cancelled');
  PERFORM pg_temp.eq((SELECT count(*) FROM public.mg_registrations WHERE mg_event_id = ev)::text, '1', 'registrations kept for audit');
  PERFORM pg_temp.eq(pg_temp.create_call(pg_temp.u_sa(), 'authenticated', ARRAY[pg_temp.m(0)]), 'already_exists', 'the date of a kept cancelled entry is not reusable');
  PERFORM pg_temp.err(pg_temp.cancel_call(pg_temp.u_sa(), e1), 'MG_CAL_NOT_CANCELLABLE', 'already_cancelled', 'second cancel');

  -- refusals
  PERFORM pg_temp.wipe();
  e1 := pg_temp.mk_start(pg_temp.m(0));                   -- started this week
  PERFORM pg_temp.err(pg_temp.cancel_call(pg_temp.u_sa(), e1), 'MG_CAL_NOT_CANCELLABLE', 'read_only', 'started entry');
  PERFORM pg_temp.wipe();
  e1 := pg_temp.mk_entry(pg_temp.m(0));
  ev := pg_temp.mk_event(pg_temp.s_a(), e1, pg_temp.m(1), 'ongoing');
  PERFORM pg_temp.err(pg_temp.cancel_call(pg_temp.u_sa(), e1), 'MG_CAL_NOT_CANCELLABLE', 'event_ongoing_or_finished', 'ongoing event');
  UPDATE public.mg_events SET status = 'finished' WHERE id = ev;
  PERFORM pg_temp.err(pg_temp.cancel_call(pg_temp.u_sa(), e1), 'MG_CAL_NOT_CANCELLABLE', 'event_ongoing_or_finished', 'finished event');
  PERFORM pg_temp.eq((SELECT status::text FROM public.mg_events WHERE id = ev), 'finished', 'event untouched by refusal');
  PERFORM pg_temp.ok((SELECT cancelled_at IS NULL FROM public.calendar_entries WHERE id = e1), 'entry untouched by refusal');
  RAISE NOTICE 'PASS S6';
END $t$;
ROLLBACK TO SAVEPOINT s6;

-- =============================================================================
-- S7. mg_events guard trigger and table privileges
-- =============================================================================
SAVEPOINT s7;
DO $t$
DECLARE
  ev uuid; evb uuid; ent uuid; r text; guard_sql constant text := 'UPDATE public.mg_events SET %s WHERE id = %L';
  pub constant text := 'status = ''selection_published'', selection_published_at = now()';
BEGIN
  PERFORM pg_temp.wipe();
  ent := pg_temp.mk_entry(pg_temp.m(0));
  ev  := pg_temp.mk_event(pg_temp.s_a(), NULL, pg_temp.m(1), 'registration_closed');
  evb := pg_temp.mk_event(pg_temp.s_b(), NULL, pg_temp.m(1), 'registration_closed');

  -- INSERT / DELETE / TRUNCATE are gone for every client role
  r := pg_temp.run(format($q$INSERT INTO public.mg_events (server_id, start_date, end_date, registration_open_at, registration_close_at, status)
    VALUES (%L, %L, %L, %L, %L, 'registration_open')$q$, pg_temp.s_a(), pg_temp.m(5), pg_temp.m(5) + 6, pg_temp.m(4), pg_temp.m(5) - 4),
    pg_temp.u_adm(), 'authenticated');
  PERFORM pg_temp.ok(r LIKE 'ERR:42501:%', 'admin INSERT denied [' || r || ']');
  r := pg_temp.run(format($q$INSERT INTO public.mg_events (server_id, start_date, end_date, registration_open_at, registration_close_at, status)
    VALUES (%L, %L, %L, %L, %L, 'registration_open')$q$, pg_temp.s_a(), pg_temp.m(5), pg_temp.m(5) + 6, pg_temp.m(4), pg_temp.m(5) - 4),
    pg_temp.u_sa(), 'authenticated');
  PERFORM pg_temp.ok(r LIKE 'ERR:42501:%', 'super admin INSERT denied [' || r || ']');
  r := pg_temp.run(format('DELETE FROM public.mg_events WHERE id = %L', ev), pg_temp.u_adm(), 'authenticated');
  PERFORM pg_temp.ok(r LIKE 'ERR:42501:%', 'admin DELETE denied [' || r || ']');
  r := pg_temp.run('TRUNCATE public.mg_events', pg_temp.u_sa(), 'authenticated');
  PERFORM pg_temp.ok(r LIKE 'ERR:42501:%', 'TRUNCATE denied [' || r || ']');
  r := pg_temp.run(format('DELETE FROM public.mg_events WHERE id = %L', ev), NULL, 'anon');
  PERFORM pg_temp.ok(r LIKE 'ERR:42501:%', 'anon DELETE denied [' || r || ']');
  r := pg_temp.run(format(guard_sql, 'status = ''finished''', ev), NULL, 'anon');
  PERFORM pg_temp.ok(r LIKE 'ERR:42501:%', 'anon UPDATE denied [' || r || ']');
  PERFORM pg_temp.eq((SELECT count(*) FROM public.mg_events WHERE id IN (ev, evb))::text, '2', 'events still there');

  -- every update other than the publication transition is refused (MG_EVENT_FORBIDDEN, 42501)
  FOR r IN SELECT unnest(ARRAY[
      'status = ''registration_open''',
      'status = ''finished''',
      'status = ''cancelled''',
      format('start_date = %L, end_date = %L, registration_close_at = %L', pg_temp.m(2), pg_temp.m(2) + 6, pg_temp.m(2) - 4),
      format('end_date = %L', pg_temp.m(1) + 7),
      format('registration_open_at = %L', pg_temp.m(1) - 14),
      'selection_published_at = now()',
      format('server_id = %L', pg_temp.s_b()),
      format('calendar_entry_id = %L', ent),
      'created_at = now() - interval ''1 day''',
      'status = ''selection_published''',                                              -- no timestamp
      pub || format(', end_date = %L', pg_temp.m(1) + 5)                                -- publication + another column
    ]) LOOP
    PERFORM pg_temp.ok(pg_temp.run(format(guard_sql, r, ev), pg_temp.u_adm(), 'authenticated') LIKE 'ERR:42501:MG_EVENT_FORBIDDEN%',
      'admin update refused: ' || r);
    PERFORM pg_temp.ok(pg_temp.run(format(guard_sql, r, ev), pg_temp.u_sa(), 'authenticated') LIKE 'ERR:42501:MG_EVENT_FORBIDDEN%',
      'super admin update refused: ' || r);
  END LOOP;
  PERFORM pg_temp.eq((SELECT status::text || '|' || start_date FROM public.mg_events WHERE id = ev), 'registration_closed|' || pg_temp.m(1), 'row unchanged after refusals');

  -- publication transition: allowed for the server admin and the super admin
  PERFORM pg_temp.eq(pg_temp.run(format(guard_sql, pub, ev), pg_temp.u_adm(), 'authenticated'), 'OK:1', 'admin publication allowed');
  PERFORM pg_temp.eq((SELECT status::text FROM public.mg_events WHERE id = ev), 'selection_published', 'status published');
  PERFORM pg_temp.ok((SELECT selection_published_at IS NOT NULL FROM public.mg_events WHERE id = ev), 'selection_published_at set');
  UPDATE public.mg_events SET status = 'registration_closed', selection_published_at = NULL WHERE id = ev;
  PERFORM pg_temp.eq(pg_temp.run(format(guard_sql, pub, ev), pg_temp.u_sa(), 'authenticated'), 'OK:1', 'super admin publication allowed');
  UPDATE public.mg_events SET status = 'registration_closed', selection_published_at = NULL WHERE id = ev;

  -- publication from the wrong status is refused
  UPDATE public.mg_events SET status = 'registration_open' WHERE id = ev;
  PERFORM pg_temp.ok(pg_temp.run(format(guard_sql, pub, ev), pg_temp.u_adm(), 'authenticated') LIKE 'ERR:42501:MG_EVENT_FORBIDDEN%',
    'publication refused from registration_open');
  UPDATE public.mg_events SET status = 'registration_closed' WHERE id = ev;

  -- members and admins of another server are filtered by RLS (no row, no error)
  PERFORM pg_temp.eq(pg_temp.run(format(guard_sql, pub, ev), pg_temp.u_mem(), 'authenticated'), 'OK:0', 'plain member cannot publish (0 rows)');
  PERFORM pg_temp.eq(pg_temp.run(format(guard_sql, pub, ev), pg_temp.u_admb(), 'authenticated'), 'OK:0', 'admin of another server cannot publish (0 rows)');
  PERFORM pg_temp.eq((SELECT status::text FROM public.mg_events WHERE id = ev), 'registration_closed', 'still not published');

  -- privileged contexts pass: postgres, service_role
  PERFORM pg_temp.eq(pg_temp.run(format(guard_sql, 'status = ''registration_open''', ev)), 'OK:1', 'postgres can update freely');
  PERFORM pg_temp.eq(pg_temp.run(format(guard_sql, 'status = ''registration_closed''', ev), NULL, 'service_role'), 'OK:1', 'service_role can update freely');
  PERFORM pg_temp.eq(pg_temp.run(format(guard_sql, format('start_date = %L, end_date = %L, registration_close_at = %L', pg_temp.m(2), pg_temp.m(2) + 6, pg_temp.m(2) - 4), ev),
    NULL, 'service_role'), 'OK:1', 'service_role can change dates');

  -- introspection: guard stays SECURITY INVOKER, definer functions owned by postgres
  PERFORM pg_temp.ok(EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid = 'public.mg_events'::regclass AND tgname = 'trg_mg_events_guard'
    AND NOT tgisinternal AND tgenabled = 'O' AND (tgtype & 2) = 2 AND (tgtype & 16) = 16 AND (tgtype & 4) = 0 AND (tgtype & 8) = 0),
    'trg_mg_events_guard: enabled BEFORE UPDATE row trigger');
  PERFORM pg_temp.ok((SELECT NOT prosecdef FROM pg_proc WHERE oid = 'public.mg_events_guard()'::regprocedure), 'mg_events_guard is SECURITY INVOKER');
  PERFORM pg_temp.ok((SELECT NOT prosecdef FROM pg_proc WHERE oid = 'public.calendar_entries_audit()'::regprocedure), 'calendar_entries_audit is SECURITY INVOKER');
  PERFORM pg_temp.ok((SELECT bool_and(prosecdef AND pg_get_userbyid(proowner) = 'postgres') FROM pg_proc
    WHERE oid = ANY (ARRAY['public.create_mg_calendar_entries(date[])'::regprocedure, 'public.shift_mg_calendar_entry(uuid,date)'::regprocedure,
      'public.cancel_mg_calendar_entry(uuid)'::regprocedure, 'public.mg_create_events_for_entry(uuid,uuid)'::regprocedure,
      'public.mg_create_events_from_calendar(timestamptz)'::regprocedure])),
    'the five functions are SECURITY DEFINER and owned by postgres');
  RAISE NOTICE 'PASS S7';
END $t$;
ROLLBACK TO SAVEPOINT s7;

-- =============================================================================
-- S8. calendar_entries RLS
-- =============================================================================
SAVEPOINT s8;
DO $t$
DECLARE r text; id_mg uuid; id_pvp uuid; total bigint; row_ record;
BEGIN
  PERFORM pg_temp.wipe();
  id_mg := pg_temp.mk_entry(pg_temp.m(3));
  INSERT INTO public.calendar_entries (type, title, starts_at, ends_at)
    VALUES ('pvp', 'seed pvp', (pg_temp.m(4) + 2)::timestamp AT TIME ZONE 'UTC', (pg_temp.m(4) + 3)::timestamp AT TIME ZONE 'UTC')
    RETURNING id INTO id_pvp;
  SELECT count(*) INTO total FROM public.calendar_entries;

  -- reads
  PERFORM pg_temp.eq(pg_temp.val('SELECT count(*)::text FROM public.calendar_entries', pg_temp.u_mem(), 'authenticated'), total::text, 'member reads every entry');
  PERFORM pg_temp.eq(pg_temp.val('SELECT count(*)::text FROM public.calendar_entries', pg_temp.u_memb(), 'authenticated'), total::text, 'member of another server reads every entry');
  r := pg_temp.val('SELECT count(*)::text FROM public.calendar_entries', NULL, 'anon');
  PERFORM pg_temp.ok(r = '0' OR r LIKE 'ERR:42501:%', 'anonymous reads nothing [' || r || ']');

  -- super admin writes non-MG rows freely
  PERFORM pg_temp.eq(pg_temp.run($q$INSERT INTO public.calendar_entries (type, title, starts_at, ends_at)
    VALUES ('pvp', 'new pvp', '2030-03-05 18:00:00+00', '2030-03-05 19:00:00+00')$q$, pg_temp.u_sa(), 'authenticated'), 'OK:1', 'super admin inserts pvp');
  PERFORM pg_temp.eq(pg_temp.run(format($q$UPDATE public.calendar_entries SET title = 'edited', starts_at = starts_at + interval '1 hour', ends_at = ends_at + interval '2 hours'
    WHERE id = %L$q$, id_pvp), pg_temp.u_sa(), 'authenticated'), 'OK:1', 'super admin edits pvp (title and times)');
  PERFORM pg_temp.eq(pg_temp.run(format('DELETE FROM public.calendar_entries WHERE id = %L', id_pvp), pg_temp.u_sa(), 'authenticated'), 'OK:1', 'super admin deletes pvp');

  -- nobody writes mg rows through the table
  r := pg_temp.run(format($q$INSERT INTO public.calendar_entries (type, starts_at, ends_at, all_day)
    VALUES ('mg', %L, %L, true)$q$, (pg_temp.m(8) + 7)::text || ' 00:00:00+00', (pg_temp.m(8) + 14)::text || ' 00:00:00+00'), pg_temp.u_sa(), 'authenticated');
  PERFORM pg_temp.ok(r LIKE 'ERR:42501:%', 'super admin cannot insert an mg row through the table [' || r || ']');
  PERFORM pg_temp.eq(pg_temp.run(format($q$UPDATE public.calendar_entries SET title = 'hack' WHERE id = %L$q$, id_mg), pg_temp.u_sa(), 'authenticated'),
    'OK:0', 'super admin cannot update an mg row (filtered)');
  PERFORM pg_temp.eq(pg_temp.run(format('DELETE FROM public.calendar_entries WHERE id = %L', id_mg), pg_temp.u_sa(), 'authenticated'),
    'OK:0', 'super admin cannot delete an mg row (filtered)');
  PERFORM pg_temp.ok(EXISTS (SELECT 1 FROM public.calendar_entries WHERE id = id_mg AND title IS NULL), 'mg row untouched');

  -- other roles
  r := pg_temp.run($q$INSERT INTO public.calendar_entries (type, title, starts_at, ends_at)
    VALUES ('pvp', 'x', '2030-04-01 10:00:00+00', '2030-04-01 11:00:00+00')$q$, pg_temp.u_adm(), 'authenticated');
  PERFORM pg_temp.ok(r LIKE 'ERR:42501:%', 'server admin cannot insert pvp [' || r || ']');
  r := pg_temp.run($q$INSERT INTO public.calendar_entries (type, title, starts_at, ends_at)
    VALUES ('pvp', 'x', '2030-04-01 10:00:00+00', '2030-04-01 11:00:00+00')$q$, pg_temp.u_mem(), 'authenticated');
  PERFORM pg_temp.ok(r LIKE 'ERR:42501:%', 'member cannot insert pvp [' || r || ']');
  r := pg_temp.run($q$INSERT INTO public.calendar_entries (type, title, starts_at, ends_at)
    VALUES ('pvp', 'x', '2030-04-01 10:00:00+00', '2030-04-01 11:00:00+00')$q$, NULL, 'anon');
  PERFORM pg_temp.ok(r LIKE 'ERR:42501:%', 'anon cannot insert pvp [' || r || ']');
  PERFORM pg_temp.eq(pg_temp.run(format($q$UPDATE public.calendar_entries SET title = 'hack' WHERE id = %L$q$, id_pvp), pg_temp.u_adm(), 'authenticated'),
    'OK:0', 'server admin cannot update (filtered)');

  -- a pvp row cannot be turned into an mg row, nor carry cancelled_at
  INSERT INTO public.calendar_entries (type, title, starts_at, ends_at)
    VALUES ('pvp', 'convert me', '2030-06-03 00:00:00+00', '2030-06-10 00:00:00+00') RETURNING id INTO id_pvp;
  r := pg_temp.run(format($q$UPDATE public.calendar_entries SET type = 'mg', all_day = true WHERE id = %L$q$, id_pvp), pg_temp.u_sa(), 'authenticated');
  PERFORM pg_temp.ok(r LIKE 'ERR:%', 'pvp -> mg conversion refused by a client [' || r || ']');
  PERFORM pg_temp.eq((SELECT type::text FROM public.calendar_entries WHERE id = id_pvp), 'pvp', 'row still pvp');
  r := pg_temp.run(format($q$UPDATE public.calendar_entries SET cancelled_at = now() WHERE id = %L$q$, id_pvp), pg_temp.u_sa(), 'authenticated');
  PERFORM pg_temp.ok(r LIKE 'ERR:23514:%ck_calendar_entries_cancel_mg_only%', 'cancelled_at on a pvp row refused [' || r || ']');

  -- forged audit columns are ignored (FR-006)
  PERFORM pg_temp.eq(pg_temp.run(format($q$INSERT INTO public.calendar_entries (type, title, starts_at, ends_at, created_by, updated_by, created_at)
    VALUES ('pvp', 'forged', '2030-07-01 10:00:00+00', '2030-07-01 11:00:00+00', %L, %L, '2001-01-01')$q$, pg_temp.u_mem(), pg_temp.u_mem()),
    pg_temp.u_sa(), 'authenticated'), 'OK:1', 'insert with forged audit columns');
  SELECT created_by, updated_by, created_at INTO row_ FROM public.calendar_entries WHERE title = 'forged';
  PERFORM pg_temp.ok(row_.created_by = pg_temp.u_sa() AND row_.updated_by = pg_temp.u_sa() AND row_.created_at > now() - interval '1 hour',
    'created_by/updated_by/created_at overwritten by the audit trigger');
  PERFORM pg_temp.run(format($q$UPDATE public.calendar_entries SET created_by = %L, created_at = '2001-01-01', title = 'forged2' WHERE title = 'forged'$q$, pg_temp.u_mem()),
    pg_temp.u_adm(), 'postgres');
  SELECT created_by, created_at INTO row_ FROM public.calendar_entries WHERE title = 'forged2';
  PERFORM pg_temp.ok(row_.created_by = pg_temp.u_sa() AND row_.created_at > now() - interval '1 hour', 'created_* frozen on UPDATE');
  RAISE NOTICE 'PASS S8';
END $t$;
ROLLBACK TO SAVEPOINT s8;

-- =============================================================================
-- S9. Introspection: privileges, search_path, policies, enum, cron jobs, triggers
-- =============================================================================
SAVEPOINT s9;
DO $t$
DECLARE
  f record; jobs int; r text; pol text; n int;
  -- md5 of the production command texts captured on 2026-11-25 (rehearsal bootstrap is byte-identical)
  snapshot_md5 constant jsonb := '{
    "mg-close-registrations": "c531110e66870beeae12194527e86710",
    "mg-end-events": "ed705283c4939d2b44e9108091fcaec4",
    "mg-start-events": "76c213813a7c41d0b8a6b23c916901fc",
    "discord-scheduled-messages-dispatch": "9f2f12b890a0f4e1cb3e28b3e43001f4"}';
  old_create_md5 constant text := '4209ee55b5f1f1050cc54d5719e241a2';
  j text; cmd text;
BEGIN
  -- privilege matrix (internal-functions.md section 5). proacl NULL = default = PUBLIC may execute.
  FOR f IN SELECT * FROM (VALUES
      ('public.create_mg_calendar_entries(date[])', true),
      ('public.shift_mg_calendar_entry(uuid,date)', true),
      ('public.cancel_mg_calendar_entry(uuid)', true),
      ('public.mg_create_events_for_entry(uuid,uuid)', false),
      ('public.mg_create_events_from_calendar(timestamptz)', false),
      ('public.mg_events_guard()', false),
      ('public.calendar_entries_audit()', false)) v(sig, authed) LOOP
    PERFORM pg_temp.ok(NOT coalesce((SELECT bool_or(a.grantee = 0 AND a.privilege_type = 'EXECUTE')
        FROM pg_proc p, aclexplode(p.proacl) a WHERE p.oid = f.sig::regprocedure), true),
      f.sig || ': PUBLIC has no EXECUTE');
    PERFORM pg_temp.ok(NOT has_function_privilege('anon', f.sig::regprocedure, 'EXECUTE'), f.sig || ': anon has no EXECUTE');
    PERFORM pg_temp.ok(has_function_privilege('authenticated', f.sig::regprocedure, 'EXECUTE') = f.authed,
      f.sig || ': authenticated EXECUTE = ' || f.authed);
    PERFORM pg_temp.ok(has_function_privilege('postgres', f.sig::regprocedure, 'EXECUTE'), f.sig || ': owner can execute');
    IF NOT f.authed THEN
      PERFORM pg_temp.ok(NOT has_function_privilege('service_role', f.sig::regprocedure, 'EXECUTE'), f.sig || ': service_role has no EXECUTE');
    END IF;
    PERFORM pg_temp.eq((SELECT pg_get_userbyid(proowner)::text FROM pg_proc WHERE oid = f.sig::regprocedure), 'postgres', f.sig || ': owner is postgres');
    PERFORM pg_temp.ok((SELECT 'search_path=public, pg_temp' = ANY (proconfig) FROM pg_proc WHERE oid = f.sig::regprocedure),
      f.sig || ': proconfig has search_path=public, pg_temp');
  END LOOP;
  FOR f IN SELECT unnest(ARRAY['public.create_mg_calendar_entries(date[])', 'public.shift_mg_calendar_entry(uuid,date)',
      'public.cancel_mg_calendar_entry(uuid)', 'public.mg_create_events_for_entry(uuid,uuid)',
      'public.mg_create_events_from_calendar(timestamptz)']) AS sig LOOP
    PERFORM pg_temp.ok((SELECT EXISTS (SELECT 1 FROM unnest(proconfig) c WHERE lower(c) = 'timezone=utc') FROM pg_proc WHERE oid = f.sig::regprocedure),
      f.sig || ': proconfig has timezone=UTC (stored as TimeZone=UTC)');
    PERFORM pg_temp.eq((SELECT l.lanname::text FROM pg_proc p JOIN pg_language l ON l.oid = p.prolang WHERE p.oid = f.sig::regprocedure), 'plpgsql',
      f.sig || ': plpgsql (research D-02)');
  END LOOP;
  PERFORM pg_temp.eq((SELECT count(*) FROM pg_proc WHERE pronamespace = 'public'::regnamespace
    AND proname IN ('create_mg_calendar_entries', 'shift_mg_calendar_entry', 'cancel_mg_calendar_entry',
      'mg_create_events_for_entry', 'mg_create_events_from_calendar', 'mg_events_guard', 'calendar_entries_audit'))::text, '7',
    'exactly one overload of each function');

  -- table privileges
  PERFORM pg_temp.ok(NOT has_table_privilege('authenticated', 'public.mg_events', 'INSERT'), 'mg_events: authenticated no INSERT');
  PERFORM pg_temp.ok(NOT has_table_privilege('authenticated', 'public.mg_events', 'DELETE'), 'mg_events: authenticated no DELETE');
  PERFORM pg_temp.ok(NOT has_table_privilege('authenticated', 'public.mg_events', 'TRUNCATE'), 'mg_events: authenticated no TRUNCATE');
  PERFORM pg_temp.ok(has_table_privilege('authenticated', 'public.mg_events', 'UPDATE') AND has_table_privilege('authenticated', 'public.mg_events', 'SELECT'),
    'mg_events: authenticated keeps SELECT and UPDATE');
  PERFORM pg_temp.ok(NOT has_table_privilege('anon', 'public.mg_events', 'INSERT') AND NOT has_table_privilege('anon', 'public.mg_events', 'DELETE')
    AND NOT has_table_privilege('anon', 'public.mg_events', 'TRUNCATE') AND NOT has_table_privilege('anon', 'public.mg_events', 'UPDATE'),
    'mg_events: anon has no INSERT/UPDATE/DELETE/TRUNCATE');
  PERFORM pg_temp.ok(has_table_privilege('service_role', 'public.mg_events', 'INSERT') AND has_table_privilege('service_role', 'public.mg_events', 'DELETE'),
    'mg_events: service_role keeps its default privileges');
  FOREACH j IN ARRAY ARRAY['SELECT', 'INSERT', 'UPDATE', 'DELETE'] LOOP
    PERFORM pg_temp.ok(has_table_privilege('authenticated', 'public.calendar_entries', j), 'calendar_entries: authenticated ' || j);
  END LOOP;
  FOREACH j IN ARRAY ARRAY['TRUNCATE', 'REFERENCES', 'TRIGGER'] LOOP
    PERFORM pg_temp.ok(NOT has_table_privilege('authenticated', 'public.calendar_entries', j), 'calendar_entries: authenticated no ' || j);
  END LOOP;
  FOREACH j IN ARRAY ARRAY['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'] LOOP
    PERFORM pg_temp.ok(NOT has_table_privilege('anon', 'public.calendar_entries', j), 'calendar_entries: anon no ' || j);
  END LOOP;

  -- policies
  PERFORM pg_temp.eq((SELECT string_agg(polcmd::text, ',' ORDER BY polcmd) FROM pg_policy WHERE polrelid = 'public.mg_events'::regclass), 'r,w',
    'mg_events keeps only SELECT and UPDATE policies');
  PERFORM pg_temp.eq((SELECT string_agg(polname, '|' ORDER BY polname) FROM pg_policy WHERE polrelid = 'public.mg_events'::regclass),
    'Admins can update MG events|Members can view their server MG events', 'mg_events policy names');
  PERFORM pg_temp.eq((SELECT string_agg(polcmd::text, ',' ORDER BY polcmd) FROM pg_policy WHERE polrelid = 'public.calendar_entries'::regclass),
    'a,d,r,w', 'calendar_entries: one policy per command');
  PERFORM pg_temp.ok((SELECT relrowsecurity FROM pg_class WHERE oid = 'public.calendar_entries'::regclass), 'calendar_entries: RLS enabled');
  PERFORM pg_temp.ok((SELECT bool_and(polroles = ARRAY['authenticated'::regrole::oid]) FROM pg_policy WHERE polrelid = 'public.calendar_entries'::regclass),
    'calendar_entries policies are TO authenticated only');
  -- existing registration/selection/config policies unchanged (production counts)
  PERFORM pg_temp.eq((SELECT count(*) FROM pg_policy WHERE polrelid = 'public.mg_registrations'::regclass)::text, '3', 'mg_registrations policies unchanged');
  PERFORM pg_temp.eq((SELECT count(*) FROM pg_policy WHERE polrelid = 'public.mg_selections'::regclass)::text, '4', 'mg_selections policies unchanged');
  PERFORM pg_temp.eq((SELECT count(*) FROM pg_policy WHERE polrelid = 'public.server_mg_config'::regclass)::text, '4', 'server_mg_config policies unchanged');
  PERFORM pg_temp.eq((SELECT count(*) FROM pg_policy WHERE polrelid = 'public.server_mg_slot_config'::regclass)::text, '4', 'server_mg_slot_config policies unchanged');

  -- enum
  PERFORM pg_temp.eq((SELECT string_agg(e::text, ',') FROM unnest(enum_range(NULL::public.mg_event_status)) e),
    'upcoming,registration_open,registration_closed,selection_published,ongoing,finished,cancelled', 'mg_event_status gained cancelled (last)');

  -- research D-02: no non-plpgsql function may mention 'cancelled'
  PERFORM pg_temp.eq((SELECT count(*) FROM pg_proc p JOIN pg_language l ON l.oid = p.prolang
    WHERE p.pronamespace = 'public'::regnamespace AND l.lanname <> 'plpgsql' AND p.prosrc ~ 'cancelled')::text, '0', 'no sql/other-language function mentions cancelled');

  -- R-14: only the expected definer functions (and e2e_* helpers of migration 48) write mg_events
  PERFORM pg_temp.eq((SELECT coalesce(string_agg(proname, ',' ORDER BY proname), '') FROM pg_proc
    WHERE pronamespace = 'public'::regnamespace AND prosecdef AND prosrc ~* 'update\s+(public\.)?mg_events'
      AND proname NOT IN ('shift_mg_calendar_entry', 'cancel_mg_calendar_entry') AND proname NOT LIKE 'e2e\_%'), '',
    'no other SECURITY DEFINER function updates mg_events (guard bypass review, R-14)');

  -- triggers: none that creates events, guard present
  PERFORM pg_temp.eq((SELECT coalesce(string_agg(tgname, ','), '') FROM pg_trigger WHERE tgrelid = 'public.server_mg_config'::regclass
    AND NOT tgisinternal AND tgname <> 'update_server_mg_config_updated_at'), '', 'no new trigger on server_mg_config (FR-016: no catch-up)');
  PERFORM pg_temp.ok(NOT EXISTS (SELECT 1 FROM pg_trigger t JOIN pg_proc p ON p.oid = t.tgfoid WHERE t.tgrelid = 'public.server_mg_config'::regclass
    AND NOT t.tgisinternal AND p.prosrc ~* 'mg_create_events'), 'no trigger on server_mg_config creates events');
  PERFORM pg_temp.ok(EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid = 'public.calendar_entries'::regclass AND tgname = 'trg_calendar_entries_audit' AND NOT tgisinternal),
    'trg_calendar_entries_audit present');

  -- cron
  SELECT count(*) INTO jobs FROM cron.job WHERE jobname = 'mg-create-events';
  PERFORM pg_temp.eq(jobs::text, '1', 'exactly one mg-create-events job');
  PERFORM pg_temp.eq((SELECT count(*) FROM cron.job WHERE command ~* 'mg_events' AND command ~* 'insert')::text, '0',
    'no remaining job inserts into mg_events directly (two creation jobs = duplicates)');
  PERFORM pg_temp.eq((SELECT count(*) FROM cron.job WHERE command ~ 'mg_create_events_from_calendar')::text, '1', 'exactly one job calls the calendar function');
  SELECT btrim(command, E' \n\t'), schedule || '|' || active || '|' || username INTO cmd, r FROM cron.job WHERE jobname = 'mg-create-events';
  PERFORM pg_temp.eq(cmd, 'SELECT public.mg_create_events_from_calendar();', 'mg-create-events command');
  PERFORM pg_temp.eq(r, '0 0 * * 1|true|postgres', 'mg-create-events schedule, active, user');
  PERFORM pg_temp.ok(NOT EXISTS (SELECT 1 FROM cron.job WHERE md5(command) = old_create_md5), 'the old parity job text is gone');
  FOR j IN SELECT jsonb_object_keys(snapshot_md5) LOOP
    PERFORM pg_temp.eq((SELECT count(*) FROM cron.job WHERE jobname = j)::text, '1', 'job ' || j || ' present once');
    PERFORM pg_temp.eq((SELECT md5(command) FROM cron.job WHERE jobname = j), snapshot_md5 ->> j, 'job ' || j || ' byte-identical to the production snapshot');
    PERFORM pg_temp.ok((SELECT active FROM cron.job WHERE jobname = j), 'job ' || j || ' still active');
  END LOOP;
  PERFORM pg_temp.eq((SELECT count(*) FROM cron.job)::text, '5', 'five jobs in total');
  RAISE NOTICE 'PASS S9';
END $t$;
ROLLBACK TO SAVEPOINT s9;

-- =============================================================================
-- S10. Migration data (snapshot-loaded rehearsal database, after the PO-1 fix)
-- =============================================================================
SAVEPOINT s10;
DO $t$
DECLARE
  backfilled constant text := '2026-04-27,2026-05-11,2026-05-25,2026-06-08,2026-06-22,2026-07-06,2026-07-20,2026-08-03,2026-08-17,2026-08-31,2026-09-14,2026-09-28,2026-10-12,2026-10-26,2026-11-09,2026-11-23';
  seeded constant text := '2026-12-07,2026-12-21,2027-01-04,2027-01-18,2027-02-01,2027-02-15,2027-03-01,2027-03-15,2027-03-29,2027-04-12,2027-04-26,2027-05-10,2027-05-24';
  w record;
BEGIN
  PERFORM pg_temp.eq((SELECT count(*) FROM public.calendar_entries)::text, '29', '29 entries: 13 seeded + 16 backfilled');
  PERFORM pg_temp.eq(pg_temp.starts(true), backfilled || ',' || seeded, 'exact list of entry starts (backfill then seed)');
  PERFORM pg_temp.eq((SELECT count(*) FROM public.calendar_entries WHERE starts_at <= '2026-11-23 00:00:00+00')::text, '16', '16 backfilled entries');
  PERFORM pg_temp.eq((SELECT count(*) FROM public.calendar_entries WHERE starts_at >= '2026-12-07 00:00:00+00')::text, '13', '13 seeded entries');
  PERFORM pg_temp.ok((SELECT bool_and(type = 'mg' AND all_day AND cancelled_at IS NULL AND created_by IS NULL AND updated_by IS NULL
    AND ends_at = starts_at + interval '168 hours' AND title IS NULL) FROM public.calendar_entries), 'all entries: mg, all_day, uncancelled, no author, 7-day length');

  PERFORM pg_temp.eq((SELECT count(*) FROM public.mg_events)::text, '49', 'event count unchanged by the migration (49 in the snapshot)');
  PERFORM pg_temp.eq((SELECT count(*) FROM public.mg_events WHERE calendar_entry_id IS NULL)::text, '0', 'every event is linked');
  PERFORM pg_temp.eq((SELECT count(*) FROM public.mg_events e JOIN public.calendar_entries c ON c.id = e.calendar_entry_id
    WHERE (c.starts_at AT TIME ZONE 'UTC')::date <> e.start_date)::text, '0', 'every link points to the entry of the same start date');
  PERFORM pg_temp.eq((SELECT count(*) FROM public.mg_events WHERE extract(isodow FROM start_date) <> 1 OR end_date <> start_date + 6
    OR registration_close_at <> start_date - 4 OR registration_open_at > start_date - 7)::text, '0', 'no event violates the date shape (SC-003)');

  -- the former Wednesday demo event
  SELECT * INTO w FROM public.mg_events WHERE id = 'a734f6ab-98f4-4814-b952-5b3269023401';
  PERFORM pg_temp.ok(w.start_date = '2026-08-03' AND w.end_date = '2026-08-09' AND w.registration_open_at = '2026-07-27'
    AND w.registration_close_at = '2026-07-30', 'Wednesday event re-dated to Monday 2026-08-03 (PO-1)');
  PERFORM pg_temp.eq((SELECT count(*) FROM public.mg_registrations WHERE mg_event_id = w.id)::text, '13', 'its 13 registrations are kept');
  PERFORM pg_temp.eq((SELECT count(*) FROM public.mg_selections WHERE mg_event_id = w.id)::text, '10', 'its 10 selections are kept');
  PERFORM pg_temp.eq((SELECT count(*) FROM public.mg_events WHERE calendar_entry_id = (SELECT id FROM public.calendar_entries WHERE starts_at = '2026-08-03 00:00:00+00'))::text,
    '3', 'three servers linked to the 2026-08-03 entry (including the former Wednesday event)');
  PERFORM pg_temp.eq((SELECT count(*) FROM public.mg_events e WHERE e.start_date >= '2026-12-01')::text, '0',
    'no event of the seeded cycle exists yet (applied before Monday 2026-11-30)');
  RAISE NOTICE 'NOTE S10: second application and invalid-row guard are covered by 47-mg-global-calendar.reapply.test.sql and .guard-negative.test.sql';
  RAISE NOTICE 'PASS S10';
END $t$;
ROLLBACK TO SAVEPOINT s10;

-- =============================================================================
-- S11. The three untouched transition crons still work on new-shape events
--      (the stored command texts are run with CURRENT_DATE replaced by a simulated date)
-- =============================================================================
SAVEPOINT s11;
DO $t$
DECLARE
  x uuid[]; i int; cmd text; d date := date '2026-12-07';
  ev_open uuid; ev_pub uuid; ev_fail uuid; ev_ongoing uuid; ev_cancel uuid;
BEGIN
  PERFORM pg_temp.wipe();
  FOR i IN 1..5 LOOP x[i] := pg_temp.mk_server('T11-' || i); END LOOP;
  ev_open    := pg_temp.mk_event(x[1], NULL, d, 'registration_open');     -- close date 2026-12-03
  ev_pub     := pg_temp.mk_event(x[2], NULL, d, 'selection_published');
  ev_fail    := pg_temp.mk_event(x[3], NULL, d, 'registration_closed');   -- admins did not publish: failsafe
  ev_ongoing := pg_temp.mk_event(x[4], NULL, d, 'ongoing');               -- ends 2026-12-13
  ev_cancel  := pg_temp.mk_event(x[5], NULL, d, 'cancelled');
  UPDATE public.mg_events SET selection_published_at = now() WHERE id = ev_pub;

  -- closing job (Thursday)
  SELECT command INTO STRICT cmd FROM cron.job WHERE jobname = 'mg-close-registrations';
  EXECUTE replace(cmd, 'CURRENT_DATE', quote_literal('2026-12-02') || '::date');
  PERFORM pg_temp.eq((SELECT status::text FROM public.mg_events WHERE id = ev_open), 'registration_open', 'close job: nothing before Thursday');
  EXECUTE replace(cmd, 'CURRENT_DATE', quote_literal('2026-12-03') || '::date');
  PERFORM pg_temp.eq((SELECT status::text FROM public.mg_events WHERE id = ev_open), 'registration_closed', 'close job: Thursday closes the event');
  PERFORM pg_temp.eq((SELECT status::text FROM public.mg_events WHERE id = ev_cancel), 'cancelled', 'close job: cancelled event untouched');

  -- start job (Monday), normal path and failsafe path
  SELECT command INTO STRICT cmd FROM cron.job WHERE jobname = 'mg-start-events';
  EXECUTE replace(cmd, 'CURRENT_DATE', quote_literal('2026-12-06') || '::date');
  PERFORM pg_temp.eq((SELECT status::text FROM public.mg_events WHERE id = ev_pub), 'selection_published', 'start job: nothing before the MG Monday');
  EXECUTE replace(cmd, 'CURRENT_DATE', quote_literal('2026-12-07') || '::date');
  PERFORM pg_temp.eq((SELECT status::text FROM public.mg_events WHERE id = ev_pub), 'ongoing', 'start job: published selection starts');
  PERFORM pg_temp.eq((SELECT status::text FROM public.mg_events WHERE id = ev_fail), 'ongoing', 'start job failsafe: unpublished event starts');
  PERFORM pg_temp.ok((SELECT selection_published_at IS NOT NULL FROM public.mg_events WHERE id = ev_fail), 'start job failsafe: selection_published_at set (full FFA)');
  PERFORM pg_temp.eq((SELECT status::text FROM public.mg_events WHERE id = ev_open), 'ongoing', 'start job failsafe: the event closed by the close job also starts');
  PERFORM pg_temp.eq((SELECT status::text FROM public.mg_events WHERE id = ev_cancel), 'cancelled', 'start job: cancelled event untouched');

  -- end job (Sunday)
  SELECT command INTO STRICT cmd FROM cron.job WHERE jobname = 'mg-end-events';
  EXECUTE replace(cmd, 'CURRENT_DATE', quote_literal('2026-12-12') || '::date');
  PERFORM pg_temp.eq((SELECT status::text FROM public.mg_events WHERE id = ev_ongoing), 'ongoing', 'end job: nothing before the last day');
  EXECUTE replace(cmd, 'CURRENT_DATE', quote_literal('2026-12-13') || '::date');
  PERFORM pg_temp.eq((SELECT status::text FROM public.mg_events WHERE id = ev_ongoing), 'finished', 'end job: Sunday finishes the event');
  PERFORM pg_temp.eq((SELECT status::text FROM public.mg_events WHERE id = ev_cancel), 'cancelled', 'end job: cancelled event untouched');
  PERFORM pg_temp.ok((SELECT bool_and(status = 'finished') FROM public.mg_events WHERE id IN (ev_open, ev_pub, ev_fail, ev_ongoing)), 'full cycle ends finished');
  RAISE NOTICE 'PASS S11';
END $t$;
ROLLBACK TO SAVEPOINT s11;

-- =============================================================================
-- S12. Side effects of the rights changes
-- =============================================================================
SAVEPOINT s12;
DO $t$
DECLARE x uuid; ev uuid; evc uuid; r text; sub uuid;
BEGIN
  PERFORM pg_temp.wipe();
  -- super admin deletes a server: events, registrations cascade although DELETE on mg_events is revoked
  x := pg_temp.mk_server('T12-DEL');
  ev := pg_temp.mk_event(x, NULL, pg_temp.m(1), 'registration_open');
  PERFORM pg_temp.mk_user(gen_random_uuid(), x, 'member', 't12-mem');
  INSERT INTO public.mg_registrations (mg_event_id, user_id) SELECT ev, id FROM public.user_profiles WHERE server_id = x;
  INSERT INTO public.server_mg_config (server_id) VALUES (x);
  PERFORM pg_temp.eq(pg_temp.run(format('DELETE FROM public.servers WHERE id = %L', x), pg_temp.u_sa(), 'authenticated'), 'OK:1', 'super admin deletes a server');
  PERFORM pg_temp.eq((SELECT count(*) FROM public.mg_events WHERE server_id = x)::text, '0', 'events cascaded');
  PERFORM pg_temp.eq((SELECT count(*) FROM public.mg_registrations WHERE mg_event_id = ev)::text, '0', 'registrations cascaded');
  PERFORM pg_temp.eq((SELECT count(*) FROM public.server_mg_config WHERE server_id = x)::text, '0', 'config cascaded');

  -- registrations: unchanged behaviour
  ev  := pg_temp.mk_event(pg_temp.s_a(), NULL, pg_temp.m(1), 'registration_open');
  evc := pg_temp.mk_event(pg_temp.s_b(), NULL, pg_temp.m(1), 'registration_closed');
  PERFORM pg_temp.eq(pg_temp.run(format('INSERT INTO public.mg_registrations (mg_event_id, user_id) VALUES (%L, %L)', ev, pg_temp.u_mem()),
    pg_temp.u_mem(), 'authenticated'), 'OK:1', 'member registers to an open event of their server');
  r := pg_temp.run(format('INSERT INTO public.mg_registrations (mg_event_id, user_id) VALUES (%L, %L)', evc, pg_temp.u_memb()),
    pg_temp.u_memb(), 'authenticated');
  PERFORM pg_temp.ok(r LIKE 'ERR:42501:%', 'member cannot register to a closed event [' || r || ']');
  r := pg_temp.run(format('INSERT INTO public.mg_registrations (mg_event_id, user_id) VALUES (%L, %L)', ev, pg_temp.u_memb()),
    pg_temp.u_memb(), 'authenticated');
  PERFORM pg_temp.ok(r LIKE 'ERR:42501:%', 'member cannot register to another server''s event [' || r || ']');
  -- selections: server admin still manages them, a member still cannot
  PERFORM pg_temp.eq(pg_temp.run(format($q$INSERT INTO public.mg_selections (mg_event_id, rank, selection_type, selected_by)
    VALUES (%L, 1, 'ffa', 'manual')$q$, ev), pg_temp.u_adm(), 'authenticated'), 'OK:1', 'server admin still inserts selections');
  r := pg_temp.run(format($q$INSERT INTO public.mg_selections (mg_event_id, rank, selection_type, selected_by)
    VALUES (%L, 2, 'ffa', 'manual')$q$, ev), pg_temp.u_mem(), 'authenticated');
  PERFORM pg_temp.ok(r LIKE 'ERR:42501:%', 'member still cannot insert selections [' || r || ']');
  -- members still read the events of their own server, and only theirs
  PERFORM pg_temp.eq(pg_temp.val(format('SELECT count(*)::text FROM public.mg_events WHERE id IN (%L, %L)', ev, evc), pg_temp.u_mem(), 'authenticated'), '1',
    'member sees only their own server''s events');
  RAISE NOTICE 'PASS S12';
END $t$;
ROLLBACK TO SAVEPOINT s12;

ROLLBACK;
\echo ALL SCENARIOS PASSED (S1-S12). Transaction rolled back, nothing persisted.
