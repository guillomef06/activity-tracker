-- Discord Webhooks
-- Allows admins to configure Discord webhook channels for sending messages
CREATE TABLE IF NOT EXISTS discord_webhooks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  alliance_id UUID REFERENCES alliances(id) ON DELETE CASCADE NOT NULL,
  channel_name TEXT NOT NULL,
  webhook_url TEXT NOT NULL,
  default_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_discord_webhooks_alliance_id
  ON discord_webhooks(alliance_id);

ALTER TABLE discord_webhooks ENABLE ROW LEVEL SECURITY;

-- Members can read their alliance webhooks
CREATE POLICY "Members can read discord webhooks"
  ON discord_webhooks FOR SELECT
  USING (
    alliance_id = get_user_alliance_id((select auth.uid()))
  );

-- Admins and super admins can manage webhooks for their alliance
CREATE POLICY "Admins can manage discord webhooks"
  ON discord_webhooks FOR ALL
  USING (
    (is_super_admin((select auth.uid())) OR is_user_admin((select auth.uid())))
    AND alliance_id = get_user_alliance_id((select auth.uid()))
  )
  WITH CHECK (
    (is_super_admin((select auth.uid())) OR is_user_admin((select auth.uid())))
    AND alliance_id = get_user_alliance_id((select auth.uid()))
  );
