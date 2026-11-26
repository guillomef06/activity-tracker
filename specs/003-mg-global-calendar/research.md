# Research: Global Calendar Driving MG Creation

**Spec**: [spec.md](spec.md) | **Plan**: [plan.md](plan.md) | **Date**: 2026-11-25

Every decision of the spec (Clarifications 2026-11-24/25, D1-D9, FR-xxx) is frozen and not reopened here. This document resolves the technical unknowns left open by the spec ("mechanism left to the plan") and records every contradiction or hard fact found while verifying the spec against the repository and against production (read-only `SELECT` through the Supabase MCP, project `yeczvyyxchssftvnobdn`, on 2026-11-25).

Format: **Decision / Rationale / Alternatives considered**.

---

## Part A. Facts verified on 2026-11-25 (production, read-only)

| # | Fact | Consequence |
|---|------|-------------|
| F1 | PostgreSQL **17.6**; extensions installed: `pg_cron 1.6.4`, `btree_gist 1.7`, `pg_net`, `pgcrypto`, `uuid-ossp`. DB `TimeZone` = `UTC`. | `ALTER TYPE ... ADD VALUE` is allowed inside a transaction block (PG >= 12); exclusion constraints are available; `btree_gist` is not needed by the chosen design. |
| F2 | `cron.job` holds 5 jobs: `mg-create-events` (id 1), `mg-close-registrations` (2), `mg-end-events` (4), `mg-start-events` (6), `discord-scheduled-messages-dispatch` (7). All run as `postgres`, all active. The production text of `mg-create-events` uses the `$inner$` delimiter (captured verbatim in Part D, snapshot P3). | Rollback must restore the **production** text, never the repo text of `26-mg-event.sql`. |
| F3 | `mg_events` has only `mg_events_pkey` and `mg_events_server_id_fkey` (no uniqueness, no CHECK), **no trigger**, RLS enabled, not forced, owner `postgres`. Policies: SELECT (members), INSERT, UPDATE, DELETE ("Admins can ..." from migration 35). `anon` and `authenticated` hold table-level `INSERT/UPDATE/DELETE/TRUNCATE/REFERENCES/TRIGGER` (Supabase default grants). No function in `public` references `mg_events` (`pg_proc.prosrc` scan: none). | The guard trigger cannot break another server-side writer; revoking client `INSERT/DELETE` only affects the PostgREST path. |
| F4 | `mg_events` content: 17 distinct `start_date` values; 16 are Mondays on the 2-week cycle (2026-04-27 ... 2026-11-23), **1 is not**: event `a734f6ab-98f4-4814-b952-5b3269023401`, server ERA008-DEMO, `start_date = 2026-08-05` (Wednesday), `end_date 08-11`, `registration_open_at 08-05`, `registration_close_at 08-08`, status `finished`, created 2026-08-29 by the demo lifecycle script (13 registrations, 10 billed selections). No duplicate `(server_id, start_date)`. | **Pre-flight P1 fails today.** See decision D-17 and open point PO-1. |
| F5 | 8 servers; only ERA008, ERA008-DEMO and `Era36 (81+132+133)` have a `server_mg_config` row. 2 `super_admin` profiles exist. `servers.name` has a UNIQUE index. `e2e_admin` is role `admin`. | SC-001 target (3 events on 2026-11-30) confirmed. A "ERA008-DEMO" name cannot be forged by creating another server. |
| F6 | `is_super_admin(uuid)`, `is_user_admin(uuid)`, `get_user_server_id(uuid)` are `SECURITY DEFINER`, `search_path = public`, and are the RLS helpers. `is_super_admin(NULL)` returns NULL. | Functions must use `IS NOT TRUE` style checks so a missing JWT is "not super admin". |
| F7 | Role-level settings exist on the project: `statement_timeout` 3 s / 8 s, `lock_timeout = 8s` on at least one role, and the `safeupdate` extension is preloaded for at least one role (rejects `UPDATE`/`DELETE` without `WHERE`). | Every statement of the migration must have a `WHERE` and run well under 8 s; a bare `UPDATE mg_events SET ...` in any script (demo, rollback) fails in the SQL editor. |
| F8 | Local tooling: Docker Desktop installed (client `29.8.2`) but the **daemon is not running**; `supabase` CLI and `psql` are **not installed** (`npx supabase` would download it). | See decision D-21 (rehearsal). |
| F9 | No `supabase/tests/` directory exists yet; no CI job runs e2e (`pr-checks.yml` has none). | The SQL test script and the rehearsal helpers create the folder. e2e stays a local run. |
| F10 | The app calls `.from('mg_events')` for: `loadCurrentEvent`, `loadLastFinishedEvent`, `publishSelection` (one `UPDATE status = selection_published, selection_published_at = now`, only reachable when `status = registration_closed`, see `canPublish`). Nothing inserts or deletes. | The FR-030 allowed transition is exactly this update. |

---

## Part B. Technical decisions

### D-01. Migration shape and statement order (FR-081, Deployment plan)

**Decision.** One file `supabase/47-mg-global-calendar.sql`, wrapped in an explicit `BEGIN; ... COMMIT;`, applied in the SQL editor. Order:

