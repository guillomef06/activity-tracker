-- =============================================================================
-- Snapshot export for the rehearsal database. READ-ONLY: a single SELECT.
--
-- Run it against PRODUCTION through the Supabase MCP `execute_sql` (or the SQL
-- editor); it returns ONE text cell, which is a complete SQL load script. Save
-- that cell as supabase/tests/rehearsal/snapshot.local.sql (ignored by git via
-- the *.local.sql pattern) and load it in the rehearsal container AFTER
-- bootstrap.sql. See README.md.
--
-- Confidentiality: only NON-PERSONAL data is exported.
--   exported as is   : servers (id, name), server_mg_config, mg_events (all columns)
--   NEVER exported   : user_profiles, auth.users, e-mails, user names, comments,
--                      selection labels, auth identifiers
--   registrations / selections are exported as COUNTS and shapes only (counts per type); the generated script rebuilds
--   them with fictitious users 'fixture-N' (deterministic ids, one numbering
--   per server), so every event keeps the same number of registrations and
--   selections as in production (e.g. a734f6ab-98f4-4814-b952-5b3269023401
--   gets 13 registrations and 10 selections).
-- =============================================================================
WITH
srv AS (
  SELECT 'INSERT INTO public.servers (id, name) VALUES' || E'\n'
         || string_agg(format('  (%L, %L)', s.id, s.name), E',\n' ORDER BY s.name) || ';' AS t
  FROM public.servers s
),
cfg AS (
  SELECT 'INSERT INTO public.server_mg_config (server_id, capacity, assignment_mode, dkp_enabled) VALUES' || E'\n'
         || string_agg(format('  (%L, %s, %L, %L)', c.server_id, c.capacity, c.assignment_mode, c.dkp_enabled),
                       E',\n' ORDER BY c.server_id) || ';' AS t
  FROM public.server_mg_config c
),
ev AS (
  SELECT 'INSERT INTO public.mg_events (id, server_id, start_date, end_date, registration_open_at, registration_close_at, status, selection_published_at, created_at) VALUES' || E'\n'
         || string_agg(format('  (%L, %L, %L, %L, %L, %L, %L, %L, %L)',
                              e.id, e.server_id, e.start_date, e.end_date, e.registration_open_at,
                              e.registration_close_at, e.status, e.selection_published_at, e.created_at),
                       E',\n' ORDER BY e.start_date, e.server_id) || ';' AS t
  FROM public.mg_events e
),
fx AS (
  SELECT string_agg(
           format('SELECT pg_temp.fx_event(%L, %s, %s, %s, %s);', e.id, d.regs, d.n_selected, d.n_empty, d.n_ffa),
           E'
' ORDER BY e.start_date, e.id) AS t
  FROM public.mg_events e
  CROSS JOIN LATERAL (
    SELECT
      (SELECT count(*) FROM public.mg_registrations r WHERE r.mg_event_id = e.id) AS regs,
      (SELECT count(*) FROM public.mg_selections x WHERE x.mg_event_id = e.id AND x.selection_type = 'selected') AS n_selected,
      (SELECT count(*) FROM public.mg_selections x WHERE x.mg_event_id = e.id AND x.selection_type = 'empty') AS n_empty,
      (SELECT count(*) FROM public.mg_selections x WHERE x.mg_event_id = e.id AND x.selection_type = 'ffa') AS n_ffa
  ) d
  WHERE d.regs + d.n_selected + d.n_empty + d.n_ffa > 0
),
pre AS (
  SELECT $pre$
-- Fixture helpers (session-local). Fictitious users only.
CREATE FUNCTION pg_temp.fx_user(p_server uuid, p_k int) RETURNS uuid LANGUAGE plpgsql AS $fn$
DECLARE v_id uuid := md5('fixture-user|' || p_server::text || '|' || p_k::text)::uuid;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = v_id) THEN
    INSERT INTO auth.users (id) VALUES (v_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.user_profiles WHERE id = v_id) THEN
    INSERT INTO public.user_profiles (id, server_id, display_name, username, role, recovery_question_id, recovery_answer_hash)
    VALUES (v_id, p_server, 'fixture-' || p_k, 'fixture-' || substr(md5(p_server::text), 1, 6) || '-' || p_k, 'member', 1, 'fixture');
  END IF;
  RETURN v_id;
END $fn$;

-- Shape-preserving rebuild: same number of registrations and of selections per
-- type; selected rows get a fixture user and a cost of 100, empty rows a cost of
-- 100 without user, ffa rows a cost of 0 without user. Ranks run 1..n.
CREATE FUNCTION pg_temp.fx_event(p_event uuid, p_regs int, p_selected int, p_empty int, p_ffa int) RETURNS void LANGUAGE plpgsql AS $fn$
DECLARE
  v_server uuid; v_open date; v_rank int := 0;
BEGIN
  SELECT server_id, registration_open_at INTO STRICT v_server, v_open FROM public.mg_events WHERE id = p_event;
  FOR i IN 1..p_regs LOOP
    INSERT INTO public.mg_registrations (mg_event_id, user_id, registered_at)
    VALUES (p_event, pg_temp.fx_user(v_server, i), v_open::timestamptz + (i * interval '1 minute'));
  END LOOP;
  FOR i IN 1..p_selected LOOP
    v_rank := v_rank + 1;
    INSERT INTO public.mg_selections (mg_event_id, user_id, rank, selection_type, selected_by, cost)
    VALUES (p_event, pg_temp.fx_user(v_server, i), v_rank, 'selected', 'manual', 100);
  END LOOP;
  FOR i IN 1..p_empty LOOP
    v_rank := v_rank + 1;
    INSERT INTO public.mg_selections (mg_event_id, rank, selection_type, selected_by, cost)
    VALUES (p_event, v_rank, 'empty', 'manual', 100);
  END LOOP;
  FOR i IN 1..p_ffa LOOP
    v_rank := v_rank + 1;
    INSERT INTO public.mg_selections (mg_event_id, rank, selection_type, selected_by, cost)
    VALUES (p_event, v_rank, 'ffa', 'manual', 0);
  END LOOP;
END $fn$;

-- Production has 2 super_admin profiles; the migration guard requires at least one.
CREATE FUNCTION pg_temp.fx_super_admin(p_k int) RETURNS void LANGUAGE plpgsql AS $fn$
DECLARE v_id uuid := md5('fixture-super-admin|' || p_k::text)::uuid;
BEGIN
  INSERT INTO auth.users (id) VALUES (v_id);
  INSERT INTO public.user_profiles (id, server_id, display_name, username, role, recovery_question_id, recovery_answer_hash)
  VALUES (v_id, NULL, 'fixture-super-admin-' || p_k, 'fixture-super-admin-' || p_k, 'super_admin', 1, 'fixture');
END $fn$;
SELECT pg_temp.fx_super_admin(1);
SELECT pg_temp.fx_super_admin(2);
$pre$ AS t
)
SELECT '-- Production snapshot (non-personal), generated by export-snapshot.sql. Do not commit.' || E'\n'
       || 'BEGIN;' || E'\n\n'
       || srv.t || E'\n\n' || cfg.t || E'\n\n' || ev.t || E'\n'
       || pre.t || E'\n'
       || fx.t || E'\n\nCOMMIT;' || E'\n' AS snapshot_script
FROM srv, cfg, ev, fx, pre;
