# Feature Specification: Global Calendar Driving MG Creation

**Feature Branch**: `003-mg-global-calendar` (spec directory only; no git branch created, work stays on `dev`)

**Created**: 2026-11-24

**Status**: Draft

**Input**: User description: "Calendrier global gere par le super admin, qui pilote la creation des Mightiest Governor (MG) des serveurs : creation / duplication assistee, decalage et annulation, bandeaux d'alerte, mise en production sans interruption du cycle."

## Context and observed state *(verified on 2026-11-24, repo and production read-only)*

Today the MG cycle is hard-coded. The pg_cron job `mg-create-events` (Monday 00:00 UTC) applies a parity rule (reference Monday `2026-01-05`, odd offsets = rest week, MG starts the following Monday) and inserts one `mg_events` row for **every** server, without looking at `server_mg_config`. Findings that shape this feature:

- **All servers receive events.** Production has 8 servers; 3 have a `server_mg_config` row (ERA008, ERA008-DEMO, Era36; two of them really use MG), 5 have none and have no registration or selection, yet each receives every event. All events share the same dates for all servers (2-week cycle; the last MG runs 2026-11-23 to 2026-11-29 and is `ongoing`).
- **No uniqueness on `mg_events(server_id, start_date)`.** The `ON CONFLICT DO NOTHING` of the cron is inoperative, so a second active creation job would silently duplicate every event.
- **Transition crons test exact dates.** `mg-close-registrations` (Thursday 23:59 UTC) tests `registration_close_at <= CURRENT_DATE`; `mg-start-events` (Monday 00:00 UTC) tests `start_date = CURRENT_DATE`; `mg-end-events` (Sunday 23:59 UTC) tests `end_date = CURRENT_DATE`. An event whose dates are not the standard Monday / Thursday / Sunday shape would stay stuck in its status forever.
- **Repo versus production.** The deployed `mg-start-events` is the version of `supabase/28-mg-failsafe-fix-full-ffa.sql` (failsafe: `registration_closed` -> `ongoing` with `selection_published_at = NOW()` and **no** rows inserted in `mg_selections`). It is *not* the version of `27-mg-failsafe-ffa.sql`, which inserts FFA rows; file 27 is intentionally superseded by 28, so there is no unexpected drift on this job. The real textual difference is on `mg-create-events`: the repo copy in `26-mg-event.sql` nests `DO $$ ... $$` inside `$$ ... $$`, while production uses the `$inner$` delimiter. The new migration must not copy the repo text of the old job (see Deployment plan, rollback).
- **Application reads.** `MgEventService.loadCurrentEvent` selects `status != finished ORDER BY start_date DESC LIMIT 1` (it takes the farthest event); `loadSpends` filters on `selection_published_at`, not on status. DKP spends are attached to the week of `mg_events.start_date` and are only revealed once that week has ended.
- **Cross-cutting rules** from `SPEC_MG_EVENT.md`: no real-time or push notifications (decision 4), all dates and times in UTC (decision 10). Angular's `date` pipe already renders a `DATE` column without a time correctly (verified), so nothing needs fixing on existing displays.

## Clarifications

### Session 2026-11-24

- Q: When the super admin postpones an MG, must the following calendar entries move with it in one operation? → A: Yes. A shift always applies the same offset to the selected entry **and to every following non-cancelled MG entry**, atomically (FR-023). Reason: with the 14-day minimum (FR-004a), shifting a single entry by one week is refused whenever a following entry exists.
- Q: Until when can the super admin create an MG whose registrations are already open (late entry)? → A: Never. An entry whose opening Monday is today or in the past is refused, whatever its closing date; players wait for the following MG. Creating an entry never creates events: the cron does it on the opening Monday (FR-015). This removes the immediate-creation path and the race with the Thursday 23:59 UTC close cron.
- Q: When a server enables MG (saves its config) while registrations are already open, does it receive the current event immediately? → A: No. No catch-up: the server receives its first event on the next opening Monday (FR-016). The `server_mg_config` trigger and its function are removed from the design.
- Q: Should server admins (or the super admin) keep the right to insert, delete or change `mg_events` directly? → A: No (2026-11-25). The crons own the statuses and create the events; the super admin does not intervene on server events; an admin only publishes a selection, and an unpublished event is FFA through the failsafe. INSERT and DELETE policies are dropped for every client and the only client update left is the publication transition (FR-030). The e2e seeder and the demo scripts must move to a privileged path (open question 1).
- Q: What does a player see on the home MG card when an MG is cancelled? → A: A notice "The MG of <date> was cancelled" above the next-MG or "not announced" message, until the end of the cancelled event's planned week (`end_date`), for every player of the server (not only the registered ones). Consequence: an entry that already generated events is never physically deleted, it is marked cancelled (FR-024, FR-063).

## Product decisions already taken *(frozen, not reopened by this spec)*

