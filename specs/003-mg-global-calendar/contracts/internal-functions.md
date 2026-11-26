# Contract: internal SQL functions, triggers, cron, e2e helpers

**Spec**: FR-014, FR-017, FR-030, FR-031 | **Research**: D-05, D-06, D-07, D-09, D-12, D-18

## 1. `mg_create_events_for_entry(p_entry_id uuid, p_server_id uuid DEFAULT NULL) RETURNS integer`

Internal. Creates the events of one calendar entry; returns the number of rows inserted.

- `LANGUAGE plpgsql`, `SECURITY DEFINER`, owner `postgres`, `SET search_path = public, pg_temp`, `SET timezone = 'UTC'`.
- `SELECT ... FROM calendar_entries WHERE id = p_entry_id FOR UPDATE` first (FR-031). Entry missing, cancelled (`cancelled_at IS NOT NULL`) or not `type = 'mg'` -> returns 0.
- Inserts one row per server that has a `server_mg_config` row (or only `p_server_id`, when given, if it has a row): `status = 'registration_open'`, `registration_open_at = S - 7`, `registration_close_at = S - 4`, `start_date = S`, `end_date = S + 6`, `calendar_entry_id = p_entry_id` (`S` = UTC date of `starts_at`).
- `INSERT ... ON CONFLICT DO NOTHING` with no conflict target: covers `uq_mg_events_server_calendar_entry` and `uq_mg_events_server_start_date`, hence idempotent. A pre-existing **unlinked** event on the same `(server, start_date)` (late application of the migration) makes the insert a no-op; the backfill links it.
- Does **not** check the time window (the caller does). Never mentions the literal `'cancelled'` of `mg_event_status` (research D-02).
- Privileges: revoked from `PUBLIC`, `anon`, `authenticated`, `service_role`.

## 2. `mg_create_events_from_calendar(p_now timestamptz DEFAULT now()) RETURNS integer`

Internal; the body of the cron job and of the migration's one-off run; also the manual emergency tool (R3). Returns the total number of events inserted.

- Same attributes as above.
- Eligible entries: `type = 'mg' AND cancelled_at IS NULL AND (starts_at AT TIME ZONE 'UTC')::date - 7 <= (p_now AT TIME ZONE 'UTC')::date AND p_now < ((starts_at AT TIME ZONE 'UTC')::date - 4 + time '23:59') AT TIME ZONE 'UTC'`, `ORDER BY starts_at FOR UPDATE`; then `mg_create_events_for_entry(id)` for each.
- On the Monday 00:00 UTC run this is exactly "the entry whose opening Monday is today" (FR-014). An empty or exhausted calendar returns 0 and raises nothing.
- `p_now` exists for the SQL tests (simulate `'2026-11-30 00:00+00'`) and for late application analysis; it is an internal function, so it is not a client-controllable clock.
- Privileges: revoked from `PUBLIC`, `anon`, `authenticated`, `service_role`. Called by `pg_cron` as `postgres`.

**Cron job (after the migration):**

| Field | Value |
|---|---|
| name | `mg-create-events` (unchanged) |
| schedule | `0 0 * * 1` (unchanged) |
| command | `SELECT public.mg_create_events_from_calendar();` |
| user | `postgres` |

The jobs `mg-close-registrations`, `mg-start-events`, `mg-end-events` and `discord-scheduled-messages-dispatch` are not touched (FR-032).

## 3. Trigger function `mg_events_guard()` (BEFORE UPDATE on `mg_events`)

- `SECURITY INVOKER` (**must stay**, research D-06), `SET search_path = public, pg_temp`, revoked from all roles.
- `IF current_user NOT IN ('authenticated','anon') THEN RETURN NEW;`
- Allowed for those roles: `OLD.status = 'registration_closed' AND NEW.status = 'selection_published' AND NEW.selection_published_at IS NOT NULL` and `id`, `server_id`, `start_date`, `end_date`, `registration_open_at`, `registration_close_at`, `created_at`, `calendar_entry_id` all `IS NOT DISTINCT FROM` their old values.
- Otherwise `RAISE EXCEPTION 'MG_EVENT_FORBIDDEN' USING ERRCODE = '42501'` (HTTP 403 through PostgREST).
- INSERT and DELETE are not handled by a trigger: no policy and no table privilege remain for clients.

