# Spec — Discord Scheduled Messages

## Tech Stack

- **Framework:** Angular 21, standalone components, Signals, OnPush
- **Backend:** Supabase (PostgreSQL + RLS + `pg_cron` + `pg_net`)
- **UI:** Angular Material
- **Tests:** Vitest (NOT Jasmine/Karma — do not use `TestBed` with Jasmine matchers)

---

## Context

Server admins can already configure Discord webhook channels and send one-off messages manually (`discord_webhooks` table, `DiscordService`, `discord-tab` component). This feature adds **recurring scheduled messages**: an admin picks an existing webhook channel, writes a message, and defines a repeat schedule. The server sends the message automatically — no admin action needed once configured.

**Scheduling granularity is intentionally coarse** — this is not a general-purpose cron UI:
- Minimum frequency: once a day
- Maximum frequency: once a month
- Time is expressed as **hour of day only** (minutes fixed at `:00`), **UTC**
- No raw cron expressions exposed to admins — a small structured form instead

This bounded scope means evaluation can happen in pure SQL inside a single hourly `pg_cron` job — no Edge Function, no Node scheduling library needed.

---

## Frequency Options

| Frequency | Extra config | Example |
|---|---|---|
| `daily` | none | Every day at 19:00 UTC |
| `weekly` | one or more days of week (ISO 1=Mon … 7=Sun) | Every Tuesday and Saturday at 19:00 UTC |
| `monthly` | one day of month (1-28) | The 1st of every month at 19:00 UTC |

> **Day of month is capped at 28** to avoid ambiguity in shorter months (no Feb 30, no "last day of month" special-casing). This is a deliberate simplification — not a bug.

---

## Data Model

### `discord_scheduled_messages`
| Column | Type | Description |
|--------|------|-------------|
| `id` | uuid | PK |
| `server_id` | uuid | FK → servers (RLS scope, denormalized from `webhook_id` for query/policy simplicity) |
| `webhook_id` | uuid | FK → discord_webhooks, `ON DELETE CASCADE` |
| `message` | text | Max 2000 chars (Discord limit) |
| `frequency` | enum | `daily` \| `weekly` \| `monthly` |
| `days_of_week` | smallint[] | Required (non-empty) when `frequency = weekly`, null otherwise. ISO 1-7 |
| `day_of_month` | smallint | Required (1-28) when `frequency = monthly`, null otherwise |
| `hour_utc` | smallint | 0-23, minutes always `:00` |
| `is_active` | boolean | Default `true` — pause without deleting |
| `created_by` | uuid | FK → user_profiles |
| `created_at` | timestamptz | |
| `updated_at` | timestamptz | |

> `CHECK` constraints enforce: `weekly` requires non-null non-empty `days_of_week` and null `day_of_month`; `monthly` requires `day_of_month BETWEEN 1 AND 28` and null `days_of_week`; `daily` requires both null.

**RLS:** same pattern as `discord_webhooks` — members can `SELECT` (read-only, no action needed on their side), admins/super-admins can `ALL` (insert/update/delete), scoped by `server_id = get_user_server_id(auth.uid())`.

---

## Features to Build

### Admin panel — new section in existing `discord-tab`

Placed as a third card, below "Webhook Channels" and "Send Message" (reuses the webhook selector pattern from the existing send-message form):

1. **List scheduled messages** — channel name, message preview, frequency summary (e.g. "Every Tue, Sat at 19:00 UTC"), active/paused toggle, edit/delete actions
2. **Create/edit form**:
   - Select webhook channel (`mat-select`, same list as existing webhooks)
   - Message content (`textarea`, max 2000 chars, live counter — mirrors the existing send-message field)
   - Frequency (`mat-select`: Daily / Weekly / Monthly)
   - Conditional sub-field:
     - Weekly → day-of-week checkboxes (Mon-Sun)
     - Monthly → day-of-month number input (1-28)
   - Hour of day (`mat-select`, 00-23, labeled as UTC explicitly to avoid admin confusion)
3. **Pause/resume** — toggle `is_active` without deleting the schedule
4. **Delete** — hard delete, confirmation dialog (consistent with existing webhook delete pattern)

No player-facing UI — this is admin-only configuration; the output is the Discord message itself.

### System / Background — `pg_cron` job

**One fixed hourly job.** No queue table, no Edge Function.

| Job name | Expression | Action |
|---|---|---|
| `discord-scheduled-messages-dispatch` | `0 * * * *` | Every hour on the hour — calls `dispatch_discord_scheduled_messages()`, a `SECURITY DEFINER` SQL function that finds all active schedules matching the current UTC hour + day, and fires `net.http_post()` to the linked webhook's `webhook_url` for each match |

Matching logic (all evaluated in SQL, no external library):
```sql
sm.is_active
AND sm.hour_utc = EXTRACT(HOUR FROM now())::smallint
AND (
  sm.frequency = 'daily'
  OR (sm.frequency = 'weekly'  AND EXTRACT(ISODOW FROM now())::smallint = ANY(sm.days_of_week))
  OR (sm.frequency = 'monthly' AND sm.day_of_month = EXTRACT(DAY FROM now())::smallint)
)
```

> **Idempotent by construction** — the job runs once per hour, and each schedule can match at most one hour per day, so there is no risk of duplicate sends from a single run.

**Prerequisite:** the `pg_net` extension must be enabled on the project (used to fire the HTTP POST directly from Postgres — same mechanism proposed for the payment webhook discussion, no Edge Function required here since Discord webhooks need no auth beyond the URL itself).

---

## Decisions & Constraints

| # | Decision |
|---|----------|
| 1 | **UTC only** — no per-server timezone setting. Admins configure the hour in UTC explicitly; the UI must label this clearly to avoid confusion. |
| 2 | **Minute is always `:00`** — no finer granularity. This is what allows a single hourly cron job instead of a minute-level poller. |
| 3 | **Monthly day-of-month capped at 1-28** — avoids "31st doesn't exist in February" edge cases entirely; no last-day-of-month fallback logic. |
| 4 | **Deleting a webhook cascades to its scheduled messages** (`ON DELETE CASCADE`) — no orphaned schedules pointing at a removed channel. |
| 5 | **No send history/log** — out of scope for v1. If a webhook call fails (e.g. Discord returns an error), it is not retried and not recorded. Can be added later as a `discord_scheduled_message_logs` table if needed. |
| 6 | **No player-facing surface** — this is purely an admin/server configuration feature. |
