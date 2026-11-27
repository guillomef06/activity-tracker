-- ============================================
-- Migration 49: Fix Signup Privilege Escalation
-- ============================================
-- SECURITY FIX (found while auditing advisors during the MG calendar work).
--
-- Two INSERT policies only check who the NEW row claims to belong to, never
-- what that row is allowed to claim:
--
-- 1. user_profiles ("Users can create their own profile", migration 30) only
--    rejects role = 'super_admin' unless the caller already is one. It never
--    checks that role = 'admin' requires owning the target server, nor that
--    role = 'member' requires a valid invitation for that exact server. Proven
--    live on 2026-11-27 (one throwaway account, cleaned up immediately after):
--    a brand-new user who redeems a real, legitimate MEMBER invitation link
--    can instead insert their own profile with role = 'admin' on that same
--    server — a full admin takeover with no recon needed, since the server_id
--    is handed to them by the invitation itself.
--
-- 2. servers ("Anyone can create server during signup", migration 01) is
--    `WITH CHECK (true)`: literally anyone, including an unauthenticated
--    visitor, can insert a server row with an arbitrary owner_id, including a
--    stranger's. Lower impact in practice (owner_id is only read back by the
--    "Users can view their own server" SELECT policy, never used to authorize
--    a write elsewhere — confirmed by reading every other servers/* policy),
--    but it is the same class of bug and worth closing in the same migration.
--
-- FIX 1 (servers): INSERT now requires owner_id = the caller's own uid (or a
--        super_admin acting on anyone's behalf, matching every other table's
--        super_admin override). No legitimate caller is affected: the only
--        INSERT site (AuthService.signUpAdmin) already sets
--        owner_id = authData.user.id right after establishing the session.
--
-- FIX 2 (user_profiles): INSERT's WITH CHECK now branches on the requested
--        role:
--          - super_admin : unchanged (existing super_admin, or first-time
--                           bootstrap when none exists yet).
--          - admin       : only when servers.owner_id for that server_id is
--                           the caller (mirrors signUpAdmin's real sequence:
--                           create the server, then the admin profile).
--          - member      : only with a non-expired invitation_token_id whose
--                           own server_id matches the profile's server_id.
--                           Tokens are intentionally multi-use (migration 04,
--                           "Remove dependency on used_at"), so used_at is not
--                           checked — only existence, server match, expiry.
--
--        The member branch needs a SECURITY DEFINER helper
--        (invitation_token_is_valid_for_server) rather than a bare subquery:
--        a brand-new user has no user_profiles row yet, so
--        get_user_server_id() is NULL and invitation_tokens' own SELECT
--        policy ("server_id = get_user_server_id(...)") would hide the very
--        token row being checked — the same reasoning migration 38 already
--        documented for super_admin_exists()/is_super_admin() inside this
--        same policy. EXECUTE is granted to `authenticated` only (this INSERT
--        policy's id = auth.uid() check already implies a session; anon is
--        never involved).
-- ============================================

-- ============================================
-- FIX 1: servers INSERT must bind owner_id to the caller
-- ============================================
DROP POLICY IF EXISTS "Anyone can create server during signup" ON public.servers;
DROP POLICY IF EXISTS "Authenticated users can create their own server" ON public.servers;

CREATE POLICY "Authenticated users can create their own server"
  ON public.servers FOR INSERT
  WITH CHECK (
    is_super_admin((SELECT auth.uid()))
    OR owner_id = (SELECT auth.uid())
  );

-- ============================================
-- FIX 2: invitation token validity helper (SECURITY DEFINER — see rationale above)
-- ============================================
CREATE OR REPLACE FUNCTION public.invitation_token_is_valid_for_server(p_invitation_token_id uuid, p_server_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.invitation_tokens it
    WHERE it.id = p_invitation_token_id
      AND it.server_id = p_server_id
      AND it.expires_at > now()
  );
$$;

REVOKE ALL ON FUNCTION public.invitation_token_is_valid_for_server(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.invitation_token_is_valid_for_server(uuid, uuid) TO authenticated;

-- ============================================
-- FIX 2: user_profiles INSERT must match the requested role to real entitlement
-- ============================================
DROP POLICY IF EXISTS "Users can create their own profile" ON public.user_profiles;

CREATE POLICY "Users can create their own profile"
  ON public.user_profiles FOR INSERT
  WITH CHECK (
    id = (SELECT auth.uid())
    AND (
      (
        role = 'super_admin'
        AND (is_super_admin((SELECT auth.uid())) OR NOT super_admin_exists())
      )
      OR (
        role = 'admin'
        AND server_id IS NOT NULL
        AND EXISTS (
          SELECT 1 FROM public.servers s
          WHERE s.id = server_id AND s.owner_id = (SELECT auth.uid())
        )
      )
      OR (
        role = 'member'
        AND server_id IS NOT NULL
        AND invitation_token_id IS NOT NULL
        AND public.invitation_token_is_valid_for_server(invitation_token_id, server_id)
      )
    )
  );

-- ============================================
-- DONE
-- ============================================