0. **Guard block** (`DO`): abort with an explicit message if (a) `calendar_entries` already exists (the migration is not re-runnable on purpose: it seeds and swaps a cron), (b) no `super_admin` profile exists (P4), (c) any `mg_events` row violates the FR-012 shape (P1; lists the ids), (d) a duplicate `(server_id, start_date)` exists (P2), (e) any `mg_events.start_date` is later than today + 14 days (stray e2e/demo leftover that the backfill would turn into a bogus far-future entry), (f) the distinct historical Mondays are not at least 14 days apart (the backfill would violate the exclusion constraint), (g) there is not exactly one `mg-create-events` job.
1. `ALTER TYPE mg_event_status ADD VALUE IF NOT EXISTS 'cancelled'`.
2. `CREATE TYPE calendar_entry_type`, `CREATE TABLE calendar_entries`, constraints, exclusion constraint, indexes, audit trigger, RLS policies, grants.
3. `ALTER TABLE mg_events`: column `calendar_entry_id`, FK, index, the two UNIQUE constraints, the four CHECK constraints; guard trigger; drop the INSERT/DELETE policies; table-level `REVOKE`.
4. Create the functions (plpgsql only, see D-02) and set their privileges. **No `server_mg_config` trigger** (FR-016).
5. Seed the 13 future entries.
6. Backfill past entries, then link `mg_events.calendar_entry_id`.
7. One-off `PERFORM mg_create_events_from_calendar()` (idempotent; creates nothing when applied before Monday 2026-11-30).
8. Guarded `cron.unschedule('mg-create-events')`, then `cron.schedule('mg-create-events', '0 0 * * 1', 'SELECT public.mg_create_events_from_calendar();')`, then a `DO` assertion that exactly one such job exists, active, and that its command references the new function.
9. Final `DO` assertions: 13 seeded entries present, zero unlinked Monday events, zero constraint violations, calendar functions not executable by `anon`/`PUBLIC`.

**Rationale.** A single explicit transaction makes "everything or nothing" true in the SQL editor (pg_cron job rows are ordinary table rows, so `cron.schedule`/`unschedule` roll back with the transaction). Seed before backfill, as in the spec, so an unlinked 2026-12-07 event created by the legacy job on a late application is linked to the seeded entry.

**Alternatives.** Two files (`47a` enum, `47b` rest): rejected as the default because of D-02, kept as the documented fallback if the rehearsal shows otherwise. Relying on the editor's implicit transaction: rejected (not guaranteed to be one block).

### D-02. `ALTER TYPE ... ADD VALUE` inside the transaction

**Decision.** Keep step 1 inside the same transaction. The new value `'cancelled'` is **never evaluated** by any statement that runs before `COMMIT`. Enforced by design rules:

- no CHECK, index predicate, policy, column default or `DO`-block data statement mentions `'cancelled'` on an `mg_event_status` column;
- every function that mentions `'cancelled'` is **`LANGUAGE plpgsql`** (its body is not analysed at `CREATE FUNCTION` time, only at first execution); never `LANGUAGE sql` (parsed eagerly, would raise `unsafe use of new value "cancelled" of enum type`);
- `mg_create_events_from_calendar` / `mg_create_events_for_entry` never reference `'cancelled'` (they filter on `calendar_entries.cancelled_at`), so the step-7 call is safe;
- the SQL test script and the rehearsal run **after** the commit.

**Rationale.** PostgreSQL >= 12 allows `ADD VALUE` in a transaction but forbids using the new value until the transaction is committed. Migration 46 relied on the same property implicitly. A verification step in the rehearsal (quickstart Q3) proves it; a grep gate in the test script (`prosrc ~ 'cancelled'` for non-plpgsql functions) guards regressions.

**Fallback.** If the rehearsal disagrees (for example because of the Supabase editor), split into `47-mg-global-calendar.sql` (statement 1 alone, committed) and `47b-...` (everything else); the numbering stays unique (`47` then `48` is renumbered e2e helpers to `49`). Decision gate: phase 1 exit criterion.

### D-03. Rule "at least 14 days between two MG" (FR-004a)

**Decision.** A **non-deferrable exclusion constraint** on `calendar_entries`:

```sql
-- illustrative
CONSTRAINT ex_calendar_entries_mg_min_gap EXCLUDE USING gist (
  daterange(((starts_at AT TIME ZONE 'UTC')::date),
            ((starts_at AT TIME ZONE 'UTC')::date + 14)) WITH &&
) WHERE (type = 'mg' AND cancelled_at IS NULL)
```

Half-open `[start, start+14)` ranges overlap iff the starts are less than 14 days apart; exactly 14 apart does not overlap. No `btree_gist` needed (only `&&` on a range type; the `type`/`cancelled_at` filter lives in the partial predicate, not in the exclusion columns).

**Immutability trap and its fix.** `starts_at + interval '14 days'` on `timestamptz` is only `STABLE` (it depends on the session time zone for day arithmetic), so PostgreSQL refuses it in an index expression (`functions in index expression must be marked IMMUTABLE`). The expression above uses only immutable pieces: `timezone(text, timestamptz)` with a constant zone, `timestamp::date`, `date + integer`, and the `daterange(date, date)` constructor. The partial predicate is also immutable (`enum = enum literal`, `timestamptz IS NULL`). This is item V1 of the rehearsal: `CREATE TABLE` must succeed and the same inserts must behave identically under `SET timezone = 'America/Los_Angeles'` and `'Asia/Tokyo'` (FR-004 "independent of the session time zone").

**Cascade shift without transient violation (FR-023).** Not by deferring constraints but by **processing order** inside `shift_mg_calendar_entry`:

- offset > 0 (postponement): update the moved entries from the **last** to the first;
- offset < 0 (only possible when the selected entry is not opened): update from the **first** to the last.

