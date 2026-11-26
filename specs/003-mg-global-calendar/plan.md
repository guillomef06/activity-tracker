# Implementation Plan: Global Calendar Driving MG Creation

**Branch**: none created (spec directory `003-mg-global-calendar`; work stays on `dev`) | **Date**: 2026-11-25 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/003-mg-global-calendar/spec.md` (Clarifications 2026-11-24/25 and decisions D1-D9 are frozen).

**Artifacts of this plan**: [research.md](research.md) | [data-model.md](data-model.md) | [contracts/client-functions.md](contracts/client-functions.md) | [contracts/internal-functions.md](contracts/internal-functions.md) | [contracts/frontend-contract.md](contracts/frontend-contract.md) | [quickstart.md](quickstart.md). `tasks.md` is produced later by `/speckit-tasks`.

## Summary

The MG cycle stops being hard-coded. A global `calendar_entries` table (written by the super admin, readable by every authenticated user) drives creation: a rewritten `mg-create-events` cron (same name, same Monday 00:00 UTC schedule) calls an internal SQL function that creates one `registration_open` event per server **that has a `server_mg_config` row** for each entry whose opening Monday is today. Three super-admin SQL functions create/duplicate, shift (entry + every following entry, atomically) and cancel entries; database constraints (Monday shape, 14-day minimum gap through an exclusion constraint, uniqueness, date shape of `mg_events`) make the three untouched transition crons impossible to get stuck; a guard trigger plus dropped INSERT/DELETE policies leave clients one single write on `mg_events` (the selection publication). The Angular side adds a lazy super-admin page (list, assistant with mandatory preview, non-MG form, shift/cancel dialogs), one shared dumb banner component used in three places plus the cancellation notice, a `CalendarService`, a pure `mg-calendar.util.ts`, `MgEventService` changes (ascending current event, cancelled exclusion), and 14 locale updates.

The hard constraint is timing: the migration must be applied **no later than Friday 2026-11-27** (the old parity job would otherwise create the 2026-12-07 events for all 8 servers on Monday 2026-11-30 00:00 UTC). The front end can follow; it is written to work before and after the migration (research D-13).

## Technical Context

**Language/Version**: TypeScript (Angular 22.2.x, strict), PL/pgSQL on PostgreSQL 17.6 (Supabase)

**Primary Dependencies**: Angular 22.2 (signals, `resource()`, Signal Forms `@angular/forms/signals`), Angular Material 22.2, `@ngx-translate/core` 17, `@supabase/supabase-js` 2.118, pg_cron 1.6.4. No new npm dependency.

**Storage**: Supabase PostgreSQL (single project shared with production; no staging, no database branch). One new table `calendar_entries`, one new enum, one new enum value, columns/constraints/trigger on `mg_events`, five new functions plus two trigger functions, one replaced cron job.

**Testing**: Vitest 4 (`npm run test:ci`), ESLint (`npm run lint`), `npm run i18n:check`, Playwright 1.64 (`npm run e2e`, local only, shared Supabase project), a new plain-SQL test script run on a local rehearsal database.

**Target Platform**: browser PWA on GitHub Pages (mobile-first, 320px), Supabase hosted backend.

**Project Type**: web application (Angular SPA + Supabase backend scripts in `supabase/`).

**Performance Goals**: not a constraint (a handful of rows; every statement far below the role `statement_timeout` of 8 s).

**Constraints**: migration applied by Friday 2026-11-27 and never around Sunday 23:59 / Monday 00:00 UTC; all dates UTC; no notifications; transition crons unmodified; `safeupdate` and `lock_timeout = 8s` role settings in the SQL editor (every `UPDATE`/`DELETE` needs a `WHERE`); the repo has no `supabase` CLI, no `psql`, and Docker's daemon is stopped (nothing may be installed).

**Scale/Scope**: 8 servers (3 opted in), about 30 calendar entries per half-year, 14 locale files, about 35 new TypeScript files, 1 + 1 SQL migrations.

## Constitution Check

`.specify/memory/constitution.md` is the **unfilled spec-kit template** (placeholders `[PROJECT_NAME]`, `[PRINCIPLE_1_NAME]`, ...): no constitution has been ratified for this repository, so there are no project-specific gates to evaluate and none is invented here. The de-facto governing rules are `CLAUDE.md` (Angular guidelines and the Definition of Done) and the frozen decisions of the spec. The check below is therefore a **CLAUDE.md conformance check**, before and after design.

| Rule (CLAUDE.md) | Status |
|---|---|
| Standalone, signals, OnPush, `inject()`, `@if`/`@for`, `input()`/`output()` | Conform (frontend contract) |
| Separate TS/HTML/SCSS/spec files, `templateUrl`/`styleUrl` | Conform (file tree below) |
| No function in templates, no `::ng-deep` | Conform: view models in `computed()`; note that the seasons page used as UI precedent calls methods in its template, **not** to be copied |
| `resource()`/`rxResource()` for loading | Conform: `resource()` with Promise services (research D-14) |
| Signal Forms + shared validation utility | Conform (assistant, non-MG form, shift picker) |
| Material first, `mat-form-field` around inputs, `mat-error` / `mat-hint` | Conform |
| Mobile-first 320px, 44px targets, a11y, `role="status"` | Conform |
| i18n 14 languages, `npm run i18n:check` | Conform (catalogue in the frontend contract) |
| Security: validate client and server, RLS, grants | Conform: SQL is the authority, TS util mirrors it |
| Definition of Done (tests, `DEVELOPMENT_STATUS.md`, no regression, lint OK) | Mapped in "Definition of Done" below |

Post-design re-check: no violation; **Complexity Tracking** is empty. Two items deserve explicit mention rather than a gate: the new test-only `e2e_*` functions in the production schema (research D-18, product-owner decision PO-2) and the rehearsal bootstrap files under `supabase/tests/`.

## Project Structure

### Documentation (this feature)

```text
specs/003-mg-global-calendar/
├── spec.md
├── plan.md                         # this file
├── research.md                     # decisions, verified facts, contradictions
├── data-model.md
├── quickstart.md                   # rehearsal, validation, deployment, Monday checks
├── contracts/
│   ├── client-functions.md         # create / shift / cancel RPC contracts + error codes
│   ├── internal-functions.md       # internal functions, triggers, cron, privilege matrix, e2e helpers
│   └── frontend-contract.md        # services, util, banner, page, i18n catalogue
├── checklists/requirements.md
└── tasks.md                        # NOT created here (/speckit-tasks)
```

### Source code (repository root) - exact new and modified files

```text
supabase/
├── 47-mg-global-calendar.sql                     NEW  switch-over migration (single BEGIN/COMMIT)
├── 47-mg-global-calendar.rollback.sql            NEW  delivered, never auto-run
├── 48-e2e-demo-mg-helpers.sql                    NEW  e2e_* helper functions (decision PO-2)
├── 48-e2e-demo-mg-helpers.rollback.sql           NEW
├── tests/
│   ├── 47-mg-global-calendar.test.sql            NEW  rolled-back plain-SQL assertions (local rehearsal DB only)
│   └── rehearsal/
│       ├── bootstrap.sql                         NEW  minimal prod-faithful schema + roles + cron jobs (no data)
│       └── README.md                             NEW  how to run the rehearsal with `docker exec` (not committed data)
└── demo/mg-event-era008-lifecycle.sql            MOD  Monday-aligned dates, header note (research D-19)

