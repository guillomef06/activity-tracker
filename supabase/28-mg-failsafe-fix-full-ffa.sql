-- ============================================
-- Migration 28: Fix MG failsafe — true full-FFA (empty selection)
-- ============================================
-- Corrects migration 27: a full-FFA event means no selection at all —
-- mg_selections stays empty and selection_published_at is set.
-- The UI detects (selection_published_at IS NOT NULL AND no selection rows) = full FFA.
-- ============================================

SELECT cron.unschedule('mg-start-events');

SELECT cron.schedule(
  'mg-start-events',
  '0 0 * * 1',
  $cron$
  DO $body$
  BEGIN
    -- Normal path: admins published a selection → just start
    UPDATE public.mg_events
    SET status = 'ongoing'
    WHERE status = 'selection_published'
      AND start_date = CURRENT_DATE;

    -- Failsafe path: admins didn't publish → full FFA (empty selection, open to all)
    UPDATE public.mg_events
    SET status = 'ongoing',
        selection_published_at = NOW()
    WHERE status = 'registration_closed'
      AND start_date = CURRENT_DATE;
  END;
  $body$;
  $cron$
);
