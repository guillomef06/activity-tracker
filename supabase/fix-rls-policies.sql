-- ============================================
-- FIX RLS POLICIES - Avoid Infinite Recursion
-- ============================================
-- Execute this script in Supabase SQL Editor to fix the policies
-- This replaces the problematic EXISTS queries with helper functions

-- Step 1: DROP all existing policies
DROP POLICY IF EXISTS "Users can view their own alliance" ON alliances;
DROP POLICY IF EXISTS "Admins can update their alliance" ON alliances;
DROP POLICY IF EXISTS "Anyone can create alliance during signup" ON alliances;
DROP POLICY IF EXISTS "Super admins can delete alliances" ON alliances;

DROP POLICY IF EXISTS "Users can view profiles in their alliance" ON user_profiles;
DROP POLICY IF EXISTS "Users can update their own profile" ON user_profiles;
DROP POLICY IF EXISTS "Users can create their own profile" ON user_profiles;
DROP POLICY IF EXISTS "Super admins can delete user profiles" ON user_profiles;

DROP POLICY IF EXISTS "Users can view activities in their alliance" ON activities;
DROP POLICY IF EXISTS "Users can create their own activities" ON activities;
DROP POLICY IF EXISTS "Users can update their own activities" ON activities;
DROP POLICY IF EXISTS "Users can delete their own activities" ON activities;

DROP POLICY IF EXISTS "Admins can view their alliance invitations" ON invitation_tokens;
DROP POLICY IF EXISTS "Admins can create invitations" ON invitation_tokens;
DROP POLICY IF EXISTS "Tokens can be marked as used" ON invitation_tokens;
DROP POLICY IF EXISTS "Admins can delete their alliance invitations" ON invitation_tokens;

DROP POLICY IF EXISTS "Users can view their alliance point rules" ON activity_point_rules;
DROP POLICY IF EXISTS "Admins can create point rules" ON activity_point_rules;
DROP POLICY IF EXISTS "Admins can update point rules" ON activity_point_rules;
DROP POLICY IF EXISTS "Admins can delete point rules" ON activity_point_rules;

-- Step 2: Ensure helper functions exist (SECURITY DEFINER bypasses RLS)
CREATE OR REPLACE FUNCTION get_user_alliance_id(user_uuid UUID)
RETURNS UUID AS $$
  SELECT alliance_id FROM user_profiles WHERE id = user_uuid;
$$ LANGUAGE sql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION is_user_admin(user_uuid UUID)
RETURNS BOOLEAN AS $$
  SELECT role IN ('admin', 'super_admin') FROM user_profiles WHERE id = user_uuid;
$$ LANGUAGE sql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION is_super_admin(user_uuid UUID)
RETURNS BOOLEAN AS $$
  SELECT role = 'super_admin' FROM user_profiles WHERE id = user_uuid;
$$ LANGUAGE sql SECURITY DEFINER;

-- Step 3: CREATE corrected policies using helper functions

-- ============================================
-- ALLIANCES
-- ============================================

CREATE POLICY "Users can view their own alliance"
  ON alliances FOR SELECT
  USING (
    is_super_admin(auth.uid())
    OR id = get_user_alliance_id(auth.uid())
    OR owner_id = auth.uid() -- Allow viewing alliance if user is the owner
  );

CREATE POLICY "Admins can update their alliance"
  ON alliances FOR UPDATE
  USING (
    is_super_admin(auth.uid())
    OR (id = get_user_alliance_id(auth.uid()) AND is_user_admin(auth.uid()))
  );

CREATE POLICY "Anyone can create alliance during signup"
  ON alliances FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Super admins can delete alliances"
  ON alliances FOR DELETE
  USING (is_super_admin(auth.uid()));

-- ============================================
-- USER PROFILES
-- ============================================

CREATE POLICY "Users can view profiles in their alliance"
  ON user_profiles FOR SELECT
  USING (
    is_super_admin(auth.uid())
    OR alliance_id = get_user_alliance_id(auth.uid())
    OR id = auth.uid()
  );

CREATE POLICY "Users can update their own profile"
  ON user_profiles FOR UPDATE
  USING (
    is_super_admin(auth.uid())
    OR id = auth.uid()
  );

CREATE POLICY "Users can create their own profile"
  ON user_profiles FOR INSERT
  WITH CHECK (id = auth.uid());

CREATE POLICY "Super admins can delete user profiles"
  ON user_profiles FOR DELETE
  USING (is_super_admin(auth.uid()));

-- ============================================
-- ACTIVITIES
-- ============================================

CREATE POLICY "Users can view activities in their alliance"
  ON activities FOR SELECT
  USING (
    is_super_admin(auth.uid())
    OR
    user_id IN (
      SELECT id FROM user_profiles 
      WHERE alliance_id = get_user_alliance_id(auth.uid())
    )
  );

CREATE POLICY "Users can create their own activities"
  ON activities FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update their own activities"
  ON activities FOR UPDATE
  USING (user_id = auth.uid());

CREATE POLICY "Users can delete their own activities"
  ON activities FOR DELETE
  USING (user_id = auth.uid());

-- ============================================
-- INVITATION TOKENS
-- ============================================

CREATE POLICY "Admins can view their alliance invitations"
  ON invitation_tokens FOR SELECT
  USING (
    is_super_admin(auth.uid())
    OR alliance_id = get_user_alliance_id(auth.uid())
    OR token IS NOT NULL -- Allow anyone to validate a token
  );

CREATE POLICY "Admins can create invitations"
  ON invitation_tokens FOR INSERT
  WITH CHECK (
    is_super_admin(auth.uid())
    OR (alliance_id = get_user_alliance_id(auth.uid()) AND is_user_admin(auth.uid()))
  );

CREATE POLICY "Tokens can be marked as used"
  ON invitation_tokens FOR UPDATE
  USING (token IS NOT NULL);

CREATE POLICY "Admins can delete their alliance invitations"
  ON invitation_tokens FOR DELETE
  USING (
    is_super_admin(auth.uid())
    OR (alliance_id = get_user_alliance_id(auth.uid()) AND is_user_admin(auth.uid()))
  );

-- ============================================
-- ACTIVITY POINT RULES
-- ============================================

CREATE POLICY "Users can view their alliance point rules"
  ON activity_point_rules FOR SELECT
  USING (
    is_super_admin(auth.uid())
    OR alliance_id = get_user_alliance_id(auth.uid())
  );

CREATE POLICY "Admins can create point rules"
  ON activity_point_rules FOR INSERT
  WITH CHECK (
    is_super_admin(auth.uid())
    OR (alliance_id = get_user_alliance_id(auth.uid()) AND is_user_admin(auth.uid()))
  );

CREATE POLICY "Admins can update point rules"
  ON activity_point_rules FOR UPDATE
  USING (
    is_super_admin(auth.uid())
    OR (alliance_id = get_user_alliance_id(auth.uid()) AND is_user_admin(auth.uid()))
  );

CREATE POLICY "Admins can delete point rules"
  ON activity_point_rules FOR DELETE
  USING (
    is_super_admin(auth.uid())
    OR (alliance_id = get_user_alliance_id(auth.uid()) AND is_user_admin(auth.uid()))
  );

-- ============================================
-- DONE! Policies are now fixed
-- ============================================
-- Try signing up again, it should work now.
