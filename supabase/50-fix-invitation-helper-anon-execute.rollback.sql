-- ============================================
-- Rollback for Migration 50
-- ============================================
GRANT EXECUTE ON FUNCTION public.invitation_token_is_valid_for_server(uuid, uuid) TO anon;
