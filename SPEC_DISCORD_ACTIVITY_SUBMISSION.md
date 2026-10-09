# SPEC — Discord Activity Submission + Unified Supabase Auth

Status: **Draft for review** · Author: scoping pass · Last updated: 2026-10-05

Lets alliance members submit their weekly activities from Discord instead of the
web UI, and (Part B) consolidates the dashboard sites onto the same Supabase
identity. Both parts hinge on **one shared Supabase project** being the single
source of identity for: the Activity Tracker app, the Discord bot, and the
`th12eat.github.io/aoem-dashboard` sites.

---

## Guiding constraints (from the current codebases)

- The Activity Tracker is a **static Angular SPA on GitHub Pages** — there is **no
  app server**. Supabase (Postgres + RLS + pg_cron + Edge Functions) is the entire
  backend. All writes today go through `ActivityService.addActivity()` → an UPSERT
  into `activities` as the logged-in user (`auth.uid()`).
- RLS is written around `auth.uid()`. **A bot has no `auth.uid()`** — this is the
  core problem the design solves.
- Catherine (the Discord bot) is Python/discord.py, JSON-file storage, **no DB
  client, no HTTP client, and no user-identity model** today (she only knows
  Discord roles + an event's `created_by`). She already shows a static
  "Activity Tracker" link button and runs as a long-lived process.
- `activities` enforces `UNIQUE(user_id, activity_type, date)` and points are
  computed by the existing `calculate_activity_points(server_id, type, position)`
  SECURITY DEFINER function. The bot must **reuse these**, never reimplement them.

### Two hard rules

1. **The bot never holds the Supabase `service_role` key.** It calls an Edge
   Function with a bot-only invoke secret; the service role stays inside Supabase.
2. **Validation + point math live in ONE place** (a Postgres RPC), shared by the
   web app's rules. The bot does zero business logic.

---

# PART A — Discord activity submission

## A1. Account linking (Discord OAuth via Supabase `linkIdentity`)

Linking is initiated **from the Activity Tracker app** (where the user is already
authenticated), not by pasting a token into Discord.

- **UI:** Settings → "Connect Discord" button → `supabase.auth.linkIdentity({ provider: 'discord' })`.
- This attaches a **verified** Discord identity to the user's Supabase account.
  Supabase stores it in `auth.identities` (provider `discord`), including the
  Discord user id (the identity's `provider_id` / `identity_data.sub`).
- **Prereqs:** create a Discord OAuth application; enable the Discord provider in
  Supabase Auth; add the app's redirect URL. Scope: `identify` only.

### Mapping table (bot-readable, no PII beyond the Discord id)

```sql
-- Mirror of the verified link, in the public schema so an RPC/Edge Function can
-- resolve Discord id → app user without touching the auth schema at query time.
CREATE TABLE IF NOT EXISTS discord_links (
  discord_user_id TEXT PRIMARY KEY,          -- Discord snowflake (string)
  user_id         UUID NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  linked_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id)                            -- one Discord acct per app acct
);
ALTER TABLE discord_links ENABLE ROW LEVEL SECURITY;
-- Users may see/delete their own link; writes happen via SECURITY DEFINER only.
CREATE POLICY discord_links_self_select ON discord_links
  FOR SELECT USING (user_id = auth.uid());
CREATE POLICY discord_links_self_delete ON discord_links
  FOR DELETE USING (user_id = auth.uid());
```

Populate `discord_links` right after a successful `linkIdentity`, from the app
(the app knows both `auth.uid()` and the freshly-linked Discord id). An "Unlink"
button deletes the row and calls `unlinkIdentity`.

> Alternative MVP if the OAuth app isn't ready: a one-time 6-char code generated in
> Settings, redeemed by `/activity_link <code>`. We are **choosing OAuth**; the code
> path is noted only as a fallback.

## A2. Submission entrypoint — RPC + Edge Function

### Postgres RPC (SECURITY DEFINER) — all validation + points here

```
submit_activity_for_discord(
  p_discord_id   TEXT,
  p_activity     TEXT,
  p_rank         INTEGER,     -- nullable; ignored for participation activities
  p_week_date    DATE         -- any date within the target week (see A3)
) RETURNS JSONB
```

Behavior:
1. Resolve `p_discord_id` → `user_id` + `server_id` via `discord_links` +
   `user_profiles`. Not linked → `{ ok:false, reason:'not_linked' }`.
2. Resolve the target week from `p_week_date` against the active `activity_seasons`
   row → `week_index`. No active season / out-of-range → reject.
3. Validate `p_activity` is offered that week (`season_activities`, or `legion`
   which is implicit every week). Not offered → `{ ok:false, reason:'activity_not_in_week' }`.
4. Determine ranked vs participation from `server_activity_settings`:
   - participation → force `position = NULL`, points = `participation_points`
     (ignore `p_rank`; if a rank was supplied, note it in the response message).
   - ranked → require `p_rank` in a sane range (e.g. 1–500); compute points via
     `calculate_activity_points(server_id, activity, rank)`.
5. Compute the stored `date` (A3) and **UPSERT** into `activities` on
   `(user_id, activity_type, date)`.
6. Return `{ ok:true, action:'inserted'|'updated', points, week_label }` or
   `{ ok:false, reason, message }`.

This is the **single** place "is this submission shaped correctly?" is answered —
exactly the gate you described.

### Edge Function `discord-submit` (the only thing the bot calls)

- Validates a header `x-bot-secret` against a Supabase secret. Reject otherwise.
- Calls the RPC with the service role and returns its JSON verbatim.
- A sibling read-only function (or RPC) `discord-open-weeks` / `discord-week-activities`
  powers autocomplete (below).

The bot's `.env` holds only: the function base URL + the bot invoke secret. **No
DB credentials.**

## A3. The "week" UX — autocomplete, not a typed date

- `week` option uses **Discord autocomplete**: the bot calls `discord-open-weeks`
  for the linked user's active season and returns the same labels the app dropdown
  shows, e.g. `Week 3 (Oct 6–12) · current`. Blank → RPC defaults to current week.
- `activity` option autocomplete **reads the chosen `week`** (`interaction.namespace`)
  and returns only that week's valid activities + `legion`.
- Week → stored `date`: the RPC maps the chosen week to a **canonical timestamp**
  (recommend the week's Monday `start_date` at `00:00Z`) so the
  `(user, activity, date)` uniqueness lands one row per activity per week. (Confirm
  this matches how the web UI currently stamps `date` — align them so web + bot
  submissions dedupe against each other.)

## A4. Bot command (Catherine, new isolated cog `activity.py`)

```
/activity_link                       → starts/explains OAuth linking (links to app Settings)
/activity_unlink                     → removes the mapping
/activity_submit week: activity: rank:   → single self-submission
/activity_status [week:]             → show what you've submitted this/!that week
```

- `week`, `activity` → autocomplete (A3). `rank` → optional integer.
- One command handles both ranked and legion; the RPC enforces shape and returns a
  human message the bot relays ephemerally (e.g. "✅ Recorded KvK Prep, rank 1 (15
  pts) for Week 3" or "⚠️ Legion is participation-only — rank ignored" or
  "⚠️ You're not linked yet — connect Discord in the tracker's Settings").
- Self-submission only for v1. **No** admin-on-behalf, **no** batch (the RPC takes a
  single discord id, so those can be added later as separate admin-gated paths
  without reshaping this one).
- New dependency: `aiohttp` (already transitively present via discord.py; add
  explicitly to `requirements.txt`). Add `ACTIVITY_FN_URL` + `ACTIVITY_BOT_SECRET`
  to `.env`/`.env.example`.

## A5. Why Catherine, not a new bot

Same community + users, one process to host, her command/ephemeral patterns fit,
and blast radius stays small because she only holds an invoke secret (not DB keys).
Built as a self-contained cog so it can be lifted into a standalone bot later with
minimal change.

---

# PART B — Unify dashboard auth onto the same Supabase project

The dashboards (`aoem-dashboard`) currently ship a **cosmetic `auth.js` placeholder**
explicitly designed to swap in real auth "at hosting time," plus an `admin/login.html`.
Both the dashboards and the tracker are static-on-GitHub-Pages, so one Supabase
project can be the single identity for everything.

- Add `@supabase/supabase-js` via CDN `<script>` to the dashboard; point `auth.js`
  `login()`/session at the **shared** project (reusing the tracker's
  `username@app.tracker` email shim so one credential works on both).
- Gate `admin/*` pages and any publish/edit UI by `user_profiles.role`
  (`super_admin` / `admin` / `member` already exist). Members get read; admins get
  the admin portal.
- The site-header chip shows the real identity instead of the demo profile.
- **Scope is light** because the dashboards publish via git, not Supabase — so this
  is *gating the admin UI*, not securing a write API. No RLS work needed for the
  dashboards themselves.

This is the real payoff of merging the two toolsets: one login across tracker +
dashboards + Discord link.

---

## Phased plan

| Phase | Repo | Work |
|------|------|------|
| 0 | — | Confirm single Supabase project; create Discord OAuth app; enable provider |
| 1 | activity-tracker | `discord_links` table + RLS; Settings "Connect Discord" (`linkIdentity`) + Unlink |
| 2 | activity-tracker (supabase) | `submit_activity_for_discord` RPC; `discord-submit` + autocomplete Edge Functions; bot secret |
| 3 | aoem-discord-bot | `activity.py` cog (link/unlink/submit/status) + autocomplete; `aiohttp`; `.env` keys |
| 4 | aoem-dashboard | supabase-js via CDN; real `auth.js` on shared project; gate `admin/*` by role; header identity |

Phases 1–3 = the Discord feature. Phase 4 = auth consolidation (independent; can run
first or last).

## Build progress
- **Phase 1 (account linking) — DONE** (branch `feature/discord-oauth-link`): migration
  43 (`discord_links` + `sync_discord_link()`), auth.service link methods, Account-dialog
  "Connect Discord" UI, i18n ×14, tests + lint green.
- **Phase 2 (submission backend) — DONE** (same branch): migration 44
  (`submit_activity_for_discord` + autocomplete RPCs) + Edge Function `discord-submit`.
- **Phase 3 (Catherine cog) — TODO** in the bot repo.
- **Phase 4 (dashboard auth) — TODO**.

## Open items to confirm before build
1. **`date` canonicalization — RESOLVED.** The web UI stamps `activities.date` as the
   week's **Monday 00:00:00.000 UTC** (`getWeekStart()`), and migration 42's trigger
   enforces exactly that on every write. The RPC uses the same
   `date_trunc('week', … AT TIME ZONE 'UTC')`, so bot + web submissions dedupe to one
   row per (user, activity, week).
2. **Rank bounds:** 1–500 hard cap, or derive from the server's `activity_point_rules`
   ranges?
3. **Season gaps:** behavior when no active season covers "now" (reject vs allow
   backfill of the most recent season's last week).
4. **Discord OAuth app ownership:** which account registers it (both have full access,
   so just pick one for the credentials home).
