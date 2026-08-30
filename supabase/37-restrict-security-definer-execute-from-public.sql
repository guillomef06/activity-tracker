-- ============================================
-- Migration 37: Restrict SECURITY DEFINER Execute Grants — close the PUBLIC gap
-- ============================================
-- Purpose:  Migration 34 (34-restrict-security-definer-execute.sql) revoked
--           EXECUTE on 7 SECURITY DEFINER functions from `anon`/`authenticated`
--           directly, but every one of those functions still had EXECUTE
--           granted to `PUBLIC` (Postgres's default grant at function
--           creation time, unless explicitly revoked). Since every role
--           — including `anon` and `authenticated` — implicitly inherits
--           whatever `PUBLIC` holds, migration 34 had no real effect:
--           verified via `information_schema.routine_privileges` after
--           applying it, and the Supabase advisor still flagged all 7 as
--           publicly callable via PostgREST RPC.
--
--           This migration revokes EXECUTE from PUBLIC on the same 7
--           functions, which is what actually closes off anon/authenticated
--           access. `delete_user_complete` and `save_guide_champions` keep
--           working for `authenticated` because that role already holds its
--           own separate, explicit EXECUTE grant (added by prior migrations
--           — see 20260321213625 / the guides feature migrations), which
--           `REVOKE ... FROM PUBLIC` does not touch.
-- ============================================

REVOKE EXECUTE ON FUNCTION public.check_guide_limit() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.update_guide_upvotes_count() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.season_has_logged_activities(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.super_admin_exists() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.calculate_activity_points(uuid, text, integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.delete_user_complete(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.save_guide_champions(uuid, jsonb) FROM PUBLIC;

-- ============================================
-- DONE
-- ============================================

-- ============================================
-- ROLLBACK (not executed — for reference only)
-- ============================================
-- GRANT EXECUTE ON FUNCTION public.check_guide_limit() TO PUBLIC;
-- GRANT EXECUTE ON FUNCTION public.update_guide_upvotes_count() TO PUBLIC;
-- GRANT EXECUTE ON FUNCTION public.season_has_logged_activities(uuid) TO PUBLIC;
-- GRANT EXECUTE ON FUNCTION public.super_admin_exists() TO PUBLIC;
-- GRANT EXECUTE ON FUNCTION public.calculate_activity_points(uuid, text, integer) TO PUBLIC;
-- GRANT EXECUTE ON FUNCTION public.delete_user_complete(uuid) TO PUBLIC;
-- GRANT EXECUTE ON FUNCTION public.save_guide_champions(uuid, jsonb) TO PUBLIC;