| # | Decision |
|---|----------|
| D1 | Two distinct notions: a **global calendar** of events (written by the super admin, readable by every authenticated user) and the **per-server MG configuration** (`server_mg_config`, `server_mg_slot_config`), which is unchanged. |
| D2 | The calendar **drives MG creation**. Opt-in of a server = **a `server_mg_config` row exists**. Servers without a row stop receiving events (no active server is affected, verified). A server cannot opt out of a single cycle: the MG takes place regardless, independently of PvP events, so there is no overlap rule between entry types. |
| D3 | One calendar table with a `type` column (only `mg` has behaviour for now; other types such as PvP are informational). Day + time granularity from the start: `starts_at` / `ends_at` as `timestamptz` (UTC) plus `all_day`. Monday constraint for `type = 'mg'` only. Unique on `(type, starts_at)`. Write: super admin only. Read: every authenticated user. Display: stored in UTC, shown in the viewer's time zone with the UTC / zone abbreviation next to the time for timestamped entries; MG entries stay whole days. |
| D4 | **Events are created at the last moment**: the cron reads the calendar and creates the events of the concerned servers on the opening Monday (D-7), for the entries whose registration opening is today. No pre-created `upcoming` events. **No late entries** (clarified 2026-11-24): an entry whose opening Monday is today or in the past is **refused**, whatever the closing date; players wait for the following entries. Events are only created by the cron on the opening Monday (no mid-cycle catch-up either, clarified 2026-11-24). `mg_events.calendar_entry_id` with `UNIQUE (server_id, calendar_entry_id)`, and a backfill of existing entries from the distinct `start_date` values. |
| D5 | **Create / duplicate assistant** for the super admin: pick a Monday = **registration opening Monday (D-7)**; the MG starts the following Monday (opening Monday, closing Thursday D-4, start Monday, end Sunday). "Duplicate over n weeks, every 2 weeks": n even (2, 4, 6, ...), n/2 MG (4 weeks from Monday 1 = MG on Mondays 2 and 4, registrations opening on Mondays 1 and 3). Mandatory preview of every date; already-existing dates are flagged and skipped (no global failure); cap (26 weeks). Duplication is a shortcut only: entries are independent afterwards (no series link). |
| D6 | **Modify / shift / cancel** an MG entry. Before opening: only the calendar row changes. Already opened: shift allowed **only if every generated event is `registration_open`** (registrations are kept), otherwise refused; all servers' `mg_events` are updated in one transaction (SQL function). Cancel: new `cancelled` status (enum value); cancelled events are excluded from `loadCurrentEvent` and `loadSpends`; physical deletion only when no event was ever generated for the entry (clarified 2026-11-24, so that a cancellation notice can always be shown). `ongoing` / `finished` entries are read-only. Non-MG entries are freely editable and deletable. Clarified 2026-11-24: a shift always moves the selected entry **and every following non-cancelled MG entry** by the same offset (see Clarifications). |
| D7 | **Safeguards**: no client can insert or delete an `mg_events` row and the only client update allowed is the selection publication (clarified 2026-11-25, FR-030); database constraints on MG dates (Monday, end = start + 6, closing = D-4) so transition crons can never get stuck; `created_by` / `updated_by` / `updated_at` audit on the calendar; row lock to avoid the race with the Monday 00:00 UTC cron. |
| D8 | **Banners** (threshold N = 2): (a) super admin alert with link to creation when fewer than 2 future `mg` entries remain (an ongoing entry does not count); (b) server admin (MG tab): "no MG planned, contact the super admin" when there is neither a current event nor a future entry, neutral message with no action; (c) player (home MG card): "Next MG: <date>, registrations open on <date>" as soon as an entry exists, otherwise "Next MG not announced yet". Only for servers that have a `server_mg_config` row. Computed at load time (no real time). Dumb component with `input()`, loaded by `resource()` / `rxResource()` in the parents, no function in templates, i18n keys in every maintained language. |
| D9 | **Production switch-over** is a major risk and is documented in the Deployment plan: one single migration creates the calendar, **seeds** the next entries before 2026-11-30 00:00 UTC (next opening Monday, MG of 2026-12-07; the 2-week cycle is continued: 12-07, 12-21, ...), replaces the parity cron (unschedule / schedule) by the calendar-based cron and performs the backfill. Empty calendar = no MG created and no signal; two active crons = duplicates. A **new numbered migration** is added in `supabase/`; an applied migration is never edited. |

## User Scenarios & Testing *(mandatory)*

### User Story 1 - The calendar creates the MG events of the opted-in servers, with a seamless switch-over (Priority: P1)

On every opening Monday, the system creates the MG event of each server that has enabled MG, using the global calendar instead of the hard-coded parity rule. The switch happens before 2026-11-30 00:00 UTC without interrupting the cycle: the MG of 2026-12-07 is created for exactly the right servers.

**Why this priority**: Without this, the calendar changes nothing and the existing cycle is at risk. It is the core behaviour and the highest-risk change.

**Independent Test**: With the migration applied on a rehearsal database containing the production-like data, run the creation function as the Monday cron would (simulated date 2026-11-30) and check which servers received an event for 2026-12-07; then run it twice and check nothing is duplicated.

**Acceptance Scenarios**:

1. **Given** the seeded calendar and servers ERA008, ERA008-DEMO and Era36 having a `server_mg_config` row (the 5 others none), **When** the Monday 2026-11-30 00:00 UTC creation job runs, **Then** each of the 3 configured servers has exactly one event for the entry starting 2026-12-07 with status `registration_open`, opening 2026-11-30, closing 2026-12-03, ending 2026-12-13, linked to that entry; the 5 other servers get none.
2. **Given** the job already ran, **When** it runs again (manual re-run, retry, or any other trigger), **Then** no event is duplicated.
3. **Given** an entry whose opening Monday is today, **When** its events are created, **Then** the transition crons (close on Thursday 23:59, start on Monday 00:00, end on Sunday 23:59) move them through their statuses without any manual intervention.
4. **Given** a server that has no `server_mg_config` row, **When** an opening Monday passes, **Then** it gets no event, and a server that is not configured never shows a banner about the calendar.
5. **Given** a server that creates its `server_mg_config` row on any day after an opening Monday (registrations of the current cycle already open for the other servers), **When** the row is saved, **Then** no event is created for the current cycle; the server receives its first event on the next opening Monday (no catch-up).
6. **Given** the migration is applied, **When** existing data is inspected, **Then** every existing `mg_events` row whose `start_date` matches a calendar entry is linked to it, and the calendar contains one `mg` entry per distinct historical `start_date` plus the seeded future entries.

---

### User Story 2 - The super admin creates and duplicates MG entries with an assistant (Priority: P1)

The super admin opens a new "Calendar" page in the super-admin area, chooses the registration opening Monday and optionally duplicates it every 2 weeks over a number of weeks. A preview lists every derived date and its outcome before anything is written.

**Why this priority**: The calendar must be fed after the seeded entries run out; without the assistant the feature is not operable.

**Independent Test**: Open the page as a super admin, run the assistant with a single date and with a 4-week duplication, verify the preview, validate, and check the resulting entries and events.

**Acceptance Scenarios**:

1. **Given** the assistant, **When** the super admin picks Monday 2027-05-31 as opening Monday without duplication, **Then** the preview shows one MG: opening 2027-05-31, closing Thursday 2027-06-03, start Monday 2027-06-07, end Sunday 2027-06-13.
2. **Given** the same Monday with duplication over 4 weeks, **When** the preview is shown, **Then** it lists 2 MG: openings 2027-05-31 and 2027-06-14, starts 2027-06-07 and 2027-06-21, with all their derived dates.
3. **Given** a preview in which one date already exists in the calendar (for example opening Monday 2026-12-28 over 4 weeks, both seeded), **When** it is displayed, **Then** the existing dates are flagged "already exists, will be ignored"; **When** validated, **Then** the existing ones are skipped, the new ones are created, and the result lists the outcome per date (no global failure).
4. **Given** a duplication request, **When** the number of weeks is odd, zero, or above the cap (26), **Then** the assistant refuses it before the preview and explains why.
5. **Given** today is Wednesday 2027-06-02, **When** the super admin creates the MG of 2027-06-07 (opening Monday 2027-05-31, already past), **Then** it is refused with an explicit reason (opening Monday is today or in the past: players wait for the next entry) and nothing is written; **Given** the same request made on Sunday 2027-05-30, **Then** the entry is created and its events are created by the cron on Monday 2027-05-31 at 00:00 UTC.
6. **Given** a chosen date that is not a Monday (for example typed manually or picked in a different time zone), **When** validated, **Then** it is refused; the date picker only offers Mondays and the chosen date is interpreted as that Monday in UTC whatever the browser time zone.
7. **Given** the preview, **When** the super admin cancels or closes the dialog, **Then** nothing is written.
8. **Given** a non super admin user, **When** calling the creation function directly, **Then** it fails with an authorization error and nothing is written.

