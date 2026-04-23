-- ============================================
-- Migration 24: Rename "alliance" → "server" throughout schema
-- ============================================
-- Tables:   alliances → servers
--           alliance_activity_settings → server_activity_settings
-- Columns:  alliance_id → server_id (in 5 tables)
-- Function: get_user_alliance_id → get_user_server_id
--           calculate_activity_points: param p_alliance_id → p_server_id
-- Policies: all "alliance" labels replaced with "server"
-- ============================================
-- Toutes les opérations DDL PostgreSQL sont transactionnelles.
-- apply_migration wrape automatiquement dans une transaction —
-- en cas d'erreur, ROLLBACK complet, aucun état intermédiaire persisté.
-- ============================================

-- ============================================
-- 1. DROP VIEW (references alliance_id)
-- ============================================

DROP VIEW IF EXISTS invitation_stats;

-- ============================================
-- 2. DROP ALL POLICIES referencing old names
-- ============================================

-- servers (currently: alliances)
DROP POLICY IF EXISTS "Users can view their own alliance" ON alliances;
DROP POLICY IF EXISTS "Admins can update their alliance" ON alliances;
DROP POLICY IF EXISTS "Anyone can create alliance during signup" ON alliances;
DROP POLICY IF EXISTS "Super admins can delete alliances" ON alliances;

-- user_profiles
DROP POLICY IF EXISTS "Users can view profiles in their alliance" ON user_profiles;
DROP POLICY IF EXISTS "Users can update their own profile" ON user_profiles;
DROP POLICY IF EXISTS "Users can create their own profile" ON user_profiles;
DROP POLICY IF EXISTS "Super admins can delete user profiles" ON user_profiles;

-- activities
DROP POLICY IF EXISTS "Users can view activities in their alliance" ON activities;
DROP POLICY IF EXISTS "Users and admins can create activities" ON activities;
DROP POLICY IF EXISTS "Users can update their own activities" ON activities;
DROP POLICY IF EXISTS "Users can delete their own activities" ON activities;

-- invitation_tokens
DROP POLICY IF EXISTS "Admins can view their alliance invitations" ON invitation_tokens;
DROP POLICY IF EXISTS "Admins can create invitations" ON invitation_tokens;
DROP POLICY IF EXISTS "Admins can update their alliance tokens" ON invitation_tokens;
DROP POLICY IF EXISTS "Admins can delete their alliance invitations" ON invitation_tokens;
DROP POLICY IF EXISTS "Tokens can be marked as used" ON invitation_tokens;

-- activity_point_rules
DROP POLICY IF EXISTS "Users can view their alliance point rules" ON activity_point_rules;
DROP POLICY IF EXISTS "Admins can create point rules" ON activity_point_rules;
DROP POLICY IF EXISTS "Admins can update point rules" ON activity_point_rules;
DROP POLICY IF EXISTS "Admins can delete point rules" ON activity_point_rules;

-- alliance_activity_settings
DROP POLICY IF EXISTS "Members can read activity settings" ON alliance_activity_settings;
DROP POLICY IF EXISTS "Admins can manage activity settings" ON alliance_activity_settings;

-- discord_webhooks
DROP POLICY IF EXISTS "Members can read discord webhooks" ON discord_webhooks;
DROP POLICY IF EXISTS "Admins can manage discord webhooks" ON discord_webhooks;

-- ============================================
-- 3. DROP FUNCTIONS referencing alliance_id
-- ============================================

DROP FUNCTION IF EXISTS get_user_alliance_id(UUID);
DROP FUNCTION IF EXISTS calculate_activity_points(UUID, TEXT, INTEGER);

-- ============================================
-- 4. RENAME TABLES
-- ============================================

ALTER TABLE alliances RENAME TO servers;
ALTER TABLE alliance_activity_settings RENAME TO server_activity_settings;

-- ============================================
-- 5. RENAME COLUMNS alliance_id → server_id
-- ============================================

ALTER TABLE user_profiles RENAME COLUMN alliance_id TO server_id;
ALTER TABLE activity_point_rules RENAME COLUMN alliance_id TO server_id;
ALTER TABLE invitation_tokens RENAME COLUMN alliance_id TO server_id;
ALTER TABLE server_activity_settings RENAME COLUMN alliance_id TO server_id;
ALTER TABLE discord_webhooks RENAME COLUMN alliance_id TO server_id;

-- ============================================
-- 6. RENAME INDEXES
-- ============================================