## 4. Trigger function `calendar_entries_audit()` (BEFORE INSERT OR UPDATE on `calendar_entries`)

`SECURITY INVOKER`, revoked from all roles. INSERT: `created_at = updated_at = now()`, `created_by = updated_by = auth.uid()`. UPDATE: `created_at`/`created_by` restored from `OLD`, `updated_at = now()`, `updated_by = auth.uid()`. `auth.uid()` NULL (cron, migration, SQL editor) gives NULL audit users.

## 5. Privilege matrix (asserted by the SQL tests, `has_function_privilege`)

| Object | PUBLIC | anon | authenticated | service_role | postgres |
|---|---|---|---|---|---|
| `create_mg_calendar_entries(date[])` | no | no | **yes** | default | owner |
| `shift_mg_calendar_entry(uuid, date)` | no | no | **yes** | default | owner |
| `cancel_mg_calendar_entry(uuid)` | no | no | **yes** | default | owner |
| `mg_create_events_for_entry(uuid, uuid)` | no | no | no | no | owner |
| `mg_create_events_from_calendar(timestamptz)` | no | no | no | no | owner |
| `mg_events_guard()`, `calendar_entries_audit()` | no | no | no | no | owner |
| table `mg_events` INSERT/DELETE/TRUNCATE | | no | no | default | owner |
| table `calendar_entries` | | none | S/I/U/D under RLS | default | owner |

Also asserted: every function above has `proconfig` containing `search_path=public, pg_temp`; `pg_get_userbyid(proowner) = 'postgres'`; no trigger of this feature exists on `server_mg_config` (the only trigger there is the pre-existing `update_server_mg_config_updated_at`, which sets `updated_at` and creates nothing).

---

## 6. e2e helper functions (separate migration `supabase/48-e2e-demo-mg-helpers.sql` + rollback)

Not part of the switch-over migration. Purpose: let the Playwright seeder keep working now that clients cannot insert, delete or freely update `mg_events` (research D-18).

Common guard (a private `e2e_mg_assert_demo_admin()` helper called first): `auth.uid()` NOT NULL; the caller's profile has `role = 'admin'` (or `super_admin`) **and** belongs to the server whose `name = 'ERA008-DEMO'` (name is UNIQUE); otherwise `RAISE EXCEPTION 'E2E_FORBIDDEN' USING ERRCODE = '42501'`. All functions: `SECURITY DEFINER`, owner `postgres`, `search_path = public, pg_temp`, `REVOKE ... FROM PUBLIC, anon`, `GRANT EXECUTE ... TO authenticated`. The server id is resolved **inside** the function from the name; no parameter can target another server.

Reserved Mondays (allow-list inside the functions): `2031-01-06`, `2031-03-03`, `2020-03-02`.

| Function | Effect |
|---|---|
| `e2e_mg_seed_event(p_start_date date, p_status mg_event_status, p_published boolean DEFAULT false) RETURNS uuid` | Reserved date only; status in (`registration_open`, `registration_closed`, `finished`, `cancelled`). Deletes any existing demo event on that date (cascade), then inserts the event with dates derived from `p_start_date` (`end = +6`, `close = -4`, `open = -7`), `calendar_entry_id = NULL`, `selection_published_at = now()` when `p_published`. Returns the event id. |
| `e2e_mg_delete_event(p_start_date date) RETURNS void` | Reserved date only; deletes the demo server's event on that date (idempotent). |
| `e2e_mg_set_status(p_start_date date, p_status mg_event_status) RETURNS void` | Reserved date only; only `registration_open -> registration_closed` (what the Thursday cron does). |

Selections and registrations of the seeded event keep being written through the regular admin session (their policies are unchanged); the publication step in `mg-flow.spec.ts` goes through the real UI and the real guard-allowed transition.

**Fallback (if the product owner refuses test code in production)**: no migration 48; `MgSeeder` uses a service-role client built from a local, `.gitignore`d `E2E_SERVICE_ROLE_KEY`, restricted by the same server and date guards in TypeScript.