---

### User Story 3 - The super admin modifies, shifts or cancels an MG entry (Priority: P2)

A cycle must sometimes be moved or cancelled. The allowed action depends on how far the entry has progressed.

**Why this priority**: Needed to correct mistakes and handle exceptional weeks, but the nominal cycle works without it.

**Independent Test**: For an entry in each state (before opening, opened, closed, ongoing, finished), try shift and cancel and compare with the rules below.

**Acceptance Scenarios**:

1. **Given** an entry whose registrations are not open yet, **When** the super admin shifts it to another Monday, **Then** the entry and every following non-cancelled MG entry move by the same number of weeks; only calendar rows change (no `mg_events` row exists or is touched) and the audit columns record who and when for each moved row.
2. **Given** an opened entry whose events (on every server) are all `registration_open`, **When** it is shifted to a later Monday, **Then** in one transaction the calendar rows of the entry and of all following entries move, and every `mg_events` row linked to the opened entry gets the new `start_date`, `end_date` and `registration_close_at`, the status stays `registration_open`, `registration_open_at` is unchanged (registrations really opened on that day) and every registration is kept.
3. **Given** an opened entry where at least one event is not `registration_open` (for example `registration_closed` after Thursday 23:59 UTC), **When** a shift is requested, **Then** it is refused entirely (no server is modified) with an explicit reason.
4. **Given** a shift in which any moved entry would land on the date of an entry that is not moved in the same operation (a kept cancelled entry included), would end up less than 14 days from such an entry, or, for an entry not yet opened, would get an opening Monday that is today or in the past, **When** requested, **Then** the whole shift is refused with an explicit reason and nothing is moved.
5. **Given** an entry with no generated event (registrations not opened yet), **When** the super admin cancels it, **Then** it is physically deleted.
6. **Given** an entry that generated events (even with no registration at all), and no event `ongoing` or `finished`, **When** the super admin cancels it, **Then** the calendar entry is kept with a cancellation mark and all its events get status `cancelled`; nothing is notified; the confirmation dialog beforehand states the number of servers and registrations concerned and that nobody is notified.
7. **Given** a cancelled entry, **When** players and admins of the affected servers load their MG views, **Then** the cancelled event is not their current event, the DKP spends of its selection are not counted (see edge cases for what this means in practice), and the home MG card shows a notice "The MG of <start date> was cancelled" above the next-MG / "not announced" message until the end date of the cancelled event (FR-063).
8. **Given** an entry that is `ongoing` or `finished` (any event in these statuses), **When** displayed, **Then** it is read-only: no shift, no cancel, no delete.
9. **Given** a non-MG entry, **When** edited or deleted by the super admin, **Then** it changes freely (no state restriction).
10. **Given** the seeded calendar (MG on 12-07, 12-21, and so on) and the MG of 12-07 whose events are all `registration_open`, **When** the super admin shifts it by one week (to 12-14), **Then** all 13 entries move by one week in one operation (12-14, 12-28, ...) without any transient violation of the 14-day rule making it fail; the preview and the confirmation dialog list every moved entry with its old and new dates; only the 12-07 entry's events are updated, the following entries change in the calendar only.
11. **Given** a shift or cancel attempted at the exact moment the Monday 00:00 UTC cron runs, **When** both touch the same entry, **Then** they are serialised by a row lock and the final state is consistent: either the cron creates events with the old dates and the shift then updates them, or the shift lands first and the cron uses the new dates.

---

### User Story 4 - Banners warn when no MG is planned (Priority: P2)

Because an empty calendar silently stops MG creation, three role-specific banners surface the situation (the super admin to fix it, the server admin to ask for it, the player to know when the next MG comes), and a cancellation notice tells the players of a server that its MG was cancelled.

**Why this priority**: This is the only signal against the "empty calendar" risk, but the feature works without it.

**Independent Test**: Render each banner with the matching data (0, 1, 2 future entries; with and without current event; with and without config row) and check text, visibility and link.

**Acceptance Scenarios**:

1. **Given** a super admin on the super-admin dashboard and fewer than 2 future non-cancelled `mg` entries (future = MG start after now, an entry whose MG is ongoing does not count), **When** the page loads, **Then** an alert explains the calendar is running out and links to the creation assistant; **Given** 2 or more future entries, **Then** no alert.
2. **Given** a server that has a `server_mg_config` row, an admin in the MG tab, no current event (not `finished`, not `cancelled`) and no future entry, **When** the tab loads, **Then** a neutral message "No MG planned, contact the super admin" is shown, with no action; if either exists, no message. A server without a config row never shows it.
3. **Given** a player of a server that has a `server_mg_config` row and a non-cancelled `mg` entry whose registration opening is still ahead, **When** the home MG card loads, **Then** it shows "Next MG: <MG start date>, registrations open on <opening date>" for the nearest such entry; **Given** no such entry, **Then** it shows "Next MG not announced yet".
4. **Given** a server without `server_mg_config` row, **When** the home MG card loads, **Then** no calendar banner is shown (neither "next MG" nor "not announced").
5. **Given** the calendar cannot be loaded (network error, policy error), **When** a banner is evaluated, **Then** the banner is **hidden** (never a false "not announced" or "running out" alarm) and the error is logged.
6. **Given** a banner, **When** inspected, **Then** it is a single dumb component fed by inputs, the text is translated in every maintained language, dates follow the viewer's locale, the information is exposed to assistive technologies (`role="status"`), and the layout holds at 320px.

---

### User Story 5 - Non-MG entries and read access for every user (Priority: P3)

The calendar is global and typed, ready for informational events such as PvP. The super admin can record these; every authenticated user can read the calendar.

**Why this priority**: Prepares the future PvP calendar; no player-facing display is delivered now.

**Independent Test**: Create, edit and delete a non-MG entry as super admin; read the calendar as an ordinary member and fail to write it.

**Acceptance Scenarios**:

