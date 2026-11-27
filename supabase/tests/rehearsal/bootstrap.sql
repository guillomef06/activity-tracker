-- =============================================================================
-- Rehearsal bootstrap: minimal, production-faithful schema, NO DATA.
-- Spec 003-mg-global-calendar, plan layer 4, quickstart Q1.
--
-- Captured read-only from production (project yeczvyyxchssftvnobdn) on 2026-11-25:
-- columns, constraints, indexes, enums, RLS policies, grants, helper functions,
-- the 5 cron jobs (verbatim texts) and the role-level settings.
--
-- FOR A DISPOSABLE LOCAL DATABASE ONLY (image public.ecr.aws/supabase/postgres).
-- NEVER run this on production. Run once, as role postgres, on an empty database:
--   docker exec -i at-mg-1b psql -U postgres -v ON_ERROR_STOP=1 < bootstrap.sql
--
-- Deliberate simplifications (not exercised by the migration 47 contracts):
--   * user_profiles triggers prevent_role_escalation / hash_recovery_answer are
--     omitted (they need the recovery machinery); fixtures set the recovery
--     columns directly. update_updated_at triggers are kept.
--   * invitation_tokens is production-shaped as of migration 49 rehearsal
--     (columns, FKs and the 4 RLS policies from 24-rename-alliance-to-server.sql);
--     it was a one-column stub before that.
--   * The `safeupdate` library is not preloaded by this image (see README).
--   * The Discord job text is verbatim but dispatch_discord_scheduled_messages()
--     does not exist here (the job would fail if it ran; it is only compared).
-- =============================================================================

\set ON_ERROR_STOP on

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS btree_gist WITH SCHEMA extensions;

-- ---------------------------------------------------------------------------
-- Enum types (production labels; mg_event_status WITHOUT 'cancelled')
-- ---------------------------------------------------------------------------
CREATE TYPE public.mg_assignment_mode AS ENUM ('automatic', 'manual');
CREATE TYPE public.mg_event_status AS ENUM
  ('upcoming', 'registration_open', 'registration_closed', 'selection_published', 'ongoing', 'finished');
CREATE TYPE public.mg_selected_by AS ENUM ('automatic', 'manual');
CREATE TYPE public.mg_selection_type AS ENUM ('selected', 'ffa', 'empty');

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------
-- server_id/created_by/used_by FKs are added after servers/user_profiles exist (circular FK).
CREATE TABLE public.invitation_tokens (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  server_id uuid,
  token text NOT NULL,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  used_by uuid,
  created_by uuid,
  created_at timestamptz DEFAULT now(),
  CONSTRAINT invitation_tokens_pkey PRIMARY KEY (id),
  CONSTRAINT invitation_tokens_token_key UNIQUE (token)
);

CREATE TABLE public.servers (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  name text NOT NULL,
  owner_id uuid,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  tag text,
  tiebreaker_activity_type text,
  scoring_weeks_multiplier int4 NOT NULL DEFAULT 1,
  discord_invite_url text,
  external_link_label text,
  external_link_url text,
  CONSTRAINT alliances_pkey PRIMARY KEY (id),
  CONSTRAINT alliances_name_key UNIQUE (name),
  CONSTRAINT alliances_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT alliances_discord_invite_url_check CHECK (((discord_invite_url IS NULL) OR (discord_invite_url ~ '^https://(discord\.gg|discord\.com\/invite)/[A-Za-z0-9_-]+$'::text))),
  CONSTRAINT alliances_scoring_weeks_multiplier_check CHECK ((scoring_weeks_multiplier = ANY (ARRAY[1, 2, 3]))),
  CONSTRAINT alliances_tag_check CHECK (((tag IS NULL) OR (char_length(tag) = 3))),
  CONSTRAINT chk_servers_external_link_both_or_neither CHECK ((((external_link_label IS NULL) AND (external_link_url IS NULL)) OR ((external_link_label IS NOT NULL) AND (external_link_url IS NOT NULL)))),
  CONSTRAINT chk_servers_external_link_label_length CHECK (((external_link_label IS NULL) OR (char_length(external_link_label) <= 50))),
  CONSTRAINT chk_servers_external_link_url_https CHECK (((external_link_url IS NULL) OR (external_link_url ~ '^https://'::text))),
  CONSTRAINT chk_servers_external_link_url_length CHECK (((external_link_url IS NULL) OR (char_length(external_link_url) <= 200)))
);
CREATE INDEX idx_alliances_owner_id ON public.servers USING btree (owner_id);

