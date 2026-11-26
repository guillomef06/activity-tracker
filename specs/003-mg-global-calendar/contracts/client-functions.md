# Contract: client-callable SQL functions (PostgREST RPC)

**Spec**: FR-020 to FR-026 | **Research**: D-03 to D-05, D-10 | Schema `public`

Common to the three functions:

- `LANGUAGE plpgsql`, `SECURITY DEFINER`, owner `postgres`, `SET search_path = public, pg_temp`, `SET timezone = 'UTC'`.
- Caller check first: `is_super_admin((select auth.uid())) IS TRUE`, otherwise `MG_CAL_FORBIDDEN`. Missing JWT (`auth.uid()` NULL) is "not super admin".
- Privileges: `REVOKE EXECUTE ... FROM PUBLIC, anon`; `GRANT EXECUTE ... TO authenticated`.
- Called through `supabase.rpc(name, args)` (`POST /rest/v1/rpc/<name>`), JSON body keyed by parameter name.
- The server clock is `now()` (UTC); it is deliberately **not** a parameter.
- "Today" below means `(now() AT TIME ZONE 'UTC')::date`.

## Error model

Business errors are `RAISE EXCEPTION '<CODE>' USING ERRCODE = '<sqlstate>', DETAIL = '<json>'`. PostgREST returns `{ "code": "<sqlstate>", "message": "<CODE>", "details": "<json>", "hint": null }`. **The client keys only on `message`.**

| Code (`message`) | SQLSTATE | HTTP | Raised by | `details` JSON (all optional) |
|---|---|---|---|---|
| `MG_CAL_FORBIDDEN` | `42501` | 403 | all | |
| `MG_CAL_INVALID_INPUT` | `MG001` | 400 | all | `{ "reason": "empty_array" \| "too_many" \| "null_element" \| "duplicate" \| "zero_offset" }` |
| `MG_CAL_NOT_FOUND` | `MG002` | 400 | shift, cancel | `{ "entry_id": "..." }` |
| `MG_CAL_NOT_MONDAY` | `MG003` | 400 | shift | `{ "date": "YYYY-MM-DD" }` |
| `MG_CAL_OPENING_PASSED` | `MG004` | 400 | shift | `{ "entry_id", "opening": "YYYY-MM-DD" }` |
| `MG_CAL_ALREADY_EXISTS` | `MG005` | 400 | shift | `{ "entry_id", "date": "YYYY-MM-DD" }` (target equals a non-moved entry, kept cancelled entry included) |
| `MG_CAL_TOO_CLOSE` | `MG006` | 400 | shift | `{ "entry_id", "date", "other_entry_id", "other_date" }` |
| `MG_CAL_NOT_SHIFTABLE` | `MG007` | 400 | shift | `{ "reason": "cancelled" \| "read_only" \| "event_not_open" \| "must_move_later" \| "following_entry_opened" \| "event_date_conflict" }` |
| `MG_CAL_NOT_CANCELLABLE` | `MG008` | 400 | cancel | `{ "reason": "already_cancelled" \| "read_only" \| "event_ongoing_or_finished" }` |

`create_mg_calendar_entries` never raises the per-date codes: it reports them as outcomes (below). Any other failure (unexpected SQLSTATE) is propagated unchanged and shown as a generic error by the client.

Concurrency safety net: around every write, `exclusion_violation (23P01)` is mapped to `too_close` and `unique_violation (23505)` to `already_exists` (race with a concurrent creation), so a constraint hit never surfaces as a raw SQL error.

---

## 1. `create_mg_calendar_entries(p_opening_mondays date[])`

Creates MG entries from **opening Mondays** (the stored MG start is `opening + 7`). Never creates events.

**Returns** `TABLE (opening_monday date, mg_start date, outcome text, entry_id uuid)`, one row per requested date, ascending by date.

| `outcome` | Meaning | `entry_id` |
|---|---|---|
| `created` | row inserted | new id |
| `already_exists` | an `mg` entry (cancelled-kept included) already has this start | existing id |
| `rejected_not_monday` | the date is not a Monday | null |
| `rejected_opening_passed` | `opening_monday <= today` | null |
| `rejected_too_close` | a non-cancelled `mg` entry starts less than 14 days away | null |

**Whole-call input validation** (nothing written; `MG_CAL_INVALID_INPUT`): array NULL or empty, more than 13 elements (`MG_CALENDAR_MAX_BATCH`), a NULL element, a duplicate date.

**Per-date precedence** (SQL and `classifyMgDates` in TypeScript must agree): `rejected_not_monday` > `already_exists` > `rejected_opening_passed` > `rejected_too_close` > `created`.

**Processing.** Dates ascending; each date in its own `BEGIN ... EXCEPTION` sub-block (savepoint) so one failure does not roll back the others; a date created earlier in the same call counts for the `too_close` test of later dates. The insert sets `type = 'mg'`, `all_day = true`, `starts_at = ((opening + 7)::timestamp AT TIME ZONE 'UTC')`, `ends_at = starts_at + 7 days` computed in UTC, `title = NULL`.

**Example.**

```text
rpc('create_mg_calendar_entries', { p_opening_mondays: ['2026-12-28', '2027-01-11', '2027-05-31'] })
-> [ {2026-12-28, 2027-01-04, 'already_exists', <id>},
     {2027-01-11, 2027-01-18, 'already_exists', <id>},
     {2027-05-31, 2027-06-07, 'created', <id>} ]
```

