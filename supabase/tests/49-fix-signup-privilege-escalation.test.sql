-- =============================================================================
-- SQL tests S1-S10 of migration 49-fix-signup-privilege-escalation.sql
--
-- !!! LOCAL REHEARSAL DATABASE ONLY, NEVER PRODUCTION !!!
-- Everything happens in ONE transaction that always ends in ROLLBACK (each
-- scenario also runs inside its own SAVEPOINT, rolled back before the next).
--
-- Preconditions: bootstrap.sql loaded (invitation_tokens production-shaped,
-- see rehearsal README), migration 49 applied. No production snapshot needed
-- — this test only creates its own fixtures.
--
-- Run (Git Bash): export MSYS_NO_PATHCONV=1
--   docker exec -i at-sec-1 psql -U postgres -v ON_ERROR_STOP=1 < supabase/49-fix-signup-privilege-escalation.sql
--   docker exec -i at-sec-1 psql -U postgres -X -v ON_ERROR_STOP=1 < supabase/tests/49-fix-signup-privilege-escalation.test.sql
-- Expected output: one "NOTICE: PASS Sxx" per scenario, then "ALL SCENARIOS PASSED".
-- =============================================================================
\set ON_ERROR_STOP on
SET client_min_messages = notice;

BEGIN;

DO $t$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'servers'
      AND policyname = 'Authenticated users can create their own server'
  ) THEN
    RAISE EXCEPTION 'PRECONDITION: migration 49 is not applied';
  END IF;
END $t$;

-- ---------------------------------------------------------------------------
-- Helpers (pg_temp: session-local)
-- ---------------------------------------------------------------------------
CREATE FUNCTION pg_temp.ok(p_cond boolean, p_msg text) RETURNS void LANGUAGE plpgsql AS $f$
BEGIN
  IF p_cond IS NOT TRUE THEN RAISE EXCEPTION 'ASSERT FAILED: %', p_msg; END IF;
END $f$;

-- Runs p_sql as role p_role impersonating p_uid (NULL uid = anon). Returns
-- 'OK:<rows>' or 'ERR:<sqlstate>:<message>'.
CREATE FUNCTION pg_temp.run(p_sql text, p_uid uuid, p_role text DEFAULT 'authenticated') RETURNS text
LANGUAGE plpgsql AS $f$
DECLARE n bigint; st text; msg text; res text;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', coalesce(p_uid::text, ''), true);
  PERFORM set_config('request.jwt.claims',
    CASE WHEN p_uid IS NULL THEN '' ELSE json_build_object('sub', p_uid, 'role', p_role)::text END, true);
  EXECUTE format('SET LOCAL ROLE %I', CASE WHEN p_uid IS NULL THEN 'anon' ELSE p_role END);
  BEGIN
    EXECUTE p_sql;
    GET DIAGNOSTICS n = ROW_COUNT;
    res := 'OK:' || n;
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS st = RETURNED_SQLSTATE, msg = MESSAGE_TEXT;
    res := 'ERR:' || st || ':' || msg;
  END;
  RESET ROLE;
  PERFORM set_config('request.jwt.claim.sub', '', true);
  PERFORM set_config('request.jwt.claims', '', true);
  RETURN res;
END $f$;

CREATE FUNCTION pg_temp.is_err(p_r text, p_code text DEFAULT '42501') RETURNS boolean
LANGUAGE sql AS $f$ SELECT p_r LIKE 'ERR:' || p_code || ':%' $f$;

CREATE FUNCTION pg_temp.mk_server(p_name text, p_owner uuid) RETURNS uuid LANGUAGE plpgsql AS $f$
DECLARE v_id uuid := gen_random_uuid();
BEGIN
  INSERT INTO public.servers (id, name, owner_id) VALUES (v_id, p_name, p_owner);
  RETURN v_id;
END $f$;

CREATE FUNCTION pg_temp.mk_auth_user(p_id uuid) RETURNS void LANGUAGE sql AS
$f$ INSERT INTO auth.users (id) VALUES (p_id) $f$;

CREATE FUNCTION pg_temp.mk_token(p_server uuid, p_expires timestamptz DEFAULT now() + interval '1 day') RETURNS uuid
LANGUAGE plpgsql AS $f$
DECLARE v_id uuid;
BEGIN
  INSERT INTO public.invitation_tokens (server_id, token, expires_at)
  VALUES (p_server, 'tok-' || gen_random_uuid(), p_expires)
  RETURNING id INTO v_id;
  RETURN v_id;
END $f$;

CREATE FUNCTION pg_temp.ins_profile(p_id uuid, p_server uuid, p_role text, p_token uuid DEFAULT NULL) RETURNS text
LANGUAGE sql AS $f$
  SELECT pg_temp.run(format(
    $sql$INSERT INTO public.user_profiles
           (id, server_id, invitation_token_id, display_name, username, role, recovery_question_id, recovery_answer_hash)
         VALUES ('%s', %L, %L, 'x', 'x-' || gen_random_uuid()::text, %L, 1, 'x')$sql$,
    p_id, p_server, p_token, p_role), p_id)