CREATE TABLE public.user_profiles (
  id uuid NOT NULL,
  server_id uuid,
  display_name text NOT NULL,
  username text NOT NULL,
  role text NOT NULL DEFAULT 'member'::text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  invitation_token_id uuid,
  preferences jsonb DEFAULT '{}'::jsonb,
  recovery_question_id int4 NOT NULL,
  recovery_answer_hash text NOT NULL,
  recovery_attempts int4 NOT NULL DEFAULT 0,
  recovery_locked_until timestamptz,
  CONSTRAINT user_profiles_pkey PRIMARY KEY (id),
  CONSTRAINT user_profiles_username_key UNIQUE (username),
  CONSTRAINT server_required_for_non_super_admin CHECK (((role = 'super_admin'::text) OR (server_id IS NOT NULL))),
  CONSTRAINT user_profiles_alliance_id_fkey FOREIGN KEY (server_id) REFERENCES public.servers(id) ON DELETE CASCADE,
  CONSTRAINT user_profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE,
  CONSTRAINT user_profiles_invitation_token_id_fkey FOREIGN KEY (invitation_token_id) REFERENCES public.invitation_tokens(id) ON DELETE SET NULL,
  CONSTRAINT user_profiles_role_check CHECK ((role = ANY (ARRAY['super_admin'::text, 'admin'::text, 'member'::text])))
);
CREATE INDEX idx_user_preferences ON public.user_profiles USING gin (preferences);
CREATE INDEX idx_user_profiles_invitation_token_id ON public.user_profiles USING btree (invitation_token_id);
CREATE INDEX idx_user_profiles_server_id ON public.user_profiles USING btree (server_id);

-- invitation_tokens: the 3 FKs deferred from its CREATE TABLE above (circular with servers/user_profiles).
ALTER TABLE public.invitation_tokens
  ADD CONSTRAINT invitation_tokens_alliance_id_fkey FOREIGN KEY (server_id) REFERENCES public.servers(id) ON DELETE CASCADE,
  ADD CONSTRAINT invitation_tokens_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  ADD CONSTRAINT invitation_tokens_used_by_fkey FOREIGN KEY (used_by) REFERENCES public.user_profiles(id) ON DELETE SET NULL;

CREATE TABLE public.server_mg_config (
  server_id uuid NOT NULL,
  capacity int2 NOT NULL DEFAULT 10,
  assignment_mode public.mg_assignment_mode NOT NULL DEFAULT 'automatic'::public.mg_assignment_mode,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  dkp_enabled bool NOT NULL DEFAULT false,
  CONSTRAINT server_mg_config_pkey PRIMARY KEY (server_id),
  CONSTRAINT server_mg_config_server_id_fkey FOREIGN KEY (server_id) REFERENCES public.servers(id) ON DELETE CASCADE,
  CONSTRAINT server_mg_config_capacity_check CHECK ((capacity = ANY (ARRAY[10, 50])))
);

CREATE TABLE public.server_mg_slot_config (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  server_id uuid NOT NULL,
  slot_order int2 NOT NULL,
  cost int2 NOT NULL,
  target_min int2 NOT NULL,
  target_max int2 NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT server_mg_slot_config_pkey PRIMARY KEY (id),
  CONSTRAINT server_mg_slot_config_server_id_fkey FOREIGN KEY (server_id) REFERENCES public.servers(id) ON DELETE CASCADE,
  CONSTRAINT uq_server_mg_slot_config_server_order UNIQUE (server_id, slot_order),
  CONSTRAINT server_mg_slot_config_check CHECK ((target_max >= target_min)),
  CONSTRAINT server_mg_slot_config_cost_check CHECK ((cost >= 0)),
  CONSTRAINT server_mg_slot_config_slot_order_check CHECK (((slot_order >= 1) AND (slot_order <= 10))),
  CONSTRAINT server_mg_slot_config_target_min_check CHECK ((target_min >= 0))
);

