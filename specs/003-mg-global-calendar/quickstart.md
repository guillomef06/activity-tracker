# Quickstart: validating the Global MG Calendar end to end

**Spec**: [spec.md](spec.md) | **Plan**: [plan.md](plan.md) | **Date**: 2026-11-25

Scenarios in the order they should be run. Q1-Q7 happen on the **local rehearsal database only**. Q8 contains the only statements that touch production, and they are read-only `SELECT`s (plus the one explicitly approved data fix of Q8.3, PO-1). Everything is UTC. Commands are illustrative: adapt names, ports and image tag.

## Q0. Prerequisites and what is missing today

| Item | State on 2026-11-25 |
|---|---|
| Docker Desktop | installed (`docker 29.8.2`), **daemon not running**: start Docker Desktop first |
| `supabase` CLI | not installed (do not install; not needed) |
| `psql` | not installed on the host; use the `psql` inside the container (`docker exec`) |
| Image | a `supabase/postgres` PostgreSQL 17 image (roles `anon`, `authenticated`, `service_role`, `authenticator`, `auth.uid()`, `pg_cron`). Pull the matching 17.x tag from the registry (needs network) |
| Node | `npm ci` already done (for Q11) |

If Docker cannot be started by Thursday noon: decision PO-3 (second free Supabase project, loaded with the same files) or explicit acceptance of the "no rehearsal" risk. Never rehearse on the production project.

## Q1. Build the rehearsal database

1. Start a disposable container, for example `docker run -d --name mg-rehearsal -e POSTGRES_PASSWORD=rehearsal -p 54329:5432 <supabase/postgres:17.x>` and wait for readiness (`docker exec mg-rehearsal pg_isready`).
2. Load the schema: `docker exec -i mg-rehearsal psql -U postgres -v ON_ERROR_STOP=1 < supabase/tests/rehearsal/bootstrap.sql`. It creates `servers`, `user_profiles`, `server_mg_config`, `mg_events`, `mg_registrations`, `mg_selections`, the helpers `is_super_admin(uuid)`, `is_user_admin(uuid)`, `get_user_server_id(uuid)` (production definitions, research Part D), the policies of migrations 26/35, and the four MG cron jobs plus the Discord job **with the production command texts** (the `$inner$` variant of `mg-create-events`). If the image lacks `pg_cron`, the bootstrap creates a stub `cron` schema (`job`, `schedule`, `unschedule`); record this degradation in the report (it then does not test the real extension).
3. Export the production snapshot (read-only `SELECT`s through the Supabase MCP, one `SELECT format('INSERT ... %L', ...)` per table) for `servers` (8 rows), `server_mg_config` (3 rows) and `mg_events` (about 50 rows), and save it as `supabase/tests/rehearsal/snapshot.local.sql` (ignored by git, contains ids and dates only). Load it the same way.
4. Create 3 fixture super-admin/admin/member profiles for the SQL tests (the test script creates its own; none is needed for the snapshot).
5. Apply the role settings to mimic the SQL editor: `ALTER ROLE postgres SET statement_timeout = '8s'; ALTER ROLE postgres SET lock_timeout = '8s';` (reconnect afterwards). If the `safeupdate` extension is available in the image, `LOAD 'safeupdate'`.

**Pass criteria**: the snapshot reproduces production: `SELECT count(*) FROM mg_events` equals production; the 17 distinct `start_date` values including `2026-08-05`.

## Q2. Pre-flight on the rehearsal copy (mirrors Q8.1)

Run the P1/P2 queries of Q8.1. Expected: exactly **one** violation (the Wednesday event). Then run the one-row fix of Q8.3 and re-run: 0 violations. Also run once the migration **before** the fix to prove its guard block aborts cleanly with the offending id and leaves nothing behind (`\dt calendar_entries` returns no rows, the `mg-create-events` job text is still the `$inner$` text).

## Q3. Apply the migration and run the SQL tests

