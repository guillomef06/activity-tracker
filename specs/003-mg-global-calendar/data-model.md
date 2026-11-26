# Data Model: Global Calendar Driving MG Creation

**Spec**: [spec.md](spec.md) | **Research**: [research.md](research.md) | **Date**: 2026-11-25

All timestamps UTC. Constraint and index names below are the names the migration must use (tests refer to them).

## 1. `calendar_entries` (new, global)

### Enum

`calendar_entry_type` = (`'mg'`, `'pvp'`). Extended later with `ALTER TYPE ... ADD VALUE` (FR-002).

### Columns

| Column | Type | Null | Default | Notes |
|---|---|---|---|---|
| `id` | uuid | no | `gen_random_uuid()` | PK `calendar_entries_pkey` |
| `type` | `calendar_entry_type` | no | | |
| `title` | text | yes | | required, 1 to 100 chars for non-MG; optional (<= 100) for MG |
| `starts_at` | timestamptz | no | | MG: Monday 00:00:00 UTC of the MG week |
| `ends_at` | timestamptz | no | | exclusive end; MG: `starts_at + 7 days` |
| `all_day` | boolean | no | `false` | forced `true` for MG |
| `cancelled_at` | timestamptz | yes | | set only by `cancel_mg_calendar_entry` |
| `cancelled_by` | uuid | yes | | FK `user_profiles(id) ON DELETE SET NULL` |
| `created_at` | timestamptz | no | `now()` | overwritten by the audit trigger |
| `created_by` | uuid | yes | | FK `user_profiles(id) ON DELETE SET NULL`; NULL for seed/backfill |
| `updated_at` | timestamptz | no | `now()` | maintained by trigger |
| `updated_by` | uuid | yes | | FK `user_profiles(id) ON DELETE SET NULL` |

### Constraints (all evaluated in UTC, independent of the session time zone)

| Name | Definition (illustrative) | Requirement |
|---|---|---|
| `uq_calendar_entries_type_starts_at` | `UNIQUE (type, starts_at)` (covers kept cancelled entries) | FR-003 |
| `ck_calendar_entries_ends_after_start` | `ends_at > starts_at` | FR-001 |
| `ck_calendar_entries_mg_shape` | `type <> 'mg' OR ( all_day AND extract(isodow FROM (starts_at AT TIME ZONE 'UTC')) = 1 AND date_trunc('day', starts_at AT TIME ZONE 'UTC') = (starts_at AT TIME ZONE 'UTC') AND (ends_at AT TIME ZONE 'UTC') = (starts_at AT TIME ZONE 'UTC') + interval '7 days' )` | FR-004 |
| `ck_calendar_entries_title` | `(type = 'mg' AND (title IS NULL OR char_length(title) <= 100)) OR (type <> 'mg' AND title IS NOT NULL AND char_length(btrim(title)) BETWEEN 1 AND 100)` | FR-001 |
| `ck_calendar_entries_cancel_mg_only` | `type = 'mg' OR (cancelled_at IS NULL AND cancelled_by IS NULL)` | FR-024, US5.4 |
| `ex_calendar_entries_mg_min_gap` | `EXCLUDE USING gist (daterange((starts_at AT TIME ZONE 'UTC')::date, (starts_at AT TIME ZONE 'UTC')::date + 14) WITH &&) WHERE (type = 'mg' AND cancelled_at IS NULL)` | FR-004a |

The exclusion constraint is non-deferrable on purpose (research D-03): the shift function orders its writes instead.

### Indexes

`calendar_entries_pkey`; `uq_calendar_entries_type_starts_at` (also serves ordered reads by `(type, starts_at)`); the exclusion constraint's GiST index; `idx_calendar_entries_created_by`, `idx_calendar_entries_updated_by`, `idx_calendar_entries_cancelled_by` (FR-007).

### Triggers

`trg_calendar_entries_audit` BEFORE INSERT OR UPDATE (function `calendar_entries_audit()`, SECURITY INVOKER): sets audit columns from `auth.uid()` and freezes `created_*` on update (FR-006).

### RLS and grants