CREATE TABLE public.mg_events (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  server_id uuid NOT NULL,
  start_date date NOT NULL,
  end_date date NOT NULL,
  registration_open_at date NOT NULL,
  registration_close_at date NOT NULL,
  status public.mg_event_status NOT NULL DEFAULT 'upcoming'::public.mg_event_status,
  selection_published_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT mg_events_pkey PRIMARY KEY (id),
  CONSTRAINT mg_events_server_id_fkey FOREIGN KEY (server_id) REFERENCES public.servers(id) ON DELETE CASCADE
);
CREATE INDEX idx_mg_events_server_id ON public.mg_events USING btree (server_id);
CREATE INDEX idx_mg_events_start_date ON public.mg_events USING btree (start_date);
CREATE INDEX idx_mg_events_status ON public.mg_events USING btree (status);

CREATE TABLE public.mg_registrations (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  mg_event_id uuid NOT NULL,
  user_id uuid NOT NULL,
  registered_at timestamptz NOT NULL DEFAULT now(),
  desired_slot_order int2,
  comment text,
  CONSTRAINT mg_registrations_pkey PRIMARY KEY (id),
  CONSTRAINT mg_registrations_mg_event_id_fkey FOREIGN KEY (mg_event_id) REFERENCES public.mg_events(id) ON DELETE CASCADE,
  CONSTRAINT mg_registrations_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.user_profiles(id) ON DELETE CASCADE,
  CONSTRAINT uq_mg_registrations_event_user UNIQUE (mg_event_id, user_id),
  CONSTRAINT mg_registrations_comment_check CHECK (((comment IS NULL) OR (char_length(comment) <= 200))),
  CONSTRAINT mg_registrations_desired_slot_order_check CHECK (((desired_slot_order IS NULL) OR ((desired_slot_order >= 1) AND (desired_slot_order <= 10))))
);
CREATE INDEX idx_mg_registrations_mg_event_id ON public.mg_registrations USING btree (mg_event_id);
CREATE INDEX idx_mg_registrations_user_id ON public.mg_registrations USING btree (user_id);

CREATE TABLE public.mg_selections (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  mg_event_id uuid NOT NULL,
  user_id uuid,
  rank int2 NOT NULL,
  selection_type public.mg_selection_type NOT NULL,
  selected_by public.mg_selected_by NOT NULL,
  cost int2 NOT NULL DEFAULT 0,
  label text,
  approved_rank int2,
  approved_cost int2,
  CONSTRAINT mg_selections_pkey PRIMARY KEY (id),
  CONSTRAINT mg_selections_mg_event_id_fkey FOREIGN KEY (mg_event_id) REFERENCES public.mg_events(id) ON DELETE CASCADE,
  CONSTRAINT mg_selections_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  CONSTRAINT mg_selections_approved_cost_check CHECK (((approved_cost IS NULL) OR (approved_cost >= 0))),
  CONSTRAINT mg_selections_approved_rank_check CHECK (((approved_rank IS NULL) OR (approved_rank >= 1))),
  CONSTRAINT mg_selections_cost_check CHECK ((cost >= 0)),
  CONSTRAINT mg_selections_label_check CHECK (((label IS NULL) OR ((char_length(label) >= 1) AND (char_length(label) <= 60)))),
  CONSTRAINT mg_selections_rank_check CHECK ((rank >= 1))
);
CREATE INDEX idx_mg_selections_mg_event_id ON public.mg_selections USING btree (mg_event_id);
CREATE INDEX idx_mg_selections_user_id ON public.mg_selections USING btree (user_id);

-- ---------------------------------------------------------------------------
-- Helper functions (production definitions, research Part D; SECURITY DEFINER,
-- search_path = public, EXECUTE open to PUBLIC/anon/authenticated/service_role)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_super_admin(user_uuid uuid)
 RETURNS boolean
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT role = 'super_admin' FROM public.user_profiles WHERE id = user_uuid;
$function$;

CREATE OR REPLACE FUNCTION public.is_super_admin()
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM user_profiles
    WHERE id = auth.uid() AND role = 'super_admin'
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.is_user_admin(user_uuid uuid)
 RETURNS boolean
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT role IN ('admin', 'super_admin') FROM public.user_profiles WHERE id = user_uuid;
$function$;

