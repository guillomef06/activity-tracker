# Rehearsal database for migration 47 (global MG calendar)

Disposable local PostgreSQL used to prove migration `47-mg-global-calendar.sql` before it touches production
(spec `003-mg-global-calendar`, plan layer 4, quickstart Q1-Q8). **Never run any of these files on production.**

| File | Committed | Purpose |
|---|---|---|
| `bootstrap.sql` | yes | Production-faithful schema, no data: tables, enums, RLS helpers, policies, grants, the 5 cron jobs (verbatim texts), role settings |
| `export-snapshot.sql` | yes | One read-only `SELECT` to run on production; it returns a complete load script (non-personal data only) |
| `snapshot.local.sql` | **no** (`*.local.sql` in `.gitignore`) | The generated load script: servers (id, name), `server_mg_config`, all `mg_events`, fictitious `fixture-N` users |
| `run-guard-negatives.sh` | yes | Drives the guard negative test (before the migration) and the second-application test (after) |
| `../47-mg-global-calendar.test.sql` | yes | Scenarios S1-S12, always rolled back |
| `../47-mg-global-calendar.guard-negative.test.sql`, `../47-mg-global-calendar.reapply.test.sql` | yes | Guard refusals (plan S10) |

## Confidentiality

The snapshot contains **no personal data**: no user names, e-mails, comments, selection labels or authentication ids.
Registrations and selections are rebuilt as counts with fictitious users `fixture-N` (deterministic ids), so each event
keeps the same number of registrations and selections as in production (for example event
`a734f6ab-98f4-4814-b952-5b3269023401` has 13 registrations and 10 selections). Two fictitious `fixture-super-admin-N`
profiles satisfy the migration guard (production has 2 real super admins). Server names are exported (they are not personal).

## Git Bash pitfalls (Windows)

```bash
export MSYS_NO_PATHCONV=1      # otherwise Git Bash rewrites /tmp/x.sql or /var/... into C:/Program Files/Git/...
```

* Feed a local file to psql with `docker exec -i ... < file` (`-i`, never `-t`, so stdin is not a TTY).
* Files that psql must open **inside** the container (`\i`) must be copied first: `docker cp supabase/47-mg-global-calendar.sql at-mg-1b:/tmp/`.
* `docker cp` and `docker exec` paths are Linux paths inside the container (`/tmp/...`).
* **Never touch the containers named `supabase_*_dashboard`**: they belong to another project. Only `at-mg-1b` is ours.

## 1. Create the container (image is local, nothing is downloaded)

```bash
export MSYS_NO_PATHCONV=1
docker run -d --name at-mg-1b -e POSTGRES_PASSWORD=postgres public.ecr.aws/supabase/postgres:17.11.0.004
until docker exec at-mg-1b pg_isready -U postgres >/dev/null 2>&1; do sleep 1; done
```

The image provides the Supabase roles, `auth.users`, `auth.uid()`, `btree_gist` and a preloaded `pg_cron`
(`bootstrap.sql` runs `CREATE EXTENSION pg_cron`). `postgres` is **not** a superuser here, as on Supabase.

## 2. Schema, then snapshot

```bash
docker exec -i at-mg-1b psql -U postgres -v ON_ERROR_STOP=1 < supabase/tests/rehearsal/bootstrap.sql
docker exec -i at-mg-1b psql -U postgres -v ON_ERROR_STOP=1 < supabase/tests/rehearsal/snapshot.local.sql
```

Expected after the snapshot: 8 servers, 3 `server_mg_config`, 49 `mg_events` with 17 distinct `start_date`
(including the Wednesday `2026-08-05`), 13 registrations and 10 selections on `a734f6ab-...`.
The cron job command texts of the bootstrap have the same `md5` as production (checked on 2026-11-25):
`mg-create-events` `4209ee55b5f1f1050cc54d5719e241a2`, `mg-close-registrations` `c531110e66870beeae12194527e86710`,
`mg-end-events` `ed705283c4939d2b44e9108091fcaec4`, `mg-start-events` `76c213813a7c41d0b8a6b23c916901fc`,
`discord-scheduled-messages-dispatch` `9f2f12b890a0f4e1cb3e28b3e43001f4`.

### Regenerating the snapshot (read-only on production)

Run `export-snapshot.sql` on production with the Supabase MCP `execute_sql` (project `yeczvyyxchssftvnobdn`, SELECT only) or in
the SQL editor. It returns **one text cell** (`snapshot_script`); save that value as
`supabase/tests/rehearsal/snapshot.local.sql`. Do not commit it.

## 3. Production-like role settings

Production gives the SQL editor session `statement_timeout = 8s` and `lock_timeout = 8s` (role `authenticator`) and preloads
`safeupdate`. The image does **not** ship `safeupdate`, so a bare `UPDATE`/`DELETE` is not rejected locally: review `WHERE` clauses by eye.
Emulate the timeouts per session:

```bash
docker exec -i -e PGOPTIONS="-c statement_timeout=8s -c lock_timeout=8s" at-mg-1b psql -U postgres -v ON_ERROR_STOP=1 < supabase/47-mg-global-calendar.sql
```

(`bootstrap.sql` already applies the production role settings of `authenticated`, `anon` and `authenticator`.)

## 4. Run order (quickstart Q2-Q5)

