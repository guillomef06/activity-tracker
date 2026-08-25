-- ============================================
-- Migration 32: Behemoth Conquest — New Activity Type
-- ============================================
-- Adds 'behemoth conquest' to APP_CONSTANTS.ACTIVITY_TYPES
-- (src/app/shared/constants/constants.ts). Per the maintenance-coupling
-- note in 31-season-schedule.sql, the season_activities.activity_type
-- CHECK constraint hardcodes that list and must be updated in lockstep,
-- or inserts for the new type are rejected with a constraint violation.
-- ============================================

ALTER TABLE season_activities DROP CONSTRAINT season_activities_activity_type_check;

ALTER TABLE season_activities ADD CONSTRAINT season_activities_activity_type_check CHECK (
  activity_type <> 'legion'
  AND char_length(activity_type) <= 100
  AND activity_type = ANY (ARRAY[
    'kvk prep',
    'kvk cross border',
    'desolate desert',
    'golden expedition',
    'primordial conflict',
    'stellar dynasty',
    'me overall',
    'behemoth conquest'
  ])
);

-- ============================================
-- DONE
-- ============================================

-- ============================================
-- ROLLBACK (not executed — for reference only)
-- ============================================
-- ALTER TABLE season_activities DROP CONSTRAINT season_activities_activity_type_check;
-- ALTER TABLE season_activities ADD CONSTRAINT season_activities_activity_type_check CHECK (
--   activity_type <> 'legion'
--   AND char_length(activity_type) <= 100
--   AND activity_type = ANY (ARRAY[
--     'kvk prep',
--     'kvk cross border',
--     'desolate desert',
--     'golden expedition',
--     'primordial conflict',
--     'stellar dynasty',
--     'me overall'
--   ])
-- );