CREATE OR REPLACE FUNCTION public.get_user_server_id(user_uuid uuid)
 RETURNS uuid
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT server_id FROM public.user_profiles WHERE id = user_uuid;
$function$;

-- Simplified stand-ins for helpers used only by non-MG policies/triggers.
CREATE OR REPLACE FUNCTION public.super_admin_exists()
 RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path TO 'public'
AS $function$ SELECT EXISTS (SELECT 1 FROM public.user_profiles WHERE role = 'super_admin'); $function$;

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
 RETURNS trigger LANGUAGE plpgsql
AS $function$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $function$;

CREATE OR REPLACE FUNCTION public.update_server_mg_config_updated_at()
 RETURNS trigger LANGUAGE plpgsql
AS $function$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $function$;

CREATE TRIGGER update_servers_updated_at BEFORE UPDATE ON public.servers
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_user_profiles_updated_at BEFORE UPDATE ON public.user_profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_server_mg_config_updated_at BEFORE UPDATE ON public.server_mg_config
  FOR EACH ROW EXECUTE FUNCTION update_server_mg_config_updated_at();
CREATE TRIGGER update_server_mg_slot_config_updated_at BEFORE UPDATE ON public.server_mg_slot_config
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ---------------------------------------------------------------------------
-- RLS + policies (production: roles = {public}, initPlan (SELECT auth.uid()) form)
-- ---------------------------------------------------------------------------
ALTER TABLE public.servers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invitation_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.server_mg_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.server_mg_slot_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mg_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mg_registrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mg_selections ENABLE ROW LEVEL SECURITY;

-- servers
CREATE POLICY "Admins can update their server" ON public.servers FOR UPDATE
  USING (is_super_admin(( SELECT auth.uid() AS uid)) OR ((id = get_user_server_id(( SELECT auth.uid() AS uid))) AND is_user_admin(( SELECT auth.uid() AS uid))));
CREATE POLICY "Anyone can create server during signup" ON public.servers FOR INSERT
  WITH CHECK (true);
CREATE POLICY "Super admins can delete servers" ON public.servers FOR DELETE
  USING (is_super_admin(( SELECT auth.uid() AS uid)));
CREATE POLICY "Users can view their own server" ON public.servers FOR SELECT
  USING (is_super_admin(( SELECT auth.uid() AS uid)) OR (id = get_user_server_id(( SELECT auth.uid() AS uid))) OR (owner_id = ( SELECT auth.uid() AS uid)));

-- user_profiles
CREATE POLICY "Super admins can delete user profiles" ON public.user_profiles FOR DELETE
  USING (is_super_admin(( SELECT auth.uid() AS uid)));
CREATE POLICY "Users can create their own profile" ON public.user_profiles FOR INSERT
  WITH CHECK ((id = ( SELECT auth.uid() AS uid)) AND ((role <> 'super_admin'::text) OR is_super_admin(( SELECT auth.uid() AS uid)) OR (NOT super_admin_exists())));
CREATE POLICY "Users can update their own profile" ON public.user_profiles FOR UPDATE
  USING (is_super_admin(( SELECT auth.uid() AS uid)) OR (id = ( SELECT auth.uid() AS uid)));
CREATE POLICY "Users can view profiles in their server" ON public.user_profiles FOR SELECT
  USING (is_super_admin(( SELECT auth.uid() AS uid)) OR (server_id = get_user_server_id(( SELECT auth.uid() AS uid))) OR (id = ( SELECT auth.uid() AS uid)));

-- invitation_tokens (production: 24-rename-alliance-to-server.sql, current state before migration 49)
CREATE POLICY "Admins can view their server invitations" ON public.invitation_tokens FOR SELECT
  USING (( SELECT auth.uid() AS uid) IS NULL OR is_super_admin(( SELECT auth.uid() AS uid)) OR (server_id = get_user_server_id(( SELECT auth.uid() AS uid))));
CREATE POLICY "Admins can create invitations" ON public.invitation_tokens FOR INSERT
  WITH CHECK (is_super_admin(( SELECT auth.uid() AS uid)) OR ((server_id = get_user_server_id(( SELECT auth.uid() AS uid))) AND is_user_admin(( SELECT auth.uid() AS uid))));