ALTER INDEX IF EXISTS idx_user_profiles_alliance_id RENAME TO idx_user_profiles_server_id;
ALTER INDEX IF EXISTS idx_invitation_tokens_alliance_id RENAME TO idx_invitation_tokens_server_id;
ALTER INDEX IF EXISTS idx_activity_point_rules_alliance_id RENAME TO idx_activity_point_rules_server_id;
ALTER INDEX IF EXISTS idx_alliance_activity_settings_alliance_id RENAME TO idx_server_activity_settings_server_id;
ALTER INDEX IF EXISTS idx_discord_webhooks_alliance_id RENAME TO idx_discord_webhooks_server_id;

-- ============================================
-- 7. RENAME TRIGGER
-- ============================================

ALTER TRIGGER update_alliances_updated_at ON servers RENAME TO update_servers_updated_at;

-- ============================================
-- 8. RENAME CHECK CONSTRAINT
-- ============================================

ALTER TABLE user_profiles
  RENAME CONSTRAINT alliance_required_for_non_super_admin TO server_required_for_non_super_admin;

-- ============================================
-- 9. RECREATE HELPER FUNCTIONS
-- ============================================

CREATE OR REPLACE FUNCTION get_user_server_id(user_uuid UUID)
RETURNS UUID AS $$
  SELECT server_id FROM public.user_profiles WHERE id = user_uuid;
$$ LANGUAGE sql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION calculate_activity_points(
  p_server_id UUID,
  p_activity_type TEXT,
  p_position INTEGER
)
RETURNS INTEGER AS $$
DECLARE
  v_points INTEGER;
  v_default_points INTEGER;
BEGIN
  SELECT points INTO v_points
  FROM public.activity_point_rules
  WHERE server_id = p_server_id
    AND activity_type = p_activity_type
    AND position_min <= p_position
    AND position_max >= p_position
  LIMIT 1;

  IF v_points IS NOT NULL THEN
    RETURN v_points;
  END IF;

  CASE p_activity_type
    WHEN 'kvk prep'          THEN v_default_points := 15;
    WHEN 'kvk cross border'  THEN v_default_points := 10;
    WHEN 'legion'            THEN v_default_points := 8;
    WHEN 'desolate desert'   THEN v_default_points := 8;
    WHEN 'golden expedition' THEN v_default_points := 5;
    ELSE                          v_default_points := 5;
  END CASE;

  RETURN v_default_points;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ============================================
-- 10. RECREATE VIEW
-- ============================================

CREATE OR REPLACE VIEW invitation_stats AS
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

-- ============================================
-- 11. RECREATE RLS POLICIES — SERVERS
-- ============================================

CREATE POLICY "Users can view their own server"
  ON servers FOR SELECT
  USING (
    is_super_admin((select auth.uid()))
    OR id = get_user_server_id((select auth.uid()))
    OR owner_id = (select auth.uid())
  );

CREATE POLICY "Admins can update their server"
  ON servers FOR UPDATE
  USING (
    is_super_admin((select auth.uid()))
    OR (id = get_user_server_id((select auth.uid())) AND is_user_admin((select auth.uid())))
  );

CREATE POLICY "Anyone can create server during signup"
  ON servers FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Super admins can delete servers"
  ON servers FOR DELETE
  USING (is_super_admin((select auth.uid())));

-- ============================================
-- 12. RECREATE RLS POLICIES — USER PROFILES
-- ============================================

