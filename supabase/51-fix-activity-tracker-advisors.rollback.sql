-- ============================================
-- Rollback for Migration 51
-- ============================================

DROP POLICY IF EXISTS "Admins can insert discord scheduled messages" ON public.discord_scheduled_messages;
DROP POLICY IF EXISTS "Admins can update discord scheduled messages" ON public.discord_scheduled_messages;
DROP POLICY IF EXISTS "Admins can delete discord scheduled messages" ON public.discord_scheduled_messages;

CREATE POLICY "Admins can manage discord scheduled messages"
  ON public.discord_scheduled_messages FOR ALL
  USING (
    (is_super_admin((select auth.uid())) OR is_user_admin((select auth.uid())))
    AND server_id = get_user_server_id((select auth.uid()))
  )
  WITH CHECK (
    (is_super_admin((select auth.uid())) OR is_user_admin((select auth.uid())))
    AND server_id = get_user_server_id((select auth.uid()))
    AND EXISTS (
      SELECT 1 FROM discord_webhooks dw
      WHERE dw.id = webhook_id AND dw.server_id = discord_scheduled_messages.server_id
    )
  );

DROP INDEX IF EXISTS public.idx_discord_scheduled_messages_created_by;

ALTER EXTENSION btree_gist SET SCHEMA public;

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$function$;
