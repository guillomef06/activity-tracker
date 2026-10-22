-- ============================================
-- Migration 46: Manual point adjustments
-- ============================================
-- Table:    point_adjustments
-- Purpose:  let admins manually correct a player's rolling-window score with a
--           signed, reasoned delta (reward or penalty) outside the normal
--           activity-logging flow. Mirrors how the MG/DKP selection cost already
--           moves a player's leaderboard total, but admin-driven and permanent
--           (a flat delta that does not age out of the rolling window).
-- RLS:      SELECT for members of the server; INSERT/DELETE for admins.
--           No UPDATE — an adjustment is corrected by deleting and re-adding.
--
-- Depends on: 01 (is_super_admin, is_user_admin), 24 (get_user_server_id).
-- NOT auto-applied to prod — run manually against hosted Supabase (same
-- precedent as migrations 33/36/41). Until applied, the UI falls back to an
-- empty list.
-- ============================================

-- ============================================
-- 1. TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS point_adjustments (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  server_id   UUID NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  delta       INTEGER NOT NULL CHECK (delta <> 0),                        -- signed: +reward / -penalty
  reason      TEXT NOT NULL CHECK (char_length(reason) BETWEEN 1 AND 200),
  created_by  UUID REFERENCES user_profiles(id) ON DELETE SET NULL,       -- admin who made it
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================
-- 2. INDEXES (FK indexes + common filters)
-- ============================================

CREATE INDEX IF NOT EXISTS idx_point_adjustments_server_id ON point_adjustments(server_id);
CREATE INDEX IF NOT EXISTS idx_point_adjustments_user_id ON point_adjustments(user_id);

-- ============================================
-- 3. ROW LEVEL SECURITY
-- ============================================

ALTER TABLE point_adjustments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view point adjustments for their server"
  ON point_adjustments FOR SELECT
  USING (
    is_super_admin((select auth.uid()))
    OR server_id = get_user_server_id((select auth.uid()))
  );

CREATE POLICY "Admins can insert point adjustments for their server"
  ON point_adjustments FOR INSERT
  WITH CHECK (
    is_super_admin((select auth.uid()))
    OR (
      server_id = get_user_server_id((select auth.uid()))
      AND is_user_admin((select auth.uid()))
    )
  );

CREATE POLICY "Admins can delete point adjustments for their server"
  ON point_adjustments FOR DELETE
  USING (
    is_super_admin((select auth.uid()))
    OR (
      server_id = get_user_server_id((select auth.uid()))
      AND is_user_admin((select auth.uid()))
    )
  );
