-- ============================================
-- Migration: Add Invitation Tracking System
-- Date: 2026-02-08
-- Description: Adds invitation_token_id to user_profiles and creates stats view
-- ============================================

-- Step 1: Add invitation_token_id column to user_profiles
ALTER TABLE user_profiles 
ADD COLUMN IF NOT EXISTS invitation_token_id UUID REFERENCES invitation_tokens(id) ON DELETE SET NULL;

-- Step 2: Create index for invitation_token_id lookups
CREATE INDEX IF NOT EXISTS idx_user_profiles_invitation_token_id 
ON user_profiles(invitation_token_id);

-- Step 3: Create invitation_stats view for efficient querying
CREATE OR REPLACE VIEW invitation_stats AS
SELECT 
  it.id,
  it.alliance_id,
  it.token,
  it.expires_at,
  it.used_at,
  it.used_by,
  it.created_by,
  it.created_at,
  COUNT(up.id) AS usage_count,
  ARRAY_AGG(
    CASE 
      WHEN up.id IS NOT NULL THEN 
        json_build_object(
          'id', up.id,
          'display_name', up.display_name,
          'username', up.username,
          'created_at', up.created_at
        )
      ELSE NULL
    END
  ) FILTER (WHERE up.id IS NOT NULL) AS members
FROM invitation_tokens it
LEFT JOIN user_profiles up ON up.invitation_token_id = it.id
GROUP BY it.id, it.alliance_id, it.token, it.expires_at, it.used_at, it.used_by, it.created_by, it.created_at;

-- Step 4: Grant permissions on the view
GRANT SELECT ON invitation_stats TO authenticated;

-- Step 5: Enable RLS on the view (inherits from underlying tables)
ALTER VIEW invitation_stats SET (security_invoker = true);

-- Verification queries (commented out - for manual testing):
-- SELECT * FROM invitation_stats LIMIT 5;
-- SELECT * FROM user_profiles WHERE invitation_token_id IS NOT NULL;
