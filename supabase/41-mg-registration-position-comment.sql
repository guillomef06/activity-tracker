-- ============================================
-- Migration 41: MG Registration Desired Position & Comment
-- ============================================
-- Columns: mg_registrations.desired_slot_order, mg_registrations.comment
-- Purpose:  Lets a player state which MG rank slot (see MG_SLOT_DEFAULTS /
--           server_mg_slot_config, slot_order 1-10) they are aiming for when
--           they register, plus an optional free-text comment. Today the
--           admin-facing registrations list (mg-admin-tab) only shows a bare
--           list of names, giving admins no signal of player intent when
--           manually picking seats (assignment_mode = 'manual'). This adds
--           that signal without changing the selection algorithm itself.
--           - desired_slot_order is nullable: rows inserted before this
--             migration (registrations for an already-open event) predate
--             the feature and have no value to backfill from — never made
--             NOT NULL.
--           - comment is optional free text, capped at 200 chars.
-- Security: No RLS change needed — none of the 5 existing mg_registrations
--           policies (26-mg-event.sql) restrict which columns are
--           readable/writable, so the existing SELECT/INSERT/DELETE
--           policies already cover these two new columns.
-- ============================================

-- ============================================
-- 1. COLUMNS
-- ============================================

ALTER TABLE mg_registrations
  ADD COLUMN IF NOT EXISTS desired_slot_order SMALLINT
    CHECK (desired_slot_order IS NULL OR desired_slot_order BETWEEN 1 AND 10);

ALTER TABLE mg_registrations
  ADD COLUMN IF NOT EXISTS comment TEXT
    CHECK (comment IS NULL OR char_length(comment) <= 200);

-- ============================================
-- DONE
-- ============================================

-- ============================================
-- ROLLBACK (not executed — for reference only)
-- ============================================
-- ALTER TABLE mg_registrations DROP COLUMN IF EXISTS desired_slot_order;
-- ALTER TABLE mg_registrations DROP COLUMN IF EXISTS comment;