1. **Given** the super admin, **When** creating a non-MG entry with a title, a start and an end (timestamped or all day), **Then** it is stored in UTC and listed with the MG entries in start order.
2. **Given** a timestamped entry, **When** displayed in the super-admin list, **Then** the time is shown in the viewer's time zone with the zone abbreviation next to it (for example "20:00 CET"), and the form states that entry times are entered in UTC; **Given** an all-day or MG entry, **Then** only the calendar day is shown, never shifted by the viewer's time zone.
3. **Given** an ordinary authenticated member (or admin), **When** querying the calendar, **Then** all rows are readable and no write is possible; **Given** an unauthenticated visitor, **Then** nothing is readable.
4. **Given** a non-MG entry, **When** written directly to the table by a super admin, **Then** it succeeds; **Given** an `mg` entry, **When** written directly to the table (bypassing the functions), **Then** it is refused; MG entries are only written through the functions of this feature.

---

### Edge Cases

- **Empty or exhausted calendar**: no MG is created and no job fails. The only signals are the banners (D8) and the seed horizon (13 MG, about 6 months). This is accepted and documented.
- **Two MG entries one week apart** (for example MG on 12-07 and 12-14) are **forbidden**: two consecutive MG do not exist in the game, and the second would open its registrations on the Monday the first starts, so players would never see them (see FR-004a). The rule applies to creation (assistant included) and to shift, against every other non-cancelled MG entry. A cancelled entry no longer counts. `loadCurrentEvent` still moves to ascending order (FR-070) because non-calendar events (e2e, demo data) can coexist with real ones.
- **Cancelling after a selection was published (DKP)**: deductions are only revealed once the event week has ended and cancellation is impossible once an event is `ongoing`, so no cancelled event ever had a visible deduction. Excluding cancelled events from `loadSpends` is the explicit, defensive guarantee that a cancelled event never costs anybody DKP and never consumes FIFO points; leaderboards are unchanged by a cancellation in practice. A shift never touches spends either (it is only allowed while every event is `registration_open`, so no selection exists yet).
- **No notification on cancel or shift**: registered players learn about it only by opening the app, where the home MG card shows a cancellation notice (FR-063; decision 4 of `SPEC_MG_EVENT.md`). Registrations of a cancelled event stay in the table for the audit but are invisible in the UI.
- **Re-creating a cancelled date**: the unique key `(type, starts_at)` also covers cancelled entries that were kept (every entry that generated events). Such a date cannot be re-created in v1 (it could not be anyway: its opening Monday is today or past, FR-015). A cancelled entry that was physically deleted (never opened) frees its date.
- **Shift of an opened entry only goes later**: the registration window then simply gets longer (opening date unchanged, new closing Thursday). Moving earlier is impossible by construction because the new closing deadline would already be behind the original opening.
- **A shift moves the following entries too**: postponing one MG by one week moves the whole remaining cycle by one week, because a single entry could not move by less than 14 days without colliding with its neighbour (FR-004a). A non-moved entry (before the selected one, or a kept cancelled one) is only a constraint, never a victim of the shift. Shifting only a last-in-calendar entry is the degenerate case with no following entry.
- **Entry with no opted-in server**: it is created and counts for the banners; zero events are generated and every shift/cancel rule holds trivially.
- **Time zone**: an all-day entry stored at `00:00 UTC` must display the same day to a viewer in UTC-8 (not the previous Sunday evening). The date picker returns local midnight; it must be re-anchored to UTC midnight (same pitfall already fixed in the seasons wizard).
- **Failure of one entry in a batch**: the other entries of the batch are still created (per-entry savepoint); the result lists the outcome per date.
- **Late application of the migration** (after Monday 2026-11-30 00:00 UTC): the old cron may already have created the 2026-12-07 events without a link; the backfill links them and the one-off creation run at the end of the migration only creates what is missing (see Deployment plan).
- **No client can delete or insert an event** (FR-030): an event can only disappear through the cancel function or the cascade of a deleted server, and only the crons, the SQL functions and the migration create one. A missing event for a cycle therefore always comes from the cron or the data, never from a client action.
- **Frontend deployed before the migration**: calendar queries fail; banners hide themselves (scenario 4.5); the old cron is still active; nothing breaks. Migration first, frontend second is the recommended order.

## Requirements *(mandatory)*

### Functional Requirements

**Calendar data**

- **FR-001**: The system MUST store a global calendar of entries with: `id`, `type`, `title` (required and at most 100 characters for non-MG types, optional for `mg`), `starts_at` and `ends_at` (`timestamptz`, UTC, `ends_at > starts_at`), `all_day`, a cancellation mark (`cancelled_at`, `cancelled_by`), and audit columns `created_at`, `created_by`, `updated_at`, `updated_by`.
- **FR-002**: The initial entry types MUST be `mg` and `pvp`; the type list MUST be extensible by a later migration. Only `mg` has behaviour in this feature.
- **FR-003**: `(type, starts_at)` MUST be unique.
- **FR-004**: For `type = 'mg'` the database MUST enforce: `all_day` true, `starts_at` is a Monday at 00:00:00 UTC, `ends_at = starts_at + 7 days` (exclusive end, so the MG covers Monday to Sunday). The registration opening (Monday `starts_at - 7 days`), the registration closing (Thursday `starts_at - 4 days`, deadline 23:59 UTC) and the last day (Sunday) are **derived**, not stored on the entry. The constraint MUST be evaluated in UTC, independent of the session time zone.
- **FR-004a**: The database MUST forbid two non-cancelled `mg` entries whose `starts_at` are less than 14 days apart (in practice: one week apart, since starts are Mondays), evaluated in UTC, so that a rest week always separates two MG. The rule MUST be enforced at database level (for example an exclusion constraint or a trigger; the mechanism is left to the plan) and MUST hold for direct inserts, the creation function, the shift function and the migration seed/backfill. Cancelled entries are excluded from the check. Non-MG types are not concerned.
- **FR-005**: Every authenticated user MUST be able to read the whole calendar; unauthenticated visitors MUST NOT. Writing non-MG rows MUST be reserved to super admins (`is_super_admin`); writing MG rows directly MUST be refused to everyone and only possible through the functions of FR-020 to FR-022.
- **FR-006**: `created_by`, `updated_by`, `updated_at` MUST be set by the database from the authenticated user (not supplied by the client); they are null for rows created by the migration (seed and backfill).
- **FR-007**: Every foreign key introduced MUST be indexed.

**MG events and the opt-in**

