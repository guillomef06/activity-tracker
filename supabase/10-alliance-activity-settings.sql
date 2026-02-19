-- Alliance Activity Settings
-- Allows admins to configure participation mode per activity type
CREATE TABLE IF NOT EXISTS alliance_activity_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  alliance_id UUID REFERENCES alliances(id) ON DELETE CASCADE NOT NULL,
  activity_type TEXT NOT NULL,
  participation_mode BOOLEAN NOT NULL DEFAULT FALSE,
  participation_points INTEGER NOT NULL DEFAULT 5 CHECK (participation_points >= 0),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(alliance_id, activity_type)
);

CREATE INDEX IF NOT EXISTS idx_alliance_activity_settings_alliance_id
  ON alliance_activity_settings(alliance_id);

ALTER TABLE alliance_activity_settings ENABLE ROW LEVEL SECURITY;

-- Members can read their alliance settings
CREATE POLICY "Members can read activity settings"
  ON alliance_activity_settings FOR SELECT
  USING (
    alliance_id = get_user_alliance_id((select auth.uid()))
  );

-- Admins and super admins can manage settings for their alliance
CREATE POLICY "Admins can manage activity settings"
  ON alliance_activity_settings FOR ALL
  USING (
    (is_super_admin((select auth.uid())) OR is_user_admin((select auth.uid())))
    AND alliance_id = get_user_alliance_id((select auth.uid()))
  )
  WITH CHECK (
    (is_super_admin((select auth.uid())) OR is_user_admin((select auth.uid())))
    AND alliance_id = get_user_alliance_id((select auth.uid()))
  );

-- position becomes nullable: participation activities have no position
ALTER TABLE activities ALTER COLUMN position DROP NOT NULL;
