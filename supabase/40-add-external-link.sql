-- ============================================
-- Migration 40: Server External Link
-- ============================================
-- Tables:   servers (2 new nullable columns)
-- Purpose:  Admin-configurable external link (short label + URL) shown as a
--           button in the app header toolbar for any authenticated member
--           of the server. Mirrors the discord_invite_url feature added in
--           25-add-discord-invite-url.sql, but is a generic (label, url)
--           pair rather than a Discord-specific single URL.
-- ============================================

-- ============================================
-- 1. COLUMNS (nullable — additive, no backfill required)
-- ============================================

ALTER TABLE servers
  ADD COLUMN IF NOT EXISTS external_link_label TEXT,
  ADD COLUMN IF NOT EXISTS external_link_url TEXT;

-- ============================================
-- 2. CONSTRAINTS
-- ============================================
-- Naming follows the chk_{table}_{description} style used in
-- 39-discord-scheduled-messages.sql (chk_discord_webhooks_url_format,
-- chk_discord_scheduled_messages_frequency_fields).

ALTER TABLE servers
  ADD CONSTRAINT chk_servers_external_link_label_length
  CHECK (external_link_label IS NULL OR char_length(external_link_label) <= 50);

ALTER TABLE servers
  ADD CONSTRAINT chk_servers_external_link_url_https
  CHECK (external_link_url IS NULL OR external_link_url ~ '^https://');

ALTER TABLE servers
  ADD CONSTRAINT chk_servers_external_link_url_length
  CHECK (external_link_url IS NULL OR char_length(external_link_url) <= 200);

ALTER TABLE servers
  ADD CONSTRAINT chk_servers_external_link_both_or_neither
  CHECK (
    (external_link_label IS NULL AND external_link_url IS NULL) OR
    (external_link_label IS NOT NULL AND external_link_url IS NOT NULL)
  );

-- ============================================
-- DONE
-- ============================================

-- ============================================
-- ROLLBACK (not executed — for reference only)
-- ============================================
-- ALTER TABLE servers DROP CONSTRAINT IF EXISTS chk_servers_external_link_both_or_neither;
-- ALTER TABLE servers DROP CONSTRAINT IF EXISTS chk_servers_external_link_url_length;
-- ALTER TABLE servers DROP CONSTRAINT IF EXISTS chk_servers_external_link_url_https;
-- ALTER TABLE servers DROP CONSTRAINT IF EXISTS chk_servers_external_link_label_length;
-- ALTER TABLE servers DROP COLUMN IF EXISTS external_link_url;
-- ALTER TABLE servers DROP COLUMN IF EXISTS external_link_label;
