-- supabase/18-add-account-recovery.sql
-- Account Recovery: columns, backfill, trigger, RPCs
-- ORDER MATTERS: backfill runs before trigger to avoid double-hashing.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 1. Add columns (nullable first for backfill)
ALTER TABLE user_profiles
  ADD COLUMN recovery_question_id INTEGER,
  ADD COLUMN recovery_answer_hash TEXT,
  ADD COLUMN recovery_attempts INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN recovery_locked_until TIMESTAMPTZ;

-- 2. Backfill existing users (trigger does NOT exist yet — hash written directly)
--    Question 2 = "Dans quelle ville êtes-vous né(e) ?"
--    Default answer = 'Tracker2025' — admin must communicate this to members.
UPDATE user_profiles
  SET recovery_question_id = 2,
      recovery_answer_hash = crypt(lower(trim('Tracker2025')), gen_salt('bf'));

-- 3. Make required columns NOT NULL
ALTER TABLE user_profiles
  ALTER COLUMN recovery_question_id SET NOT NULL,
  ALTER COLUMN recovery_answer_hash SET NOT NULL;

-- 4. Trigger: normalize + hash answer on INSERT and UPDATE OF recovery_answer_hash
--    Created AFTER backfill to avoid double-hashing.
CREATE OR REPLACE FUNCTION hash_recovery_answer()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.recovery_answer_hash IS NOT NULL
     AND (TG_OP = 'INSERT' OR NEW.recovery_answer_hash IS DISTINCT FROM OLD.recovery_answer_hash) THEN
    NEW.recovery_answer_hash = crypt(lower(trim(NEW.recovery_answer_hash)), gen_salt('bf'));
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_hash_recovery_answer
  BEFORE INSERT OR UPDATE OF recovery_answer_hash ON user_profiles
  FOR EACH ROW EXECUTE FUNCTION hash_recovery_answer();

-- 5. RPC: get_recovery_question — returns question_id only, never the hash
CREATE OR REPLACE FUNCTION get_recovery_question(p_username TEXT)
RETURNS JSONB AS $$
DECLARE
  v_question_id INTEGER;
BEGIN
  SELECT recovery_question_id
  INTO v_question_id
  FROM user_profiles WHERE username = p_username;

  IF NOT FOUND THEN
    RETURN '{"error": "user_not_found"}'::JSONB;
  END IF;

  RETURN jsonb_build_object('question_id', v_question_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth;

-- 6. RPC: reset_password_with_recovery — full atomic reset with rate limiting
CREATE OR REPLACE FUNCTION reset_password_with_recovery(
  p_username TEXT,
  p_answer TEXT,
  p_new_password TEXT
)
RETURNS JSONB AS $$
DECLARE
  v_user_id UUID;
  v_answer_hash TEXT;
  v_attempts INTEGER;
  v_locked_until TIMESTAMPTZ;
  v_new_attempts INTEGER;
  v_remaining INTEGER;
BEGIN
  -- Row-lock prevents race conditions on concurrent requests
  SELECT id, recovery_answer_hash, recovery_attempts, recovery_locked_until
  INTO v_user_id, v_answer_hash, v_attempts, v_locked_until
  FROM user_profiles WHERE username = p_username
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN '{"error": "user_not_found"}'::JSONB;
  END IF;

  -- Validate password length before any write
  IF length(p_new_password) < 6 THEN
    RETURN '{"error": "password_too_short"}'::JSONB;
  END IF;

  -- Check lock; reset if expired
  IF v_locked_until IS NOT NULL THEN
    IF v_locked_until > NOW() THEN
      RETURN jsonb_build_object('error', 'locked', 'until', v_locked_until);
    ELSE
      UPDATE user_profiles SET recovery_attempts = 0, recovery_locked_until = NULL
      WHERE id = v_user_id;
      v_attempts := 0;
    END IF;
  END IF;

  -- Verify answer (same normalization as trigger)
  IF v_answer_hash != crypt(lower(trim(p_answer)), v_answer_hash) THEN
    v_new_attempts := v_attempts + 1;
    v_remaining := GREATEST(5 - v_new_attempts, 0);
    UPDATE user_profiles SET
      recovery_attempts = v_new_attempts,
      recovery_locked_until = CASE
        WHEN v_new_attempts >= 5 THEN NOW() + INTERVAL '15 minutes'
        ELSE NULL
      END
    WHERE id = v_user_id;
    RETURN jsonb_build_object('error', 'wrong_answer', 'remaining', v_remaining);
  END IF;

  -- Reset password — update GoTrue timestamps for session compatibility
  UPDATE auth.users SET
    encrypted_password = crypt(p_new_password, gen_salt('bf')),
    updated_at = NOW(),
    password_updated_at = NOW()
  WHERE id = v_user_id;

  -- Reset rate-limit counters
  UPDATE user_profiles SET
    recovery_attempts = 0,
    recovery_locked_until = NULL
  WHERE id = v_user_id;

  RETURN '{"success": true}'::JSONB;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth;
