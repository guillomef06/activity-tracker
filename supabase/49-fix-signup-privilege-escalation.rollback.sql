-- ============================================
-- Rollback for Migration 49: Fix Signup Privilege Escalation
-- ============================================
-- Restores the exact pre-migration-49 policy texts (migrations 01 / 30).
-- Re-opens both holes this migration closed — emergency use only.
-- ============================================

DROP POLICY IF EXISTS "Users can create their own profile" ON public.user_profiles;

CREATE POLICY "Users can create their own profile"
  ON public.user_profiles FOR INSERT
  WITH CHECK (
    id = (SELECT auth.uid())
    AND (
      role != 'super_admin'
      OR is_super_admin((SELECT auth.uid()))
      OR NOT super_admin_exists()
    )
  );

-- Dropping the function removes its grants with it; no separate REVOKE needed
-- (and none that would survive a second run, once the function is gone).
DROP FUNCTION IF EXISTS public.invitation_token_is_valid_for_server(uuid, uuid);

DROP POLICY IF EXISTS "Authenticated users can create their own server" ON public.servers;
DROP POLICY IF EXISTS "Anyone can create server during signup" ON public.servers;

CREATE POLICY "Anyone can create server during signup"
  ON public.servers FOR INSERT
  WITH CHECK (true);
