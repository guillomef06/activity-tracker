-- ============================================
-- Migration 29: Stellar Dynasty — Game Update
-- ============================================
-- Changes:
--   1. Copy activity_point_rules from 'golden expedition' → 'primordial conflict'
--      per server (Primordial Conflict uses the same position-based scoring)
--   2. Copy server_activity_settings from 'golden expedition' → 'primordial conflict'
--      per server (preserves participation_mode and participation_points settings)
-- Note: 'stellar glory' data is preserved for historical display.
--       New activity 'stellar dynasty' inherits no existing rules (starts fresh).
-- ============================================

-- 1. Copy activity_point_rules: golden expedition → primordial conflict
INSERT INTO activity_point_rules (server_id, activity_type, position_min, position_max, points)
SELECT server_id, 'primordial conflict', position_min, position_max, points
FROM activity_point_rules
WHERE activity_type = 'golden expedition'
ON CONFLICT DO NOTHING;

-- 2. Copy server_activity_settings: golden expedition → primordial conflict
INSERT INTO server_activity_settings (server_id, activity_type, participation_mode, participation_points)
SELECT server_id, 'primordial conflict', participation_mode, participation_points
FROM server_activity_settings
WHERE activity_type = 'golden expedition'
ON CONFLICT DO NOTHING;

-- ============================================
-- DONE
-- ============================================
