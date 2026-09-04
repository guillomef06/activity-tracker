-- ============================================
-- Migration 39: Discord Scheduled Messages
-- ============================================
-- Spec:     SPEC_DISCORD_SCHEDULED_MESSAGES.md (repo root)
-- Tables:   discord_scheduled_messages
-- RLS:      SELECT for members; ALL for admins/super-admins (mirrors
--           14-discord-webhooks.sql, updated to the post-rename server_id
--           column/get_user_server_id() pattern from 24-rename-alliance-to-server.sql)
-- Trigger:  reuses update_updated_at_column(), already defined in
--           01-initial-schema.sql (see 33-mg-slot-config.sql / 31-season-schedule.sql
--           for the same reuse pattern)
-- pg_cron:  1 hourly job — dispatch_discord_scheduled_messages(), a
--           SECURITY DEFINER function that fires net.http_post() to the
--           linked webhook for each schedule matching the current UTC hour
-- ============================================
-- Prerequisite: pg_net must be enabled on the Supabase project (this is the
-- first migration in this repo to use it). If `net.http_post` is not found
-- when this migration runs, that is a project configuration issue (the
-- extension not being enabled/exposed) — flag it, do not work around it
-- with a different HTTP mechanism.
-- ============================================

-- ============================================
-- 1. EXTENSION
-- ============================================

CREATE EXTENSION IF NOT EXISTS pg_net;

-- ============================================
-- 1b. SSRF GUARD ON discord_webhooks.webhook_url
-- ============================================
-- discord_webhooks.webhook_url (14-discord-webhooks.sql) had no DB-level
-- format constraint, only client-side Angular validation. dispatch_discord_
-- scheduled_messages() below now calls net.http_post(url := webhook_url, ...)
-- automatically every hour, forever, as SECURITY DEFINER — turning that gap
-- into a real SSRF primitive (a compromised/malicious admin could point a
-- webhook at an internal/metadata address and have the DB server hit it
-- hourly, unattended). Constrain at the table level as layer 1; the dispatch
-- function re-asserts the same check in its WHERE clause as layer 2 (see
-- section 6) so the function never trusts the constraint alone.
ALTER TABLE discord_webhooks
  ADD CONSTRAINT chk_discord_webhooks_url_format
  CHECK (
    webhook_url LIKE 'https://discord.com/api/webhooks/%'
    OR webhook_url LIKE 'https://discordapp.com/api/webhooks/%'
  );

-- ============================================
-- 2. TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS discord_scheduled_messages (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  server_id      UUID NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
  webhook_id     UUID NOT NULL REFERENCES discord_webhooks(id) ON DELETE CASCADE,
  message        TEXT NOT NULL CHECK (char_length(message) <= 2000),
  frequency      TEXT NOT NULL CHECK (frequency IN ('daily', 'weekly', 'monthly')),
  days_of_week   SMALLINT[],
  day_of_month   SMALLINT,
  hour_utc       SMALLINT NOT NULL CHECK (hour_utc BETWEEN 0 AND 23),
  is_active      BOOLEAN NOT NULL DEFAULT true,
  created_by     UUID NOT NULL REFERENCES user_profiles(id),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_discord_scheduled_messages_frequency_fields CHECK (
    (
      frequency = 'daily'
      AND days_of_week IS NULL
      AND day_of_month IS NULL
    ) OR (
      frequency = 'weekly'
      AND days_of_week IS NOT NULL
      AND array_length(days_of_week, 1) > 0
      AND days_of_week <@ ARRAY[1, 2, 3, 4, 5, 6, 7]::smallint[]
      AND day_of_month IS NULL
    ) OR (
      frequency = 'monthly'
      AND day_of_month BETWEEN 1 AND 28
      AND days_of_week IS NULL
    )
  )
);

