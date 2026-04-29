-- ============================================
-- Migration 25: Fix invitation_stats view — enforce SECURITY INVOKER
-- ============================================
-- The view was created without security_invoker = true, which means
-- it runs with the view creator's permissions (SECURITY DEFINER by default),
-- bypassing RLS policies of the querying user.
-- With security_invoker = true, the querying user's RLS policies are enforced.
-- Existing policies on invitation_tokens and user_profiles already restrict
-- access correctly per server, so this change is safe.
-- ============================================

CREATE OR REPLACE VIEW invitation_stats
WITH (security_invoker = true)
AS
SELECT
  it.id,
  it.server_id,
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
GROUP BY it.id, it.server_id, it.token, it.expires_at, it.used_at, it.used_by, it.created_by, it.created_at;