CREATE POLICY "Admins can update their server tokens" ON public.invitation_tokens FOR UPDATE
  USING (is_super_admin(( SELECT auth.uid() AS uid)) OR ((server_id = get_user_server_id(( SELECT auth.uid() AS uid))) AND is_user_admin(( SELECT auth.uid() AS uid))));
CREATE POLICY "Admins can delete their server invitations" ON public.invitation_tokens FOR DELETE
  USING (is_super_admin(( SELECT auth.uid() AS uid)) OR ((server_id = get_user_server_id(( SELECT auth.uid() AS uid))) AND is_user_admin(( SELECT auth.uid() AS uid))));

-- server_mg_config
CREATE POLICY "Admins can delete their server MG config" ON public.server_mg_config FOR DELETE
  USING (is_super_admin(( SELECT auth.uid() AS uid)) OR ((server_id = get_user_server_id(( SELECT auth.uid() AS uid))) AND is_user_admin(( SELECT auth.uid() AS uid))));
CREATE POLICY "Admins can insert their server MG config" ON public.server_mg_config FOR INSERT
  WITH CHECK (is_super_admin(( SELECT auth.uid() AS uid)) OR ((server_id = get_user_server_id(( SELECT auth.uid() AS uid))) AND is_user_admin(( SELECT auth.uid() AS uid))));
CREATE POLICY "Admins can update their server MG config" ON public.server_mg_config FOR UPDATE
  USING (is_super_admin(( SELECT auth.uid() AS uid)) OR ((server_id = get_user_server_id(( SELECT auth.uid() AS uid))) AND is_user_admin(( SELECT auth.uid() AS uid))))
  WITH CHECK (is_super_admin(( SELECT auth.uid() AS uid)) OR ((server_id = get_user_server_id(( SELECT auth.uid() AS uid))) AND is_user_admin(( SELECT auth.uid() AS uid))));
CREATE POLICY "Members can view their server MG config" ON public.server_mg_config FOR SELECT
  USING (is_super_admin(( SELECT auth.uid() AS uid)) OR (server_id = get_user_server_id(( SELECT auth.uid() AS uid))));

-- server_mg_slot_config (production policy names are truncated at 63 chars by Postgres)
CREATE POLICY "Admins can delete their server MG slot config" ON public.server_mg_slot_config FOR DELETE
  USING (is_super_admin(( SELECT auth.uid() AS uid)) OR ((server_id = get_user_server_id(( SELECT auth.uid() AS uid))) AND is_user_admin(( SELECT auth.uid() AS uid))));
CREATE POLICY "Admins can insert their server MG slot config" ON public.server_mg_slot_config FOR INSERT
  WITH CHECK (is_super_admin(( SELECT auth.uid() AS uid)) OR ((server_id = get_user_server_id(( SELECT auth.uid() AS uid))) AND is_user_admin(( SELECT auth.uid() AS uid))));
CREATE POLICY "Admins can update their server MG slot config" ON public.server_mg_slot_config FOR UPDATE
  USING (is_super_admin(( SELECT auth.uid() AS uid)) OR ((server_id = get_user_server_id(( SELECT auth.uid() AS uid))) AND is_user_admin(( SELECT auth.uid() AS uid))))
  WITH CHECK (is_super_admin(( SELECT auth.uid() AS uid)) OR ((server_id = get_user_server_id(( SELECT auth.uid() AS uid))) AND is_user_admin(( SELECT auth.uid() AS uid))));
CREATE POLICY "Members can view their server MG slot config" ON public.server_mg_slot_config FOR SELECT
  USING (is_super_admin(( SELECT auth.uid() AS uid)) OR (server_id = get_user_server_id(( SELECT auth.uid() AS uid))));

-- mg_events (INSERT and DELETE are the policies migration 47 must drop)
CREATE POLICY "Admins can delete MG events" ON public.mg_events FOR DELETE
  USING (is_super_admin(( SELECT auth.uid() AS uid)) OR ((server_id = get_user_server_id(( SELECT auth.uid() AS uid))) AND is_user_admin(( SELECT auth.uid() AS uid))));
