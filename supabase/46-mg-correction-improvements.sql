-- ============================================
-- Migration 46: MG correction improvements (empty slots + approved-cost baseline)
-- ============================================
-- Enum:     mg_selection_type += 'empty'
-- Columns:  mg_selections.label, mg_selections.approved_rank, mg_selections.approved_cost
-- Purpose:  Richer admin "Correct the last event" tool.
--           - 'empty' selection type: a named placeholder slot (default label
--             "Empty", editable to an unregistered person's name) that occupies
--             a rank and shows the slot cost for accounting but bills NOBODY
--             (user_id stays NULL; loadSpends already filters user_id IS NULL,
--             so no leaderboard deduction is ever charged for these rows).
--           - approved_rank / approved_cost snapshot each selected player's
--             rank and cost on the originally-published ("admin-approved")
--             list, stamped once at publish. The correction tool bills a
--             forgiven upward move at approved_cost instead of the dearer
--             final-rank cost, and the snapshot survives repeated corrections.
-- Security: No RLS changes — new column/enum value are covered by the existing
--           mg_selections policies (26-mg-event.sql).
--
-- NOT auto-applied to prod — run manually against hosted Supabase (same
-- precedent as migrations 33/36/41). The 'empty' enum value must be committed
-- before any statement uses it; running this file as a whole (each statement
-- auto-committed) satisfies that.
-- ============================================

-- ============================================
-- 1. ENUM VALUE
-- ============================================

ALTER TYPE mg_selection_type ADD VALUE IF NOT EXISTS 'empty';

-- ============================================
-- 2. COLUMNS
-- ============================================

ALTER TABLE mg_selections
  ADD COLUMN IF NOT EXISTS label TEXT CHECK (label IS NULL OR char_length(label) BETWEEN 1 AND 60);

ALTER TABLE mg_selections
  ADD COLUMN IF NOT EXISTS approved_rank SMALLINT CHECK (approved_rank IS NULL OR approved_rank >= 1);

ALTER TABLE mg_selections
  ADD COLUMN IF NOT EXISTS approved_cost SMALLINT CHECK (approved_cost IS NULL OR approved_cost >= 0);

-- ============================================
-- ROLLBACK (not executed — for reference only)
-- ============================================
-- ALTER TABLE mg_selections DROP COLUMN IF EXISTS approved_cost;
-- ALTER TABLE mg_selections DROP COLUMN IF EXISTS approved_rank;
-- ALTER TABLE mg_selections DROP COLUMN IF EXISTS label;
-- (an enum value cannot be dropped from mg_selection_type without recreating the type)
