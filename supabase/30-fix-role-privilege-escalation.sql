-- ============================================
-- Migration 30: Fix Role Privilege Escalation
-- ============================================
-- SECURITY FIX: Two privilege escalation vectors were identified on user_profiles:
--
-- 1. UPDATE: The RLS policy "Users can update their own profile" allowed any
--    authenticated user to update ANY column of their own row, including `role`.
--    A user could call the Supabase REST API directly to promote themselves:
--    supabase.from('user_profiles').update({ role: 'super_admin' }).eq('id', uid)
--
-- 2. INSERT: The INSERT policy only checked id = auth.uid(), not the role value.
--    A new user could insert a profile with role = 'super_admin' directly.
--
-- FIX 1: BEFORE UPDATE trigger that blocks role changes from non-super-admins.
--        Trigger-based enforcement cannot be bypassed by future RLS policy changes.
--
-- FIX 2: Updated INSERT policy WITH CHECK that restricts super_admin role creation
--        to existing super_admins or first-time setup (no super_admin exists yet).
-- ============================================

-- ============================================
-- HELPER: Check if any super_admin exists
-- SECURITY DEFINER to bypass RLS safely
-- ============================================
CREATE OR REPLACE FUNCTION super_admin_exists()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (SELECT 1 FROM user_profiles WHERE role = 'super_admin');
$$ LANGUAGE sql SECURITY DEFINER SET search_path = public;

-- ============================================
-- FIX 1: Trigger to prevent role self-escalation on UPDATE
-- ============================================
CREATE OR REPLACE FUNCTION prevent_role_escalation()
RETURNS TRIGGER AS $$
BEGIN
  -- If role is not changing, no check needed
  IF NEW.role = OLD.role THEN
    RETURN NEW;
  END IF;

  -- auth.uid() is NULL when called via service_role or direct DB access → allow
  -- Otherwise, only an existing super_admin can change roles
  IF (SELECT auth.uid()) IS NOT NULL AND NOT is_super_admin((SELECT auth.uid())) THEN
    RAISE EXCEPTION 'Insufficient privileges: only super_admins can change user roles'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

DROP TRIGGER IF EXISTS enforce_role_change_privilege ON user_profiles;

CREATE TRIGGER enforce_role_change_privilege
  BEFORE UPDATE ON user_profiles
  FOR EACH ROW
  EXECUTE FUNCTION prevent_role_escalation();

-- ============================================
-- FIX 2: Restrict super_admin role on INSERT
-- ============================================
DROP POLICY IF EXISTS "Users can create their own profile" ON user_profiles;

CREATE POLICY "Users can create their own profile"
  ON user_profiles FOR INSERT
  WITH CHECK (
    id = (SELECT auth.uid())
    AND (
      -- Regular roles (member, admin) are always allowed
      role != 'super_admin'
      -- super_admin role: only allowed if caller is already super_admin
      OR is_super_admin((SELECT auth.uid()))
      -- OR if no super_admin exists yet (first-time setup only)
      OR NOT super_admin_exists()
    )
  );
