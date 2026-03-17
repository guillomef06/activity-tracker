-- Migration 17: Add missing indexes on foreign key columns
-- Supabase performance advisor flags FK columns without indexes
-- as they cause sequential scans on DELETE/UPDATE of referenced rows

CREATE INDEX IF NOT EXISTS idx_alliances_owner_id
  ON alliances(owner_id);

CREATE INDEX IF NOT EXISTS idx_invitation_tokens_used_by
  ON invitation_tokens(used_by);

CREATE INDEX IF NOT EXISTS idx_invitation_tokens_created_by
  ON invitation_tokens(created_by);