-- ============================================
-- 3. INDEXES (FK indexes — every FK must be indexed per this repo's DB standards)
-- ============================================

CREATE INDEX IF NOT EXISTS idx_discord_scheduled_messages_server_id
  ON discord_scheduled_messages(server_id);

CREATE INDEX IF NOT EXISTS idx_discord_scheduled_messages_webhook_id
  ON discord_scheduled_messages(webhook_id);

-- ============================================
-- 4. UPDATED_AT TRIGGER (reuses update_updated_at_column())
-- ============================================

CREATE TRIGGER update_discord_scheduled_messages_updated_at
  BEFORE UPDATE ON discord_scheduled_messages
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- 5. ROW LEVEL SECURITY
-- ============================================

ALTER TABLE discord_scheduled_messages ENABLE ROW LEVEL SECURITY;

-- Members can read their server's scheduled messages
CREATE POLICY "Members can read discord scheduled messages"
  ON discord_scheduled_messages FOR SELECT
  USING (
    server_id = get_user_server_id((select auth.uid()))
  );

-- Admins and super admins can manage scheduled messages for their server
CREATE POLICY "Admins can manage discord scheduled messages"
  ON discord_scheduled_messages FOR ALL
  USING (
    (is_super_admin((select auth.uid())) OR is_user_admin((select auth.uid())))
    AND server_id = get_user_server_id((select auth.uid()))
  )
  WITH CHECK (
    (is_super_admin((select auth.uid())) OR is_user_admin((select auth.uid())))
    AND server_id = get_user_server_id((select auth.uid()))
    -- webhook_id is a plain FK to discord_webhooks(id) — without this check
    -- an admin of server A could point a schedule at server B's webhook,
    -- since the FK alone accepts any existing webhook row regardless of owner.
    AND EXISTS (
      SELECT 1 FROM discord_webhooks dw
      WHERE dw.id = webhook_id AND dw.server_id = discord_scheduled_messages.server_id
    )
  );

-- ============================================
-- 6. DISPATCH FUNCTION (SECURITY DEFINER — pg_cron only, never a client RPC)
-- ============================================
-- Matching predicate is verbatim from SPEC_DISCORD_SCHEDULED_MESSAGES.md:
-- idempotent by construction (hourly job, each schedule matches at most one
-- hour per day), no queue table, no Edge Function.

CREATE OR REPLACE FUNCTION dispatch_discord_scheduled_messages()
RETURNS void AS $$
DECLARE
  v_schedule RECORD;
BEGIN
  FOR v_schedule IN
    SELECT
      sm.message,
      dw.webhook_url
    FROM public.discord_scheduled_messages sm
    JOIN public.discord_webhooks dw ON dw.id = sm.webhook_id
    WHERE sm.is_active
      -- Layer 2 of the SSRF guard: never trust the discord_webhooks table
      -- constraint alone — re-assert the same host allowlist directly in the
      -- query that actually fires the network call.
      AND (
        dw.webhook_url LIKE 'https://discord.com/api/webhooks/%'
        OR dw.webhook_url LIKE 'https://discordapp.com/api/webhooks/%'
      )
      AND sm.hour_utc = EXTRACT(HOUR FROM now())::smallint
      AND (
        sm.frequency = 'daily'
        OR (sm.frequency = 'weekly' AND EXTRACT(ISODOW FROM now())::smallint = ANY(sm.days_of_week))
        OR (sm.frequency = 'monthly' AND sm.day_of_month = EXTRACT(DAY FROM now())::smallint)
      )
  LOOP
    PERFORM net.http_post(
      url := v_schedule.webhook_url,
      body := jsonb_build_object('content', v_schedule.message),
      headers := jsonb_build_object('Content-Type', 'application/json')
    );
  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Never callable as a client RPC — only invoked by pg_cron as the postgres
-- role. Revoke immediately rather than relying on a later cleanup migration
-- (this exact class of gap is what 34/37/38 had to fix retroactively).
REVOKE EXECUTE ON FUNCTION dispatch_discord_scheduled_messages() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION dispatch_discord_scheduled_messages() FROM anon, authenticated;

-- ============================================
-- 7. pg_cron JOB
-- ============================================

SELECT cron.schedule(
  'discord-scheduled-messages-dispatch',
  '0 * * * *',
  $$ SELECT dispatch_discord_scheduled_messages(); $$
);

-- ============================================
-- DONE
-- ============================================

-- ============================================
-- ROLLBACK (not executed — for reference only)
-- ============================================
-- SELECT cron.unschedule('discord-scheduled-messages-dispatch');
-- DROP FUNCTION IF EXISTS dispatch_discord_scheduled_messages();
-- DROP POLICY IF EXISTS "Admins can manage discord scheduled messages" ON discord_scheduled_messages;
-- DROP POLICY IF EXISTS "Members can read discord scheduled messages" ON discord_scheduled_messages;
-- DROP TRIGGER IF EXISTS update_discord_scheduled_messages_updated_at ON discord_scheduled_messages;
-- DROP INDEX IF EXISTS idx_discord_scheduled_messages_webhook_id;
-- DROP INDEX IF EXISTS idx_discord_scheduled_messages_server_id;
-- DROP TABLE IF EXISTS discord_scheduled_messages;
-- ALTER TABLE discord_webhooks DROP CONSTRAINT IF EXISTS chk_discord_webhooks_url_format;
-- DROP EXTENSION IF EXISTS pg_net;