Proof sketch: moved entries keep their mutual gaps (all >= 14 days by invariant); moving in the direction-safe order means an entry always lands in space already vacated by the entry ahead of it; against non-moved entries the **final** position is pre-validated (distance >= 14 days, no equal date) and each entry makes a single jump. A multi-row `UPDATE` is not used: non-deferrable unique/exclusion constraints are checked row by row, so a single statement would not help.

**Alternatives considered.**
- *`DEFERRABLE INITIALLY DEFERRED` exclusion + unique:* works, but deferrable constraints cannot serve as `ON CONFLICT` arbiters, move error reporting to commit time (the function could no longer return a stable `MG_CAL_*` code before returning), and add per-row after-trigger cost. Rejected.
- *`BEFORE INSERT/UPDATE` trigger doing a manual overlap query:* simpler to read but not concurrency-safe (two transactions can both pass the check) unless it takes an advisory lock; the exclusion constraint is atomic by construction. Rejected as the primary mechanism.
- *Generated column + `UNIQUE`:* cannot express a 14-day window.

The functions still **pre-validate** (explicit queries) to return `MG_CAL_TOO_CLOSE` / `MG_CAL_ALREADY_EXISTS`; the constraint is the safety net: `exclusion_violation (23P01)` and `unique_violation (23505)` are caught around the write and mapped to the same codes (race with a concurrent create).

### D-04. Day arithmetic and time zone safety

**Decision.** All client-callable and internal functions carry `SET timezone = 'UTC'` (function-level setting) and `SET search_path = public, pg_temp`. Every calendar comparison converts explicitly: `(starts_at AT TIME ZONE 'UTC')::date`. New timestamps are built as `((d::timestamp) AT TIME ZONE 'UTC')` (never `starts_at + interval`). CHECK constraints use only explicit `AT TIME ZONE 'UTC'` expressions and `timestamp + interval '7 days'` (immutable on `timestamp`).

**Rationale.** `current_date` and `interval '7 days'` on `timestamptz` follow the session zone; PostgREST sessions can be asked for another zone (`Prefer: timezone=`). `current_date` inside the old cron is UTC only because the database default is UTC; the new function does not depend on it.

### D-05. Row locking and serialisation with the crons (FR-031)

**Decision.**

- `mg_create_events_from_calendar` selects the eligible entries `ORDER BY starts_at FOR UPDATE` and creates events for one entry at a time under that lock.
- `shift_mg_calendar_entry` and `cancel_mg_calendar_entry` take `FOR UPDATE` on the selected entry, then on the following moved entries **in ascending `starts_at` order**, then on the linked `mg_events` rows (`FOR UPDATE`, ordered by `id`).
- One global lock order everywhere (calendar rows ascending, then events by id) so a cron and a shift cannot deadlock.

**Interaction with the transition crons (FR-032, untouched).** The close/start/end crons are plain `UPDATE ... WHERE status = X AND date test` and do not take the calendar lock. They are serialised through the **event row** lock: a shift/cancel holds `FOR UPDATE` on the events, the cron `UPDATE` waits, then re-evaluates its `WHERE` against the committed row (READ COMMITTED re-check) with the new `registration_close_at` / the new status. Result: after a shift the Thursday cron uses the new close date; after a cancel the Monday cron no longer matches `selection_published`.

**Residual risk.** `lock_timeout = 8s` on some roles (F7): a cron waiting more than 8 s behind a stuck super-admin transaction would fail; the transactions involved last milliseconds and the job is idempotent and manually re-runnable (R3).

### D-06. Protecting `mg_events` from clients (FR-030): the trigger mechanism

**Problem.** The feature's `SECURITY DEFINER` functions, the crons and the migration must be allowed to change `mg_events`; clients must only be allowed the publication transition. `auth.uid()` cannot distinguish a client from a definer function the client invoked (the JWT claims GUC survives `SECURITY DEFINER`).

**Decision.** `BEFORE UPDATE` trigger `trg_mg_events_guard` on `mg_events`, function `mg_events_guard()` declared **`SECURITY INVOKER`** (explicitly; the default), `SET search_path = public, pg_temp`:

```text
-- illustrative
IF current_user NOT IN ('authenticated', 'anon') THEN RETURN NEW; END IF;   -- privileged contexts
IF OLD.status = 'registration_closed' AND NEW.status = 'selection_published'
   AND NEW.selection_published_at IS NOT NULL
   AND (every other column IS NOT DISTINCT FROM OLD) THEN RETURN NEW; END IF;
RAISE EXCEPTION 'MG_EVENT_FORBIDDEN' USING ERRCODE = '42501';
```

**Why `current_user` and not `session_user`, a GUC, or `auth.uid()`.**

| Context | `session_user` | `current_user` inside the trigger | `auth.uid()` |
|---|---|---|---|
| Client DML through PostgREST | `authenticator` | `authenticated` (or `anon`) | user id |
| Client calling one of our `SECURITY DEFINER` functions (owner `postgres`) | `authenticator` | **`postgres`** | user id (still set) |
| `pg_cron` job (runs as `postgres`) | `postgres` | `postgres` | NULL |
| SQL editor / MCP / migration | `postgres` | `postgres` | NULL |
| PostgREST with the service-role key | `authenticator` | `service_role` | NULL |

`current_user` is the only column that separates "client direct" from "definer function" and it cannot be forged by a client (a client cannot `SET ROLE` to `postgres`; `authenticated` is not a member of it). `session_user` is `authenticator` for everyone on the PostgREST path, so it is useless. A transaction-local GUC set by our functions would work, but it adds state each function must remember to set and a spoofing question; the structural test needs no code in the functions.

