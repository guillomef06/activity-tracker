-- ============================================
-- Migration 26: Mightiest Governor (MG) Event
-- ============================================
-- Tables:   mg_events, server_mg_config, mg_registrations, mg_selections
-- Enums:    mg_event_status, mg_assignment_mode, mg_selection_type, mg_selected_by
-- RLS:      SELECT for members; INSERT/UPDATE/DELETE for admins
--           mg_selections SELECT gated on selection_published_at IS NOT NULL for non-admins
-- pg_cron:  4 jobs — create events, close registrations, start events, end events
-- ============================================

-- ============================================
-- 1. ENUMS
-- ============================================

CREATE TYPE mg_event_status AS ENUM (
  'upcoming',
  'registration_open',
  'registration_closed',
  'selection_published',
  'ongoing',
  'finished'
);

CREATE TYPE mg_assignment_mode AS ENUM (
  'automatic',
  'manual'
);

CREATE TYPE mg_selection_type AS ENUM (
  'selected',
  'ffa'
);

CREATE TYPE mg_selected_by AS ENUM (
  'automatic',
  'manual'
);

-- ============================================
-- 2. TABLES
-- ============================================

-- Per-server MG configuration
CREATE TABLE IF NOT EXISTS server_mg_config (
  server_id    UUID PRIMARY KEY REFERENCES servers(id) ON DELETE CASCADE,
  capacity     SMALLINT NOT NULL DEFAULT 10 CHECK (capacity IN (10, 50)),
  assignment_mode mg_assignment_mode NOT NULL DEFAULT 'automatic',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- MG Events (one per server per cycle)
CREATE TABLE IF NOT EXISTS mg_events (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  server_id               UUID NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
  start_date              DATE NOT NULL,
  end_date                DATE NOT NULL,
  registration_open_at    DATE NOT NULL,
  registration_close_at   DATE NOT NULL,
  status                  mg_event_status NOT NULL DEFAULT 'upcoming',
  selection_published_at  TIMESTAMPTZ,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Registrations (one per user per event)
CREATE TABLE IF NOT EXISTS mg_registrations (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mg_event_id     UUID NOT NULL REFERENCES mg_events(id) ON DELETE CASCADE,
  user_id         UUID NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  registered_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_mg_registrations_event_user UNIQUE (mg_event_id, user_id)
);

-- Selections (one row per slot — selected players + FFA slots)
CREATE TABLE IF NOT EXISTS mg_selections (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mg_event_id     UUID NOT NULL REFERENCES mg_events(id) ON DELETE CASCADE,
  user_id         UUID REFERENCES user_profiles(id) ON DELETE SET NULL,
  rank            SMALLINT NOT NULL CHECK (rank >= 1),
  selection_type  mg_selection_type NOT NULL,
  selected_by     mg_selected_by NOT NULL
);

-- ============================================
-- 3. INDEXES (FK indexes + common filters)
-- ============================================

CREATE INDEX IF NOT EXISTS idx_mg_events_server_id ON mg_events(server_id);
CREATE INDEX IF NOT EXISTS idx_mg_events_status ON mg_events(status);
CREATE INDEX IF NOT EXISTS idx_mg_events_start_date ON mg_events(start_date);
CREATE INDEX IF NOT EXISTS idx_mg_registrations_mg_event_id ON mg_registrations(mg_event_id);
CREATE INDEX IF NOT EXISTS idx_mg_registrations_user_id ON mg_registrations(user_id);
CREATE INDEX IF NOT EXISTS idx_mg_selections_mg_event_id ON mg_selections(mg_event_id);
CREATE INDEX IF NOT EXISTS idx_mg_selections_user_id ON mg_selections(user_id);

-- ============================================
-- 4. UPDATED_AT TRIGGER (server_mg_config)
-- ============================================

CREATE OR REPLACE FUNCTION update_server_mg_config_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_server_mg_config_updated_at
  BEFORE UPDATE ON server_mg_config
  FOR EACH ROW EXECUTE FUNCTION update_server_mg_config_updated_at();

-- ============================================
-- 5. ROW LEVEL SECURITY
-- ============================================

ALTER TABLE server_mg_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE mg_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE mg_registrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE mg_selections ENABLE ROW LEVEL SECURITY;

-- ─── server_mg_config ─────────────────────────────────────────────────────

CREATE POLICY "Members can view their server MG config"
  ON server_mg_config FOR SELECT
  USING (
    is_super_admin((select auth.uid()))
    OR server_id = get_user_server_id((select auth.uid()))
  );

CREATE POLICY "Admins can manage their server MG config"
  ON server_mg_config FOR ALL
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

-- ─── mg_events ────────────────────────────────────────────────────────────

CREATE POLICY "Members can view their server MG events"
  ON mg_events FOR SELECT
  USING (
    is_super_admin((select auth.uid()))
    OR server_id = get_user_server_id((select auth.uid()))
  );

CREATE POLICY "Admins can manage MG events"
  ON mg_events FOR ALL
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

-- ─── mg_registrations ─────────────────────────────────────────────────────

CREATE POLICY "Members can view registrations for their server events"
  ON mg_registrations FOR SELECT
  USING (
    is_super_admin((select auth.uid()))
    OR mg_event_id IN (
      SELECT id FROM mg_events
      WHERE server_id = get_user_server_id((select auth.uid()))
    )
  );

CREATE POLICY "Members can register themselves"
  ON mg_registrations FOR INSERT
  WITH CHECK (
    user_id = (select auth.uid())
    AND mg_event_id IN (
      SELECT id FROM mg_events
      WHERE server_id = get_user_server_id((select auth.uid()))
        AND status = 'registration_open'
    )
  );

CREATE POLICY "Admins can insert registrations for their server"
  ON mg_registrations FOR INSERT
  WITH CHECK (
    (
      is_super_admin((select auth.uid()))
      OR is_user_admin((select auth.uid()))
    )
    AND mg_event_id IN (
      SELECT id FROM mg_events
      WHERE server_id = get_user_server_id((select auth.uid()))
    )
  );

CREATE POLICY "Members can delete their own registration"
  ON mg_registrations FOR DELETE
  USING (
    user_id = (select auth.uid())
    AND mg_event_id IN (
      SELECT id FROM mg_events
      WHERE server_id = get_user_server_id((select auth.uid()))
        AND status = 'registration_open'
    )
  );

CREATE POLICY "Admins can delete registrations for their server"
  ON mg_registrations FOR DELETE
  USING (
    is_super_admin((select auth.uid()))
    OR (
      is_user_admin((select auth.uid()))
      AND mg_event_id IN (
        SELECT id FROM mg_events
        WHERE server_id = get_user_server_id((select auth.uid()))
      )
    )
  );

-- ─── mg_selections ────────────────────────────────────────────────────────
-- SELECT: members can see selections only after publication; admins always

CREATE POLICY "Members can view published selections for their server"
  ON mg_selections FOR SELECT
  USING (
    is_super_admin((select auth.uid()))
    OR (
      is_user_admin((select auth.uid()))
      AND mg_event_id IN (
        SELECT id FROM mg_events
        WHERE server_id = get_user_server_id((select auth.uid()))
      )
    )
    OR mg_event_id IN (
      SELECT id FROM mg_events
      WHERE server_id = get_user_server_id((select auth.uid()))
        AND selection_published_at IS NOT NULL
    )
  );

CREATE POLICY "Admins can manage selections for their server"
  ON mg_selections FOR ALL
  USING (
    is_super_admin((select auth.uid()))
    OR (
      is_user_admin((select auth.uid()))
      AND mg_event_id IN (
        SELECT id FROM mg_events
        WHERE server_id = get_user_server_id((select auth.uid()))
      )
    )
  )
  WITH CHECK (
    is_super_admin((select auth.uid()))
    OR (
      is_user_admin((select auth.uid()))
      AND mg_event_id IN (
        SELECT id FROM mg_events
        WHERE server_id = get_user_server_id((select auth.uid()))
      )
    )
  );

-- ============================================
-- 6. pg_cron JOBS
-- ============================================

-- Job 1: Create MG events for servers where this Monday is D−7 (rest week Monday)
-- Runs every Monday at 00:00 UTC
-- Condition: the Monday is 7 days before a MG start_date
-- A "rest week Monday" satisfies: (monday_offset_from_reference / 7) % 2 = 1
-- where monday_offset = CURRENT_DATE - reference_start_date and reference_start_date is a known MG Monday.
-- We use 2026-01-05 as a known MG start Monday (odd week reference).
SELECT cron.schedule(
  'mg-create-events',
  '0 0 * * 1',
  $$
  DO $$
  DECLARE
    v_reference_date DATE := '2026-01-05'::DATE;
    v_current_monday DATE := date_trunc('week', CURRENT_DATE)::DATE;
    v_week_offset    INTEGER;
    v_mg_start       DATE;
    v_mg_end         DATE;
    v_reg_open       DATE;
    v_reg_close      DATE;
    v_server         RECORD;
  BEGIN
    v_week_offset := (v_current_monday - v_reference_date) / 7;

    -- Only proceed if current week is a rest week (odd offset = 1, 3, 5 …)
    -- A rest week Monday is D-7, so the MG starts the following Monday
    IF v_week_offset % 2 <> 1 THEN
      RETURN;
    END IF;

    v_mg_start   := v_current_monday + 7;
    v_mg_end     := v_mg_start + 6;
    v_reg_open   := v_current_monday;       -- D-7
    v_reg_close  := v_current_monday + 3;   -- D-4 (Thursday)

    FOR v_server IN SELECT id FROM public.servers LOOP
      INSERT INTO public.mg_events (
        server_id,
        start_date,
        end_date,
        registration_open_at,
        registration_close_at,
        status
      )
      VALUES (
        v_server.id,
        v_mg_start,
        v_mg_end,
        v_reg_open,
        v_reg_close,
        'registration_open'
      )
      ON CONFLICT DO NOTHING;
    END LOOP;
  END;
  $$;
  $$
);

-- Job 2: Close registrations — Thursday 23:59 UTC
SELECT cron.schedule(
  'mg-close-registrations',
  '59 23 * * 4',
  $$
  UPDATE public.mg_events
  SET status = 'registration_closed'
  WHERE status = 'registration_open'
    AND registration_close_at <= CURRENT_DATE;
  $$
);

-- Job 3: Start events — Monday 00:00 UTC (same window as create-events)
SELECT cron.schedule(
  'mg-start-events',
  '0 0 * * 1',
  $$
  UPDATE public.mg_events
  SET status = 'ongoing'
  WHERE status = 'selection_published'
    AND start_date = CURRENT_DATE;
  $$
);

-- Job 4: End events — Sunday 23:59 UTC
SELECT cron.schedule(
  'mg-end-events',
  '59 23 * * 0',
  $$
  UPDATE public.mg_events
  SET status = 'finished'
  WHERE status = 'ongoing'
    AND end_date = CURRENT_DATE;
  $$
);

-- ============================================
-- DONE
-- ============================================
