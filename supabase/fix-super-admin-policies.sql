-- Fix Super Admin RLS Policies
-- Allows super_admin to manage all activities and invitation tokens properly

-- ============================================
-- FIX 1: Activities - Allow super_admin to UPDATE
-- ============================================

DROP POLICY IF EXISTS "Users can update their own activities" ON activities;

CREATE POLICY "Users can update their own activities"
  ON activities FOR UPDATE
  USING (
    is_super_admin(auth.uid())
    OR user_id = auth.uid()
  );

-- ============================================
-- FIX 2: Activities - Allow super_admin to DELETE
-- ============================================

DROP POLICY IF EXISTS "Users can delete their own activities" ON activities;

CREATE POLICY "Users can delete their own activities"
  ON activities FOR DELETE
  USING (
    is_super_admin(auth.uid())
    OR user_id = auth.uid()
  );

-- ============================================
-- FIX 3: Invitation Tokens - Fix UPDATE policy
-- ============================================

DROP POLICY IF EXISTS "Tokens can be marked as used" ON invitation_tokens;

CREATE POLICY "Admins can update their alliance tokens"
  ON invitation_tokens FOR UPDATE
  USING (
    is_super_admin(auth.uid())
    OR (alliance_id = get_user_alliance_id(auth.uid()) AND is_user_admin(auth.uid()))
  );

-- ============================================
-- SUMMARY
-- ============================================

-- Super admins can now:
-- ✅ Update any activity (not just their own)
-- ✅ Delete any activity (for moderation)
-- ✅ Update any invitation token
-- ✅ All other permissions already in place (users, alliances, etc.)
