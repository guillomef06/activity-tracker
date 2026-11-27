-- ============================================
-- Rollback of migration 48 (e2e demo MG helpers)
-- ============================================
-- Removes the e2e_mg_* functions only. Data they created lives on the
-- reserved demo dates (2031-01-06, 2031-03-03, 2020-03-02) of ERA008-DEMO and
-- is left untouched; delete it first with the e2e cleanup if needed.
-- ============================================
DROP FUNCTION IF EXISTS public.e2e_mg_seed_event(date, mg_event_status, boolean);
DROP FUNCTION IF EXISTS public.e2e_mg_delete_event(date);
DROP FUNCTION IF EXISTS public.e2e_mg_set_status(date, mg_event_status);
DROP FUNCTION IF EXISTS public.e2e_mg_assert_reserved_date(date);
DROP FUNCTION IF EXISTS public.e2e_mg_assert_demo_admin();
