#!/usr/bin/env bash
# Drives the negative tests of the migration 47 pre-flight guard in the rehearsal container.
# LOCAL REHEARSAL CONTAINER ONLY (default name: at-mg-1b), never production.
#
#   bash supabase/tests/rehearsal/run-guard-negatives.sh pre      # BEFORE migration 47: 7 corruptions
#   bash supabase/tests/rehearsal/run-guard-negatives.sh reapply  # AFTER  migration 47: second application
#
# Run it from the repository root, under Git Bash. Exit code 0 when every case passed.
set -u
export MSYS_NO_PATHCONV=1
C="${REHEARSAL_CONTAINER:-at-mg-1b}"
MODE="${1:-pre}"
MIG=supabase/47-mg-global-calendar.sql
TESTS=supabase/tests

docker cp "$MIG" "$C:/tmp/47-mg-global-calendar.sql" >/dev/null || exit 2
docker cp "$TESTS/47-mg-global-calendar.guard-negative.test.sql" "$C:/tmp/guard-negative.sql" >/dev/null || exit 2
docker cp "$TESTS/47-mg-global-calendar.reapply.test.sql" "$C:/tmp/reapply.sql" >/dev/null || exit 2

fail=0
check() { # label expected_substring output exit_code
  local label="$1" expect="$2" out="$3" code="$4"
  local first
  first=$(printf '%s\n' "$out" | grep -m1 'ERROR:' || true)
  if [ "$code" -eq 0 ] && printf '%s' "$first" | grep -q -- "$expect" && printf '%s' "$out" | grep -q 'PASS '; then
    echo "PASS  $label  -> $first"
  else
    echo "FAIL  $label (exit $code, expected first error to contain: $expect)"
    printf '%s\n' "$out" | grep -E 'ERROR|PASS|ASSERT' | head -5
    fail=1
  fi
}

# PO-1 fix, idempotent, applied inside each corrupt statement so the guard sees ONE defect only.
FIX="UPDATE public.mg_events SET start_date='2026-08-03', end_date='2026-08-09', registration_open_at='2026-07-27', registration_close_at='2026-07-30' WHERE id='a734f6ab-98f4-4814-b952-5b3269023401' AND start_date='2026-08-05'"
# Any real event as the corruption target (ERA008 2026-05-11).
EV="c93c3b94-3841-4f82-bc76-dc28141932c7"
SRV="3ea08f87-3236-48b4-aee7-6a680fce3677"

run_pre() { # label expected corrupt-sql
  local out code
  out=$(docker exec -i "$C" psql -U postgres -X -v migration_file=/tmp/47-mg-global-calendar.sql -v "corrupt=$3" -f /tmp/guard-negative.sql 2>&1)
  code=$?
  check "$1" "$2" "$out" "$code"
}

if [ "$MODE" = "pre" ]; then
  run_pre "Wednesday event not re-dated (P1)" "violate the date shape" \
    "UPDATE public.mg_events SET start_date='2026-08-05', end_date='2026-08-11', registration_open_at='2026-08-05', registration_close_at='2026-08-08' WHERE id='a734f6ab-98f4-4814-b952-5b3269023401'"
  run_pre "end_date <> start_date + 6" "violate the date shape" "$FIX; UPDATE public.mg_events SET end_date = end_date + 1 WHERE id='$EV'"
  run_pre "registration_close_at <> start_date - 4" "violate the date shape" "$FIX; UPDATE public.mg_events SET registration_close_at = registration_close_at + 1 WHERE id='$EV'"
  run_pre "duplicate (server, start_date) (P2)" "duplicated (server_id, start_date)" \
    "$FIX; INSERT INTO public.mg_events (server_id, start_date, end_date, registration_open_at, registration_close_at, status) VALUES ('$SRV','2026-05-11','2026-05-17','2026-05-04','2026-05-07','finished')"
  run_pre "stray far-future event (P4b)" "start after today + 14 days" \
    "$FIX; INSERT INTO public.mg_events (server_id, start_date, end_date, registration_open_at, registration_close_at, status) VALUES ('$SRV','2031-01-06','2031-01-12','2030-12-30','2031-01-02','registration_open')"
  run_pre "two MG starts less than 14 days apart" "less than 14 days apart" \
    "$FIX; INSERT INTO public.mg_events (server_id, start_date, end_date, registration_open_at, registration_close_at, status) VALUES ('$SRV','2026-11-30','2026-12-06','2026-11-23','2026-11-26','registration_open')"
  run_pre "no super_admin profile (P4)" "no super_admin profile" \
    "$FIX; DELETE FROM public.user_profiles WHERE role = 'super_admin'"
elif [ "$MODE" = "reapply" ]; then
  out=$(docker exec -i "$C" psql -U postgres -X -v migration_file=/tmp/47-mg-global-calendar.sql -f /tmp/reapply.sql 2>&1)
  code=$?
  check "second application refused" "already exists" "$out" "$code"
else
  echo "usage: $0 pre|reapply"; exit 2
fi
exit $fail
