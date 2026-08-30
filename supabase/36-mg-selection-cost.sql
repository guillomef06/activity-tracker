-- ============================================
-- Migration 36: MG Selection Cost (DKP system)
-- ============================================
-- Columns: mg_selections.cost, server_mg_config.dkp_enabled
-- Purpose:  Implements the DKP mechanic referenced by the (now stale)
--           "under development" notice on the player-facing Mightiest
--           Governor table: a player selected for an MG event spends
--           points equal to their slot's cost, deducted from their total
--           on the main leaderboard.
--           - mg_selections.cost snapshots the resolved slot cost at
--             selection-generation time (client-side, via
--             resolveSlotForRank() in src/app/shared/utils/mg-slot.util.ts)
--             so a later change to server_mg_slot_config never retroactively
--             changes the cost already charged for a past event.
--           - server_mg_config.dkp_enabled is the per-server master switch
--             admins control from the MG admin tab (server_mg_config already
--             holds capacity/assignment_mode). Defaults to false so existing
--             servers don't see scores drop the moment this ships.
-- Security: No RLS changes — both columns are covered by the existing
--           policies on their respective tables (26-mg-event.sql).
-- ============================================

-- ============================================
-- 1. COLUMNS
-- ============================================

ALTER TABLE mg_selections
  ADD COLUMN IF NOT EXISTS cost SMALLINT NOT NULL DEFAULT 0 CHECK (cost >= 0);

ALTER TABLE server_mg_config
  ADD COLUMN IF NOT EXISTS dkp_enabled BOOLEAN NOT NULL DEFAULT false;

-- ============================================
-- DONE
-- ============================================

-- ============================================
-- ROLLBACK (not executed — for reference only)
-- ============================================
-- ALTER TABLE mg_selections DROP COLUMN IF EXISTS cost;
-- ALTER TABLE server_mg_config DROP COLUMN IF EXISTS dkp_enabled;
