-- ============================================
-- Migration 31: Season Schedule
-- ============================================
-- Replaces the hardcoded, eternally-repeating 6-week activity cycle
-- (APP_CONSTANTS.ACTIVITY_TYPES[].availableWeeks + CYCLE_REFERENCE_DATE in
-- date.util.ts) with super-admin-configurable "seasons": a season is a
-- contiguous, non-overlapping date range split into N weeks, each week
-- declaring which activity types (besides 'legion', which is implicit
-- every week of every season) are selectable that week.
--
-- Tables: activity_seasons, season_activities
-- Security: RLS (all authenticated users can read, only super_admin can
-- write) PLUS trigger-enforced business rules (defense in depth — RLS-
-- writable rows can be mutated directly via the Supabase REST API,
-- bypassing the Angular app, so the "lock once activities are logged"
-- and "seasons must chain with zero gaps" rules are enforced in the
-- database, not just the service layer). See 30-fix-role-privilege-
-- escalation.sql for the precedent of this philosophy.
-- ============================================

-- ============================================
-- 1. TABLES
-- ============================================

CREATE TABLE IF NOT EXISTS activity_seasons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL CHECK (char_length(name) <= 100),
  -- Must be a Monday; immutable after creation (no UPDATE path is exposed
  -- for it in SeasonService, and the lock trigger below rejects any
  -- attempt to change it directly via the REST API).
  start_date DATE NOT NULL CHECK (EXTRACT(ISODOW FROM start_date) = 1),
  week_count INT NOT NULL CHECK (week_count BETWEEN 1 AND 52),
  -- Inclusive last day of the season (Sunday of its last week).
  end_date DATE GENERATED ALWAYS AS (start_date + (week_count * 7 - 1)) STORED,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- No two seasons may cover overlapping dates.
  EXCLUDE USING gist (daterange(start_date, end_date, '[]') WITH &&)
);

-- Per-season, per-week activity assignment. 'legion' is implicit every
-- week of every season and must NEVER appear as a row here.
--
-- MAINTENANCE COUPLING: the activity_type CHECK below is a hardcoded
-- mirror of the non-legion values in APP_CONSTANTS.ACTIVITY_TYPES
-- (src/app/shared/constants/constants.ts). Adding/renaming/removing an
-- activity type requires a follow-up migration to update this CHECK, or
-- inserts for the new type will be rejected with a constraint violation.
CREATE TABLE IF NOT EXISTS season_activities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  season_id UUID NOT NULL REFERENCES activity_seasons(id) ON DELETE CASCADE,
  week_index INT NOT NULL CHECK (week_index >= 1),
  activity_type TEXT NOT NULL CHECK (
    activity_type <> 'legion'
    AND char_length(activity_type) <= 100
    AND activity_type = ANY (ARRAY[
      'kvk prep',
      'kvk cross border',
      'desolate desert',
      'golden expedition',
      'primordial conflict',
      'stellar dynasty',
      'me overall'
    ])
  ),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_season_activities_season_week_type UNIQUE (season_id, week_index, activity_type)
);

-- ============================================
-- 2. INDEXES
-- ============================================

CREATE INDEX IF NOT EXISTS idx_season_activities_season_id ON season_activities(season_id);

-- ============================================
-- 3. updated_at TRIGGER
-- Reuses update_updated_at_column(), already defined in 01-initial-schema.sql
-- (search_path pinned in 16-fix-function-search-path.sql).
-- ============================================

DROP TRIGGER IF EXISTS update_activity_seasons_updated_at ON activity_seasons;
CREATE TRIGGER update_activity_seasons_updated_at
  BEFORE UPDATE ON activity_seasons
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- 4. HELPER — has this season ever had a real activity logged against it?
-- SECURITY DEFINER so it can be evaluated inside RLS-protected trigger
-- functions regardless of the caller's row visibility on `activities`.
--
-- Note: activities.date is TIMESTAMPTZ (see 01-initial-schema.sql), so it
-- is cast to DATE before comparing against the season's inclusive
-- start_date/end_date range.
-- ============================================

