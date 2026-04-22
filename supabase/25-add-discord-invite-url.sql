-- Add Discord invite URL to alliances/servers
ALTER TABLE alliances
  ADD COLUMN IF NOT EXISTS discord_invite_url TEXT
  CHECK (
    discord_invite_url IS NULL
    OR discord_invite_url ~ '^https://(discord\.gg|discord\.com\/invite)/[A-Za-z0-9_-]+$'
  );