| Operation | Policy (role `authenticated`) |
|---|---|
| SELECT | `USING (true)` |
| INSERT | `WITH CHECK ((select auth.uid()) IS NOT NULL AND is_super_admin((select auth.uid())) AND type <> 'mg')` |
| UPDATE | `USING` and `WITH CHECK` same predicate (cannot turn a row into `mg`) |
| DELETE | `USING` same predicate |

`anon`: no privilege. `authenticated`: `SELECT, INSERT, UPDATE, DELETE` (RLS decides), no `TRUNCATE/REFERENCES/TRIGGER`. MG rows are written only by the three definer functions (owner `postgres`, RLS not forced, so they bypass the policies by design).

## 2. `mg_events` (modified)

| Change | Detail |
|---|---|
| enum `mg_event_status` | `+ 'cancelled'` (terminal; no cron matches it) |
| column | `calendar_entry_id uuid NULL REFERENCES calendar_entries(id) ON DELETE RESTRICT` |
| index | `idx_mg_events_calendar_entry_id (calendar_entry_id)` (the composite unique below leads with `server_id`, so it does not cover FK lookups) |
| unique | `uq_mg_events_server_calendar_entry (server_id, calendar_entry_id)` (multiple NULLs allowed: events created outside the calendar) |
| unique | `uq_mg_events_server_start_date (server_id, start_date)` |
| check | `ck_mg_events_start_monday`: `extract(isodow FROM start_date) = 1` |
| check | `ck_mg_events_end_date`: `end_date = start_date + 6` |
| check | `ck_mg_events_close_date`: `registration_close_at = start_date - 4` |
| check | `ck_mg_events_open_date`: `registration_open_at <= start_date - 7` |
| trigger | `trg_mg_events_guard` BEFORE UPDATE, function `mg_events_guard()` SECURITY INVOKER (research D-06) |
| policies | `DROP POLICY "Admins can insert MG events"`, `DROP POLICY "Admins can delete MG events"`; SELECT and UPDATE policies unchanged |
| grants | `REVOKE INSERT, DELETE, TRUNCATE ON mg_events FROM anon, authenticated`; `REVOKE UPDATE ON mg_events FROM anon` |

`date` arithmetic in the CHECKs (`date - integer`, `date + integer`, `extract(isodow ...)`) is immutable and time-zone free.

### Guard trigger behaviour (client contexts only)

| Caller (`current_user`) | Allowed UPDATE |
|---|---|
| `authenticated`, `anon` | exactly `OLD.status = 'registration_closed'` -> `NEW.status = 'selection_published'`, `NEW.selection_published_at IS NOT NULL`, every other column `IS NOT DISTINCT FROM` the old value; anything else raises `MG_EVENT_FORBIDDEN` (SQLSTATE 42501) |
| `postgres` (cron, SQL editor, migration, our definer functions), `service_role`, `supabase_admin` | any |

### Status flow

```text
upcoming (unused) -> registration_open -> registration_closed -> selection_published -> ongoing -> finished
                          \_____________ (cancel function, any status before ongoing) _____________/
                                                        v
                                                    cancelled (terminal)
```

Writers: create function/cron (`-> registration_open`), close cron (`registration_open -> registration_closed`), admin publish (`registration_closed -> selection_published`, only client write), start cron (`selection_published | registration_closed(failsafe) -> ongoing`), end cron (`ongoing -> finished`), cancel function (`-> cancelled`), shift function (dates only, status unchanged).

## 3. `server_mg_config` (unchanged)

Opt-in = row exists. No trigger. Production snapshot: ERA008, ERA008-DEMO, `Era36 (81+132+133)`.

## 4. Derived dates (single formula, SQL and TypeScript)

For an MG entry with MG start Monday `S` (the value of `starts_at`, date part):

| Name | Formula | Weekday |
|---|---|---|
| opening (`registration_open_at`) | `S - 7` | Monday |
| closing (`registration_close_at`) | `S - 4` (deadline 23:59 UTC) | Thursday |
| start (`start_date`) | `S` | Monday |
| end (`end_date`) | `S + 6` | Sunday |
| creation-eligibility instant | `opening <= p_now::date` AND `p_now < (closing + 23:59) UTC` | |

Assistant input is the **opening Monday** `M`; the stored start is `S = M + 7`. Series of `n` weeks (n even, 2..26): `n / 2` entries with `M + 14k`, `S + 14k`, `k = 0 .. n/2 - 1`.