**Hard requirements that follow (all asserted by the SQL test script):**
1. The guard function must stay `SECURITY INVOKER`; making it `DEFINER` would make `current_user` always `postgres` and silently disable the guard.
2. The five definer functions must be owned by a role not in `('authenticated','anon')` (owner `postgres`).
3. No *other* client-callable `SECURITY DEFINER` function may update `mg_events` (F3 shows there is none today; a future one would bypass the guard by design and must be reviewed).
4. `service_role` passes (FR-030: contexts without a client session). It is a server secret, not a client.

The publication transition allowed to clients is exactly `registration_closed -> selection_published` with `selection_published_at` set and no other column changed (F10). `INSERT`/`DELETE` are blocked by dropping the policies **and** by `REVOKE INSERT, DELETE, TRUNCATE ON mg_events FROM anon, authenticated` (defence in depth; `REVOKE UPDATE FROM anon`). Cascade deletes of a server still work: RI cascade actions run with the table owner's privileges (verified in test S12).

### D-07. RLS and grants (patterns of migrations 34, 35, 37, 38)

**`calendar_entries`**

- `ENABLE ROW LEVEL SECURITY`; `REVOKE ALL ... FROM anon`; `REVOKE TRUNCATE, REFERENCES, TRIGGER FROM authenticated`.
- SELECT policy `TO authenticated USING (true)` (FR-005; unauthenticated gets nothing).
- INSERT/UPDATE/DELETE policies `TO authenticated`, `USING / WITH CHECK ((select auth.uid()) IS NOT NULL AND is_super_admin((select auth.uid())) AND type <> 'mg')` (the `(select ...)` initPlan form of migration 35). `WITH CHECK type <> 'mg'` also forbids turning a non-MG row into an MG row.
- CHECK `type = 'mg' OR cancelled_at IS NULL`: only MG rows can carry the cancellation mark, which only the cancel function sets.
- The audit trigger (D-08) overwrites `created_*`/`updated_*` so a client cannot forge them (FR-006).

**Functions** (pattern of 34/37/38, extended for the Supabase default-privilege grants to `anon`/`authenticated`):

| Function | PUBLIC | anon | authenticated | service_role |
|---|---|---|---|---|
| `create_mg_calendar_entries`, `shift_mg_calendar_entry`, `cancel_mg_calendar_entry` | revoke | revoke | **grant** | keep default |
| `mg_create_events_for_entry`, `mg_create_events_from_calendar` | revoke | revoke | revoke | revoke |
| `mg_events_guard`, `calendar_entries_audit` (trigger functions) | revoke | revoke | revoke | revoke |

Each call is `REVOKE EXECUTE ON FUNCTION public.f(args) FROM PUBLIC, anon, authenticated` (explicit **PUBLIC**, the gap that made migration 34 a no-op until 37), then `GRANT` where needed. Trigger and cron functions need no client grant (cron runs as `postgres`, the owner). The test script checks `has_function_privilege` for the whole matrix. After applying in production, run `get_advisors(security)` and compare with the baseline (quickstart Q9).

### D-08. Audit columns (FR-006)

**Decision.** `BEFORE INSERT OR UPDATE` trigger `calendar_entries_audit` (SECURITY INVOKER): on INSERT set `created_at = now()`, `created_by = auth.uid()`, `updated_at = now()`, `updated_by = auth.uid()`; on UPDATE restore `created_*` from `OLD`, set `updated_at = now()`, `updated_by = auth.uid()`. In the migration/cron `auth.uid()` is NULL, giving null audit columns for seed and backfill rows. The cancel function writes `cancelled_by = auth.uid()` explicitly. `created_by`/`updated_by`/`cancelled_by` are FKs to `user_profiles(id) ON DELETE SET NULL`, each indexed (FR-007).

### D-09. Event creation function and the Thursday boundary (FR-014, FR-017)

**Decision.**

- `mg_create_events_for_entry(p_entry_id uuid, p_server_id uuid DEFAULT NULL) RETURNS integer`: locks the entry, inserts `status = 'registration_open'`, `registration_open_at = start - 7`, `registration_close_at = start - 4`, `start_date`, `end_date = start + 6`, `calendar_entry_id` for every server that has a `server_mg_config` row (or only `p_server_id` when given), `ON CONFLICT DO NOTHING` (no target: covers both new UNIQUE constraints).
- `mg_create_events_from_calendar(p_now timestamptz DEFAULT now()) RETURNS integer`: picks the non-cancelled `mg` entries whose opening date `<= (p_now at UTC)::date` and calls the entry function for each. The `p_now` parameter exists only so the SQL tests can simulate Monday 2026-11-30 and the late-application cases; it is on an internal function that clients cannot execute.

**Refinement of the spec rule "deadline still ahead".** The spec reads: opening date <= today and the registration deadline still ahead. The close cron fires **once**, Thursday 23:59 UTC, and tests `registration_close_at <= CURRENT_DATE`. An event created on Thursday after 23:59:00 with `registration_close_at = today` would never be closed by that run and would sit in `registration_open` until the next Thursday (then the start-cron failsafe, which only handles `registration_closed`, would not start it): a stuck event, the exact failure FR-012/FR-032 try to prevent. Therefore the eligibility test is **timestamp-based**: `p_now < (close_date + time '23:59') AT TIME ZONE 'UTC'`, i.e. aligned with the cron instant. On the Monday run this is identical to "opening today"; for a late manual or migration-time run it allows creation until Thursday 23:58 UTC and refuses afterwards. This is a clarification of FR-014, not a change of product behaviour; the TS util mirrors it.

