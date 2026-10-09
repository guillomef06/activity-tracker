-- ============================================
-- Migration 43: Discord account linking
-- ============================================
-- Lets a user pair their Discord account with their Activity Tracker account so a
-- Discord bot can later submit activities on their behalf (authenticated: the bot
-- only acts for a Discord user whose account is verifiably linked here).
--
-- Linking is initiated FROM THE APP (where the user is already authenticated) via
-- Supabase `auth.linkIdentity({ provider: 'discord' })`, which attaches a VERIFIED
-- Discord identity to auth.identities. We never trust a Discord id supplied by the
-- client; `sync_discord_link()` reads it server-side from auth.identities for the
-- current auth.uid().
--
-- `discord_links` is the public-schema mapping the bot path reads (Discord id →
-- app user), so submission RPCs/Edge Functions never touch the auth schema at
-- query time.
--
-- Depends on: 01 (user_profiles).
-- ============================================

CREATE TABLE IF NOT EXISTS discord_links (
  discord_user_id TEXT PRIMARY KEY,                 -- Discord snowflake (as text)
  user_id         UUID NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  discord_username TEXT,                            -- cosmetic, for display in the app
  linked_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT discord_links_user_unique UNIQUE (user_id)  -- one Discord acct per app acct
);

CREATE INDEX IF NOT EXISTS idx_discord_links_user_id ON discord_links(user_id);

ALTER TABLE discord_links ENABLE ROW LEVEL SECURITY;

-- A user may read and remove ONLY their own link. Inserts/updates happen through
-- sync_discord_link() (SECURITY DEFINER) so the Discord id can only ever come from
-- the verified auth.identities row, never from client-supplied input.
DROP POLICY IF EXISTS discord_links_self_select ON discord_links;
CREATE POLICY discord_links_self_select ON discord_links
  FOR SELECT USING (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS discord_links_self_delete ON discord_links;
CREATE POLICY discord_links_self_delete ON discord_links
  FOR DELETE USING (user_id = (SELECT auth.uid()));

-- ============================================
-- sync_discord_link() — mirror the caller's verified Discord identity into
-- discord_links. Call from the app immediately after linkIdentity resolves.
-- Reads the Discord id from auth.identities for auth.uid() (server-side, trusted).
-- Idempotent: re-running updates the username / re-points the row.
-- Returns the linked discord_user_id, or NULL if the caller has no Discord identity.
-- ============================================
CREATE OR REPLACE FUNCTION sync_discord_link()
RETURNS TEXT AS $$
DECLARE
  v_uid        UUID := auth.uid();
  v_discord_id TEXT;
  v_username   TEXT;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  -- Pull the most recent Discord identity for this user. provider_id is the Discord
  -- snowflake; identity_data holds the OAuth profile (name/global_name/user_name vary
  -- by provider version, so we coalesce).
  SELECT i.provider_id,
         COALESCE(i.identity_data->>'global_name',
                  i.identity_data->>'full_name',
                  i.identity_data->>'name',
                  i.identity_data->>'user_name')
    INTO v_discord_id, v_username
  FROM auth.identities i
  WHERE i.user_id = v_uid
    AND i.provider = 'discord'
  ORDER BY i.updated_at DESC NULLS LAST
  LIMIT 1;

  IF v_discord_id IS NULL THEN
    RETURN NULL;  -- caller hasn't linked a Discord identity (yet)
  END IF;

  -- A Discord account links to at most one app account. If this Discord id was
  -- previously mapped to a DIFFERENT app user, move it to the current caller.
  INSERT INTO discord_links (discord_user_id, user_id, discord_username, linked_at)
  VALUES (v_discord_id, v_uid, v_username, NOW())
  ON CONFLICT (discord_user_id)
    DO UPDATE SET user_id = EXCLUDED.user_id,
                  discord_username = EXCLUDED.discord_username,
                  linked_at = NOW();

  RETURN v_discord_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth;

REVOKE ALL ON FUNCTION sync_discord_link() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION sync_discord_link() TO authenticated;

COMMENT ON FUNCTION sync_discord_link() IS
  'Mirror the caller''s verified Discord identity (auth.identities) into discord_links. App calls this after linkIdentity. Returns the discord_user_id or NULL.';

-- ============================================
-- DONE
-- ============================================

-- ============================================
-- ROLLBACK (not executed — for reference only)
-- ============================================
-- DROP FUNCTION IF EXISTS sync_discord_link();
-- DROP TABLE IF EXISTS discord_links;
