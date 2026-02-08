-- Activity Tracker - Supabase Database Schema
-- Multi-Alliance Activity Tracking System with Invitation Links

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
CREATE TABLE IF NOT EXISTS user_profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  alliance_id UUID REFERENCES alliances(id) ON DELETE CASCADE,
  display_name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('admin', 'member')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Activities
CREATE TABLE IF NOT EXISTS activities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES user_profiles(id) ON DELETE CASCADE,
  activity_type TEXT NOT NULL,
  points INTEGER NOT NULL,
  date TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
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
CREATE INDEX IF NOT EXISTS idx_activities_user_id ON activities(user_id);
CREATE INDEX IF NOT EXISTS idx_activities_date ON activities(date DESC);
CREATE INDEX IF NOT EXISTS idx_invitation_tokens_token ON invitation_tokens(token);
CREATE INDEX IF NOT EXISTS idx_invitation_tokens_alliance_id ON invitation_tokens(alliance_id);

-- ============================================
-- 3. ROW LEVEL SECURITY (RLS)
-- ============================================

-- Enable RLS on all tables
ALTER TABLE alliances ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE invitation_tokens ENABLE ROW LEVEL SECURITY;

-- ============================================
-- RLS POLICIES - ALLIANCES
-- ============================================

-- Users can view their own alliance
CREATE POLICY "Users can view their own alliance"
  ON alliances FOR SELECT
  USING (
    id IN (
      SELECT alliance_id FROM user_profiles WHERE id = auth.uid()
    )
  );

-- Users can update their own alliance if they are admin
CREATE POLICY "Admins can update their alliance"
  ON alliances FOR UPDATE
  USING (
    id IN (
      SELECT alliance_id FROM user_profiles WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- Anyone can insert alliances (during signup)
CREATE POLICY "Anyone can create alliance during signup"
  ON alliances FOR INSERT
  WITH CHECK (true);

-- ============================================
-- RLS POLICIES - USER PROFILES
-- ============================================

-- Users can view profiles in their alliance
CREATE POLICY "Users can view profiles in their alliance"
  ON user_profiles FOR SELECT
  USING (
    alliance_id IN (
      SELECT alliance_id FROM user_profiles WHERE id = auth.uid()
    )
  );

-- Users can update their own profile
CREATE POLICY "Users can update their own profile"
  ON user_profiles FOR UPDATE
  USING (id = auth.uid());

-- Users can insert their own profile (during signup)
CREATE POLICY "Users can create their own profile"
  ON user_profiles FOR INSERT
  WITH CHECK (id = auth.uid());

-- ============================================
-- RLS POLICIES - ACTIVITIES
-- ============================================

-- Users can view activities in their alliance
CREATE POLICY "Users can view activities in their alliance"
  ON activities FOR SELECT
  USING (
    user_id IN (
      SELECT id FROM user_profiles WHERE alliance_id IN (
        SELECT alliance_id FROM user_profiles WHERE id = auth.uid()
      )
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

-- Admins can view invitations for their alliance
CREATE POLICY "Admins can view their alliance invitations"
  ON invitation_tokens FOR SELECT
  USING (
    alliance_id IN (
      SELECT alliance_id FROM user_profiles WHERE id = auth.uid() AND role = 'admin'
    )
    OR token IS NOT NULL -- Allow anyone to validate a token if they have it
  );

-- Admins can create invitations for their alliance
CREATE POLICY "Admins can create invitations"
  ON invitation_tokens FOR INSERT
  WITH CHECK (
    alliance_id IN (
      SELECT alliance_id FROM user_profiles WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- System can update invitation tokens when used
CREATE POLICY "Tokens can be marked as used"
  ON invitation_tokens FOR UPDATE
  USING (token IS NOT NULL);

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

-- ============================================
-- 5. HELPER FUNCTIONS
-- ============================================

-- Function to get user's alliance ID
CREATE OR REPLACE FUNCTION get_user_alliance_id(user_uuid UUID)
RETURNS UUID AS $$
  SELECT alliance_id FROM user_profiles WHERE id = user_uuid;
$$ LANGUAGE sql SECURITY DEFINER;

-- Function to check if user is admin
CREATE OR REPLACE FUNCTION is_user_admin(user_uuid UUID)
RETURNS BOOLEAN AS $$
  SELECT role = 'admin' FROM user_profiles WHERE id = user_uuid;
$$ LANGUAGE sql SECURITY DEFINER;

-- ============================================
-- 6. SAMPLE DATA (OPTIONAL - FOR DEVELOPMENT)
-- ============================================

-- You can uncomment this section to create sample data
-- Note: This requires manual user creation in Supabase Auth first

/*
-- Insert sample alliance
INSERT INTO alliances (id, name) VALUES
  ('00000000-0000-0000-0000-000000000001', 'Demo Alliance');

-- Insert sample user profiles (requires auth.users to exist first)
-- INSERT INTO user_profiles (id, alliance_id, display_name, email, role) VALUES
--   ('user-uuid-from-auth', '00000000-0000-0000-0000-000000000001', 'Admin User', 'admin@example.com', 'admin');
*/
