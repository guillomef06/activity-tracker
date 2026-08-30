-- ============================================
-- Migration 33: MG Slot Config
-- ============================================
-- Tables:   server_mg_slot_config
-- Purpose:  Makes the per-rank cost/target thresholds of the "Mightiest
--           Governor" table admin-configurable per server, instead of the
--           hardcoded SLOTS_DATA constant previously baked into
--           mightiest-governor.component.ts. Rank labels and medal counts
--           stay fixed/universal (see MG_SLOT_DEFAULTS in
--           src/app/shared/constants/mg-slots.constant.ts) — only
--           cost/target_min/target_max become overridable per server, one
--           row per slot_order (1-10). A server with no rows falls back to
--           the hardcoded defaults (merge handled client-side by
--           buildMgSlotRows() in src/app/shared/utils/mg-slot.util.ts).
-- Security: RLS — SELECT for members; ALL for admins (mirrors
--           server_mg_config from 26-mg-event.sql exactly).
-- ============================================

-- ============================================
-- 1. TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS server_mg_slot_config (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  server_id   UUID NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
  slot_order  SMALLINT NOT NULL CHECK (slot_order BETWEEN 1 AND 10),
  cost        SMALLINT NOT NULL CHECK (cost >= 0),
  target_min  SMALLINT NOT NULL CHECK (target_min >= 0),
  target_max  SMALLINT NOT NULL CHECK (target_max >= target_min),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_server_mg_slot_config_server_order UNIQUE (server_id, slot_order)
);

-- No standalone index on server_id: the unique constraint above already
-- creates a composite index leading with server_id, covering server-scoped
-- lookups without duplicating it.

-- ============================================
-- 2. updated_at TRIGGER
-- Reuses update_updated_at_column(), already defined in 01-initial-schema.sql
-- (search_path pinned in 16-fix-function-search-path.sql), following the
-- 31-season-schedule.sql convention rather than defining a new per-table
-- trigger function like 26-mg-event.sql did.
-- ============================================

DROP TRIGGER IF EXISTS update_server_mg_slot_config_updated_at ON server_mg_slot_config;
CREATE TRIGGER update_server_mg_slot_config_updated_at
  BEFORE UPDATE ON server_mg_slot_config
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- 3. ROW LEVEL SECURITY
-- Mirrors server_mg_config's two policies from 26-mg-event.sql exactly.
-- ============================================

ALTER TABLE server_mg_slot_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view their server MG slot config"
  ON server_mg_slot_config FOR SELECT
  USING (
    is_super_admin((select auth.uid()))
    OR server_id = get_user_server_id((select auth.uid()))
  );

CREATE POLICY "Admins can manage their server MG slot config"
  ON server_mg_slot_config FOR ALL
  USING (
    is_super_admin((select auth.uid()))
    OR (
      server_id = get_user_server_id((select auth.uid()))
      AND is_user_admin((select auth.uid()))
    )
  )
  WITH CHECK (
    is_super_admin((select auth.uid()))
    OR (
      server_id = get_user_server_id((select auth.uid()))
      AND is_user_admin((select auth.uid()))
    )
  );

-- ============================================
-- DONE
-- ============================================

-- ============================================
-- ROLLBACK (not executed — for reference only)
-- ============================================
-- DROP TRIGGER IF EXISTS update_server_mg_slot_config_updated_at ON server_mg_slot_config;
-- DROP TABLE IF EXISTS server_mg_slot_config;