**No catch-up stays true.** There is no trigger and no automatic path: only the Monday cron, the migration's one-off run and a manual emergency run call the function. A manual re-run on a Wednesday would create the event of a server that enabled MG on Tuesday; this is accepted and documented in the emergency procedure (it is the same idempotent function).

### D-10. Create / shift / cancel contracts

See `contracts/client-functions.md`. Key points decided here:

- Business errors are raised as `RAISE EXCEPTION '<MG_CAL_CODE>' USING ERRCODE = <sqlstate>, DETAIL = <json>` so PostgREST returns `{ code, message, details }` with `message` = the stable code (mapping table in the contract). `MG_CAL_FORBIDDEN` uses SQLSTATE `42501` (HTTP 403); the others use a dedicated class `MG` (`MG001` ... ) mapped by PostgREST to HTTP 400; the client keys only on `message`.
- Classification precedence per date, mirrored by the TS util and the SQL: `rejected_not_monday` > `already_exists` > `rejected_opening_passed` > `rejected_too_close` > `created`. "Already exists" outranks "opening passed" so that re-running the seeded dates after their opening reports them as existing.
- `create_mg_calendar_entries`: input validated first (1 to 13 elements, no NULL, no duplicate: otherwise `MG_CAL_INVALID_INPUT` for the whole call, nothing written), then dates processed in ascending order, each in its own `BEGIN ... EXCEPTION` sub-block (savepoint) so one failure never rolls back another and earlier-created dates count for later `too_close` checks.
- `shift_mg_calendar_entry`: sequence of checks, all before any write: super admin; entry exists and is not cancelled; not read-only (`starts_at` not reached, no linked `ongoing`/`finished` event); if opened: every linked event `registration_open` and offset strictly positive; target Monday; offset non-zero; for each moved entry the final-position checks (equal date with a non-moved entry incl. cancelled, <14 days from a non-moved non-cancelled entry, opening Monday strictly after today for entries not yet opened, a following entry must not be opened); for the opened selected entry, no foreign `mg_events` row of the affected servers already on the new `start_date`. Then ordered writes (D-03), then event updates.
- `cancel_mg_calendar_entry`: entry exists, not already cancelled, `starts_at` not reached, no `ongoing`/`finished` event; no event ever generated => `DELETE` (returns `deleted`); else mark entry cancelled and set every linked event `cancelled` (returns `cancelled`). Event rows are locked first (D-05).
- Read-only impact numbers for the confirmation dialogs (servers, registrations) come from a PostgREST embedded select (`calendar_entries?select=*,mg_events(id,status,server_id,mg_registrations(count))`), no extra SQL function (super admin can read everything under the existing policies).

### D-11. Seed, backfill, link (FR-018, D9)

**Decision.**