CREATE POLICY "Admins can insert MG events" ON public.mg_events FOR INSERT
  WITH CHECK (is_super_admin(( SELECT auth.uid() AS uid)) OR ((server_id = get_user_server_id(( SELECT auth.uid() AS uid))) AND is_user_admin(( SELECT auth.uid() AS uid))));
CREATE POLICY "Admins can update MG events" ON public.mg_events FOR UPDATE
  USING (is_super_admin(( SELECT auth.uid() AS uid)) OR ((server_id = get_user_server_id(( SELECT auth.uid() AS uid))) AND is_user_admin(( SELECT auth.uid() AS uid))))
  WITH CHECK (is_super_admin(( SELECT auth.uid() AS uid)) OR ((server_id = get_user_server_id(( SELECT auth.uid() AS uid))) AND is_user_admin(( SELECT auth.uid() AS uid))));
CREATE POLICY "Members can view their server MG events" ON public.mg_events FOR SELECT
  USING (is_super_admin(( SELECT auth.uid() AS uid)) OR (server_id = get_user_server_id(( SELECT auth.uid() AS uid))));

-- mg_registrations
CREATE POLICY "Admins or members can delete registrations" ON public.mg_registrations FOR DELETE
  USING (is_super_admin(( SELECT auth.uid() AS uid)) OR (is_user_admin(( SELECT auth.uid() AS uid)) AND (mg_event_id IN ( SELECT mg_events.id FROM mg_events WHERE (mg_events.server_id = get_user_server_id(( SELECT auth.uid() AS uid)))))) OR ((user_id = ( SELECT auth.uid() AS uid)) AND (mg_event_id IN ( SELECT mg_events.id FROM mg_events WHERE ((mg_events.server_id = get_user_server_id(( SELECT auth.uid() AS uid))) AND (mg_events.status = 'registration_open'::mg_event_status))))));
CREATE POLICY "Admins or members can insert registrations" ON public.mg_registrations FOR INSERT
  WITH CHECK (((is_super_admin(( SELECT auth.uid() AS uid)) OR is_user_admin(( SELECT auth.uid() AS uid))) AND (mg_event_id IN ( SELECT mg_events.id FROM mg_events WHERE (mg_events.server_id = get_user_server_id(( SELECT auth.uid() AS uid)))))) OR ((user_id = ( SELECT auth.uid() AS uid)) AND (mg_event_id IN ( SELECT mg_events.id FROM mg_events WHERE ((mg_events.server_id = get_user_server_id(( SELECT auth.uid() AS uid))) AND (mg_events.status = 'registration_open'::mg_event_status))))));
CREATE POLICY "Members can view registrations for their server" ON public.mg_registrations FOR SELECT
  USING (is_super_admin(( SELECT auth.uid() AS uid)) OR (mg_event_id IN ( SELECT mg_events.id FROM mg_events WHERE (mg_events.server_id = get_user_server_id(( SELECT auth.uid() AS uid))))));

-- mg_selections
CREATE POLICY "Admins can delete selections for their server" ON public.mg_selections FOR DELETE
  USING (is_super_admin(( SELECT auth.uid() AS uid)) OR (is_user_admin(( SELECT auth.uid() AS uid)) AND (mg_event_id IN ( SELECT mg_events.id FROM mg_events WHERE (mg_events.server_id = get_user_server_id(( SELECT auth.uid() AS uid)))))));
CREATE POLICY "Admins can insert selections for their server" ON public.mg_selections FOR INSERT
  WITH CHECK (is_super_admin(( SELECT auth.uid() AS uid)) OR (is_user_admin(( SELECT auth.uid() AS uid)) AND (mg_event_id IN ( SELECT mg_events.id FROM mg_events WHERE (mg_events.server_id = get_user_server_id(( SELECT auth.uid() AS uid)))))));
CREATE POLICY "Admins can update selections for their server" ON public.mg_selections FOR UPDATE
  USING (is_super_admin(( SELECT auth.uid() AS uid)) OR (is_user_admin(( SELECT auth.uid() AS uid)) AND (mg_event_id IN ( SELECT mg_events.id FROM mg_events WHERE (mg_events.server_id = get_user_server_id(( SELECT auth.uid() AS uid)))))))
  WITH CHECK (is_super_admin(( SELECT auth.uid() AS uid)) OR (is_user_admin(( SELECT auth.uid() AS uid)) AND (mg_event_id IN ( SELECT mg_events.id FROM mg_events WHERE (mg_events.server_id = get_user_server_id(( SELECT auth.uid() AS uid)))))));
