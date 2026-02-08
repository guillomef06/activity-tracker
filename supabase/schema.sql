-- Activity Tracker - Supabase Database Schema
-- Multi-Alliance Activity Tracking System with Invitation Links

-- ============================================
-- 0. EXTENSIONS
-- ============================================

-- Enable btree_gist for range exclusion constraints (optional, for position overlap prevention)
-- This extension is needed for the EXCLUDE constraint on activity_point_rules
-- If not available, the constraint will be removed and validation done in application code
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- ============================================
-- 1. TABLES
-- ============================================

-- Alliances (Teams/Organizations)
CREATE TABLE IF NOT EXISTS alliances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  owner_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- User Profiles (extends Supabase Auth)
-- Note: alliance_id can be NULL for super_admin users
CREATE TABLE IF NOT EXISTS user_profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  alliance_id UUID REFERENCES alliances(id) ON DELETE CASCADE,
  invitation_token_id UUID REFERENCES invitation_tokens(id) ON DELETE SET NULL,
  display_name TEXT NOT NULL,
  username TEXT NOT NULL UNIQUE,
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('super_admin', 'admin', 'member')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT alliance_required_for_non_super_admin 
    CHECK (role = 'super_admin' OR alliance_id IS NOT NULL)
);

-- Activities
CREATE TABLE IF NOT EXISTS activities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES user_profiles(id) ON DELETE CASCADE,
  activity_type TEXT NOT NULL,
  position INTEGER NOT NULL DEFAULT 1,
  points INTEGER NOT NULL,
  date TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Activity Point Rules (configurable points based on position)
-- Each alliance can define custom point rules based on activity position ranges
-- Example: position 1-3 = 50 points, position 4-10 = 30 points, etc.
CREATE TABLE IF NOT EXISTS activity_point_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  alliance_id UUID REFERENCES alliances(id) ON DELETE CASCADE NOT NULL,
  activity_type TEXT NOT NULL,
  position_min INTEGER NOT NULL CHECK (position_min > 0),
  position_max INTEGER NOT NULL CHECK (position_max >= position_min),
  points INTEGER NOT NULL CHECK (points >= 0),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(alliance_id, activity_type, position_min, position_max)
  -- Note: Overlap prevention is handled by application code to avoid dependency on btree_gist
  -- Alternative constraint (requires btree_gist extension):
  -- CONSTRAINT no_overlap_positions EXCLUDE USING gist (
  --   alliance_id WITH =,
  --   activity_type WITH =,
  --   int4range(position_min, position_max, '[]') WITH &&
  -- )
);