$f$;

-- Fixed identities
CREATE FUNCTION pg_temp.u1() RETURNS uuid LANGUAGE sql IMMUTABLE AS $f$ SELECT 'aaaaaaaa-1111-0000-0000-000000000001'::uuid $f$;
CREATE FUNCTION pg_temp.u2() RETURNS uuid LANGUAGE sql IMMUTABLE AS $f$ SELECT 'aaaaaaaa-1111-0000-0000-000000000002'::uuid $f$;
CREATE FUNCTION pg_temp.u3() RETURNS uuid LANGUAGE sql IMMUTABLE AS $f$ SELECT 'aaaaaaaa-1111-0000-0000-000000000003'::uuid $f$;

-- =============================================================================
-- S1 (regression): own-server creation during admin signup still works.
-- =============================================================================
SAVEPOINT s1;
DO $s$ BEGIN
  PERFORM pg_temp.mk_auth_user(pg_temp.u1());
  PERFORM pg_temp.ok(
    pg_temp.run(format($sql$INSERT INTO public.servers (name, owner_id) VALUES ('srv-s1', '%s')$sql$, pg_temp.u1()), pg_temp.u1()) = 'OK:1',
    'S1: authenticated user must create a server with owner_id = self');
  RAISE NOTICE 'PASS S1';
END $s$;
ROLLBACK TO s1;

-- =============================================================================
-- S2 (FAIL, new): nobody can create a server owned by a stranger, incl. anon.
-- =============================================================================
SAVEPOINT s2;
DO $s$ BEGIN
  PERFORM pg_temp.mk_auth_user(pg_temp.u1());
  PERFORM pg_temp.mk_auth_user(pg_temp.u2());
  PERFORM pg_temp.ok(
    pg_temp.is_err(pg_temp.run(format($sql$INSERT INTO public.servers (name, owner_id) VALUES ('srv-s2a', '%s')$sql$, pg_temp.u2()), pg_temp.u1())),
    'S2a: authenticated user must not create a server owned by someone else');
  PERFORM pg_temp.ok(
    pg_temp.is_err(pg_temp.run(format($sql$INSERT INTO public.servers (name, owner_id) VALUES ('srv-s2b', '%s')$sql$, pg_temp.u1()), NULL)),
    'S2b: anon must not create a server at all, even owned by itself');
  RAISE NOTICE 'PASS S2';
END $s$;
ROLLBACK TO s2;

-- =============================================================================
-- S3 (regression): admin self-signup on the server they just created still works.
-- =============================================================================
SAVEPOINT s3;
DO $s$
DECLARE v_server uuid;
BEGIN
  PERFORM pg_temp.mk_auth_user(pg_temp.u1());
  v_server := pg_temp.mk_server('srv-s3', pg_temp.u1());
  PERFORM pg_temp.ok(pg_temp.ins_profile(pg_temp.u1(), v_server, 'admin') = 'OK:1',
    'S3: the server owner must be able to self-insert as admin of it');
  RAISE NOTICE 'PASS S3';
END $s$;
ROLLBACK TO s3;

-- =============================================================================
-- S4 (FAIL, THE vulnerability): a non-owner cannot self-insert as admin of an
-- existing server, even one it knows the id of.
-- =============================================================================
SAVEPOINT s4;
DO $s$
DECLARE v_server uuid;
BEGIN
  PERFORM pg_temp.mk_auth_user(pg_temp.u1());
  PERFORM pg_temp.mk_auth_user(pg_temp.u2());
  v_server := pg_temp.mk_server('srv-s4', pg_temp.u1());
  PERFORM pg_temp.ok(pg_temp.is_err(pg_temp.ins_profile(pg_temp.u2(), v_server, 'admin')),
    'S4: a stranger must not self-insert as admin of someone else''s server');
  RAISE NOTICE 'PASS S4';
END $s$;
ROLLBACK TO s4;

-- =============================================================================
-- S5 (regression): member self-signup with a valid, matching invitation still works.
-- =============================================================================
SAVEPOINT s5;
DO $s$
DECLARE v_server uuid; v_token uuid;
BEGIN
  PERFORM pg_temp.mk_auth_user(pg_temp.u1());
  PERFORM pg_temp.mk_auth_user(pg_temp.u2());
  v_server := pg_temp.mk_server('srv-s5', pg_temp.u1());
  v_token := pg_temp.mk_token(v_server);
  PERFORM pg_temp.ok(pg_temp.ins_profile(pg_temp.u2(), v_server, 'member', v_token) = 'OK:1',
    'S5: a fresh user with a valid matching invitation must join as member');
  RAISE NOTICE 'PASS S5';