Covers US2.1-2.8 (the "refused with an explicit reason" of US2.5 is the `rejected_opening_passed` outcome; the UI shows it from the preview before any call and from the outcome list after).

---

## 2. `shift_mg_calendar_entry(p_entry_id uuid, p_new_opening_monday date)`

Moves the selected entry **and every following non-cancelled `mg` entry** (those with a later `starts_at`) by the same whole number of weeks, atomically. Never creates events.

**Returns** `TABLE (entry_id uuid, old_start date, new_start date, events_updated integer)`: one row per moved entry in ascending old start; `events_updated` is non-zero only for the selected entry when it was opened.

**Definitions.** `offset_days = (p_new_opening_monday + 7) - old_start_of_selected` (a multiple of 7 because the target is a Monday). `opened(e)` = `opening(e) <= today`. Moved set `M` = selected + following non-cancelled `mg` entries. Cancelled entries and earlier entries are never moved; they are constraints.

**Checks, in this order, all before any write:**

1. Super admin (`MG_CAL_FORBIDDEN`).
2. Selected entry exists, `type = 'mg'` (`MG_CAL_NOT_FOUND`); not cancelled (`MG_CAL_NOT_SHIFTABLE` / `cancelled`).
3. `p_new_opening_monday` is a Monday (`MG_CAL_NOT_MONDAY`); `offset_days <> 0` (`MG_CAL_INVALID_INPUT` / `zero_offset`).
4. Lock the selected entry, then the following entries ascending, then the linked events (research D-05).
5. Read-only: `starts_at <= now()` or any linked event `ongoing`/`finished` (`MG_CAL_NOT_SHIFTABLE` / `read_only`).
6. If the selected entry is opened: every linked event must be `registration_open` (`event_not_open`), and `offset_days > 0` (`must_move_later`); registrations are kept. If it is not opened: `new opening > today` (`MG_CAL_OPENING_PASSED`).
7. Every following moved entry must not be opened (`following_entry_opened`) and, for each moved entry, its new opening Monday must be `> today` (`MG_CAL_OPENING_PASSED`).
8. For each moved entry's **final** start: not equal to the start of any non-moved `mg` entry, kept cancelled entries included (`MG_CAL_ALREADY_EXISTS`); at least 14 days from every non-moved non-cancelled `mg` entry (`MG_CAL_TOO_CLOSE`).
9. For the opened selected entry: no `mg_events` row of any other entry already sits on the new `start_date` for an affected server (`event_date_conflict`).

**Writes (only if every check passed):**

- Calendar rows of `M`, one `UPDATE ... WHERE id = ...` per entry, ordered **last to first when `offset_days > 0`, first to last when `< 0`** (no transient exclusion/unique violation, research D-03). `starts_at`/`ends_at` are recomputed in UTC; the audit trigger records `updated_by`/`updated_at` for each moved row.
- If the selected entry is opened: `UPDATE mg_events SET start_date, end_date, registration_close_at WHERE calendar_entry_id = <selected>`; `registration_open_at`, `status`, registrations and selections untouched. The guard trigger lets the update through (definer context).

**Atomicity.** One function call = one transaction: any exception leaves 0 rows changed (SC-004).

**Example (US3.10).** Selected 2026-12-07 entry, `p_new_opening_monday = '2026-12-07'` (one week later than opening 2026-11-30): returns 13 rows (12-07 to 12-14, 12-21 to 12-28, ..., 2027-05-24 to 05-31); `events_updated = 3` on the first row on 2026-12-01.

---

## 3. `cancel_mg_calendar_entry(p_entry_id uuid)`

**Returns** `text`: `'deleted'` or `'cancelled'`.

**Checks / effects, in order:**

1. Super admin; entry exists and `type = 'mg'` (`MG_CAL_NOT_FOUND`).
2. Lock the entry, then its events (ordered by id).
3. Not already cancelled (`MG_CAL_NOT_CANCELLABLE` / `already_cancelled`); `starts_at > now()` and no linked event `ongoing`/`finished` (`read_only` / `event_ongoing_or_finished`).
4. No event ever linked -> `DELETE` the entry, return `'deleted'` (frees the date; this also covers an opened entry with zero opted-in servers).
5. Otherwise `UPDATE calendar_entries SET cancelled_at = now(), cancelled_by = auth.uid()` and `UPDATE mg_events SET status = 'cancelled' WHERE calendar_entry_id = <id>`; registrations and selections stay for audit; return `'cancelled'`. Nobody is notified.

**Serialisation with the crons.** The event rows are locked `FOR UPDATE`; a cron `UPDATE` at the same instant waits and re-checks its `WHERE status = ...` against the committed row (research D-05).

Covers US3.5-3.8 and 3.11.

---

## Read-side contract (no function): impact numbers

For the confirmation dialogs and the list columns, the super admin reads:

```text
GET /rest/v1/calendar_entries
    ?select=*,mg_events(id,status,server_id,mg_registrations(count))
    &order=starts_at.asc
```

(`supabase.from('calendar_entries').select('*, mg_events(id, status, server_id, mg_registrations(count))').order('starts_at')`). Servers affected = number of embedded events; registrations = sum of the embedded counts. Non-super-admin users only see their own server's events in the embedded rows (existing `mg_events` RLS), which is why only the super-admin page uses this select; banners use the plain select.