-- Invitation Tokens
CREATE TABLE IF NOT EXISTS invitation_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  alliance_id UUID REFERENCES alliances(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  used_by UUID REFERENCES user_profiles(id) ON DELETE SET NULL,
  created_by UUID REFERENCES user_profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- 2. INDEXES
-- ============================================

CREATE INDEX IF NOT EXISTS idx_user_profiles_alliance_id ON user_profiles(alliance_id);
CREATE INDEX IF NOT EXISTS idx_user_profiles_invitation_token_id ON user_profiles(invitation_token_id);
CREATE INDEX IF NOT EXISTS idx_activities_user_id ON activities(user_id);
CREATE INDEX IF NOT EXISTS idx_activities_date ON activities(date DESC);
CREATE INDEX IF NOT EXISTS idx_activities_position ON activities(position);
CREATE INDEX IF NOT EXISTS idx_invitation_tokens_token ON invitation_tokens(token);
CREATE INDEX IF NOT EXISTS idx_invitation_tokens_alliance_id ON invitation_tokens(alliance_id);
CREATE INDEX IF NOT EXISTS idx_activity_point_rules_alliance_id ON activity_point_rules(alliance_id);
CREATE INDEX IF NOT EXISTS idx_activity_point_rules_activity_type ON activity_point_rules(activity_type);

-- ============================================
-- 3. VIEWS
-- ============================================

-- Invitation Stats View
-- Aggregates invitation usage data with member information
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

-- ============================================
-- 4. ROW LEVEL SECURITY (RLS)
-- ============================================

-- Enable RLS on all tables
ALTER TABLE alliances ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity_point_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE invitation_tokens ENABLE ROW LEVEL SECURITY;

-- ============================================
-- RLS POLICIES - ALLIANCES
-- ============================================
-- NOTE: Using helper functions (is_super_admin, get_user_alliance_id, is_user_admin)
-- to avoid infinite recursion in policies

-- Users can view their own alliance (super_admin can view all)
CREATE POLICY "Users can view their own alliance"
  ON alliances FOR SELECT
  USING (
    is_super_admin(auth.uid())
    OR id = get_user_alliance_id(auth.uid())
    OR owner_id = auth.uid() -- Allow viewing alliance if user is the owner
  );

-- Admins can update their alliance (super_admin can update all)
CREATE POLICY "Admins can update their alliance"
  ON alliances FOR UPDATE
  USING (
    is_super_admin(auth.uid())
    OR (id = get_user_alliance_id(auth.uid()) AND is_user_admin(auth.uid()))
  );

-- Anyone can insert alliances (during signup)
CREATE POLICY "Anyone can create alliance during signup"
  ON alliances FOR INSERT
  WITH CHECK (true);

-- Super admins can delete any alliance
CREATE POLICY "Super admins can delete alliances"
  ON alliances FOR DELETE
  USING (is_super_admin(auth.uid()));

-- ============================================
-- RLS POLICIES - USER PROFILES
-- ============================================

-- Users can view profiles in their alliance (super_admin can view all)
CREATE POLICY "Users can view profiles in their alliance"
  ON user_profiles FOR SELECT
  USING (
    is_super_admin(auth.uid())
    OR alliance_id = get_user_alliance_id(auth.uid())
    OR id = auth.uid()
  );

-- Users can update their own profile (super_admin can update all)
CREATE POLICY "Users can update their own profile"
  ON user_profiles FOR UPDATE
  USING (
    is_super_admin(auth.uid())
    OR id = auth.uid()
  );

-- Users can insert their own profile (during signup)
CREATE POLICY "Users can create their own profile"
  ON user_profiles FOR INSERT
  WITH CHECK (id = auth.uid());

-- Super admins can delete any user profile
CREATE POLICY "Super admins can delete user profiles"
  ON user_profiles FOR DELETE
  USING (is_super_admin(auth.uid()));

-- ============================================
-- RLS POLICIES - ACTIVITIES
-- ============================================

-- Users can view activities in their alliance (super_admin can view all)
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

-- Users can create their own activities
CREATE POLICY "Users can create their own activities"
  ON activities FOR INSERT
  WITH CHECK (user_id = auth.uid());

-- Users can update their own activities
CREATE POLICY "Users can update their own activities"
  ON activities FOR UPDATE
  USING (user_id = auth.uid());

-- Users can delete their own activities
CREATE POLICY "Users can delete their own activities"
  ON activities FOR DELETE
  USING (user_id = auth.uid());

-- ============================================
-- RLS POLICIES - INVITATION TOKENS
-- ============================================

-- Admins can view invitations for their alliance (super_admin can view all)
-- Public can validate tokens (needed for signup)
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

-- Admins can create invitations for their alliance (super_admin can create for any alliance)
CREATE POLICY "Admins can create invitations"
  ON invitation_tokens FOR INSERT
  WITH CHECK (
    is_super_admin(auth.uid())
    OR (alliance_id = get_user_alliance_id(auth.uid()) AND is_user_admin(auth.uid()))
  );

-- System can update invitation tokens when used
CREATE POLICY "Tokens can be marked as used"
  ON invitation_tokens FOR UPDATE
  USING (token IS NOT NULL);

-- Admins can delete (revoke) invitations for their alliance
CREATE POLICY "Admins can delete their alliance invitations"
  ON invitation_tokens FOR DELETE
  USING (
    is_super_admin(auth.uid())
    OR (alliance_id = get_user_alliance_id(auth.uid()) AND is_user_admin(auth.uid()))
  );

-- ============================================
-- RLS POLICIES - ACTIVITY POINT RULES
-- ============================================

-- Users can view point rules in their alliance (super_admin can view all)
CREATE POLICY "Users can view their alliance point rules"
  ON activity_point_rules FOR SELECT
  USING (
    is_super_admin(auth.uid())
    OR alliance_id = get_user_alliance_id(auth.uid())
  );

-- Admins can insert point rules for their alliance (super_admin can insert for any alliance)
CREATE POLICY "Admins can create point rules"
  ON activity_point_rules FOR INSERT
  WITH CHECK (
    is_super_admin(auth.uid())
    OR (alliance_id = get_user_alliance_id(auth.uid()) AND is_user_admin(auth.uid()))
  );

-- Admins can update point rules for their alliance (super_admin can update all)
CREATE POLICY "Admins can update point rules"
  ON activity_point_rules FOR UPDATE
  USING (
    is_super_admin(auth.uid())
    OR (alliance_id = get_user_alliance_id(auth.uid()) AND is_user_admin(auth.uid()))
  );

-- Admins can delete point rules for their alliance (super_admin can delete all)
CREATE POLICY "Admins can delete point rules"
  ON activity_point_rules FOR DELETE
  USING (
    is_super_admin(auth.uid())
    OR (alliance_id = get_user_alliance_id(auth.uid()) AND is_user_admin(auth.uid()))
  );

-- ============================================
-- 4. FUNCTIONS
-- ============================================

-- Function to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers for updated_at
CREATE TRIGGER update_alliances_updated_at
  BEFORE UPDATE ON alliances
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_user_profiles_updated_at
  BEFORE UPDATE ON user_profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_activities_updated_at
  BEFORE UPDATE ON activities
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_point_rules_updated_at
  BEFORE UPDATE ON activity_point_rules
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- 5. HELPER FUNCTIONS
-- ============================================

-- Function to get user's alliance ID
CREATE OR REPLACE FUNCTION get_user_alliance_id(user_uuid UUID)
RETURNS UUID AS $$
  SELECT alliance_id FROM user_profiles WHERE id = user_uuid;
$$ LANGUAGE sql SECURITY DEFINER;

-- Function to check if user is admin or super_admin
CREATE OR REPLACE FUNCTION is_user_admin(user_uuid UUID)
RETURNS BOOLEAN AS $$
  SELECT role IN ('admin', 'super_admin') FROM user_profiles WHERE id = user_uuid;
$$ LANGUAGE sql SECURITY DEFINER;

-- Function to check if user is super_admin
CREATE OR REPLACE FUNCTION is_super_admin(user_uuid UUID)
RETURNS BOOLEAN AS $$
  SELECT role = 'super_admin' FROM user_profiles WHERE id = user_uuid;
$$ LANGUAGE sql SECURITY DEFINER;

-- Function to calculate points based on position and alliance rules
-- Returns points for a given activity type and position
-- Falls back to default ACTIVITY_TYPES points if no rule matches
CREATE OR REPLACE FUNCTION calculate_activity_points(
  p_alliance_id UUID,
  p_activity_type TEXT,
  p_position INTEGER
)
RETURNS INTEGER AS $$
DECLARE
  v_points INTEGER;
  v_default_points INTEGER;
BEGIN
  -- Try to find a matching rule
  SELECT points INTO v_points
  FROM activity_point_rules
  WHERE alliance_id = p_alliance_id
    AND activity_type = p_activity_type
    AND position_min <= p_position
    AND position_max >= p_position
  LIMIT 1;
  
  -- If found, return calculated points
  IF v_points IS NOT NULL THEN
    RETURN v_points;
  END IF;
  
  -- Fallback to default points from ACTIVITY_TYPES
  -- Based on AOEM activities
  CASE p_activity_type
    WHEN 'kvk prep' THEN v_default_points := 15;
    WHEN 'kvk cross border' THEN v_default_points := 10;
    WHEN 'legion' THEN v_default_points := 8;
    WHEN 'desolate desert' THEN v_default_points := 8;
    WHEN 'golden expedition' THEN v_default_points := 5;
    ELSE v_default_points := 5; -- Generic default
  END CASE;
  
  RETURN v_default_points;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