src/app/
├── shared/
│   ├── models/calendar-entry.model.ts            NEW
│   ├── models/mg-event.model.ts                  MOD  'cancelled', calendar_entry_id
│   ├── models/index.ts                           MOD  exports
│   ├── constants/mg-calendar.constant.ts         NEW  N = 2, 26 weeks, 13 batch, 14 days, status lists
│   ├── utils/mg-calendar.util.ts (+ .spec.ts)    NEW  derivation, series, classification, state, banners
│   └── components/mg-calendar-banner/            NEW  .ts .html .scss .spec.ts (dumb)
├── core/services/
│   ├── calendar.service.ts (+ .spec.ts)          NEW
│   └── mg-event.service.ts (+ .spec.ts)          MOD  FR-070/071/074, strict loader
├── pages/super-admin/
│   ├── calendar/                                 NEW  page + 5 components (frontend contract section 5)
│   └── dashboard/super-admin-dashboard.page.*    MOD  quick-action card + alert banner (+ spec)
├── pages/server-settings/components/mg-admin-tab/mg-admin-tab.component.*   MOD  banner, load wiring (+ spec)
├── pages/home/components/mightiest-governor/mightiest-governor.component.*  MOD  next-MG banner, cancellation notice (+ spec)
├── app.routes.ts                                 MOD  lazy `calendar` child under superAdminGuard (+ routes spec if present)
└── (status audit, research D-15)                 REVIEW mg-event-card, mg-selection-panel, mg-selection.util, home.page