- Seed: 13 rows from a `VALUES` list of opening Mondays (spec list), `starts_at = (opening + 7)` at 00:00 UTC, `ends_at = starts_at + 7 days`, `all_day = true`, plain `INSERT` (a conflict on a fresh table is a bug and must abort the migration).
- Backfill: one `mg` entry per distinct existing Monday `start_date` not already covered by a seeded entry (`WHERE NOT EXISTS`), then `UPDATE mg_events SET calendar_entry_id = ce.id FROM calendar_entries ce WHERE ce.type = 'mg' AND (ce.starts_at AT TIME ZONE 'UTC')::date = mg_events.start_date AND mg_events.calendar_entry_id IS NULL` (carries a `WHERE`, compatible with `safeupdate`).
- Expected production result (2026-11-25, after the D-17 pre-flight fix): 16 distinct Monday dates (2026-04-27 ... 2026-11-23) give 16 backfilled entries, plus 13 seeded = **29 entries**; every existing `mg_events` row (all 8 servers' events, including the former Wednesday row now on 2026-08-03) is linked, 0 unlinked.

### D-12. Cron replacement (FR-014)

**Decision.** In the same transaction as step 8 of D-01: guarded `cron.unschedule` (it raises when the job is absent) then `cron.schedule` with the same name and expression. The command text is the plain `SELECT public.mg_create_events_from_calendar();`, so no nested dollar-quoting problem exists (the `$inner$` issue disappears). A new `jobid` is assigned (harmless). The assertion block afterwards makes "two creation jobs" impossible to commit. The other three transition jobs and the Discord dispatcher are untouched (FR-032).

`cron.schedule` with an existing name is an upsert in pg_cron 1.6, so the explicit unschedule is redundant but kept for traceability and to match the spec wording.

### D-13. Why the front-end must not filter with `.neq('status','cancelled')` (spec contradiction C-2)

PostgREST casts the literal to the column type. Before migration 47 the enum has no `cancelled` label, so `status=neq.cancelled` fails with `invalid input value for enum mg_event_status` (HTTP 400) and `loadCurrentEvent` would return `null`: **the player's MG card would disappear on production** if the front-end were deployed first. The spec states "Frontend deployed before the migration: ... nothing breaks", which is only true if the filters never mention the new label.

**Decision.** `loadCurrentEvent` and `loadSpends` use an **inclusion list of existing labels** (`.in('status', MG_NON_CANCELLED_STATUSES)` with the constant `['upcoming','registration_open','registration_closed','selection_published','ongoing','finished']`; `loadCurrentEvent` additionally excludes `finished`, i.e. `MG_ACTIVE_STATUSES`). It works before and after the migration and keeps the spec's "migration first, frontend second is recommended, not required". The model comment must say a future status has to be added to the lists. Only the new `loadRecentCancelledEvent` (FR-074) uses `.eq('status','cancelled')`, and its failure is already specified to hide the notice.

### D-14. Front-end loading strategy

- **Promise-based services + `resource()`** in smart components (the repo's services and the seasons page do this; no genuine event streams here, so no `rxResource`). A short comment documents the choice in `calendar.service.ts`.
- **Failure must be distinguishable from "empty"** (scenario 4.5: never a false alarm). Existing `MgEventService.loadCurrentEvent` swallows errors and returns `null`, which would turn a network error into "no MG planned". Decision: add `loadCurrentEventStrict()` (throws) next to the unchanged swallowing `loadCurrentEvent()`; both share one private query; banner `resource()` loaders call the strict variant and `CalendarService.loadEntries()` (throws). The notice loader and `loadServerConfig` already degrade to `null`, which hides banners (they require a config row).
- **Banner state is computed in pure util functions**, wrapped in a `computed()` of the parent that returns `{ kind: 'none' }` whenever a resource `hasValue()` is false or `error()` is set. The banner component is dumb, renders `state()` through an `@switch`, has `role="status"`, and no function call in its template.
- **No function in templates** (project rule). The seasons page does call methods from its template (`isExpanded(...)`); the new page must not copy that. List rows are view models built in a `computed()` (`CalendarEntryRow` with precomputed `stateKey`, `canShift`, `canCancel`, display strings).
- **Dates.** UI model keeps date-only values as ISO strings `YYYY-MM-DD` (UTC calendar days) so equality and RPC payloads never involve a `Date`; the picker value is re-anchored with `Date.UTC(y, m, d)` (`reanchorToUtcMidnight`, FR-041), the Monday-only filter uses the local weekday of the picked cell exactly like the seasons page (`getDay() === 1`, valid because the cell is a local calendar day). MG entries are displayed with the `date` pipe on date-only strings (parsed as local midnight by Angular, so the same calendar day for every viewer); timestamped non-MG entries use `date:'short'` plus `z` (zone name) in the viewer's zone. In `en-US` Angular's `z` prints `GMT+1`, not `CET` (ICU); the example in the spec ("20:00 CET") is therefore indicative, the requirement "UTC / zone abbreviation next to the time" is met by `GMT+1`/`UTC+1`.
- **Signal Forms** for the three forms (assistant, non-MG entry, shift picker); custom validators (`evenWeeks`, `endsAfterStart`) via `validate()` with their error kinds mapped through `getFieldErrorKey(errors, customErrorKeys)` from `form-validation.utils.ts` (extended only if a kind is reusable).
- **Error codes to i18n.** `MG_CAL_ERROR_KEYS: Record<McgCalErrorCode, string>` as literal strings in code (the `i18n:check` script detects usage by scanning source for key strings, so a literal map keeps the keys "used").
- **Dialogs.** The shared `ConfirmDialogComponent` takes a plain `message: string`; shift (list of moved entries) and cancel (counts) need structure, so a new dumb `calendar-confirm-dialog` is created instead of overloading the shared one.
- **i18n files** are a merge hotspot (14 JSON files). The key catalogue is fixed in `contracts/frontend-contract.md`, and one task owns the file edits.

### D-15. `mg_events` status audit (FR-072, SC-007)

A grep of status-dependent code gives these call sites to review when `cancelled` joins the union: `mg-event-card` (`showRegistrationActions`, `showWaiting`: status-explicit, safe), `mightiest-governor` (`showEventCard`, `showStatuses`: safe), `mg-admin-tab` (`currentPanelKind`; the status chip builds its label with `'mg.event.' + status`, so the **missing key `mg.event.cancelled` would render the raw key**: add it in the 14 locales), `mg-selection-panel`, `mg-selection.util`, `activity.service`, `home.page`. Because `loadCurrentEvent` excludes cancelled events, a cancelled event only reaches the UI through the notice (FR-063); the key and an exhaustive `Record<MgEventStatus, ...>` where one exists make the type system flag any missed switch.

### D-16. Tests: SQL layer

**Decision.** A plain-SQL, framework-free script `supabase/tests/47-mg-global-calendar.test.sql`: `BEGIN; ... ROLLBACK;`, a tiny `pg_temp` assertion helper (`RAISE EXCEPTION` on failure, `RAISE NOTICE 'PASS Sxx'`), client identity simulated with `SELECT set_config('request.jwt.claims', '{"sub":"<uuid>","role":"authenticated"}', true)` and `SET LOCAL ROLE authenticated` (then `RESET ROLE`), time simulated through the `p_now` parameter of the internal functions and through fixtures dated relative to `now()` for the client functions (their clock is deliberately not injectable). Cases are listed in `plan.md` section "Test strategy".

**Rationale.** pgTAP is not installed in production and `supabase test db` needs the CLI (F8) and a `supabase/tests/database/` layout; plain `DO` blocks run unchanged in the SQL editor, `psql` or the CLI. **The script creates fixture `auth.users`/`user_profiles` rows, so it is meant for the local rehearsal database, never for production.** Production gets read-only post-check queries instead (quickstart Q8).

### D-17. Pre-flight anomaly: the Wednesday demo event (spec P1, finding F4)

**Decision.** Re-date the single row to the cycle's Monday **before** the migration, as an explicit, reviewed, one-row data fix executed by the product owner (not hidden in the migration; the migration only verifies):

```sql
-- illustrative, run once, after PO validation
UPDATE mg_events
SET start_date = '2026-08-03', end_date = '2026-08-09',
    registration_open_at = '2026-07-27', registration_close_at = '2026-07-30'
WHERE id = 'a734f6ab-98f4-4814-b952-5b3269023401' AND start_date = '2026-08-05';
```

Safe because: ERA008-DEMO has no other event on 2026-08-03 (no `(server_id, start_date)` collision; checked), the event is `finished`, and the week used for DKP is the ISO week of `start_date`, which is the same Monday-to-Sunday week for 08-03 and 08-05, so the leaderboard effect is nil (and the 6-week window has long passed anyway). It then backfills onto the 2026-08-03 entry like the other servers' events. This is data on the demo server only.

**Alternatives.** `DELETE` (loses 13 registrations and 10 selection rows of demo data; destructive on production); `NOT VALID` CHECKs (leaves SC-003 at 99 percent and a latent failure the day anything updates that row); excluding it from the backfill (leaves an unlinked event forever). Decision requested from the product owner: PO-1.

### D-18. e2e path now that clients cannot insert/delete events (spec open question 1)

**Options.**

| | A. Service-role key in a local uncommitted env var | B. Test-only `SECURITY DEFINER` helpers bounded to the demo server |
|---|---|---|
| New secret | Yes: the **production** service-role key on a developer machine (and later in GitHub secrets). One leak = full read/write on all production data; the DB is shared with production (no staging). | None: reuses `e2e_admin`. |
| Blast radius | Whole database, RLS bypassed, bounded only by guards in test code. | SQL-bounded: the function itself refuses anything but the demo server and three reserved dates. A leaked `e2e_admin` password already gives admin power on that server today. |
| Consistency with repo policy | Breaks the documented rule "Aucune clé service-role" (DEVELOPMENT_STATUS e2e section). | Keeps it. |
| Production code surface | None. | Three small functions in the production schema, clearly named `e2e_*`, removable by a rollback script. |
| Works in CI later | Needs a prod key as a CI secret. | Needs only the existing e2e secrets. |

**Decision: B**, delivered as a separate migration `supabase/48-e2e-demo-mg-helpers.sql` (+ rollback), so the switch-over migration 47 stays free of test code and 48 can be applied or dropped independently. Functions (contracts in `contracts/internal-functions.md`): `e2e_mg_seed_event(p_start_date, p_status, p_published)`, `e2e_mg_delete_event(p_start_date)`, `e2e_mg_set_status(p_start_date, p_status)`. Each: caller must be an `admin` of the server whose **name is exactly `ERA008-DEMO`** (unique name, F5), `start_date` must be one of three **reserved Mondays**, status restricted to a short allow-list, dates derived inside the function (so the CHECKs always hold), granted to `authenticated` only. They pass the guard trigger because they are definer functions (D-06).

**If the product owner refuses test code in production**, fall back to A with these mitigations: key only in `.env.e2e`, `.gitignore`d (already), a second guard in `openDemoSession`, and no CI use. Decision requested: PO-2 (recommendation B).

**Masking by the new ascending order (FR-070).** With `ORDER BY start_date ASC` the real current event of the demo server (for example 2026-12-07) wins over the far-future 2031 flow event, so the flow specs would no longer see their seeded event. The spec's default (delete the demo server's own non-finished events first) is destructive (those events are never recreated: no catch-up). **Better decision**: move the **non-finished** flow event to a far-**past** reserved Monday (`2020-03-02`, a Monday): ascending order then selects it first, nothing real is touched, and `loadSpends` (window `>= sinceDate`) ignores it. The **finished** correction event stays at `2031-01-06` because `loadLastFinishedEvent` keeps `DESC` order (the real last finished event is 2026-11-09 and must lose). Reserved set: `2031-01-06` (finished), `2020-03-02` (flow), `2031-03-03` (cancelled-notice spec: a cancelled event must have `end_date >= today` to show the notice). Verified: all three satisfy the new CHECKs (Mondays; `close = start - 4`, `open = start - 7`). To confirm during implementation: no component compares event dates with "today" in a way that disables the registration card for a past-dated event (grep shows status-only conditions today).

### D-19. Demo scripts (`supabase/demo/*.sql`)

`mg-event-era008-lifecycle.sql` inserts an event with `CURRENT_DATE - 24 ... - 18` (not a Monday): it would now violate the CHECKs. Decision: derive Mondays (`date_trunc('week', CURRENT_DATE)::date - 21` as `start_date`, with the other columns computed from it) and note in the header that the script must be run as `postgres` in the SQL editor (the guard lets it through) and never as a client. Its later `UPDATE ... SET status` statements already carry `WHERE` clauses. `mg-event-era008-cleanup.sql` needs no change (deletes by server). Both stay "not numbered migrations".

### D-20. Existing 3 transition crons are untouched, and they stay correct (FR-032)

With the CHECKs every event has `start_date` Monday, `registration_close_at` Thursday, `end_date` Sunday, so the three exact-date tests always match. A SQL test (S11) runs the three production command texts against fixtures of the new shape. The `cancelled` status is outside every `WHERE status = ...` of the three jobs.

### D-21. Rehearsal on a local stack (spec P5)

**Facts (F8).** No database branch (free plan). Docker Desktop is installed but its daemon is stopped; `supabase` CLI and `psql` are absent. Nothing may be installed for this plan.

**Decision.** Rehearse in a throw-away container of the **`supabase/postgres`** image (PostgreSQL 17 with the Supabase roles `anon`, `authenticated`, `service_role`, `authenticator`, the `auth` schema helpers and `pg_cron`), driven with `docker exec ... psql` (psql lives inside the image). A bootstrap script (`supabase/tests/rehearsal/bootstrap.sql`, committed, no data) recreates the minimal production-faithful schema: `servers`, `user_profiles`, `mg_*` tables with their columns, the three RLS helper functions (production definitions captured in Part D), the policies of migrations 26/35, and the four cron jobs with the **production command texts**. A second generated file (`load-snapshot.sql`, **not committed**, produced from read-only `SELECT`s) loads the production rows of `servers`, `server_mg_config` and `mg_events` (ids and dates only, no personal data). Replaying the 46 repo migrations from scratch is rejected: production also holds objects created outside the numbered files (migration 37's comment cites a timestamped migration) so a replay would not be faithful, and it needs `auth` internals.

**Verification items the rehearsal must settle** (each has a quickstart step): V1 exclusion constraint is accepted (immutability) and behaves under three session time zones; V2 `ADD VALUE` inside the transaction; V3 `cron.schedule`/`unschedule` rollback with the transaction and the final job text; V4 the guard trigger under `SET ROLE authenticated` vs definer functions; V5 `has_function_privilege` matrix; V6 simulated Monday 2026-11-30 and idempotence; V7 cascade shift; V8 rollback script round-trip; V9 `safeupdate` and `statement_timeout = 8s` emulated (`SET statement_timeout`, optional `safeupdate` load if present in the image).

**If Docker cannot be started**, the only responsible fallbacks are: (a) a second free Supabase project (needs product-owner confirmation of cost/quota; `create_project` is not run by this plan), loaded with the same bootstrap + snapshot; (b) none other: running the migration "in a transaction that is rolled back" on production is explicitly out of bounds (shared database, cron side effects). If neither is possible by Thursday 2026-11-26 noon UTC, the risk register's "no rehearsal" branch applies (PO-3).

### D-22. Agent context file

`.specify/scripts/powershell/*.ps1` are blocked by the machine's execution policy and are not bypassed. `setup-plan.ps1` was replaced by deriving `FEATURE_DIR` from `.specify/feature.json` and creating the files by hand from `.specify/templates/plan-template.md`. No agent-context update script was run (`update-agent-context` is absent from `.specify/scripts/powershell/` anyway; nothing to do).

---

## Part C. Contradictions, stale statements and refinements found in the spec

| ID | Where | Finding | Resolution |
|---|---|---|---|
| C-1 | Deployment plan, order step (4) | Says "create the functions **and the `server_mg_config` trigger**". Contradicts the Clarifications (2026-11-24: "the `server_mg_config` trigger and its function are removed from the design") and FR-016. Stale wording. | Plan follows FR-016: no trigger. The stale words were removed from `spec.md` (evident factual error; reported to the caller). |
| C-2 | Edge case "Frontend deployed before the migration: ... nothing breaks" | False if the front end filters `status` with the new label (D-13). | Plan makes it true by using inclusion lists of existing labels. Spec text left as is (it becomes correct). |
| C-3 | FR-014 "registration deadline still ahead" | Date-level reading can create a stuck event after the Thursday 23:59 cron (D-09). | Timestamp-level cutoff `p_now < Thursday 23:59:00 UTC`; equivalent on the Monday run. |
| C-4 | Pre-flight P1 | Not satisfied today (F4): one Wednesday demo event. | D-17 / PO-1. |
| C-5 | Open question 1 default ("remove the demo server's own non-finished events before seeding") | Destructive for the demo server's real cycle events (no catch-up recreates them). | Far-past reserved date for the non-finished flow event (D-18). |
| C-6 | D8 / FR-040 example "20:00 CET" | Angular/ICU prints `GMT+1` in `en-US`. | Requirement kept ("zone abbreviation next to the time"); example is indicative. |
| C-7 | Spec Edge case "Late application ... the old cron may already have created the 2026-12-07 events without a link" | Events of the 5 unconfigured servers would also exist. | The migration does not delete them (non-destructive); they are linked by the backfill only if a matching entry exists (it does) and they are reported by the post-check; they finish normally. Documented risk R-7. |
| C-8 | FR-023 "target of every moved entry MUST satisfy the creation rules" with "opening Monday strictly after today" | For the **opened** selected entry (postponement only) the opening Monday is already past by definition. | The rule applies to entries not yet opened; the opened selected entry must move strictly **later** (spec edge case "Shift of an opened entry only goes later"), stated explicitly in the contract. |

---

## Part D. Snapshots (read-only, 2026-11-25) used by the rollback and the rehearsal

**P3. Production command of `mg-create-events` (jobid 1, `0 0 * * 1`, active, user `postgres`)** - re-capture on the day of the application and diff against this text; the rollback script embeds the freshly captured text, not this one if they differ:

```text
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
```

The other three MG jobs (ids 2, 4, 6) and the Discord dispatcher (id 7) must be unchanged after the migration; their texts are in `26-mg-event.sql` / `28-mg-failsafe-fix-full-ffa.sql` and match production.

**RLS helper definitions** (for the rehearsal bootstrap): `is_super_admin(user_uuid uuid)` = `SELECT role = 'super_admin' FROM public.user_profiles WHERE id = user_uuid` (SQL, `SECURITY DEFINER`, `search_path = public`); `is_user_admin(uuid)` = `role IN ('admin','super_admin')`; `get_user_server_id(uuid)` = `SELECT server_id FROM public.user_profiles WHERE id = user_uuid`; `is_super_admin()` (no argument) reads `auth.uid()`.

**mg_events production policies** (to be reproduced in the bootstrap): SELECT "Members can view their server MG events"; INSERT "Admins can insert MG events"; UPDATE "Admins can update MG events"; DELETE "Admins can delete MG events".
