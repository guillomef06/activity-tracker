-- supabase/20-grant-recovery-functions.sql
-- Grant execute on recovery RPCs to anon role (used by unauthenticated users on /account-recovery)
GRANT EXECUTE ON FUNCTION get_recovery_question(TEXT) TO anon;
GRANT EXECUTE ON FUNCTION reset_password_with_recovery(TEXT, TEXT, TEXT) TO anon;
