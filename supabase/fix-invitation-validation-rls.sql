-- ============================================
-- Migration: Fix Invitation Token Validation for Multi-Use
-- Date: 2026-02-08
-- Description: 
--   - Allow unauthenticated users to read invitation_tokens (needed for signup validation)
--   - Remove dependency on used_at (tokens are now multi-use with tracking)
-- ============================================

-- Drop the existing policy
DROP POLICY IF EXISTS "Admins can view their alliance invitations" ON invitation_tokens;

-- Recreate with public read access for validation
CREATE POLICY "Admins can view their alliance invitations"
  ON invitation_tokens FOR SELECT
  USING (
    -- Allow unauthenticated users to validate tokens (for signup)
    auth.uid() IS NULL
    -- Allow super admins to view all
    OR is_super_admin(auth.uid())
    -- Allow admins/members to view their alliance invitations
    OR alliance_id = get_user_alliance_id(auth.uid())
  );

-- Verification: Test that policy allows unauthenticated access
-- SELECT * FROM invitation_tokens LIMIT 1; (should work even when logged out)