- **FR-010**: `mg_events` MUST gain a nullable `calendar_entry_id` (FK to the calendar, `ON DELETE RESTRICT`) with `UNIQUE (server_id, calendar_entry_id)`. It stays nullable (events created outside the calendar, such as e2e and demo data, remain possible).
- **FR-011**: `mg_events` MUST also get `UNIQUE (server_id, start_date)` (defence in depth: it makes the target-less `ON CONFLICT DO NOTHING` of any leftover legacy job effective and prevents duplicates even if two creation jobs were ever active).
- **FR-012**: `mg_events` MUST enforce at database level: `start_date` is a Monday, `end_date = start_date + 6`, `registration_close_at = start_date - 4`, and `registration_open_at <= start_date - 7` (equality for events created normally; strictly earlier only after a postponement, FR-023). These constraints are validated against existing rows during the migration; non-compliant rows block the migration and are handled beforehand (Deployment plan, pre-flight).
- **FR-013**: The `mg_event_status` enum MUST gain the value `cancelled`. It is terminal; no cron touches it; registration and selection policies that require `registration_open` already exclude it.
- **FR-014**: The creation job MUST, for each non-cancelled `mg` entry whose registration opening date is today (UTC) (formally: opening date on or before today and registration deadline still ahead, which on a Monday 00:00 UTC run is exactly the entries opening today, and lets the same function serve the cron and the migration-time run), create one event per server that has a `server_mg_config` row, with status `registration_open`, `registration_open_at = D-7`, `registration_close_at = D-4`, `start_date`, `end_date`, and `calendar_entry_id`. It MUST be idempotent and MUST NOT create anything for servers without a config row. It MUST replace, under the same job name `mg-create-events` and the same schedule (Monday 00:00 UTC), the parity job, in the same transaction as the unschedule.
- **FR-015**: Creating an entry whose opening Monday is today or in the past MUST be refused (nothing is written), whatever its closing date: there are no late entries. Creating an entry never creates events; events are created by the cron on the opening Monday (FR-014) and by the one-off run of the migration.
- **FR-016**: There is no catch-up: inserting or deleting a `server_mg_config` row MUST NOT create or remove any event. A server that enables MG mid-cycle receives its first event on the next opening Monday; no trigger is added on `server_mg_config`.
- **FR-017**: The creation logic MUST live in a single internal SQL function shared by the cron and the one-off run of the migration; that function MUST NOT be callable by clients.
- **FR-018**: The migration MUST backfill: one `mg` entry per distinct existing `mg_events.start_date` (Monday), and the link `calendar_entry_id` on the matching events. Rows that do not match a Monday are reported, not guessed.

**Create / duplicate**

