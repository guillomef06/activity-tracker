# Spec — Mightiest Governor (MG) Event

## Tech Stack

- **Framework:** Angular 21, standalone components, Signals, OnPush
- **Backend:** Supabase (PostgreSQL + RLS + pg_cron)
- **UI:** Angular Material
- **Tests:** Vitest (NOT Jasmine/Karma — do not use `TestBed` with Jasmine matchers)

---

## Context

The Mightiest Governor is a competitive event that runs every two weeks (odd weeks: 1, 3, 5…). It lasts a full week, Monday to Sunday. The activity tracker is the source of truth for player rankings, which drive automatic seat allocation.

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

> **Rest week** = the even week between two MG events.

**MG schedule:** computed from a configurable reference start date + a 2-week recurrence (odd weeks only).

---

## Alliance Configuration

Each alliance can configure:

| Setting | Values | Description |
|---------|--------|-------------|
| `capacity` | `10` or `50` | Number of reserved slots for selected players |
| `assignment_mode` | `automatic` \| `manual` | How selected players are determined |

---

## Registration Rules

- **Who can register:** any member of the alliance
- **Window:** from registration open date to registration close date
- **Withdrawal:** a player can unregister at any point during the open window
- **No status shown to players during window** — just "registered" or "not registered"

---

## Seat Assignment

### Automatic mode
- After registration closes, the system takes the **top N registered players** ranked by the current leaderboard (rolling 6-week score)
- N = alliance `capacity`

### Manual mode
- After registration closes, alliance admins manually pick up to N players from the registered list
- Selection is saved but not visible to players until published

### FFA (Free-For-All) slots
- If fewer than N players registered, all registered players are selected
- Remaining slots (capacity − selected count) are **FFA**: open to anyone without registration
- Example: 40 registered for 50 slots → 40 selected + 10 FFA

---

## Selection Publication

- Admins **publish** the selection (manual action, available from D−3 at the earliest)
- In automatic mode, the system can auto-generate the selection — admin still confirms before publishing
- Once published, all alliance members can see:
  - The list of selected players (ranked)
  - The number of FFA slots remaining (if any)

---

## MG Event Statuses

```
upcoming → registration_open → registration_closed → selection_published → ongoing → finished
```

| Status | Trigger |
|--------|---------|
| `upcoming` | Event created |
| `registration_open` | Monday of rest week (D−7) |
| `registration_closed` | Thursday of rest week (D−4) at midnight |
| `selection_published` | Admin publishes (earliest D−3) |
| `ongoing` | Monday of MG week (D) |
| `finished` | Sunday of MG week (D+6) at end of day |

---

## Data Model

### `mg_events`
| Column | Type | Description |
|--------|------|-------------|
| `id` | uuid | PK |
| `alliance_id` | uuid | FK → alliances |
| `start_date` | date | Monday of MG week |
| `end_date` | date | Sunday of MG week |
| `registration_open_at` | date | D−7 |
| `registration_close_at` | date | D−4 |
| `status` | enum | See statuses above |
| `selection_published_at` | timestamp \| null | When admin published |
| `created_at` | timestamp | |

### `alliance_mg_config`
| Column | Type | Description |
|--------|------|-------------|
| `alliance_id` | uuid | PK, FK → alliances |
| `capacity` | smallint | 10 or 50 |
| `assignment_mode` | enum | `automatic` \| `manual` |

### `mg_registrations`
| Column | Type | Description |
|--------|------|-------------|
| `id` | uuid | PK |
| `mg_event_id` | uuid | FK → mg_events |
| `user_id` | uuid | FK → user_profiles |
| `registered_at` | timestamp | |
| `unregistered_at` | timestamp \| null | Set on withdrawal |

> A registration is considered **active** when `unregistered_at IS NULL`.

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

### Admin panel (alliance-settings or dedicated MG admin tab)

1. **MG config** — set `capacity` (10/50) and `assignment_mode` per alliance
2. **View registrations** — list of active registrations for the next MG, with leaderboard rank shown
3. **Generate selection** (auto mode) — compute top N from leaderboard; preview before confirming
4. **Manual selection** (manual mode) — pick players from registered list via UI
5. **Publish selection** — confirm and make selection visible to all members

### Player-facing

1. **Register / Unregister** — visible during `registration_open` window with countdown to deadline
2. **View selection** — visible after `selection_published`; shows selected players + FFA slots count
3. **My status** — am I registered? am I selected?

### System / Background — pg_cron jobs

4 fixed cron jobs in Supabase. No queue table. Each job is idempotent.

| Job name | Expression | Action |
|---|---|---|
| `mg-create-events` | `0 0 * * 1` | Every Monday 00:00 UTC — creates MG events for alliances where this Monday = D−7 (rest week). Inserts with `status = registration_open`. Condition: `(current_monday - reference_start_date) / 7 % 2 = 1` |
| `mg-close-registrations` | `59 23 * * 4` | Every Thursday 23:59 UTC — transitions `registration_open` → `registration_closed` for events where `registration_close_at <= NOW()` |
| `mg-start-events` | `0 0 * * 1` | Every Monday 00:00 UTC — transitions `selection_published` → `ongoing` for events where `start_date = CURRENT_DATE` |
| `mg-end-events` | `59 23 * * 0` | Every Sunday 23:59 UTC — transitions `ongoing` → `finished` for events where `end_date = CURRENT_DATE` |

> `selection_published` is always admin-triggered (not a cron). The Monday cron runs two jobs simultaneously: event creation and `ongoing` transition.

---

## Decisions & Constraints

| # | Decision |
|---|----------|
| 1 | Registration cannot be re-opened after closing. However, admins can **manually add players** to unfilled slots at any point before the event starts. |
| 2 | The selection **can be edited after publication** — if a selected player drops out, an admin can replace them (manual override). |
| 3 | The MG schedule is **per-alliance** — each alliance manages its own MG calendar independently. |
| 4 | **No notifications** — real-time (Supabase) and push notification systems are not yet implemented; out of scope for this feature. |
| 5 | **History is natural** — published selections serve as the historical record of who participated in each MG. No separate history model needed. |