1. `docker exec -i mg-rehearsal psql -U postgres -v ON_ERROR_STOP=1 < supabase/47-mg-global-calendar.sql`. Expected: success, no notice about `unsafe use of new value` (**V2**), exclusion constraint created (**V1**).
2. `docker exec -i mg-rehearsal psql -U postgres -v ON_ERROR_STOP=1 < supabase/tests/47-mg-global-calendar.test.sql`. Expected: one `NOTICE PASS Sxx` line per case S1-S12, no exception, and the script ends in `ROLLBACK` (re-run it: same result; verify with `SELECT count(*) FROM calendar_entries` = 29 before and after).
3. Time zone independence (**V1**): re-run S1/S2 after `ALTER DATABASE postgres SET timezone = 'America/Los_Angeles'` and then `'Asia/Tokyo'` (reconnect each time); results must be identical. Reset to `UTC`.
4. Data checks after the apply (rehearsal copy): 29 entries (16 backfilled, `created_by IS NULL`; 13 seeded), 0 `mg_events` with `calendar_entry_id IS NULL` and a Monday `start_date`, `SELECT jobname, schedule, command, active FROM cron.job` shows one `mg-create-events`, `0 0 * * 1`, `SELECT public.mg_create_events_from_calendar();`, and the other four jobs byte-identical to before.

## Q4. Simulate Monday 2026-11-30 00:00 UTC (US1.1, SC-001)

On the rehearsal DB (after Q3, outside the rolled-back test script):

```sql
-- illustrative
SELECT public.mg_create_events_from_calendar('2026-11-30 00:00:00+00');   -- expect 3
SELECT s.name, e.status, e.start_date, e.end_date, e.registration_open_at, e.registration_close_at, e.calendar_entry_id IS NOT NULL AS linked
FROM mg_events e JOIN servers s ON s.id = e.server_id WHERE e.start_date = '2026-12-07' ORDER BY s.name;
-- expect: ERA008, ERA008-DEMO, Era36 (81+132+133) only; registration_open; 2026-12-07 / 2026-12-13; open 2026-11-30; close 2026-12-03; linked = true
SELECT public.mg_create_events_from_calendar('2026-11-30 00:00:00+00');   -- expect 0 (US1.2)
```

Then the follow-through of US1.3 with the three transition jobs. `CURRENT_DATE` cannot be faked inside a cron command, so test S11 executes the same `UPDATE ... WHERE` statements with `CURRENT_DATE` replaced by the simulated date (`2026-12-03`, `2026-12-07`, `2026-12-13`), and separately asserts that the stored `cron.job.command` texts equal the production snapshot (so the statements tested are the statements deployed). Expected: `registration_closed` after the Thursday run, `ongoing` on 2026-12-07 (published selection, and the failsafe path with `selection_published_at` set), `finished` on 2026-12-13, and `cancelled` events untouched.

Edge runs: clock `2026-12-02 12:00+00` (Wednesday) creates for a newly configured server; `2026-12-03 23:58+00` creates; `2026-12-03 23:59+00` and `2026-12-04` create nothing. Configure a 4th server **after** the Monday run and confirm nothing appears until the function is called manually (no catch-up, US1.5).

## Q5. Idempotence, re-application, empty calendar

- Re-run the Monday function twice more: 0 each time, row counts unchanged (US1.2).
- Re-run the whole `47-...sql`: it must abort at the guard ("already applied") before touching anything.
- Empty calendar: in a transaction, `DELETE FROM calendar_entries WHERE starts_at > now()` (as `postgres`; needs `WHERE`), call the function: returns 0, no error; `ROLLBACK`.

## Q6. Concurrency (two sessions, FR-031, US3.11)

Open two `docker exec -it mg-rehearsal psql -U postgres` sessions.

1. Session A: `BEGIN; SELECT * FROM calendar_entries WHERE starts_at = '2026-12-07' FOR UPDATE;` (simulates a shift holding the lock). Session B: `SELECT public.mg_create_events_from_calendar('2026-11-30 00:00+00');` must **block** until A ends. Session A: `COMMIT`. B finishes and sees the committed dates.
2. Shift versus close cron: A runs a shift of the opened 2026-12-07 entry (inside `BEGIN`, not yet committed); B runs the close-registrations `UPDATE` for Thursday. B waits; after A commits B re-evaluates against the new `registration_close_at` (the event is not closed if the new Thursday is later).
3. Cancel versus start cron analogue on a `selection_published` event dated today.

Expected: no deadlock, no duplicate event, no event left with old dates after a committed shift.

## Q7. Rollback round trip (V8)

