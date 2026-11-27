-- ============================================
-- Migration 50: Revoke anon EXECUTE on invitation_token_is_valid_for_server
-- ============================================
-- Migration 49 only did `REVOKE ALL ... FROM PUBLIC` before granting `authenticated`.
-- Supabase's default privileges additionally grant EXECUTE to anon/authenticated
-- directly (not via PUBLIC) on every new function — the exact gotcha migration 38
-- already documented, and which 47 handled correctly with an explicit
-- `FROM PUBLIC, anon, authenticated`. Advisors confirmed anon still had EXECUTE here.
-- Low severity (the function only returns a boolean for an unguessable token uuid),
-- but anon has no business calling it: this INSERT policy only ever runs for an
-- authenticated signup (`id = auth.uid()` already excludes anon).
-- ============================================

REVOKE EXECUTE ON FUNCTION public.invitation_token_is_valid_for_server(uuid, uuid) FROM anon;

-- ============================================
-- DONE
-- ============================================