CREATE POLICY "Users can view profiles in their server"
  ON user_profiles FOR SELECT
  USING (
    is_super_admin((select auth.uid()))
    OR server_id = get_user_server_id((select auth.uid()))
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
-- 13. RECREATE RLS POLICIES — ACTIVITIES
-- ============================================

CREATE POLICY "Users can view activities in their server"
  ON activities FOR SELECT
  USING (
    is_super_admin((select auth.uid()))
    OR user_id IN (
      SELECT id FROM user_profiles
      WHERE server_id = get_user_server_id((select auth.uid()))
    )
  );

CREATE POLICY "Users and admins can create activities"
  ON activities FOR INSERT
  WITH CHECK (
    user_id = (select auth.uid())
    OR (
      is_user_admin((select auth.uid()))
      AND user_id IN (
        SELECT id FROM user_profiles
        WHERE server_id = get_user_server_id((select auth.uid()))
      )
    )
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
-- 14. RECREATE RLS POLICIES — INVITATION TOKENS
-- ============================================

CREATE POLICY "Admins can view their server invitations"
  ON invitation_tokens FOR SELECT
  USING (
    (select auth.uid()) IS NULL
    OR is_super_admin((select auth.uid()))
    OR server_id = get_user_server_id((select auth.uid()))
  );

CREATE POLICY "Admins can create invitations"
  ON invitation_tokens FOR INSERT
  WITH CHECK (
    is_super_admin((select auth.uid()))
    OR (server_id = get_user_server_id((select auth.uid())) AND is_user_admin((select auth.uid())))
  );

CREATE POLICY "Admins can update their server tokens"
  ON invitation_tokens FOR UPDATE
  USING (
    is_super_admin((select auth.uid()))
    OR (server_id = get_user_server_id((select auth.uid())) AND is_user_admin((select auth.uid())))
  );

CREATE POLICY "Admins can delete their server invitations"
  ON invitation_tokens FOR DELETE
  USING (
    is_super_admin((select auth.uid()))
    OR (server_id = get_user_server_id((select auth.uid())) AND is_user_admin((select auth.uid())))
  );

-- ============================================
-- 15. RECREATE RLS POLICIES — ACTIVITY POINT RULES
-- ============================================

CREATE POLICY "Users can view their server point rules"
  ON activity_point_rules FOR SELECT
  USING (
    is_super_admin((select auth.uid()))
    OR server_id = get_user_server_id((select auth.uid()))
  );

CREATE POLICY "Admins can create point rules"
  ON activity_point_rules FOR INSERT
  WITH CHECK (
    is_super_admin((select auth.uid()))
    OR (server_id = get_user_server_id((select auth.uid())) AND is_user_admin((select auth.uid())))
  );

CREATE POLICY "Admins can update point rules"
  ON activity_point_rules FOR UPDATE
  USING (
    is_super_admin((select auth.uid()))
    OR (server_id = get_user_server_id((select auth.uid())) AND is_user_admin((select auth.uid())))
  );

CREATE POLICY "Admins can delete point rules"
  ON activity_point_rules FOR DELETE
  USING (
    is_super_admin((select auth.uid()))
    OR (server_id = get_user_server_id((select auth.uid())) AND is_user_admin((select auth.uid())))
  );

-- ============================================
-- 16. RECREATE RLS POLICIES — SERVER ACTIVITY SETTINGS
-- ============================================

CREATE POLICY "Members can read server activity settings"
  ON server_activity_settings FOR SELECT
  USING (
    server_id = get_user_server_id((select auth.uid()))
  );

CREATE POLICY "Admins can manage server activity settings"
  ON server_activity_settings FOR ALL
  USING (
    (is_super_admin((select auth.uid())) OR is_user_admin((select auth.uid())))
    AND server_id = get_user_server_id((select auth.uid()))
  )
  WITH CHECK (
    (is_super_admin((select auth.uid())) OR is_user_admin((select auth.uid())))
    AND server_id = get_user_server_id((select auth.uid()))
  );

-- ============================================
-- 17. RECREATE RLS POLICIES — DISCORD WEBHOOKS
-- ============================================

CREATE POLICY "Members can read server discord webhooks"
  ON discord_webhooks FOR SELECT
  USING (
    server_id = get_user_server_id((select auth.uid()))
  );

CREATE POLICY "Admins can manage server discord webhooks"
  ON discord_webhooks FOR ALL
  USING (
    (is_super_admin((select auth.uid())) OR is_user_admin((select auth.uid())))
    AND server_id = get_user_server_id((select auth.uid()))
  )
  WITH CHECK (
    (is_super_admin((select auth.uid())) OR is_user_admin((select auth.uid())))
    AND server_id = get_user_server_id((select auth.uid()))
  );

-- ============================================
-- 18. UPDATE validate_invitation_token FUNCTION
-- (defined directly in Supabase, not in prior migrations)
-- ============================================

DROP FUNCTION IF EXISTS validate_invitation_token(TEXT);

CREATE OR REPLACE FUNCTION validate_invitation_token(p_token TEXT)
RETURNS json AS $$
DECLARE
  v_record RECORD;
BEGIN
  SELECT it.expires_at, it.server_id, s.name AS server_name
  INTO v_record
  FROM invitation_tokens it
  JOIN servers s ON s.id = it.server_id
  WHERE it.token = p_token;

  IF NOT FOUND THEN
    RETURN json_build_object('valid', false, 'error', 'Invalid invitation token');
  END IF;

  IF v_record.expires_at < now() THEN
    RETURN json_build_object('valid', false, 'error', 'Invitation token has expired');
  END IF;

  RETURN json_build_object(
    'valid', true,
    'server_id', v_record.server_id,
    'server_name', v_record.server_name
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ============================================
-- DONE
-- ============================================