```bash
export MSYS_NO_PATHCONV=1

# 4.1 Guard negatives, BEFORE the migration (7 corruptions, each must be refused with MG47_PREFLIGHT and leave nothing behind)
bash supabase/tests/rehearsal/run-guard-negatives.sh pre

# 4.2 Approved one-row data fix PO-1 (Wednesday demo event); the migration refuses to apply without it
docker exec at-mg-1b psql -U postgres -v ON_ERROR_STOP=1 -c "UPDATE mg_events SET start_date='2026-08-03', end_date='2026-08-09', registration_open_at='2026-07-27', registration_close_at='2026-07-30' WHERE id='a734f6ab-98f4-4814-b952-5b3269023401' AND start_date='2026-08-05'"

# 4.3 Apply the migration (single BEGIN/COMMIT)
docker exec -i -e PGOPTIONS="-c statement_timeout=8s -c lock_timeout=8s" at-mg-1b psql -U postgres -v ON_ERROR_STOP=1 < supabase/47-mg-global-calendar.sql

# 4.4 SQL tests S1-S12 (rolled back; re-runnable). Expect "NOTICE: PASS S1" ... "PASS S12", then "ALL SCENARIOS PASSED".
docker exec -i at-mg-1b psql -U postgres -X -v ON_ERROR_STOP=1 < supabase/tests/47-mg-global-calendar.test.sql

# 4.5 Time zone independence (V1): same script under three session time zones
for tz in UTC America/Los_Angeles Asia/Tokyo; do
  docker exec -i -e PGOPTIONS="-c timezone=$tz" at-mg-1b psql -U postgres -X -v ON_ERROR_STOP=1 < supabase/tests/47-mg-global-calendar.test.sql 2>&1 | grep -E "ERROR|ALL"
done

# 4.6 Second application must be refused by the guard, database unchanged
bash supabase/tests/rehearsal/run-guard-negatives.sh reapply
```

The test script needs the snapshot (S4, S10, S11 rely on real data shapes), the PO-1 fix, and the migration applied; it checks the
preconditions itself. It creates fixture rows only inside its transaction and always ends in `ROLLBACK`.

## 5. Simulate Monday 2026-11-30 (quickstart Q4)

Outside the test script (this one commits, so do it last or on a fresh database):

```bash
docker exec at-mg-1b psql -U postgres -c "SELECT public.mg_create_events_from_calendar('2026-11-30 00:00:00+00')"   # 3
docker exec at-mg-1b psql -U postgres -c "SELECT public.mg_create_events_from_calendar('2026-11-30 00:00:00+00')"   # 0 (idempotent)
```

The transition crons are verified by test S11 (their stored texts, `CURRENT_DATE` replaced by simulated dates).

## 6. Two-session scenarios (manual, FR-031 / US3.11, quickstart Q6)

A single script cannot hold two connections, so these stay manual. Step 6.1 below was executed on 2026-11-25
(session B waited for the remaining lock time, then created the 3 events).

**6.1 Creation waits for a lock held on the entry** (before any event exists for 2026-12-07):

```bash
export MSYS_NO_PATHCONV=1
( docker exec at-mg-1b psql -U postgres -qAtc "BEGIN; SELECT id FROM calendar_entries WHERE starts_at='2026-12-07 00:00+00' FOR UPDATE; SELECT pg_sleep(10); COMMIT;" ) &
sleep 2
time docker exec at-mg-1b psql -U postgres -qAtc "SELECT public.mg_create_events_from_calendar('2026-11-30 00:00+00')"   # must block about 8 s, then return 3
wait
```

**6.2 Shift versus close cron.** Create an opened entry with `registration_open` events (see scenario S5(g) of the test script for the fixture shape),
then in session A run `BEGIN; SELECT * FROM shift_mg_calendar_entry(...)` as the super admin identity
(`SELECT set_config('request.jwt.claim.sub','<uuid>',true); SET LOCAL ROLE authenticated;`) without committing; in session B run the close-registrations
`UPDATE` of the stored cron command with `CURRENT_DATE` replaced by the old Thursday. B must wait; after A commits, B re-evaluates against the new `registration_close_at`.

**6.3 Cancel versus start cron** is the same pattern with `cancel_mg_calendar_entry` and the start job.

Expected for all: no deadlock, no duplicate event, no event left with old dates after a committed shift.
Note that role `lock_timeout = 8s` applies to `authenticator` sessions in production; set `-c lock_timeout=8s` to emulate.

## 7. Clean-up

```bash
export MSYS_NO_PATHCONV=1
docker rm -f at-mg-1b
```

Remove only `at-mg-1b`. `snapshot.local.sql` stays untracked (it holds ids and dates only) and can be deleted at will.

## Known fidelity gaps of the rehearsal database

* `safeupdate` is not preloaded (see section 3).
* `auth.uid()` of this image reads the legacy GUC `request.jwt.claim.sub`; the test helpers set both that and `request.jwt.claims`.
* `user_profiles` triggers `prevent_role_escalation` and `hash_recovery_answer` are not reproduced; `invitation_tokens` is a stub.
* The Discord cron job text is verbatim but `dispatch_discord_scheduled_messages()` does not exist locally (it would fail at the top of the hour; nothing reads that).
* The `pg_cron` background worker is live in the container: a job could fire if the container runs across a Monday 00:00 or Thursday 23:59 UTC. Remove the container after use.
* Only the snapshot's 3 opted-in servers have a `server_mg_config` row, like production.
