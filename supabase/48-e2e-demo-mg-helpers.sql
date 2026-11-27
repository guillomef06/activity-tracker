-- ============================================
-- Migration 48: e2e helper functions for the MG demo server (decision PO-2 = B)
-- ============================================
-- Purpose:  Migration 47 removes INSERT/DELETE on mg_events from clients and
--           restricts client UPDATEs to registration_closed -> selection_published.
--           The Playwright seeder (e2e/helpers/mg-seed.ts) still has to create,
--           delete and close events on the demo server. These SECURITY DEFINER
--           functions do it, bounded server-side:
--             - the server is resolved INSIDE the functions from its name
--               ('ERA008-DEMO', UNIQUE); no parameter can target another server;
--             - only the reserved Mondays below are accepted;
--             - the caller must be an admin / super_admin whose profile belongs
--               to that server (E2E_FORBIDDEN / 42501 otherwise).
--           They run as postgres, so the mg_events_guard trigger of 47
--           (current_user IN ('authenticated','anon') only) does not apply.
--
-- Apply:    AFTER migration 47 (refuses to run otherwise). Removable with
--           48-e2e-demo-mg-helpers.rollback.sql.
-- Contract: specs/003-mg-global-calendar/contracts/internal-functions.md, section 6.
-- ============================================

-- ============================================
-- 0. GUARD: migration 47 must be applied
-- ============================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'mg_event_status' AND e.enumlabel = 'cancelled'
  ) OR NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'mg_events' AND column_name = 'calendar_entry_id'
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid = 'public.mg_events'::regclass AND tgname = 'trg_mg_events_guard' AND NOT tgisinternal
  ) OR has_table_privilege('authenticated', 'public.mg_events', 'INSERT') THEN
    RAISE EXCEPTION 'Migration 47 (global MG calendar) is not applied; refusing to install the e2e helpers.';
  END IF;
END
$$;

-- ============================================
-- 1. PRIVATE HELPERS (no client can call them)
-- ============================================

-- Returns the demo server id when the caller is an admin of ERA008-DEMO.
CREATE OR REPLACE FUNCTION public.e2e_mg_assert_demo_admin()
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_demo_server_id uuid;
BEGIN
  SELECT s.id INTO v_demo_server_id
  FROM servers s
  JOIN user_profiles p ON p.server_id = s.id
  WHERE s.name = 'ERA008-DEMO'
    AND auth.uid() IS NOT NULL
    AND p.id = auth.uid()
    AND p.role IN ('admin', 'super_admin');

  IF v_demo_server_id IS NULL THEN
    RAISE EXCEPTION 'E2E_FORBIDDEN' USING ERRCODE = '42501';
  END IF;
  RETURN v_demo_server_id;
END;
$$;

-- Only these Mondays may be touched (far future / far past: never a real event).
CREATE OR REPLACE FUNCTION public.e2e_mg_assert_reserved_date(p_start_date date)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF p_start_date IS NULL
     OR p_start_date NOT IN (DATE '2031-01-06', DATE '2031-03-03', DATE '2020-03-02') THEN
    RAISE EXCEPTION 'E2E_FORBIDDEN' USING ERRCODE = '42501';
  END IF;
END;
$$;

-- ============================================
-- 2. PUBLIC E2E FUNCTIONS
-- ============================================

CREATE OR REPLACE FUNCTION public.e2e_mg_seed_event(
  p_start_date date,
  p_status mg_event_status,
  p_published boolean DEFAULT false
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_server_id uuid := public.e2e_mg_assert_demo_admin();
  v_event_id  uuid;
BEGIN
  PERFORM public.e2e_mg_assert_reserved_date(p_start_date);
  IF p_status IS NULL OR p_status::text NOT IN
     ('registration_open', 'registration_closed', 'finished', 'cancelled') THEN
    RAISE EXCEPTION 'E2E_FORBIDDEN' USING ERRCODE = '42501';
  END IF;

  DELETE FROM mg_events WHERE server_id = v_server_id AND start_date = p_start_date;

  INSERT INTO mg_events (
    server_id, start_date, end_date, registration_open_at, registration_close_at,
    status, selection_published_at, calendar_entry_id
  ) VALUES (
    v_server_id, p_start_date, p_start_date + 6, p_start_date - 7, p_start_date - 4,
    p_status, CASE WHEN COALESCE(p_published, false) THEN now() END, NULL
  )
  RETURNING id INTO v_event_id;
  RETURN v_event_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.e2e_mg_delete_event(p_start_date date)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_server_id uuid := public.e2e_mg_assert_demo_admin();
BEGIN
  PERFORM public.e2e_mg_assert_reserved_date(p_start_date);
  DELETE FROM mg_events WHERE server_id = v_server_id AND start_date = p_start_date;
END;
$$;

-- Only registration_open -> registration_closed (what the Thursday cron does).
CREATE OR REPLACE FUNCTION public.e2e_mg_set_status(p_start_date date, p_status mg_event_status)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_server_id uuid := public.e2e_mg_assert_demo_admin();
  v_updated   integer;
BEGIN
  PERFORM public.e2e_mg_assert_reserved_date(p_start_date);
  IF p_status IS DISTINCT FROM 'registration_closed'::mg_event_status THEN
    RAISE EXCEPTION 'E2E_FORBIDDEN' USING ERRCODE = '42501';
  END IF;

  UPDATE mg_events SET status = 'registration_closed'
  WHERE server_id = v_server_id AND start_date = p_start_date AND status = 'registration_open';
  GET DIAGNOSTICS v_updated = ROW_COUNT;

  IF v_updated = 0 THEN
    RAISE EXCEPTION 'E2E_NO_OPEN_EVENT' USING ERRCODE = 'P0002';
  END IF;
END;
$$;

-- ============================================
-- 3. PRIVILEGES
-- ============================================
REVOKE ALL ON FUNCTION public.e2e_mg_assert_demo_admin() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.e2e_mg_assert_reserved_date(date) FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.e2e_mg_seed_event(date, mg_event_status, boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.e2e_mg_delete_event(date) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.e2e_mg_set_status(date, mg_event_status) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.e2e_mg_seed_event(date, mg_event_status, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.e2e_mg_delete_event(date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.e2e_mg_set_status(date, mg_event_status) TO authenticated;
