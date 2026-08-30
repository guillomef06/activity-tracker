-- ============================================
-- Migration 34: Restrict SECURITY DEFINER Function Execute Grants
-- ============================================
-- Purpose:  Supabase's advisor flags 15 SECURITY DEFINER functions in
--           `public` as directly callable via PostgREST RPC
--           (/rest/v1/rpc/<fn>) by both `anon` and `authenticated` — 30
--           lint entries total. Every function was audited individually
--           (call sites in the Angular app, call sites in other SQL
--           functions/triggers, and its own body) before deciding whether
--           tightening its grant is safe. This migration only touches the
--           7 functions below, where doing so does NOT remove any
--           legitimate capability:
--
--           Fully revoked (anon + authenticated) — never meant to be
--           called directly by a client, only fired as a trigger or
--           invoked internally by another SECURITY DEFINER function
--           (which executes as its owner, not the original caller, so
--           internal call chains are unaffected by revoking these):
--             - check_guide_limit()              BEFORE INSERT trigger on guides
--             - update_guide_upvotes_count()      AFTER INSERT/DELETE trigger on guide_upvotes
--             - season_has_logged_activities(uuid) only called from season lock triggers (31-season-schedule.sql)
--             - super_admin_exists()               only called from the privilege-escalation trigger (30-fix-role-privilege-escalation.sql)
--             - calculate_activity_points(uuid,text,int) no call sites found anywhere (app or SQL) —
--               appears orphaned, and until now let an unauthenticated
--               (anon) caller read any server's configured point-rule
--               values for free.
--
--           `anon` grant revoked only (kept for `authenticated`, since
--           both are legitimate client RPCs — see src/app/pages/super-
--           admin/users/super-admin-users.page.ts and
--           src/app/core/services/guide.service.ts — but only for
--           already-authenticated users; anon has no use for either and
--           each performs a sensitive action):
--             - delete_user_complete(uuid)
--             - save_guide_champions(uuid, jsonb)
--
--           Deliberately NOT touched by this migration:
--             - check_username_available, get_recovery_question,
--               reset_password_with_recovery, validate_invitation_token:
--               genuinely need anon+authenticated — all four are called
--               from the client while the user is not yet logged in
--               (signup, password recovery). See src/app/core/services/
--               auth.service.ts and server.service.ts.
--             - get_user_server_id, is_super_admin() [both overloads],
--               is_user_admin: RLS helper functions referenced in the
--               USING/WITH CHECK clause of nearly every table's policies
--               across every migration in this repo. Postgres evaluates
--               RLS expressions under the *querying* role's own
--               privileges, so anon/authenticated MUST retain EXECUTE on
--               these or every RLS-protected query in the app breaks
--               immediately. The advisor's WARN on these four is an
--               accepted, unavoidable tradeoff for this codebase's RLS
--               design (see 02-fix-rls-infinite-recursion.sql for why
--               they're SECURITY DEFINER in the first place) — closing it
--               properly would mean moving them to a non-PostgREST-
--               exposed schema and updating every RLS policy that
--               references them, which is out of scope here.
-- ============================================

REVOKE EXECUTE ON FUNCTION public.check_guide_limit() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.update_guide_upvotes_count() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.season_has_logged_activities(uuid) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.super_admin_exists() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.calculate_activity_points(uuid, text, integer) FROM anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.delete_user_complete(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.save_guide_champions(uuid, jsonb) FROM anon;

-- ============================================
-- DONE
-- ============================================

-- ============================================
-- ROLLBACK (not executed — for reference only)
-- Restores every grant this migration revoked, back to the state
-- Supabase's default `GRANT EXECUTE ON ALL FUNCTIONS ... TO anon,
-- authenticated` behavior left them in.
-- ============================================
-- GRANT EXECUTE ON FUNCTION public.check_guide_limit() TO anon, authenticated;
-- GRANT EXECUTE ON FUNCTION public.update_guide_upvotes_count() TO anon, authenticated;
-- GRANT EXECUTE ON FUNCTION public.season_has_logged_activities(uuid) TO anon, authenticated;
-- GRANT EXECUTE ON FUNCTION public.super_admin_exists() TO anon, authenticated;
-- GRANT EXECUTE ON FUNCTION public.calculate_activity_points(uuid, text, integer) TO anon, authenticated;
-- GRANT EXECUTE ON FUNCTION public.delete_user_complete(uuid) TO anon;
-- GRANT EXECUTE ON FUNCTION public.save_guide_champions(uuid, jsonb) TO anon;
