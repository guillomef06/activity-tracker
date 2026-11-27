-- ============================================
-- Migration 51: Fix activity-tracker advisor findings (safe subset)
-- ============================================
-- Scope: ONLY activity-tracker findings. This Supabase project also hosts an
-- unrelated "AoEM dashboard" app (tables dashboard_access / events / event_data /
-- event_map_state / server_rosters, roles strategist/developer) that is not in
-- this repo — its advisor findings (all 14 auth_rls_initplan, the no_primary_key,
-- 3 of the 4 unindexed_foreign_keys, can_edit_live_state / is_dashboard_developer)
-- are deliberately left untouched here: no visibility into its consumers.
--
-- Deliberately NOT included (documented, not fixed):
--   - get_user_server_id / is_super_admin / is_user_admin remain callable by
--     anon. They are RLS helpers referenced by dozens of policies across every
--     table; authenticated MUST keep EXECUTE (migration 38's exact reasoning —
--     RLS expressions run as the querying role) and several policies are
--     {public} (not `TO authenticated`), so anon can hit them too. The real fix
--     (move to a non-PostgREST-exposed schema) touches too much to rush in this
--     pass; left as a documented limitation.
--   - check_username_available / get_recovery_question /
--     reset_password_with_recovery / validate_invitation_token callable by anon:
--     intentional (signup / forgot-password / invitation flows are pre-login).
--   - 10 "unused index" findings: not touched — low traffic is not proof of
--     dead code, and dropping a real index is harder to notice than keeping an
--     unnecessary one.
--   - Leaked-password protection: an Auth dashboard toggle, not a migration.
-- ============================================

-- ============================================
-- 1. set_updated_at: fix mutable search_path (migration 23, guides)
-- ============================================
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $function$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$function$;

-- ============================================
-- 2. btree_gist out of public (postgres role's search_path already includes
--    `extensions`, confirmed in prod; the existing exclusion constraint on
--    calendar_entries resolves via already-bound catalog references, unaffected
--    by the move).
--    pg_net is NOT moved: `ALTER EXTENSION pg_net SET SCHEMA ...` fails with
--    "extension does not support SET SCHEMA" (0A000) — pg_net ships
--    non-relocatable (its background worker/queue are fixed to the schema it
--    was created in), a known constraint of the extension itself, not
--    something this migration can work around. The advisor finding for pg_net
--    stays open; its functions already live in their own `net` schema either
--    way, so the actual blast radius of leaving it in `public` is minimal.
-- ============================================
ALTER EXTENSION btree_gist SET SCHEMA extensions;

-- ============================================
-- 3. discord_scheduled_messages: missing FK index
-- ============================================
CREATE INDEX IF NOT EXISTS idx_discord_scheduled_messages_created_by
  ON public.discord_scheduled_messages(created_by);

-- ============================================
-- 4. discord_scheduled_messages: split the FOR ALL admin policy into
--    INSERT/UPDATE/DELETE (same exact conditions) so SELECT is only ever
--    evaluated once, via the existing "Members can read" policy. FOR ALL is
--    pure Postgres shorthand for SELECT+INSERT+UPDATE+DELETE with the same
--    expression, so this is not a behavior change (migration 39's conditions
--    reproduced verbatim).
-- ============================================
DROP POLICY IF EXISTS "Admins can manage discord scheduled messages" ON public.discord_scheduled_messages;

CREATE POLICY "Admins can insert discord scheduled messages"
  ON public.discord_scheduled_messages FOR INSERT
  WITH CHECK (
    (is_super_admin((select auth.uid())) OR is_user_admin((select auth.uid())))
    AND server_id = get_user_server_id((select auth.uid()))
    AND EXISTS (
      SELECT 1 FROM discord_webhooks dw
      WHERE dw.id = webhook_id AND dw.server_id = discord_scheduled_messages.server_id
    )
  );

CREATE POLICY "Admins can update discord scheduled messages"
  ON public.discord_scheduled_messages FOR UPDATE
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

CREATE POLICY "Admins can delete discord scheduled messages"
  ON public.discord_scheduled_messages FOR DELETE
  USING (
    (is_super_admin((select auth.uid())) OR is_user_admin((select auth.uid())))
    AND server_id = get_user_server_id((select auth.uid()))
  );

-- ============================================
-- DONE
-- ============================================