- **FR-020**: A SQL function `create_mg_calendar_entries` MUST take a list of opening Mondays (at most 13), be callable by super admins only, and return one result row per requested date with an outcome (`created`, `already_exists`, `rejected_not_monday`, `rejected_opening_passed`, `rejected_too_close`). Each date MUST be processed independently (a failing date does not roll back the others) and the insertion of each entry MUST be atomic.
- **FR-021**: The assistant MUST take an opening Monday and an optional duplication over n weeks (n even, 2 to 26). It MUST generate `n / 2` MG: opening dates `M + 14k`, MG starts `M + 7 + 14k` (k from 0). Without duplication exactly one MG is generated. It MUST show a preview of every derived date (opening, closing, start, end) and the outcome per date (will be created, already exists and will be ignored, refused with reason, including `too close` to another MG entry, FR-004a) before any write; nothing is written until the super admin confirms. Duplicated entries MUST be independent (no series identifier).
- **FR-022**: The pure date derivation (opening, closing, start, end from an opening Monday; series generation; outcome classification against existing entries and the current time) MUST live in a single shared TypeScript utility used by the assistant preview and the banners, with unit tests; the SQL functions remain the authority and re-validate.
- **FR-023**: A SQL function `shift_mg_calendar_entry` (super admin only) MUST accept an entry and a new opening Monday and ALWAYS applies the same offset (a whole number of weeks) to that entry **and to every following non-cancelled `mg` entry** (every entry whose `starts_at` is after the selected one's), atomically: either all of them move or none does. Cancelled entries and entries before the selected one are never moved. A following entry is never opened when the shift is accepted (it opens at least 14 days after the selected entry); if one were, the whole shift is refused. The operation MUST NOT fail because of transient violations (uniqueness, FR-004a) between entries moved together; the mechanism (processing order or deferred constraints) is left to the plan. For an entry before its opening it updates calendar rows only. For an opened entry it MUST be accepted only if every linked event is `registration_open`, and then update, in one transaction, the calendar rows and every event linked to the selected entry (`start_date`, `end_date`, `registration_close_at`; `registration_open_at` unchanged; status and registrations unchanged). It MUST lock the entry row and the linked event rows to serialise with the crons. The target of **every moved entry** MUST satisfy the creation rules (Monday, no existing entry on that date, for an entry not yet opened an opening Monday strictly after today (UTC), at least 14 days from every non-cancelled MG entry that is not moved in the same operation, FR-004a); a moved entry that would land on the date of a kept cancelled entry causes the whole shift to be refused. A shift never creates events.
- **FR-024**: A SQL function `cancel_mg_calendar_entry` (super admin only) MUST physically delete the entry when no event was ever generated for it (registrations not opened yet), otherwise mark the entry cancelled (`cancelled_at`, `cancelled_by`) and set all its events to `cancelled`; it MUST refuse when any linked event is `ongoing` or `finished`; it returns which of the two happened.
- **FR-025**: The three functions MUST report business errors with stable, machine-readable codes (for example `MG_CAL_FORBIDDEN`, `MG_CAL_NOT_MONDAY`, `MG_CAL_OPENING_PASSED`, `MG_CAL_ALREADY_EXISTS`, `MG_CAL_TOO_CLOSE`, `MG_CAL_NOT_SHIFTABLE`, `MG_CAL_NOT_CANCELLABLE`, `MG_CAL_INVALID_INPUT`) that the UI maps to translated messages. They MUST verify the caller is a super admin inside the function, run as `SECURITY DEFINER` with a fixed `search_path`, have `EXECUTE` revoked from `PUBLIC` and `anon` and granted to `authenticated` only (pattern of migrations 34, 37, 38).
- **FR-026**: An `ongoing` or `finished` entry (any linked event in these statuses, or `starts_at` already reached) MUST be read-only: no shift, no cancel, no delete. Non-MG entries MUST be editable and deletable without state restriction.

**Safeguards**

- **FR-030**: Client write access to `mg_events` MUST be reduced to what the app really does. SELECT for members is unchanged. The INSERT and DELETE policies ("Admins can insert MG events", "Admins can delete MG events") MUST be dropped for every authenticated user, super admin included: events are created and removed only by the crons, by the SQL functions of this feature (`SECURITY DEFINER`) and by the migration. UPDATE stays available to server admins (existing policy) but a trigger on `mg_events` MUST refuse, for any authenticated user, every update except the publication transition performed by the app (`registration_closed` to `selection_published`, setting `selection_published_at`). Contexts without a client session (crons, migration, service role) and the SQL functions of this feature MUST pass through the trigger (mechanism left to the plan: the functions run with the caller's JWT claims, so the trigger cannot rely on the absence of `auth.uid()` for them). The statuses are owned by the crons; the super admin does not intervene on server events.
- **FR-031**: The cron creation function and the three entry functions MUST lock the entry row (`FOR UPDATE`) before reading or writing events so that a shift or cancel at 00:00 UTC cannot interleave with the Monday cron.
- **FR-032**: Existing transition crons (`mg-close-registrations`, `mg-start-events`, `mg-end-events`) MUST NOT be modified by this feature; the constraints of FR-012 guarantee their exact-date tests always match.

**Display and time zones**

- **FR-040**: Timestamped entries MUST be displayed in the viewer's time zone with the zone / UTC abbreviation next to the time. All-day entries and MG entries MUST be displayed as calendar days in UTC (never shifted). Forms for timestamped entries MUST state that times are entered in UTC.
- **FR-041**: The date picker used for MG Mondays MUST only offer Mondays and MUST return the chosen day anchored at UTC midnight.

**Super-admin area**

- **FR-050**: A new lazy-loaded page `/app/super-admin/calendar` MUST list entries (future first, then history), show for each its type, dates, derived state (planned, registration open, awaiting start, ongoing, finished, cancelled) and for opened MG entries the number of servers and registrations; it hosts the assistant and the non-MG entry form. The dashboard MUST gain a quick-action card to it. The page MUST carry the existing back-to-dashboard button. Super-admin write operations MUST use the functions (MG) or direct writes (non-MG).
- **FR-051**: Destructive actions (cancel, delete) and every shift MUST require a confirmation dialog stating the consequences (servers and registrations affected, that nobody is notified); for a shift the dialog MUST list every moved entry with its old and new dates.

**Banners**

- **FR-060**: A single dumb banner component (inputs only, `OnPush`, no function call in its template) MUST render the four messages of D8 (super-admin alert with link, server-admin neutral message, player "next MG", player "not announced") and the cancellation notice of FR-063. Parents MUST load the data with `resource()` / `rxResource()`.
- **FR-061**: "Future entry" for banners (a) and (b) is a non-cancelled `mg` entry whose MG start is after now; for banner (c) it is a non-cancelled `mg` entry whose registration opening date is after today (UTC), nearest first. The threshold N = 2 MUST be a single named constant.
- **FR-062**: Banners (b) and (c) MUST be hidden for servers without a `server_mg_config` row, and every banner MUST be hidden (not shown in an alarming state) when its data failed to load.
- **FR-063**: The home MG card MUST show, for every player of a server that has a `server_mg_config` row, a notice "The MG of <start date> was cancelled" when that server has a `cancelled` event whose `end_date` is today or later (UTC); it is shown above the "next MG" / "not announced" message and disappears after that end date. When several cancelled events qualify, only the most recent one is shown. It is hidden (not an alarming state) when its data failed to load.

**Existing behaviour that must change**

- **FR-070**: `MgEventService.loadCurrentEvent` MUST exclude `cancelled` events and order by `start_date` ascending (nearest non-finished event first).
- **FR-071**: `MgEventService.loadSpends` MUST exclude events whose status is `cancelled`.
- **FR-074**: `MgEventService` MUST expose a loader returning the most recent `cancelled` event of a server whose `end_date` is today or later (UTC), for the notice of FR-063.
- **FR-072**: The TypeScript `MgEventStatus` and `MgEvent` models MUST include `cancelled` and `calendar_entry_id`; every status-dependent view MUST be checked so a `cancelled` value can never leave a blank or broken card.
- **FR-073**: All new i18n keys MUST exist in the 14 maintained languages (`ar`, `de`, `el`, `en`, `es`, `fr`, `hi`, `id`, `it`, `ko`, `ku`, `pt`, `tr`, `zh`); `npm run i18n:check` is the gate (it checks presence only; `en` and `fr` are translated, others may start as English placeholders as done for earlier MG keys).

**Quality (project rules)**

- **FR-080**: Every new component, service and utility MUST ship its `.spec.ts`; every modified business logic MUST update the existing specs. Components use separate TS / HTML / SCSS / spec files, `templateUrl` / `styleUrl`, standalone, `OnPush`, signals, `inject()`, `@if` / `@for`, no `::ng-deep`, no function in templates, Material components, forms with Signal Forms (`@angular/forms/signals`) and the shared validation utility, touch targets of at least 44px, mobile-first from 320px, translated accessible names.
- **FR-081**: The migration MUST be a new numbered file after `46-mg-correction-improvements.sql` (proposed `supabase/47-mg-global-calendar.sql`) with a delivered rollback script and a SQL test script; it MUST NOT edit any applied migration.

### Key Entities *(data model)*

**`calendar_entries`** (new, global)

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid PK | |
| `type` | enum `calendar_entry_type` (`mg`, `pvp`) | extensible |
| `title` | text null | required for non-MG, max 100 |
| `starts_at` | timestamptz NOT NULL | UTC; for `mg` = MG start Monday 00:00 UTC |
| `ends_at` | timestamptz NOT NULL | exclusive; for `mg` = `starts_at + 7 days` |
| `all_day` | boolean NOT NULL default false | forced true for `mg` |
| `cancelled_at` / `cancelled_by` | timestamptz / uuid null | set only by the cancel function |
| `created_at` / `created_by` | timestamptz / uuid null | `created_by` FK to `user_profiles`, `ON DELETE SET NULL` |
| `updated_at` / `updated_by` | timestamptz / uuid null | maintained by trigger |

Constraints: `uq_calendar_entries_type_starts_at (type, starts_at)`; CHECK `ends_at > starts_at`; CHECK for `mg` (Monday 00:00 UTC, all-day, +7 days); CHECK title rule. Indexes on each FK (`idx_calendar_entries_created_by`, `..._updated_by`, `..._cancelled_by`). RLS: SELECT for `authenticated` (all rows); INSERT / UPDATE / DELETE for super admin and only for `type <> 'mg'`.

**`mg_events`** (modified): `+ calendar_entry_id uuid null` (FK, `ON DELETE RESTRICT`, index `idx_mg_events_calendar_entry_id`), `uq_mg_events_server_calendar_entry (server_id, calendar_entry_id)`, `uq_mg_events_server_start_date (server_id, start_date)`, CHECK constraints of FR-012, status enum `+ cancelled`, date-protection trigger of FR-030.

**`server_mg_config`** (unchanged schema): its existence is the opt-in; no trigger is added (no catch-up, FR-016).

Status flow of an event: `upcoming` (unused by this feature) -> `registration_open` -> `registration_closed` -> `selection_published` -> `ongoing` -> `finished`, with `cancelled` reachable only through the cancel function from any status before `ongoing`.

**SQL functions** (all `SECURITY DEFINER`, fixed `search_path`, `PUBLIC` revoked):

| Function | Callable by | Input | Output / errors |
|----------|-------------|-------|-----------------|
| `create_mg_calendar_entries(p_opening_mondays date[])` | super admin (authenticated) | 1 to 13 Mondays | per-date outcome; `MG_CAL_FORBIDDEN`, `MG_CAL_INVALID_INPUT` |
| `shift_mg_calendar_entry(p_entry_id uuid, p_new_opening_monday date)` | super admin | entry, new opening Monday (moves the entry and all following non-cancelled entries) | entries moved, servers updated, events created; `MG_CAL_NOT_FOUND`, `MG_CAL_NOT_SHIFTABLE`, `MG_CAL_ALREADY_EXISTS`, `MG_CAL_TOO_CLOSE`, `MG_CAL_NOT_MONDAY`, `MG_CAL_OPENING_PASSED` |
| `cancel_mg_calendar_entry(p_entry_id uuid)` | super admin | entry | `deleted` or `cancelled`; `MG_CAL_NOT_FOUND`, `MG_CAL_NOT_CANCELLABLE` |
| `mg_create_events_for_entry(...)` (internal) | cron / other functions only | entry, optional server | events created |
| `mg_create_events_from_calendar()` (internal) | `pg_cron` (job `mg-create-events`) | none | events created for entries opening today |

## Impact on existing code and documents

| Area | Change |
|------|--------|
| `supabase/47-mg-global-calendar.sql` (new) + rollback + `supabase/tests/47-...test.sql` | Everything in the Data model, functions, cron replacement, seed, backfill (migration is the only backend deliverable). `supabase/MIGRATIONS.md` documents only migrations 01 to 07 and is not maintained for later ones; no change required. |
| `src/app/shared/models/mg-event.model.ts` | `cancelled` status, `calendar_entry_id`. New `calendar-entry.model.ts`. |
| `src/app/core/services/mg-event.service.ts` (+ spec) | `loadCurrentEvent` ascending + exclude cancelled; `loadSpends` exclude cancelled; new loader for the recent cancelled event (FR-074). |
| New `calendar.service.ts` (+ spec) | Reads the calendar; calls the three functions; maps error codes. |
| New `src/app/shared/utils/mg-calendar.util.ts` (+ spec) | Date derivation, series, outcome classification, banner state; plus a constant file entry for N = 2 and the 26-week cap. |
| New `src/app/pages/super-admin/calendar/` (+ components for list, assistant, non-MG form) | Smart page, dumb components, `resource()` loading, Signal Forms. |
| New dumb banner component (shared) | Used in 3 parents. |
| `super-admin-dashboard.page.*`, `app.routes.ts` | Quick action card, alert banner, new lazy route under `super-admin` (guarded by `superAdminGuard`). |
| `mg-admin-tab.component.*`, `mightiest-governor.component.*` | Load next entry data with `resource()`, show banner, handle absence of config row; load order follows the new `loadCurrentEvent`. |
| `src/assets/i18n/*.json` (14 files) | New keys. |
| `e2e/helpers/mg-seed.ts`, `e2e/specs` | See Open questions (the demo server has a config row, receives real events, the ascending order would mask the seeded far-future events, and the seeder inserts / deletes `mg_events` through the `e2e_admin` session, which FR-030 no longer allows). |
| `supabase/demo/mg-event-era008-*.sql` | Use non-Monday offsets (`CURRENT_DATE - 24`) that would violate the new constraints: align them on Mondays or mark them obsolete. |
| `SPEC_MG_EVENT.md`, `DEVELOPMENT_STATUS.md` | Update at implementation time: "MG schedule" paragraph and cron table (parity rule replaced), decision 3 ("per server" becomes "global calendar, per-server opt-in"), `cancelled` status, new feature entry, known limitations, new files list. Not part of this spec task. |

## Deployment plan (production switch-over)

**Constraint**: the old parity job will run on Monday 2026-11-30 00:00 UTC (offset 47, odd) and would create the 2026-12-07 events for all 8 servers. The new job and its data must be in place before that instant. Apply the migration between now and **Friday 2026-11-27** (the current MG, 11-23 to 11-29, is `ongoing`; its events get linked by the backfill). Never apply it in the minutes around Sunday 23:59 / Monday 00:00 UTC.

**Order inside the migration** (single transaction, single file): (1) `ALTER TYPE mg_event_status ADD VALUE IF NOT EXISTS 'cancelled'` (the new value must not be used by any index predicate, CHECK, default or data statement of the same transaction, otherwise PostgreSQL refuses; if that proves unavoidable, run this statement alone first); (2) create enum, `calendar_entries`, constraints, indexes, RLS, audit trigger; (3) add `mg_events` column, uniques, CHECK constraints, protection trigger; (4) create the functions (no `server_mg_config` trigger, FR-016); (5) **seed** the future entries; (6) **backfill** past entries and links (after the seed so that unlinked events already created by an early-running old cron are linked too); (7) run the creation function once (idempotent, creates only what is missing, relevant if applied late); (8) `cron.unschedule('mg-create-events')` then `cron.schedule('mg-create-events', '0 0 * * 1', ...)` calling the calendar function. Same job name = it is impossible to end up with two creation jobs. No application logic beyond this, and no other cron is touched.

**Seed** (13 `mg` entries, opening Monday -> MG start): 2026-11-30 -> 12-07; 12-14 -> 12-21; 12-28 -> 2027-01-04; 2027-01-11 -> 01-18; 01-25 -> 02-01; 02-08 -> 02-15; 02-22 -> 03-01; 03-08 -> 03-15; 03-22 -> 03-29; 04-05 -> 04-12; 04-19 -> 04-26; 05-03 -> 05-10; 05-17 -> 05-24 (26 weeks, equal to the assistant cap; continues the 2-week cycle of the former parity rule). `created_by` null.

**Pre-flight (read-only, before applying)**: (P1) every `mg_events` row has a Monday `start_date`, `end_date = start + 6`, `registration_close_at = start - 4`, `registration_open_at = start - 7` (expected 0 exceptions; any leftover e2e / demo row, for example dated 2031, must be removed or accounted for); (P2) no duplicate `(server_id, start_date)`; (P3) save the **production** command text of the `mg-create-events` job and of the other three jobs (rollback material); (P4) confirm at least one `super_admin` profile exists; (P5) rehearse the whole migration on a local Supabase stack loaded with a copy of the `mg_events` / `server_mg_config` / `servers` data (the plan has no database branches), including a simulated 2026-11-30 run.

**Post-deployment checks**: exactly one `mg-create-events` job, active, calling the calendar function; 13 future entries plus the backfilled past ones; no `mg_events` violating a constraint; all existing events linked. **Monday 2026-11-30 00:05 UTC**: exactly 3 new events (ERA008, ERA008-DEMO, Era36) for 2026-12-07, status `registration_open`, none for the 5 other servers, no duplicate. **Thursday 2026-12-03 23:59 UTC +5 min**: those events are `registration_closed`.

**Frontend order**: migration first, frontend second (the old frontend works with the new schema: cancelled events do not exist yet; banners tolerate failures in the other order).

**Rollback** (script delivered, not auto-run): (R1) before Monday 2026-11-30 00:00 UTC: re-schedule `mg-create-events` with the production command saved in P3 (not the repo text of file 26), then drop the new functions and triggers; the calendar tables can stay (unused, harmless) or be dropped; the added constraints can stay. (R2) after the Monday cron: events created from the calendar stay valid (same shape as legacy events); reverting the job to parity yields the same dates for the cycle; any event set to `cancelled` must be reviewed manually first because an enum value cannot be removed (the value stays, unused). (R3) **Monday emergency**: if at 00:05 UTC the events are missing (empty calendar, failed job), run the creation function manually for the entry (idempotent); the registration window runs until Thursday 23:59 UTC so the cycle is still recoverable that day.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: On 2026-11-30 00:05 UTC, exactly 3 events exist for the MG of 2026-12-07 (one per configured server), 0 for unconfigured servers, 0 duplicates; the same holds for every later seeded cycle.
- **SC-002**: A super admin creates a 6-MG series (12 weeks) in a single assistant run, seeing every derived date before confirming; dates already present are reported and skipped, never causing a failure of the batch.
- **SC-003**: 100 percent of the `mg_events` rows satisfy the date constraints (query returns 0 violations), so a transition cron can never leave an event stuck because of its dates.
- **SC-004**: A shift or cancel is all-or-nothing across every server and every moved entry: after a refused or failed operation, 0 `mg_events` and 0 calendar rows differ from before.
- **SC-005**: No client session, server admin or super admin, can insert or delete an `mg_events` row, change an `mg_events` date or status other than the publication transition, nor write an `mg` calendar row outside the three functions (tested at SQL level).
- **SC-006**: Each banner and the cancellation notice are shown in exactly the cases of D8 and FR-063 and hidden otherwise (including load failure and unconfigured server), covered by automated tests for every combination.
- **SC-007**: No page or card of a server breaks when an event is `cancelled`; the cancelled event never appears as current event nor in DKP spends.
- **SC-008**: Definition of Done of the project: every new / modified file has its up-to-date `.spec.ts`; the full test suite passes with no regression; lint has no error; `npm run i18n:check` passes; the production build passes; `DEVELOPMENT_STATUS.md` is updated (feature complete, new files, known limitations); no open security finding on the migration (RLS, `SECURITY DEFINER` grants).

## Assumptions

- The migration is applied manually in the Supabase SQL editor, as for previous numbered migrations; there is no database branch (free plan), hence the local rehearsal.
- The spec convention of this repo is English; the product decisions were taken in French and are reproduced faithfully.
- Decision D4 as clarified on 2026-11-24: an entry whose opening Monday is today or in the past is refused (no late entries); this supersedes the earlier reading in which a late entry with the Thursday deadline still ahead created its events immediately.
- The opened-entry shift of decision D6 is a **postponement** (the registration window gets longer, `registration_open_at` is kept), which is why the database constraint is `registration_open_at <= start_date - 7` and not an equality; the brief's D7 list (Monday, end = start + 6, closing D-4) does not constrain the opening date.
- Physical deletion in D6 ("no server has a registration") is narrowed to "no event was ever generated for the entry" (clarified 2026-11-24), so that registrations, selections (and their DKP costs) are never destroyed silently and a cancellation notice can always be shown to the players.
- `UNIQUE (server_id, start_date)` and `registration_open_at <= start_date - 7` are additions to D7, motivated by the duplicate risk and by the postponement case.
- The creation function uses the single rule "opening date on or before today and deadline ahead"; on the Monday 00:00 UTC run this equals "opening today" of decision D4, so the cron and the one-off run of the migration share one rule.
- Times of timestamped non-MG entries are typed by the super admin in UTC (explicit label) and displayed to viewers in their own zone; no per-server time zone exists.
- No super-admin test account exists (same limitation as spec 002): super-admin screens are covered by unit specs and by the SQL test script; e2e coverage of the super-admin calendar page is out of reach for now.
- The only write the app performs on `mg_events` is the selection publication (`mg-event.service.ts`, update to `selection_published`); no screen inserts or deletes an event. Server admins' INSERT / DELETE rights, inherited from the broad "manage" policy of migration 26, were only used by the e2e seeder and the demo scripts and are removed (clarified 2026-11-25, FR-030).
- Cancelled events remain readable by the members of their server through the existing select policy; the only screen that displays one is the cancellation notice of the home MG card (FR-063).

## Open questions *(non-blocking, a default is applied)*

1. **E2E and demo server.** ERA008-DEMO has a config row, so it receives real events, and the move to ascending order makes the real event win over the far-future events (2031) that the MG e2e helper seeds (the e2e doc already notes the masking in the reverse direction). Default applied: the seeding helper must remove the demo server's own non-finished events before seeding (guarded to the demo server, as every other e2e write), and the demo SQL scripts are realigned on Mondays. Because client INSERT / DELETE on `mg_events` is dropped (FR-030), the helper can no longer write through the `e2e_admin` session: it needs a privileged path (for example a service-role key kept in a local, uncommitted e2e environment variable, or a test-only `SECURITY DEFINER` function restricted to the demo server). To decide at planning time.
2. *(Resolved)* **Direct writes by server admins on `mg_events`.** Decided by the product owner on 2026-11-25: the crons own the statuses, the super admin does not intervene on server events, and admins only publish a selection (an unpublished event is FFA through the failsafe). INSERT and DELETE policies are dropped for every client and the only client update left is the publication transition (FR-030). Consequence: the e2e seeder and the demo scripts need a privileged path (see question 1).
3. *(Resolved)* **Spacing between MG entries.** Decided by the product owner: two consecutive MG do not exist in the game, so a minimum of 14 days between two non-cancelled MG starts is a hard database rule (FR-004a), not a warning.

## Out of scope

- Any player-facing display of non-MG (for example PvP) entries; the table is readable by all but no screen shows them yet.
- Notifications of any kind (real-time or push) on creation, shift or cancel.
- Per-server calendars, opt-out of a single cycle by a server, link between duplicated entries, un-cancelling an entry, a super-admin e2e account.
- Changes to the transition crons, the failsafe behaviour, registrations, selections, DKP computation, slot configuration.