1. Apply `supabase/47-mg-global-calendar.rollback.sql` (level R1) on the rehearsed DB after Q4-Q6. Expected: `mg-create-events` is back to the saved **production text** (compare character by character with research Part D), the five functions and two triggers are gone, `mg_events` INSERT/DELETE policies and grants are restored, existing events are untouched, the `cancelled` enum value remains.
2. Re-run the old job logic mentally (or execute its `DO` block) on `2026-11-30` and confirm it would target the same 2026-12-07 dates.
3. Re-apply `47-...sql` on the same database after the **full** rollback level (which drops `calendar_entries`): it must succeed again, proving the rollback leaves no residue. After only the soft level (cron restored, tables kept) the guard must abort the re-application: that is the expected behaviour.

## Q8. Production: pre-flight, fix, post-checks (project `yeczvyyxchssftvnobdn`)

### Q8.1 Pre-flight (read-only SELECTs, Thursday 2026-11-26)

```sql
-- P1: shape exceptions (expect 1 row before the fix, 0 after)
SELECT id, server_id, start_date, status FROM mg_events
WHERE extract(isodow FROM start_date) <> 1 OR end_date <> start_date + 6
   OR registration_close_at <> start_date - 4 OR registration_open_at <> start_date - 7;
-- P2: duplicates (expect 0)
SELECT server_id, start_date, count(*) FROM mg_events GROUP BY 1, 2 HAVING count(*) > 1;
-- P3: the four MG jobs and the Discord job (compare with research Part D and the repo texts)
SELECT jobid, jobname, schedule, active, username, command FROM cron.job ORDER BY jobid;
-- P4: a super admin exists (expect >= 1)
SELECT count(*) FROM user_profiles WHERE role = 'super_admin';
-- P4b: stray far-future / e2e leftovers (expect 0)
SELECT id, server_id, start_date FROM mg_events WHERE start_date > current_date + 14;
-- P4c: current state of the opted-in servers (expect ERA008, ERA008-DEMO, Era36)
SELECT s.name FROM servers s JOIN server_mg_config c ON c.server_id = s.id ORDER BY 1;
```

### Q8.2 Baseline for the advisors

`get_advisors` (security and performance) saved before the apply, to be compared after.

### Q8.3 The one approved data fix (PO-1), by the product owner, once, Thursday

```sql
-- illustrative; has a WHERE (safeupdate) and re-checks the current value
UPDATE mg_events
SET start_date = '2026-08-03', end_date = '2026-08-09',
    registration_open_at = '2026-07-27', registration_close_at = '2026-07-30'
WHERE id = 'a734f6ab-98f4-4814-b952-5b3269023401' AND start_date = '2026-08-05';
```

Re-run P1 (expect 0 rows) and P2 (expect 0 rows).

### Q8.4 Apply (Friday 2026-11-27, 08:00-12:00 UTC)

Paste `supabase/47-mg-global-calendar.sql` in the SQL editor and run it once. A guard failure aborts with a message and changes nothing.

### Q8.5 Post-checks (read-only, immediately after)

```sql
SELECT jobname, schedule, active, command FROM cron.job WHERE jobname LIKE 'mg-%' ORDER BY jobname;   -- 4 rows; mg-create-events = new command
SELECT count(*) FILTER (WHERE created_by IS NULL) AS entries, count(*) FILTER (WHERE starts_at > now()) AS future FROM calendar_entries WHERE type = 'mg';   -- 29 and 13
SELECT count(*) FROM mg_events WHERE calendar_entry_id IS NULL;                                       -- 0
SELECT count(*) FROM mg_events WHERE extract(isodow FROM start_date) <> 1 OR end_date <> start_date + 6
  OR registration_close_at <> start_date - 4 OR registration_open_at > start_date - 7;               -- 0 (SC-003)
SELECT polname FROM pg_policy WHERE polrelid = 'mg_events'::regclass;                                 -- SELECT and UPDATE policies only
SELECT proname, has_function_privilege('anon', oid, 'EXECUTE') AS anon, has_function_privilege('authenticated', oid, 'EXECUTE') AS authed
FROM pg_proc WHERE pronamespace = 'public'::regnamespace
  AND proname IN ('create_mg_calendar_entries','shift_mg_calendar_entry','cancel_mg_calendar_entry','mg_create_events_for_entry','mg_create_events_from_calendar');
-- anon false everywhere; authenticated true only for the first three
SELECT count(*) FROM pg_trigger WHERE tgrelid = 'server_mg_config'::regclass AND NOT tgisinternal
  AND tgname <> 'update_server_mg_config_updated_at';  -- 0 (the pre-existing updated_at trigger is excluded)
```

### Q8.6 Monday 2026-11-30 00:05 UTC and Thursday 2026-12-03 23:59 + 5 min