### Calendar entry state (UI, derived from dates and cancel mark, `today` = UTC date)

| State | Rule |
|---|---|
| `cancelled` | `cancelled_at IS NOT NULL` |
| `planned` | `opening > today` |
| `registration_open` | `opening <= today <= closing` |
| `awaiting_start` | `closing < today < S` |
| `ongoing` | `S <= today <= S + 6` |
| `finished` | `today > S + 6` |

Action flags (view model; the SQL functions remain the authority): `canShift` = not cancelled and `S > today` (opened entries only if every linked event is `registration_open`: the page disables the action when the loaded event counts say otherwise and lets the function decide when unknown); `canCancel` = not cancelled and `S > today`; `canDelete` (non-MG) = always; `readOnly` = `S <= today` or cancelled.

## 5. Seed (13 entries, `created_by` NULL) and backfill

| # | Opening Monday | MG start |
|---|---|---|
| 1 | 2026-11-30 | 2026-12-07 |
| 2 | 2026-12-14 | 2026-12-21 |
| 3 | 2026-12-28 | 2027-01-04 |
| 4 | 2027-01-11 | 2027-01-18 |
| 5 | 2027-01-25 | 2027-02-01 |
| 6 | 2027-02-08 | 2027-02-15 |
| 7 | 2027-02-22 | 2027-03-01 |
| 8 | 2027-03-08 | 2027-03-15 |
| 9 | 2027-03-22 | 2027-03-29 |
| 10 | 2027-04-05 | 2027-04-12 |
| 11 | 2027-04-19 | 2027-04-26 |
| 12 | 2027-05-03 | 2027-05-10 |
| 13 | 2027-05-17 | 2027-05-24 |

Backfill (expected on 2026-11-25 after the D-17 fix): MG starts 2026-04-27, 05-11, 05-25, 06-08, 06-22, 07-06, 07-20, 08-03, 08-17, 08-31, 09-14, 09-28, 10-12, 10-26, 11-09, 11-23 (16 entries, each 14 days from the next; the 2026-11-23 entry and the seeded 2026-12-07 entry are exactly 14 days apart, which the exclusion constraint accepts).

## 6. TypeScript models (`src/app/shared/models/calendar-entry.model.ts`, `mg-event.model.ts`)

```ts
// illustrative shapes, not final code
export type CalendarEntryType = 'mg' | 'pvp';

export interface CalendarEntry {
  id: string;
  type: CalendarEntryType;
  title: string | null;
  starts_at: string;      // ISO timestamptz as returned by PostgREST
  ends_at: string;
  all_day: boolean;
  cancelled_at: string | null;
  cancelled_by: string | null;
  created_at: string;
  created_by: string | null;
  updated_at: string;
  updated_by: string | null;
}

export interface CalendarEntryWithImpact extends CalendarEntry {
  mg_events: { id: string; status: MgEventStatus; server_id: string; mg_registrations: { count: number }[] }[];
}

// mg-event.model.ts
export type MgEventStatus = 'upcoming' | 'registration_open' | 'registration_closed'
  | 'selection_published' | 'ongoing' | 'finished' | 'cancelled';
// MgEvent gains: calendar_entry_id: string | null;
```

Constants (`src/app/shared/constants/mg-calendar.constant.ts`): `MG_CALENDAR_MIN_FUTURE_ENTRIES = 2` (threshold N), `MG_CALENDAR_MAX_SERIES_WEEKS = 26`, `MG_CALENDAR_MAX_BATCH = 13`, `MG_CALENDAR_MIN_GAP_DAYS = 14`, plus the two status lists of research D-13 (`MG_ACTIVE_STATUSES`, `MG_NON_CANCELLED_STATUSES`).

## 7. Entity relationships

```text
servers 1 --- 0..1 server_mg_config          (opt-in)
servers 1 --- * mg_events * --- 0..1 calendar_entries   (calendar_entry_id, RESTRICT; NULL for e2e/demo events)
mg_events 1 --- * mg_registrations / mg_selections      (unchanged, cascade)
user_profiles 1 --- * calendar_entries (created_by / updated_by / cancelled_by, SET NULL)
```
