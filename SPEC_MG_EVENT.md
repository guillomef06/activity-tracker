# Spec — Mightiest Governor (MG) Event

## Tech Stack

- **Framework:** Angular 21, standalone components, Signals, OnPush
- **Backend:** Supabase (PostgreSQL + RLS + pg_cron)
- **UI:** Angular Material
- **Tests:** Vitest (NOT Jasmine/Karma — do not use `TestBed` with Jasmine matchers)

---

## Context

The Mightiest Governor is a competitive event that lasts a full week, Monday to Sunday. The activity tracker is the source of truth for player rankings, which drive automatic seat allocation.

> **Scheduling (updated 27 November 2026, migration 47, spec `specs/003-mg-global-calendar`):** the "every two weeks (odd weeks), per-server reference date" model this document originally specified has been replaced. MG events are no longer scheduled per server — a **super admin manages one global calendar** (`calendar_entries`, type `mg`), and each opted-in server (a `server_mg_config` row exists) gets its own `mg_events` row created from that single shared schedule. See that spec folder for the full design (14-day minimum gap between MG starts, cascade shift of an entry and all following ones, the `cancelled` status). The rest of this document (registration, seat assignment, publication, per-event statuses `upcoming` → `finished`) is unchanged by that work.

---

## Event Cycle & Timeline

For each MG event, the following fixed timeline applies relative to its start date (Monday):

| Day | Action |
|-----|--------|
| Monday of rest week (D−7) | Registration opens for the next MG |
| Thursday of rest week (D−4) | Registration closes — deadline for players |
| Friday of rest week (D−3) | Selection is published (auto or manual) |
| Monday of MG week (D) | MG event starts |
| Sunday of MG week (D+6) | MG event ends |

> **Rest week** = the week between two MG events (no longer fixed at exactly 2 weeks — see the scheduling note above).

---

## Server Configuration

Each server can configure:

| Setting | Values | Description |
|---------|--------|-------------|
| `capacity` | `10` or `50` | Number of reserved slots for selected players |
| `assignment_mode` | `automatic` \| `manual` | How selected players are determined |

---

## Registration Rules

- **Who can register:** any member of the server
- **Window:** from registration open date to registration close date
- **Withdrawal:** a player can unregister at any point during the open window — the row is hard deleted, re-registration is allowed
- **No status shown to players during window** — just "registered" or "not registered"

---

## Seat Assignment

### Automatic mode
- After registration closes, the system takes the **top N registered players** ranked by the current leaderboard (rolling 6-week score)
- N = server `capacity`

### Manual mode
- After registration closes, server admins manually pick up to N players from the registered list
- Selection is saved but not visible to players until published

### FFA (Free-For-All) slots
- If fewer than N players registered, all registered players are selected
- Remaining slots (capacity − selected count) are **FFA**: open to anyone without registration
- Example: 40 registered for 50 slots → 40 selected + 10 FFA

---

## Selection Publication

- Admins **publish** the selection (manual action, available from D−3 at the earliest)
- In automatic mode, the system can auto-generate the selection — admin still confirms before publishing
- Once published, all server members can see:
  - The list of selected players (ranked)
  - The number of FFA slots remaining (if any)

---

## MG Event Statuses

```
upcoming → registration_open → registration_closed → selection_published → ongoing → finished
                                                                          ↘ cancelled (any status before `ongoing`)
```

| Status | Trigger |
|--------|---------|
| `upcoming` | Event created |
| `registration_open` | Monday of rest week (D−7) — created directly in this status by `mg_create_events_from_calendar()`, migration 47; an event never actually sits in `upcoming` in practice |
| `registration_closed` | Thursday of rest week (D−4) at midnight |
| `selection_published` | Admin publishes (earliest D−3) |
| `ongoing` | Monday of MG week (D) |
| `finished` | Sunday of MG week (D+6) at end of day |
| `cancelled` | Super admin cancels the underlying calendar entry (spec 003) before the event starts; a player-facing notice is shown, no one is otherwise notified |

---

## Data Model

### `mg_events`
| Column | Type | Description |
|--------|------|-------------|
| `id` | uuid | PK |
| `server_id` | uuid | FK → servers |
| `start_date` | date | Monday of MG week |
| `end_date` | date | Sunday of MG week |
| `registration_open_at` | date | D−7 |
| `registration_close_at` | date | D−4 |
| `status` | enum | See statuses above |
| `selection_published_at` | timestamp \| null | When admin published |
| `created_at` | timestamp | |
| `calendar_entry_id` | uuid \| null | FK → `calendar_entries` (migration 47); the global calendar entry this event was created from. `null` for events created before migration 47's backfill linked them, or by the e2e demo helpers (migration 48) |

> **Client writes on `mg_events` (migration 47):** INSERT and DELETE are no longer allowed for `authenticated`/`anon` — only the super admin's calendar functions and the pg_cron jobs create/remove rows. The **only** client UPDATE still permitted is the publish transition (`registration_closed` → `selection_published`, with `selection_published_at` set and every other column unchanged); anything else is rejected by the `trg_mg_events_guard` trigger.

### `server_mg_config`
| Column | Type | Description |
|--------|------|-------------|
| `server_id` | uuid | PK, FK → servers |
| `capacity` | smallint | 10 or 50 |
| `assignment_mode` | enum | `automatic` \| `manual` |

### `mg_registrations`
| Column | Type | Description |
|--------|------|-------------|
| `id` | uuid | PK |
| `mg_event_id` | uuid | FK → mg_events |
| `user_id` | uuid | FK → user_profiles |
| `registered_at` | timestamp | |

> `UNIQUE(mg_event_id, user_id)`. Unregistering = hard DELETE. Re-registration = new INSERT.