```sql
SELECT s.name, e.status, e.start_date, e.calendar_entry_id IS NOT NULL AS linked
FROM mg_events e JOIN servers s ON s.id = e.server_id WHERE e.start_date = '2026-12-07' ORDER BY s.name;   -- 3 rows, registration_open (then registration_closed on 12-03)
SELECT status, return_message, start_time FROM cron.job_run_details WHERE jobid = (SELECT jobid FROM cron.job WHERE jobname = 'mg-create-events') ORDER BY start_time DESC LIMIT 3;
```

If missing at 00:15: emergency R3, `SELECT public.mg_create_events_from_calendar();` as `postgres` in the SQL editor, then re-run the first query.

## Q9. Advisors

After the apply and after migration 48, `get_advisors(security)` and `get_advisors(performance)`: no new finding on `calendar_entries` (RLS enabled, policies present, FK indexes present) or on the five functions (not callable by `anon`). Any "SECURITY DEFINER function callable by authenticated" warning on the three client functions is expected and documented (they check the caller inside).

## Q10. Manual UI checklist (product owner, as super admin; Chrome desktop and a 320px viewport; run once with the browser time zone set to UTC-8 and once UTC+10)

1. Dashboard: the calendar quick-action card is reachable by keyboard and opens `/app/super-admin/calendar`; with 13 future entries no alert shows. The back button returns to the dashboard.
2. Calendar page: seeded entries listed future first (13), then the 16 past entries; derived state chips correct; the 2026-11-23 entry is `ongoing`; counts of servers and registrations on opened entries.
3. Assistant US2: opening Monday 2027-05-31 without duplication: preview 2027-05-31 / 06-03 / 06-07 / 06-13 (US2.1); with 4 weeks: two MG (US2.2); opening 2026-12-28 over 4 weeks: both flagged "already exists, will be ignored" (US2.3); weeks 3, 0, 28: refused before preview (US2.4); a non-Monday cannot be picked; the picked Monday does not shift day under UTC-8 / UTC+10 (US2.6); closing the dialog writes nothing (US2.7). Validate one real future entry only if intended, then cancel it again (physically deleted since never opened).
4. Shift preview (do **not** validate on production before the cycle is stable): the dialog lists all moved entries with old and new dates (13 for the 2026-12-07 entry, US3.10); refused shifts show a translated reason.
5. Cancel confirmation shows server and registration counts and "nobody is notified"; do not confirm on a real opened entry.
6. Non-MG form: a `pvp` entry with title, start/end typed in UTC and labelled so; listed with the viewer-zone time and the zone label (`GMT-8` / `GMT+10`); edit and delete work freely; an all-day entry shows the same calendar day in both zones (US5.2).
7. Banners: server admin MG tab of a configured server shows no "No MG planned" message while entries exist; a server without a config row shows none; home MG card shows "Next MG: ..., registrations open on ..." (or "not announced yet"); the cancellation notice appears above it for the e2e-seeded cancelled demo event (use the e2e helper in a demo session) and disappears after cleanup.
8. Switch the app language to `fr`, `de`, `ar` (RTL): every new text translated or English placeholder, no raw key visible.

## Q11. Front-end gates (Definition of Done)

```text
npm run lint              # 0 error
npm run format:check
npm run i18n:check        # parity across the 14 locales and no unused key
npm run test:ci           # full Vitest suite, no regression
npm run build:prod        # production build
npm run e2e               # local, demo server only; needs migration 47 and (PO-2 = B) migration 48 applied
```

Then update `DEVELOPMENT_STATUS.md` and `SPEC_MG_EVENT.md` (cron table, decision 3, `cancelled` status) as listed in the plan.

## Q12. e2e specifics

- Seeder: `MgSeeder` writes through the `e2e_mg_*` RPCs (reserved Mondays `2031-01-06` finished, `2020-03-02` flow, `2031-03-03` cancelled notice); registrations and selections still through the `e2e_admin` session; the cleanup is idempotent and runs in `beforeAll`/`afterAll`.
- Verify after a full run: `SELECT count(*) FROM mg_events WHERE start_date IN ('2031-01-06','2031-03-03','2020-03-02')` returns 0, and the demo server's real events are untouched (status and registrations of the current cycle unchanged).
- Verify FR-070 on the demo server: while the flow event (2020-03-02) exists it is the current event; after cleanup the real event is.