CREATE POLICY "Members can view published selections for their server" ON public.mg_selections FOR SELECT
  USING (is_super_admin(( SELECT auth.uid() AS uid)) OR (is_user_admin(( SELECT auth.uid() AS uid)) AND (mg_event_id IN ( SELECT mg_events.id FROM mg_events WHERE (mg_events.server_id = get_user_server_id(( SELECT auth.uid() AS uid)))))) OR (mg_event_id IN ( SELECT mg_events.id FROM mg_events WHERE ((mg_events.server_id = get_user_server_id(( SELECT auth.uid() AS uid))) AND (mg_events.selection_published_at IS NOT NULL)))));

-- ---------------------------------------------------------------------------
-- Grants: production gives anon/authenticated/service_role every table
-- privilege (Supabase default privileges). Stated explicitly for fidelity.
-- ---------------------------------------------------------------------------
GRANT ALL ON TABLE public.servers, public.user_profiles, public.server_mg_config,
  public.server_mg_slot_config, public.mg_events, public.mg_registrations,
  public.mg_selections, public.invitation_tokens TO anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Role-level settings captured from production (pg_db_role_setting).
-- authenticator also has session_preload_libraries = 'supautils, safeupdate'
-- in production; the image used for the rehearsal does not ship safeupdate.
-- postgres has NO statement/lock timeout in production: the SQL editor limits
-- come from the connection role, emulate them per session with
--   SET statement_timeout = '8s'; SET lock_timeout = '8s';
-- ---------------------------------------------------------------------------
ALTER ROLE authenticated SET statement_timeout = '8s';
ALTER ROLE anon SET statement_timeout = '3s';
ALTER ROLE authenticator SET statement_timeout = '8s';
ALTER ROLE authenticator SET lock_timeout = '8s';

-- ---------------------------------------------------------------------------
-- The 5 production cron jobs, command texts VERBATIM (leading newline and
-- indentation included; the outer $cmd$ tag is only a carrier, the texts
-- themselves use $inner$ / $body$). Production jobids are 1,2,4,6,7 (3 and 5
-- are gaps); here ids are assigned in this order, so they may differ: tests
-- compare names, schedules and command texts, never jobids.
-- ---------------------------------------------------------------------------
SELECT cron.schedule('mg-create-events', '0 0 * * 1', $cmd$
  DO $inner$
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
    IF v_week_offset % 2 <> 1 THEN
      RETURN;
    END IF;
    v_mg_start   := v_current_monday + 7;
    v_mg_end     := v_mg_start + 6;
    v_reg_open   := v_current_monday;
    v_reg_close  := v_current_monday + 3;
    FOR v_server IN SELECT id FROM public.servers LOOP
      INSERT INTO public.mg_events (server_id, start_date, end_date, registration_open_at, registration_close_at, status)
      VALUES (v_server.id, v_mg_start, v_mg_end, v_reg_open, v_reg_close, 'registration_open')
      ON CONFLICT DO NOTHING;
    END LOOP;
  END;
  $inner$;
  $cmd$);

SELECT cron.schedule('mg-close-registrations', '59 23 * * 4', $cmd$
  UPDATE public.mg_events
  SET status = 'registration_closed'
  WHERE status = 'registration_open'
    AND registration_close_at <= CURRENT_DATE;
  $cmd$);

SELECT cron.schedule('mg-end-events', '59 23 * * 0', $cmd$
  UPDATE public.mg_events
  SET status = 'finished'
  WHERE status = 'ongoing'
    AND end_date = CURRENT_DATE;
  $cmd$);

SELECT cron.schedule('mg-start-events', '0 0 * * 1', $cmd$
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
  $cmd$);

SELECT cron.schedule('discord-scheduled-messages-dispatch', '0 * * * *', $cmd$ SELECT dispatch_discord_scheduled_messages(); $cmd$);