src/assets/i18n/{ar,de,el,en,es,fr,hi,id,it,ko,ku,pt,tr,zh}.json   MOD  new keys, one owner

e2e/
├── helpers/mg-seed.ts                            MOD  RPC-based writes (e2e_*), reserved dates 2031-01-06 / 2020-03-02 / 2031-03-03
├── specs/mg-flow.spec.ts                         MOD  flow date constant
├── specs/mg-cancelled-notice.spec.ts             NEW  cancellation notice on the demo home card
└── specs/auth.spec.ts                            MOD  /app/super-admin/calendar denied to a plain admin

DEVELOPMENT_STATUS.md, SPEC_MG_EVENT.md           MOD  at implementation time (Definition of Done)
.gitignore                                        MOD  `supabase/tests/rehearsal/*.local.sql` (production snapshot, never committed)
```

**Structure Decision**: the existing single Angular workspace plus the `supabase/` script folder. Smart/dumb split as in the repo: the page, `mg-admin-tab`, `mightiest-governor` and the dashboard are smart; list, wizard, form, dialogs and banner are dumb.

## Backend architecture (summary; details in research and contracts)

1. **One transaction, fixed order** (research D-01): guard block -> `ADD VALUE 'cancelled'` -> enum/table/constraints/RLS -> `mg_events` columns, constraints, trigger, policy/grant changes -> functions -> seed -> backfill and link -> one-off creation -> cron swap -> final assertions. `'cancelled'` is never evaluated before `COMMIT`: only plpgsql bodies mention it (D-02).
2. **14-day rule**: non-deferrable GiST exclusion constraint on an immutable UTC `daterange` expression (`[start, start + 14)`), partial on `type = 'mg' AND cancelled_at IS NULL` (D-03). **Cascade shift** without transient violations by ordered single-row updates (last-to-first when postponing, first-to-last when advancing), after pre-validating every final position.
3. **Locking**: entry rows `FOR UPDATE` in ascending order, then event rows by id; the transition crons serialise through the event-row lock and re-check their `WHERE` (D-05).
4. **`mg_events` protection**: `BEFORE UPDATE` guard trigger, `SECURITY INVOKER`, keyed on `current_user IN ('authenticated','anon')` (definer functions run as `postgres`, so they pass; crons, SQL editor and `service_role` pass); only `registration_closed -> selection_published` with `selection_published_at` set and every other column unchanged is allowed to clients; INSERT/DELETE policies dropped **and** table privileges revoked (D-06).
5. **RLS/grants**: calendar SELECT for `authenticated`, writes for super admin on non-MG rows only; the five definer functions plus triggers follow the matrix of `contracts/internal-functions.md` (explicit `PUBLIC`, `anon`, `authenticated` revokes, pattern 34/37/38) (D-07).
6. **Cron**: guarded `unschedule` + `schedule` of the same name and expression, command `SELECT public.mg_create_events_from_calendar();`, plus an assertion that exactly one such job exists; the production text of the old job is saved in `research.md` Part D and re-captured on the day (D-12).
7. **Seed / backfill / link**: 13 seeded entries; 16 backfilled Monday entries; every event linked; pre-flight fix of the single Wednesday demo event (D-11, D-17).
8. **Creation eligibility** refined to a timestamp (until Thursday 23:58 UTC) so a late run can never create an event that no cron will close (D-09).

## Frontend architecture (summary)

- **New**: `calendar.service.ts`, `mg-calendar.util.ts`, `mg-calendar.constant.ts`, `calendar-entry.model.ts`, `MgCalendarBannerComponent`, page `/app/super-admin/calendar` (lazy, under `superAdminGuard`) with list / assistant / non-MG form / confirm dialog / shift dialog.
- **Loading**: `resource()` over Promise services; loaders throw so failures are visible; every banner computes `none` on error (never a false alarm); the swallowing `loadCurrentEvent` gets a strict twin for the admin banner (D-14).
- **Existing files** per the spec "Impact" table: `mg-event.model.ts`, `mg-event.service.ts`, `super-admin-dashboard.page.*`, `app.routes.ts`, `mg-admin-tab.component.*`, `mightiest-governor.component.*`, 14 locale files, `e2e/helpers/mg-seed.ts` + specs, `supabase/demo/*.sql`, `SPEC_MG_EVENT.md`, `DEVELOPMENT_STATUS.md`.
- **Forms**: Signal Forms for the assistant (`openingMonday`, `duplicate`, `weeks` with `evenWeeks`), the non-MG form (`title`, `type`, `allDay`, UTC datetimes, `endsAfterStart`) and the shift picker; errors via `getFieldErrorKey` with custom kinds.
- **Errors**: stable `MG_CAL_*` codes from the RPC `message`, mapped through a literal `MG_CAL_ERROR_KEYS` record to i18n keys (the i18n script then sees the keys as used).
- **Front-end compatibility with both orders of deployment**: status filters use inclusion lists of existing enum labels (D-13).

## Open questions resolved here, with recommendation

1. **e2e seeder path** (spec open question 1): **recommended B**, test-only bounded `SECURITY DEFINER` helpers in a separate migration 48 (no production service-role key anywhere), plus a far-past reserved Monday (`2020-03-02`) for the non-finished flow event so the ascending order selects it without deleting anything real (research D-18). Fallback A (local service-role key) is documented. Decision PO-2.
2. **Demo scripts**: `mg-event-era008-lifecycle.sql` is realigned on Mondays; the cleanup script is unchanged (research D-19).
3. **Other points found** (all in research Part C): stale "trigger" wording of the spec (corrected, reported), false "frontend first nothing breaks" claim (made true by inclusion lists), Thursday-23:59 stuck-event window (timestamp cutoff), Wednesday demo event blocking P1 (re-date), `GMT+1` vs `CET`, unlinked events of unconfigured servers on a late application, opened-entry rule wording.

## Test strategy

### Layer 1 - SQL (rehearsal database, rolled back): `supabase/tests/47-mg-global-calendar.test.sql`

Plain `DO` blocks with an assertion helper; fixtures (servers, `auth.users`, `user_profiles`, config rows, entries) created inside the transaction; client identity via `request.jwt.claims` + `SET LOCAL ROLE`. Run **after** the migration commit. Cases:

| ID | Subject |
|---|---|
| S1 | Structure: constraints exist, `ex_calendar_entries_mg_min_gap` accepted; MG shape CHECK under `SET timezone` in `America/Los_Angeles`, `Asia/Tokyo`, `UTC` (non-Monday, non-midnight, wrong length, `all_day = false` refused) |
| S2 | 14-day rule: +7 refused, +14 accepted, +13/+8 refused, cancelled entry ignored, `pvp` unaffected, direct insert/update by `postgres` also refused (holds for the seed and backfill) |
| S3 | `create_mg_calendar_entries`: non-super-admin and anonymous refused; all five outcomes; precedence; per-date isolation; ascending self-interaction (M and M+14); input errors (empty, 14 elements, NULL, duplicate); audit columns; **no event created** |
| S4 | Simulated Monday `2026-11-30 00:00+00`: fixture of 8 servers / 3 configs / seeded entries -> exactly 3 events with `registration_open`, dates 11-30/12-03/12-07/12-13, `calendar_entry_id` set, 0 for the 5 others; second call returns 0; cancelled entry skipped; empty calendar returns 0; Wednesday run creates, Thursday 23:58 creates, Thursday 23:59 and Friday do not; **no automatic catch-up** (insert a config row afterwards: nothing created, no trigger on `server_mg_config`) |
| S5 | `shift_mg_calendar_entry`: not-opened shift moves entry + followers and touches no event; opened shift with all `registration_open` updates dates, keeps `registration_open_at`, status and registrations; refused when one event is `registration_closed` (nothing changed); cascade of 13 entries by +1 week without violation; advance (negative offset) of unopened entries; collision with a kept cancelled entry; too close to a non-moved entry; opening passed; not Monday; zero offset; read-only/cancelled/ongoing; a following entry already opened; foreign event on the target date; atomicity (a forced failure on the last moved entry leaves 0 changes); audit columns of every moved row |
| S6 | `cancel_mg_calendar_entry`: physical delete when never opened; mark + events `cancelled` when events exist; refused for `ongoing`/`finished`/already cancelled/past start; registrations kept; date of a deleted entry reusable, date of a kept cancelled entry not |
| S7 | `mg_events` guard: as `authenticated` admin: INSERT and DELETE denied; UPDATE of status other than the publication transition, of any date, of `calendar_entry_id`, `selection_published_at` alone: denied; publication transition allowed and sets the timestamp; as super admin same; as `anon`: nothing; `postgres`, `service_role`, definer functions: allowed; the guard function is `SECURITY INVOKER` and the definer functions are owned by `postgres` (introspection) |
| S8 | `calendar_entries` RLS: member reads all; anonymous reads none; super admin writes a `pvp` row and edits/deletes it freely; super admin and member cannot insert/update/delete an `mg` row; a `pvp` row cannot be turned into `mg`; `cancelled_at` on a `pvp` row refused; forged `created_by` ignored |
| S9 | Introspection: privilege matrix of `contracts/internal-functions.md`; `proconfig` search paths; policies on `mg_events` (no INSERT/DELETE); enum has `cancelled`; no non-plpgsql function mentions `cancelled`; exactly one `mg-create-events` job, active, new command; the three transition jobs and the Discord job byte-identical to the snapshot |
| S10 | Migration data (run on the snapshot-loaded rehearsal DB): 13 seeded + 16 backfilled entries; every event linked; Wednesday event handled; second application of the file aborts on the guard; pre-flight guard aborts on a seeded bad row (negative test run separately) |
| S11 | Transition crons unchanged and still correct: run the three production command texts against new-shape fixtures (close Thursday, start with published selection and failsafe, end Sunday); a `cancelled` event is untouched by all of them |
| S12 | Rights side effects: super admin deletes a server and its events cascade (revoked `DELETE` does not break RI); existing registration/selection policies unchanged |

Two-session scenarios that a single script cannot express (lock serialisation, FR-031/US3.11) are manual steps with two `docker exec psql` sessions (quickstart Q6).

### Layer 2 - Angular unit specs (Vitest)

Per frontend contract section 8: `mg-calendar.util.spec.ts` (largest: derivation, series, classification, states, shift preview, banners, UTC re-anchor), `calendar.service.spec.ts`, updated `mg-event.service.spec.ts`, specs for the banner, the five calendar components, the page, and the three modified smart components, the dashboard, and the route. Guards against regression: the existing suite (1177 tests according to `DEVELOPMENT_STATUS.md` of 2026-11-03; re-measure at the start of phase 2) must stay green.

### Layer 3 - e2e (Playwright, local, demo server only)

Possible: (a) `/app/super-admin/calendar` redirects a plain admin (extend the existing guard test); (b) the MG flow and correction specs keep passing with the new seeder (proves FR-070 ordering: the far-past flow event wins over the real demo event; the 2031 finished event still wins `loadLastFinishedEvent`); (c) new `mg-cancelled-notice.spec.ts`: a cancelled demo event dated 2031-03-03 shows "The MG of ... was cancelled" on the home MG card and is not offered as current event; (d) a registration/selection flow on the demo server proving that admin **publication still works** under the guard trigger (already in `mg-flow.spec.ts`, now an explicit regression guard). **Not possible**: any super-admin screen (no super-admin test account; unchanged limitation of spec 002), the assistant, shift, cancel, the super-admin and server-admin banners fed by real calendar data (the e2e account cannot write the calendar). These are covered by unit specs, the SQL tests and the manual checklist of quickstart Q10, executed by the product owner (a super admin).

### Layer 4 - Rehearsal on a local stack (before production)

Feasibility checked on 2026-11-25: Docker Desktop is installed but its daemon is **not running**; the `supabase` CLI and `psql` are **not installed**; installing is out of bounds for this plan. Procedure (quickstart Q1-Q8): start Docker Desktop, run a disposable `supabase/postgres` container, create the schema with `bootstrap.sql`, load the production snapshot (read-only export), apply `47-...sql`, run `47-...test.sql`, simulate Monday, apply the rollback and re-apply. Fallback if Docker cannot run: second free Supabase project (PO-3); running the migration on production "to roll it back" is not acceptable.

## Phases (deliverable, ordered, with dependencies and parallelism)

Calendar: today Wed 2026-11-25. Only phase 1 is on the critical path of the hard deadline.

### Phase 1 - Migration 47, SQL tests, rollback, rehearsal (**critical path; done by Thu 2026-11-26 evening, applied Fri 2026-11-27 morning UTC at the latest**)

Deliverables: `47-mg-global-calendar.sql`, `47-mg-global-calendar.rollback.sql`, `supabase/tests/47-mg-global-calendar.test.sql`, `supabase/tests/rehearsal/*`, security review report, rehearsal report (V1-V9 answered).

| Track | Agent | Depends on | Can run in parallel with |
|---|---|---|---|
| 1A migration + rollback | `senior-dev` (SQL) | contracts (this plan) | 1B, 2A, 2B, 2C |
| 1B SQL test script + rehearsal bootstrap + snapshot export script | `test-writer` | contracts (writes against signatures) | 1A |
| 1C security review of 47 (RLS, grants, definer functions, guard bypass paths) | `security-reviewer` | 1A draft | 2x |
| 1D rehearsal execution and report | `senior-dev` or product owner (Docker start needed) | 1A + 1B | 2x, 3 |

Exit gate: S1-S12 green in the rehearsal, rollback round-trip green, V1-V9 settled (in particular V1 immutability and V2 enum-in-transaction; failing V2 triggers the file split of research D-02), no open security finding, pre-flight P1-P5 executed on production read-only, product-owner decisions PO-1 and PO-4 taken.

### Phase 2 - Front-end foundation (parallel with phase 1; no production dependency)

Deliverables: models/constants, `mg-calendar.util.ts` (+spec), `calendar.service.ts` (+spec), `mg-event.service.ts` changes (+spec), `MgCalendarBannerComponent` (+spec), i18n catalogue (single owner, 14 files). Tracks 2A util, 2B services/models, 2C banner component, 2D i18n: four agents in parallel (2C and 2D depend only on the contract). Exit: unit specs green, lint and i18n check clean.

### Phase 3 - Super-admin calendar page (depends on 2A, 2B, 2D)

Deliverables: route, page, list, assistant, non-MG form, confirm and shift dialogs, dashboard quick-action card (+specs). Parallel with phase 4 (different files; the dashboard file is touched by phase 4 for the banner, so one agent owns the dashboard changes of both phases).

### Phase 4 - Banners, cancellation notice, status audit (depends on 2A, 2B, 2C)

Deliverables: banner wiring in `super-admin-dashboard`, `mg-admin-tab`, `mightiest-governor` (next-MG banner and cancellation notice above it), `mg.event.cancelled` and the D-15 status audit (+ updated specs, including the "failure hides the banner" and "no config row hides the banner" cases for each parent).

### Phase 5 - e2e path, documentation, Definition of Done (depends on phase 1 applied for the e2e parts)

Deliverables: `48-e2e-demo-mg-helpers.sql` + rollback (written in parallel in phase 1 time, **applied right after 47** if PO-2 = B), `mg-seed.ts` and spec updates, `mg-cancelled-notice.spec.ts`, guard e2e extension, demo script realignment, `SPEC_MG_EVENT.md` and `DEVELOPMENT_STATUS.md` updates, full DoD run (below), advisors check on production.

**Order that reduces risk**: 1 (data and cron safety) -> in parallel 2 -> 3 and 4 -> 5. The front end is deployable at any moment after phase 4 because of the inclusion-list filters; the recommended release order stays "migration, post-checks, then front end", with the front-end release not later than the first need to feed the calendar (about 2027-04, when fewer than 2 future entries remain; the seed horizon is 2027-05-24).

## Deployment plan (refines the spec)

| When (UTC) | Step |
|---|---|
| Wed 11-25 / Thu 11-26 | Phase 1 build and rehearsal. Product owner decides PO-1 (Wednesday demo event), PO-2, PO-3 (Docker), PO-4 (window). |
| Thu 11-26 (afternoon) | **Pre-flight on production, read-only**: P1 (constraint-shape query; expect exactly 1 exception until PO-1 is executed), P2 duplicates, P3 re-capture the four MG job texts and diff with research Part D, P4 `super_admin` exists, e2e/demo leftovers beyond today + 14 days (expect 0). Then **execute PO-1** (one-row re-date) and re-run P1 (expect 0). |
| Fri 11-27, between 08:00 and 12:00 | **Apply `47-mg-global-calendar.sql`** in the SQL editor by the product owner (single script). Never within an hour of Sunday 23:59 / Monday 00:00. If the rehearsal or review is not green by Fri noon, the fallback is the emergency path below, not a rushed apply. |
| Immediately after | **Post-checks** (quickstart Q8): one active `mg-create-events` job with the new command, the three other MG jobs unchanged, 29 entries (16 + 13), 0 unlinked events, 0 constraint violations, `has_function_privilege` matrix, no INSERT/DELETE policy on `mg_events`, `get_advisors(security)` compared with the baseline. Apply `48` (e2e helpers) if PO-2 = B and run the e2e suite. |
| Fri 11-27 to Sun 11-29 | Read-only observation. No schema change, no calendar edit (a shift in this window would also be legal, but do not exercise it before the Monday run). |
| **Mon 11-30 00:05** | Check: exactly 3 new events for 2026-12-07 (ERA008, ERA008-DEMO, Era36), `registration_open`, linked, none for the other 5 servers, no duplicate; `cron.job_run_details` shows a successful run of `mg-create-events`. |
| **Mon 11-30 00:15, only if missing** | Emergency R3: as `postgres` run `SELECT public.mg_create_events_from_calendar();` (idempotent; registrations stay open until Thursday 23:59). Diagnose with `cron.job_run_details`. |
| Thu 12-03 23:59 + 5 min | Check the three events are `registration_closed`. |
| Any time after phase 4 | Release the front end (merge flow of the repository). Super admin runs the manual checklist (quickstart Q10). |

**Rollback** (script delivered, never auto-run): R1 before Monday 00:00 UTC: re-schedule the **freshly captured production text** of the old job, then drop the new functions/triggers and restore the `mg_events` INSERT/DELETE policies and grants; calendar tables and compatible CHECKs may stay. R2 after the Monday run: events created from the calendar remain valid (same shape); any `cancelled` event must be reviewed first (the enum value stays). R3 Monday emergency as above. Round-trip is rehearsed (quickstart Q7).

## Risks and mitigations

| # | Risk | Likelihood / impact | Mitigation |
|---|---|---|---|
| R-1 | Migration not applied before Mon 2026-11-30 00:00 UTC: old parity job creates the 2026-12-07 events for **all 8 servers** | Medium / high | Phase 1 first and parallel agents on tracks 1A/1B; hard internal deadline Thu evening for the rehearsal; late application is supported (backfill links, one-off run creates the missing events, unconfigured servers' events are not deleted, post-check lists them) |
| R-2 | Pre-flight P1 fails (known: Wednesday demo event) | Certain until fixed / blocks apply | PO-1 re-date; the migration's own guard refuses to proceed otherwise |
| R-3 | Exclusion constraint rejected by PostgreSQL (immutability) or behaves differently across time zones | Low / high | Expression built only from immutable pieces; rehearsal item V1 on three session zones before anything else; fallback = trigger + advisory lock (documented, not planned) |
| R-4 | `ADD VALUE` used inside the transaction | Low / high | Design rules (plpgsql only, `cancelled` unused before commit), rehearsal V2, documented file-split fallback |
| R-5 | Guard trigger blocks the legitimate publication or leaks a bypass | Medium / medium | Exact allowed transition from the real `canPublish` rule; e2e publication regression; tests S7 including bypass attempts; `SECURITY INVOKER` and owner assertions; security review |
| R-6 | New cron fails on Monday (error, lock wait, empty calendar) | Low / high | Idempotent function, seed horizon of 13 entries, assertion block on the job, manual R3, 00:05 check, `cron.job_run_details` |
| R-7 | Late application leaves unlinked or extra events for unconfigured servers | Low / low | Backfill links them; no deletion; post-check reports them for the product owner |
| R-8 | Frontend released before migration breaks the MG card | Eliminated by design | Inclusion-list filters (research D-13); test in rehearsal front-end run is optional but unit-tested |
| R-9 | e2e suite red after migration (client INSERT/DELETE removed) | Certain until phase 5 / low | Local-only suite; apply 48 right after 47, or fall back to A; documented in `DEVELOPMENT_STATUS.md` |
| R-10 | Rehearsal not possible (Docker) | Medium / medium | Start Docker Desktop; else second Supabase project (PO-3); else the explicit "no rehearsal" risk acceptance by the product owner, with the guard block and post-checks as the only net |
| R-11 | Super admin forgets to feed the calendar | Medium / medium | Banners (D8), seed horizon about 6 months, DEVELOPMENT_STATUS note |
| R-12 | i18n parity check fails (14 files) | Medium / low | Single owner of the locale files; key catalogue frozen in the contract |
| R-13 | `safeupdate` / 8 s timeouts reject a statement in the SQL editor | Low / medium | All statements have `WHERE`, tiny tables; rehearsal sets `statement_timeout = 8s` |
| R-14 | Future client-callable definer function updating `mg_events` silently bypasses the guard | Low / medium | Documented in D-06 and the contract; S7 asserts today's function list; reviewers' checklist |

## Definition of Done mapping

| DoD item (CLAUDE.md) | How it is met |
|---|---|
| Tests updated | Every new or modified `.ts` has its `.spec.ts`; SQL test script; e2e updates (Layers 1-3) |
| `DEVELOPMENT_STATUS.md` updated | Feature entry (complete, files, migrations 47/48 status "to apply manually", known limitations: no super-admin e2e, `GMT+1` display, no catch-up, calendar must be fed, e2e helper functions), cron table and `cancelled` in `SPEC_MG_EVENT.md` (decision 3 becomes "global calendar, per-server opt-in") |
| No regression | `npm run test:ci` (baseline 1177 tests) and `npm run e2e` (baseline 33 runs, local) green |
| Lint OK | `npm run lint` with 0 error; `npm run format:check` |
| i18n | `npm run i18n:check` passes |
| Build | `npm run build:prod` passes |
| Security | no open finding on the migration (review phase 1), advisors compared on production after apply |

Order for the final task (as in the project rules): tests, `DEVELOPMENT_STATUS.md`, regression run, lint.

## Decisions requested from the product owner

| ID | Question | Recommendation | Needed by |
|---|---|---|---|
| PO-1 | Re-date the single Wednesday demo event `a734f6ab-...` (2026-08-05 -> Monday 2026-08-03) before the migration, as one explicit production data fix | Yes (no delete; DKP effect nil) | Thu 11-26 |
| PO-2 | e2e privileged path: bounded `e2e_*` SQL helpers (migration 48) or a local service-role key | B (helpers) | Thu 11-26 |
| PO-3 | Allow starting Docker Desktop and pulling a `supabase/postgres` image for the rehearsal; otherwise a second free Supabase project (cost/quota check) | Docker | Wed 11-25 |
| PO-4 | Application window and operator (SQL editor) | Fri 11-27, 08:00-12:00 UTC, by the product owner, plan agent on standby for post-checks | Thu 11-26 |
| PO-5 | Accept the timestamp refinement of FR-014 (no creation after Thursday 23:58 UTC) | Yes | with the plan |
| PO-6 | Translation of the non-en/fr locales (English placeholders now) | As done for earlier MG keys | before release |
