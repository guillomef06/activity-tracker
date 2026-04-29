-- ============================================
-- Migration 27: MG failsafe — auto full-FFA if admins miss the publish deadline
-- ============================================
-- If Monday arrives and an event is still 'registration_closed' (admins didn't
-- publish a selection), all registered players are inserted as FFA slots,
-- the selection is auto-published, and the event starts normally.
-- ============================================

SELECT cron.unschedule('mg-start-events');

SELECT cron.schedule(
  'mg-start-events',
  '0 0 * * 1',
  $cron$
  DO $body$
  DECLARE
    v_event RECORD;
    v_reg   RECORD;
    v_rank  SMALLINT;
  BEGIN
    -- Normal path: selection already published by admins → just start
    UPDATE public.mg_events
    SET status = 'ongoing'
    WHERE status = 'selection_published'
      AND start_date = CURRENT_DATE;

    -- Failsafe path: admins didn't publish → auto full-FFA
    FOR v_event IN
      SELECT id FROM public.mg_events
      WHERE status = 'registration_closed'
        AND start_date = CURRENT_DATE
    LOOP
      v_rank := 1;

      FOR v_reg IN
        SELECT user_id FROM public.mg_registrations
        WHERE mg_event_id = v_event.id
        ORDER BY registered_at
      LOOP
        INSERT INTO public.mg_selections (mg_event_id, user_id, rank, selection_type, selected_by)
        VALUES (v_event.id, v_reg.user_id, v_rank, 'ffa', 'automatic');
        v_rank := v_rank + 1;
      END LOOP;

      UPDATE public.mg_events
      SET status = 'ongoing',
          selection_published_at = NOW()
      WHERE id = v_event.id;
    END LOOP;
  END;
  $body$;
  $cron$
);