CREATE OR REPLACE FUNCTION season_has_logged_activities(p_season_id UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1
    FROM activities a
    JOIN activity_seasons s ON s.id = p_season_id
    WHERE a.date::date >= s.start_date AND a.date::date <= s.end_date
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

-- ============================================
-- 5. TRIGGER — contiguity (BEFORE INSERT only)
-- Seasons must chain with zero gaps: a new season's start_date must equal
-- MAX(end_date) + 1 day across existing seasons, or (if none exist yet)
-- any Monday is fine.
-- ============================================

CREATE OR REPLACE FUNCTION check_season_contiguity()
RETURNS TRIGGER AS $$
DECLARE
  v_max_end_date DATE;
BEGIN
  SELECT MAX(end_date) INTO v_max_end_date FROM activity_seasons;

  IF v_max_end_date IS NOT NULL AND NEW.start_date <> v_max_end_date + 1 THEN
    RAISE EXCEPTION 'Season start_date must immediately follow the previous season''s end_date (expected %, got %)',
      v_max_end_date + 1, NEW.start_date
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

DROP TRIGGER IF EXISTS trigger_check_season_contiguity ON activity_seasons;
CREATE TRIGGER trigger_check_season_contiguity
  BEFORE INSERT ON activity_seasons
  FOR EACH ROW EXECUTE FUNCTION check_season_contiguity();

-- ============================================
-- 6. TRIGGER — lock on UPDATE
-- `name` may always be changed, even when the season is locked.
-- `start_date` may never be changed (immutable — enforced here too, not
-- just by omitting an update path in the service layer).
-- `week_count` may only be changed while the season has no logged
-- activities.
-- ============================================

CREATE OR REPLACE FUNCTION prevent_locked_season_structure_change()
RETURNS TRIGGER AS $$
DECLARE
  v_next_season_start_date DATE;
BEGIN
  IF NEW.start_date IS DISTINCT FROM OLD.start_date THEN
    RAISE EXCEPTION 'Season start_date is immutable and cannot be changed after creation'
      USING ERRCODE = '23514';
  END IF;

  IF NEW.week_count IS DISTINCT FROM OLD.week_count THEN
    IF season_has_logged_activities(OLD.id) THEN
      RAISE EXCEPTION 'Cannot change week_count for season "%": activities have already been logged for this season', OLD.name
        USING ERRCODE = '55006';
    END IF;

    -- week_count drives the GENERATED end_date, which the contiguity trigger
    -- only validates on INSERT. Changing week_count on an unlocked season
    -- moves end_date and can silently open a gap before the *immediately
    -- following* season's start_date (the EXCLUDE constraint only catches
    -- overlaps, never gaps), so re-validate contiguity against that one
    -- season here too.
    SELECT start_date INTO v_next_season_start_date
    FROM activity_seasons
    WHERE start_date > OLD.start_date
    ORDER BY start_date
    LIMIT 1;

    IF v_next_season_start_date IS NOT NULL AND v_next_season_start_date <> NEW.end_date + 1 THEN
      RAISE EXCEPTION 'Changing week_count for season "%" would break contiguity with the following season (expected next start_date %, got %)',
        OLD.name, NEW.end_date + 1, v_next_season_start_date
        USING ERRCODE = '23514';
    END IF;

    -- A shrinking week_count can strand season_activities rows whose
    -- week_index no longer fits within the new range. Cascade-clean them
    -- rather than leaving orphaned rows the app never surfaces again.
    IF NEW.week_count < OLD.week_count THEN
      DELETE FROM season_activities WHERE season_id = OLD.id AND week_index > NEW.week_count;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

DROP TRIGGER IF EXISTS trigger_prevent_locked_season_structure_change ON activity_seasons;
CREATE TRIGGER trigger_prevent_locked_season_structure_change
  BEFORE UPDATE ON activity_seasons
  FOR EACH ROW EXECUTE FUNCTION prevent_locked_season_structure_change();

-- ============================================
-- 7. TRIGGER — lock on DELETE
-- A season that already has real submissions against it must never be
-- deletable.
-- ============================================

CREATE OR REPLACE FUNCTION prevent_locked_season_delete()
RETURNS TRIGGER AS $$
BEGIN
  IF season_has_logged_activities(OLD.id) THEN
    RAISE EXCEPTION 'Cannot delete season "%": activities have already been logged for this season', OLD.name
      USING ERRCODE = '55006';
  END IF;

  RETURN OLD;
END;
$$ LANGUAGE plpgsql SET search_path = public;

DROP TRIGGER IF EXISTS trigger_prevent_locked_season_delete ON activity_seasons;
CREATE TRIGGER trigger_prevent_locked_season_delete
  BEFORE DELETE ON activity_seasons
  FOR EACH ROW EXECUTE FUNCTION prevent_locked_season_delete();

-- ============================================
-- 8. TRIGGER — season_activities: week_index must fit within the parent
-- season's week_count. A CHECK constraint cannot reference another table,
-- so this is enforced via trigger.
-- ============================================

CREATE OR REPLACE FUNCTION check_season_activity_week_index()
RETURNS TRIGGER AS $$
DECLARE
  v_week_count INT;