### `mg_selections`
| Column | Type | Description |
|--------|------|-------------|
| `id` | uuid | PK |
| `mg_event_id` | uuid | FK → mg_events |
| `user_id` | uuid \| null | null = FFA slot |
| `rank` | smallint | Position in selection (1-based) |
| `selection_type` | enum | `selected` \| `ffa` |
| `selected_by` | enum | `automatic` \| `manual` |

---

## Features to Build

### Admin panel (server-settings or dedicated MG admin tab)

1. **MG config** — set `capacity` (10/50) and `assignment_mode` per server
2. **View registrations** — list of active registrations for the next MG, with leaderboard rank shown
3. **Generate selection** (auto mode) — compute top N from leaderboard; preview before confirming. Admins can also add non-registered players to unfilled slots.
4. **Manual selection** (manual mode) — pick players from registered or unregistered members; order determined by admin
5. **Publish selection** — confirm and make selection visible to all members

### Player-facing

Location: **existing "Mightiest Governor" tab** on the home page (`home.page.html`, 3rd tab).

The tab already contains a static reference table (`MightiestGovernorComponent`) showing rank / weekly target / cost. The dynamic event section is added **below** the static table in the same tab.

Dynamic section behavior by event status:

| Status | What the player sees |
|--------|----------------------|
| `upcoming` | Nothing (no event card shown) |
| `registration_open` | Register / Unregister button + registration deadline date (no countdown) |
| `registration_closed` | Static message: "La liste sera bientôt publiée" — no action |
| `selection_published` | Selected players list (ranked) + FFA slots count + own status |
| `ongoing` | Selected players list + own status (locked) |
| `finished` | Read-only result — selected players list |

1. **Register / Unregister** — visible during `registration_open`; displays the registration deadline date (no countdown timer)
2. **Waiting state** — between `registration_closed` and `selection_published`: static message, no action
3. **View selection** — visible from `selection_published`; shows selected players ranked + FFA slots count
4. **My status** — am I registered? am I selected? (shown as a badge/chip on the event card)

### System / Background — pg_cron jobs

4 fixed cron jobs in Supabase. No queue table. Each job is idempotent.

| Job name | Expression | Action |
|---|---|---|
| `mg-create-events` | `0 0 * * 1` | Every Monday 00:00 UTC — calls `mg_create_events_from_calendar()` (migration 47): for every non-cancelled `calendar_entries` row of type `mg` whose opening Monday (D−7) has arrived (and no later than the Thursday 23:58 UTC the close cron handles), creates one `mg_events` row per opted-in server (`server_mg_config` exists), with `status = registration_open` |
| `mg-close-registrations` | `59 23 * * 4` | Every Thursday 23:59 UTC — transitions `registration_open` → `registration_closed` for events where `registration_close_at <= NOW()`. **Does not generate selections** — admins trigger that manually. |
| `mg-start-events` | `0 0 * * 1` | Every Monday 00:00 UTC — transitions `selection_published` → `ongoing` for events where `start_date = CURRENT_DATE`; **failsafe**: an event still `registration_closed` at this point (no selection ever published) is also moved to `ongoing` with an empty selection (full FFA) |
| `mg-end-events` | `59 23 * * 0` | Every Sunday 23:59 UTC — transitions `ongoing` → `finished` for events where `end_date = CURRENT_DATE` |

> `selection_published` is always admin-triggered (not a cron). The Monday cron runs two jobs simultaneously: event creation (from the global calendar) and the `ongoing` transition (+ failsafe).

---

## Decisions & Constraints

| # | Decision |
|---|----------|
| 1 | Registration cannot be re-opened after closing. However, admins can **manually add any server member** (registered or not) to unfilled slots at any point before `ongoing`. |
| 2 | The selection **can be edited after publication** up to `ongoing`. Once the event is `ongoing`, the selection is **locked** — no further changes. |
| 3 | ~~The MG schedule is per-server — each server manages its own MG calendar independently.~~ **Superseded 27 November 2026 (migration 47):** the schedule is a single **global calendar** a super admin manages; a server only opts in or out (via `server_mg_config` existing or not) and otherwise has no control over the dates. |
| 4 | **No notifications** — real-time (Supabase) and push notification systems are not yet implemented; out of scope for this feature. |
| 5 | **History is natural** — published selections serve as the historical record of who participated in each MG. No separate history model needed. |
| 6 | **Any admin** of the server can manage selections (generate, publish, edit) — not restricted to the server owner. |
| 7 | **`rank` in `mg_selections`** = position within the selection list (1-based, 1..N). In auto mode, determined by leaderboard score. In manual mode, determined by admin ordering. Not the leaderboard rank. |
| 8 | **FFA slots** are informative only — displayed as a count after publication, no in-app reservation mechanism. |
| 9 | **0 registered players** = 100% FFA. Admins can publish a selection with 0 `selected` rows and N `ffa` rows. Publication is not blocked. |
| 10 | **All dates/times are UTC.** The cron Thursday 23:59 UTC may correspond to Friday local time for some timezones — this is expected and documented behavior. |
| 11 | **Cron only changes status** — the `mg-close-registrations` cron does not generate selections. Selection generation is always admin-triggered (auto preview + confirm, or manual pick). |
| 12 | **Registrations are hard deleted on withdrawal** — no soft delete, no `unregistered_at`. `UNIQUE(mg_event_id, user_id)` enforced at DB level. Re-registration is allowed (new INSERT). |
| 13 | **Re-generating auto selection** (before publication) = UPSERT on `mg_selections` — existing rows are updated in place, no DELETE. |
| 14 | **No countdown timer** — the player-facing UI shows the registration deadline as a date, not a live countdown. Simpler and sufficient. |
| 15 | **Waiting message** — between `registration_closed` and `selection_published`, the player view shows a static informational message; no interactive elements. |