END $s$;
ROLLBACK TO s5;

-- =============================================================================
-- S6 (FAIL, THE vulnerability): the exact live PoC — a legitimate MEMBER
-- invitation must not let the holder register as admin instead.
-- =============================================================================
SAVEPOINT s6;
DO $s$
DECLARE v_server uuid; v_token uuid;
BEGIN
  PERFORM pg_temp.mk_auth_user(pg_temp.u1());
  PERFORM pg_temp.mk_auth_user(pg_temp.u2());
  v_server := pg_temp.mk_server('srv-s6', pg_temp.u1());
  v_token := pg_temp.mk_token(v_server);
  PERFORM pg_temp.ok(pg_temp.is_err(pg_temp.ins_profile(pg_temp.u2(), v_server, 'admin', v_token)),
    'S6: a member invitation must not grant role=admin');
  RAISE NOTICE 'PASS S6';
END $s$;
ROLLBACK TO s6;

-- =============================================================================
-- S7 (FAIL, new): member self-signup with NO invitation token is rejected.
-- =============================================================================
SAVEPOINT s7;
DO $s$
DECLARE v_server uuid;
BEGIN
  PERFORM pg_temp.mk_auth_user(pg_temp.u1());
  PERFORM pg_temp.mk_auth_user(pg_temp.u2());
  v_server := pg_temp.mk_server('srv-s7', pg_temp.u1());
  PERFORM pg_temp.ok(pg_temp.is_err(pg_temp.ins_profile(pg_temp.u2(), v_server, 'member', NULL)),
    'S7: member signup without any invitation token must be rejected');
  RAISE NOTICE 'PASS S7';
END $s$;
ROLLBACK TO s7;

-- =============================================================================
-- S8 (FAIL, new): an invitation for server A cannot be reused to join server B.
-- =============================================================================
SAVEPOINT s8;
DO $s$
DECLARE v_server_a uuid; v_server_b uuid; v_token uuid;
BEGIN
  PERFORM pg_temp.mk_auth_user(pg_temp.u1());
  PERFORM pg_temp.mk_auth_user(pg_temp.u2());
  PERFORM pg_temp.mk_auth_user(pg_temp.u3());
  v_server_a := pg_temp.mk_server('srv-s8a', pg_temp.u1());
  v_server_b := pg_temp.mk_server('srv-s8b', pg_temp.u3());
  v_token := pg_temp.mk_token(v_server_a);
  PERFORM pg_temp.ok(pg_temp.is_err(pg_temp.ins_profile(pg_temp.u2(), v_server_b, 'member', v_token)),
    'S8: a token scoped to server A must not grant membership on server B');
  RAISE NOTICE 'PASS S8';
END $s$;
ROLLBACK TO s8;

-- =============================================================================
-- S9 (FAIL, new): an expired invitation token is rejected.
-- =============================================================================
SAVEPOINT s9;
DO $s$
DECLARE v_server uuid; v_token uuid;
BEGIN
  PERFORM pg_temp.mk_auth_user(pg_temp.u1());
  PERFORM pg_temp.mk_auth_user(pg_temp.u2());
  v_server := pg_temp.mk_server('srv-s9', pg_temp.u1());
  v_token := pg_temp.mk_token(v_server, now() - interval '1 hour');
  PERFORM pg_temp.ok(pg_temp.is_err(pg_temp.ins_profile(pg_temp.u2(), v_server, 'member', v_token)),
    'S9: an expired invitation token must not grant membership');
  RAISE NOTICE 'PASS S9';
END $s$;
ROLLBACK TO s9;

-- =============================================================================
-- S10 (regression): a used-but-unexpired token still works (multi-use by design,
-- migration 04) — a second member joining on the same token must succeed.
-- =============================================================================
SAVEPOINT s10;
DO $s$
DECLARE v_server uuid; v_token uuid;
BEGIN
  PERFORM pg_temp.mk_auth_user(pg_temp.u1());
  PERFORM pg_temp.mk_auth_user(pg_temp.u2());
  PERFORM pg_temp.mk_auth_user(pg_temp.u3());
  v_server := pg_temp.mk_server('srv-s10', pg_temp.u1());
  v_token := pg_temp.mk_token(v_server);
  PERFORM pg_temp.ok(pg_temp.ins_profile(pg_temp.u2(), v_server, 'member', v_token) = 'OK:1',
    'S10a: first member joins on the shared token');
  PERFORM pg_temp.ok(pg_temp.ins_profile(pg_temp.u3(), v_server, 'member', v_token) = 'OK:1',
    'S10b: a second member must still be able to join on the same (multi-use) token');
  RAISE NOTICE 'PASS S10';
END $s$;
ROLLBACK TO s10;

DO $t$ BEGIN RAISE NOTICE 'ALL SCENARIOS PASSED'; END $t$;
ROLLBACK;