BEGIN
  SELECT week_count INTO v_week_count FROM activity_seasons WHERE id = NEW.season_id;

  IF v_week_count IS NULL THEN
    RAISE EXCEPTION 'Season % does not exist', NEW.season_id
      USING ERRCODE = '23503';
  END IF;

  IF NEW.week_index > v_week_count THEN
    RAISE EXCEPTION 'week_index % exceeds season week_count %', NEW.week_index, v_week_count
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

DROP TRIGGER IF EXISTS trigger_check_season_activity_week_index ON season_activities;
CREATE TRIGGER trigger_check_season_activity_week_index
  BEFORE INSERT OR UPDATE ON season_activities
  FOR EACH ROW EXECUTE FUNCTION check_season_activity_week_index();

-- ============================================
-- 9. TRIGGER — season_activities: lock once the parent season has logged
-- activities. The whole per-week map is frozen once any activity has
-- been logged anywhere in that season's date range.
-- ============================================

CREATE OR REPLACE FUNCTION prevent_locked_season_activities_change()
RETURNS TRIGGER AS $$
DECLARE
  v_season_id UUID;
BEGIN
  v_season_id := COALESCE(NEW.season_id, OLD.season_id);

  IF season_has_logged_activities(v_season_id) THEN
    RAISE EXCEPTION 'Cannot modify week assignments: activities have already been logged for this season'
      USING ERRCODE = '55006';
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

DROP TRIGGER IF EXISTS trigger_prevent_locked_season_activities_change ON season_activities;
CREATE TRIGGER trigger_prevent_locked_season_activities_change
  BEFORE INSERT OR UPDATE OR DELETE ON season_activities
  FOR EACH ROW EXECUTE FUNCTION prevent_locked_season_activities_change();

-- ============================================
-- 10. ROW LEVEL SECURITY
-- Mirrors 23-guides.sql: SELECT is open to all authenticated users
-- (every member needs to read the schedule, including past seasons for
-- historical/backdated lookups — there is no is_active flag here).
-- INSERT/UPDATE/DELETE are super_admin only.
-- ============================================

ALTER TABLE activity_seasons ENABLE ROW LEVEL SECURITY;
ALTER TABLE season_activities ENABLE ROW LEVEL SECURITY;

-- activity_seasons
CREATE POLICY "activity_seasons_select_all" ON activity_seasons
  FOR SELECT USING (true);

CREATE POLICY "activity_seasons_insert_super_admin" ON activity_seasons
  FOR INSERT WITH CHECK (is_super_admin());

CREATE POLICY "activity_seasons_update_super_admin" ON activity_seasons
  FOR UPDATE USING (is_super_admin());

CREATE POLICY "activity_seasons_delete_super_admin" ON activity_seasons
  FOR DELETE USING (is_super_admin());

-- season_activities
CREATE POLICY "season_activities_select_all" ON season_activities
  FOR SELECT USING (true);

CREATE POLICY "season_activities_insert_super_admin" ON season_activities
  FOR INSERT WITH CHECK (is_super_admin());

CREATE POLICY "season_activities_update_super_admin" ON season_activities
  FOR UPDATE USING (is_super_admin());

CREATE POLICY "season_activities_delete_super_admin" ON season_activities
  FOR DELETE USING (is_super_admin());

-- ============================================
-- DONE
-- ============================================

-- ============================================
-- ROLLBACK (not executed — for reference only)
-- ============================================
-- DROP TRIGGER IF EXISTS trigger_prevent_locked_season_activities_change ON season_activities;
-- DROP TRIGGER IF EXISTS trigger_check_season_activity_week_index ON season_activities;
-- DROP TRIGGER IF EXISTS trigger_prevent_locked_season_delete ON activity_seasons;
-- DROP TRIGGER IF EXISTS trigger_prevent_locked_season_structure_change ON activity_seasons;
-- DROP TRIGGER IF EXISTS trigger_check_season_contiguity ON activity_seasons;
-- DROP TRIGGER IF EXISTS update_activity_seasons_updated_at ON activity_seasons;
-- DROP FUNCTION IF EXISTS prevent_locked_season_activities_change();
-- DROP FUNCTION IF EXISTS check_season_activity_week_index();
-- DROP FUNCTION IF EXISTS prevent_locked_season_delete();
-- DROP FUNCTION IF EXISTS prevent_locked_season_structure_change();
-- DROP FUNCTION IF EXISTS check_season_contiguity();
-- DROP FUNCTION IF EXISTS season_has_logged_activities(UUID);
-- DROP TABLE IF EXISTS season_activities;
-- DROP TABLE IF EXISTS activity_seasons;
