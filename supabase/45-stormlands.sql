-- ============================================
-- Migration 45: Stormlands — New Activity Type
-- ============================================
-- Adds 'stormlands' to APP_CONSTANTS.ACTIVITY_TYPES
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
    'behemoth conquest',
    'stormlands'
  ])
);

-- ============================================
-- DONE
-- ============================================

-- ============================================
-- ROLLBACK (not executed — for reference only)
-- ============================================
-- Fails if season_activities rows with activity_type = 'stormlands' exist;
-- delete them first.
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
--     'me overall',
--     'behemoth conquest'
--   ])
-- );
