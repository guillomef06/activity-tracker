-- ============================================
-- Migration 15: Fix RLS Performance Warnings
-- ============================================
-- Fixes two classes of Supabase performance advisor warnings:
--
-- 1. auth.uid() / auth.<function>() re-evaluated per row
--    Fix: wrap all calls as (select auth.uid()) so Postgres evaluates once per query
--
-- 2. Multiple permissive INSERT policies on activities for the same role
--    Fix: merge the 3 INSERT policies into a single combined policy
-- ============================================

-- ============================================
-- ALLIANCES
-- ============================================

DROP POLICY IF EXISTS "Users can view their own alliance" ON alliances;
DROP POLICY IF EXISTS "Admins can update their alliance" ON alliances;
DROP POLICY IF EXISTS "Super admins can delete alliances" ON alliances;

CREATE POLICY "Users can view their own alliance"
  ON alliances FOR SELECT
  USING (
    is_super_admin((select auth.uid()))
    OR id = get_user_alliance_id((select auth.uid()))
    OR owner_id = (select auth.uid())
  );

CREATE POLICY "Admins can update their alliance"
  ON alliances FOR UPDATE
  USING (
    is_super_admin((select auth.uid()))
    OR (id = get_user_alliance_id((select auth.uid())) AND is_user_admin((select auth.uid())))
  );

CREATE POLICY "Super admins can delete alliances"
  ON alliances FOR DELETE
  USING (is_super_admin((select auth.uid())));

-- ============================================
-- USER PROFILES
-- ============================================

DROP POLICY IF EXISTS "Users can view profiles in their alliance" ON user_profiles;
DROP POLICY IF EXISTS "Users can update their own profile" ON user_profiles;
DROP POLICY IF EXISTS "Users can create their own profile" ON user_profiles;
DROP POLICY IF EXISTS "Super admins can delete user profiles" ON user_profiles;

CREATE POLICY "Users can view profiles in their alliance"
  ON user_profiles FOR SELECT
  USING (
    is_super_admin((select auth.uid()))
    OR alliance_id = get_user_alliance_id((select auth.uid()))
    OR id = (select auth.uid())
  );

CREATE POLICY "Users can update their own profile"
  ON user_profiles FOR UPDATE
  USING (
    is_super_admin((select auth.uid()))
    OR id = (select auth.uid())
  );

CREATE POLICY "Users can create their own profile"
  ON user_profiles FOR INSERT
  WITH CHECK (id = (select auth.uid()));

CREATE POLICY "Super admins can delete user profiles"
  ON user_profiles FOR DELETE
  USING (is_super_admin((select auth.uid())));

-- ============================================
-- ACTIVITIES
-- ============================================

DROP POLICY IF EXISTS "Users can view activities in their alliance" ON activities;
DROP POLICY IF EXISTS "Users can create their own activities" ON activities;
DROP POLICY IF EXISTS "Admins can create activities for alliance members" ON activities;
DROP POLICY IF EXISTS "Super admins can create activities for any user" ON activities;
DROP POLICY IF EXISTS "Users can update their own activities" ON activities;
DROP POLICY IF EXISTS "Users can delete their own activities" ON activities;

CREATE POLICY "Users can view activities in their alliance"
  ON activities FOR SELECT
  USING (
    is_super_admin((select auth.uid()))
    OR user_id IN (
      SELECT id FROM user_profiles
      WHERE alliance_id = get_user_alliance_id((select auth.uid()))
    )
  );

-- Merged INSERT policy: replaces the 3 separate permissive INSERT policies
CREATE POLICY "Users and admins can create activities"
  ON activities FOR INSERT
  WITH CHECK (
    -- Users can create their own activities
    user_id = (select auth.uid())
    -- Admins can create activities for members of their alliance
    OR (
      is_user_admin((select auth.uid()))
      AND user_id IN (
        SELECT id FROM user_profiles
        WHERE alliance_id = get_user_alliance_id((select auth.uid()))
      )
    )
    -- Super admins can create activities for any user
    OR is_super_admin((select auth.uid()))
  );

CREATE POLICY "Users can update their own activities"
  ON activities FOR UPDATE
  USING (
    is_super_admin((select auth.uid()))
    OR user_id = (select auth.uid())
  );

CREATE POLICY "Users can delete their own activities"
  ON activities FOR DELETE
  USING (
    is_super_admin((select auth.uid()))
    OR user_id = (select auth.uid())
  );

-- ============================================
-- INVITATION TOKENS
-- ============================================

DROP POLICY IF EXISTS "Admins can view their alliance invitations" ON invitation_tokens;
DROP POLICY IF EXISTS "Admins can create invitations" ON invitation_tokens;
DROP POLICY IF EXISTS "Admins can update their alliance tokens" ON invitation_tokens;
DROP POLICY IF EXISTS "Admins can delete their alliance invitations" ON invitation_tokens;

CREATE POLICY "Admins can view their alliance invitations"
  ON invitation_tokens FOR SELECT
  USING (
    -- Allow unauthenticated users to validate tokens (for signup flow)
    (select auth.uid()) IS NULL
    OR is_super_admin((select auth.uid()))
    OR alliance_id = get_user_alliance_id((select auth.uid()))
  );

CREATE POLICY "Admins can create invitations"
  ON invitation_tokens FOR INSERT
  WITH CHECK (
    is_super_admin((select auth.uid()))
    OR (alliance_id = get_user_alliance_id((select auth.uid())) AND is_user_admin((select auth.uid())))
  );

CREATE POLICY "Admins can update their alliance tokens"
  ON invitation_tokens FOR UPDATE
  USING (
    is_super_admin((select auth.uid()))
    OR (alliance_id = get_user_alliance_id((select auth.uid())) AND is_user_admin((select auth.uid())))
  );

CREATE POLICY "Admins can delete their alliance invitations"
  ON invitation_tokens FOR DELETE
  USING (
    is_super_admin((select auth.uid()))
    OR (alliance_id = get_user_alliance_id((select auth.uid())) AND is_user_admin((select auth.uid())))
  );

-- ============================================
-- ACTIVITY POINT RULES
-- ============================================

DROP POLICY IF EXISTS "Users can view their alliance point rules" ON activity_point_rules;
DROP POLICY IF EXISTS "Admins can create point rules" ON activity_point_rules;
DROP POLICY IF EXISTS "Admins can update point rules" ON activity_point_rules;
DROP POLICY IF EXISTS "Admins can delete point rules" ON activity_point_rules;

CREATE POLICY "Users can view their alliance point rules"
  ON activity_point_rules FOR SELECT
  USING (
    is_super_admin((select auth.uid()))
    OR alliance_id = get_user_alliance_id((select auth.uid()))
  );

CREATE POLICY "Admins can create point rules"
  ON activity_point_rules FOR INSERT
  WITH CHECK (
    is_super_admin((select auth.uid()))
    OR (alliance_id = get_user_alliance_id((select auth.uid())) AND is_user_admin((select auth.uid())))
  );

CREATE POLICY "Admins can update point rules"
  ON activity_point_rules FOR UPDATE
  USING (
    is_super_admin((select auth.uid()))
    OR (alliance_id = get_user_alliance_id((select auth.uid())) AND is_user_admin((select auth.uid())))
  );

CREATE POLICY "Admins can delete point rules"
  ON activity_point_rules FOR DELETE
  USING (
    is_super_admin((select auth.uid()))
    OR (alliance_id = get_user_alliance_id((select auth.uid())) AND is_user_admin((select auth.uid())))
  );
