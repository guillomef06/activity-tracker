-- supabase/19-fix-recovery-search-path.sql
-- Fix: add 'extensions' to search_path so pgcrypto's crypt() is found.
-- In Supabase, pgcrypto is installed in the 'extensions' schema, not 'public'.

-- Fix trigger function
CREATE OR REPLACE FUNCTION hash_recovery_answer()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.recovery_answer_hash IS NOT NULL
     AND (TG_OP = 'INSERT' OR NEW.recovery_answer_hash IS DISTINCT FROM OLD.recovery_answer_hash) THEN
    NEW.recovery_answer_hash = crypt(lower(trim(NEW.recovery_answer_hash)), gen_salt('bf'));
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public, extensions;

-- Fix RPC: get_recovery_question
CREATE OR REPLACE FUNCTION get_recovery_question(p_username TEXT)
RETURNS JSONB AS $$
DECLARE
  v_question_id INTEGER;
BEGIN
  SELECT recovery_question_id
  INTO v_question_id
  FROM user_profiles WHERE LOWER(username) = LOWER(p_username);

  IF NOT FOUND THEN
    RETURN '{"error": "user_not_found"}'::JSONB;
  END IF;

  RETURN jsonb_build_object('question_id', v_question_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth, extensions;

-- Fix RPC: reset_password_with_recovery
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
  SELECT id, recovery_answer_hash, recovery_attempts, recovery_locked_until
  INTO v_user_id, v_answer_hash, v_attempts, v_locked_until
  FROM user_profiles WHERE LOWER(username) = LOWER(p_username)
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN '{"error": "user_not_found"}'::JSONB;
  END IF;

  IF length(p_new_password) < 6 THEN
    RETURN '{"error": "password_too_short"}'::JSONB;
  END IF;

  IF v_locked_until IS NOT NULL THEN
    IF v_locked_until > NOW() THEN
      RETURN jsonb_build_object('error', 'locked', 'until', v_locked_until);
    ELSE
      UPDATE user_profiles SET recovery_attempts = 0, recovery_locked_until = NULL
      WHERE id = v_user_id;
      v_attempts := 0;
    END IF;
  END IF;

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

  UPDATE auth.users SET
    encrypted_password = crypt(p_new_password, gen_salt('bf')),
    updated_at = NOW()
  WHERE id = v_user_id;

  UPDATE user_profiles SET
    recovery_attempts = 0,
    recovery_locked_until = NULL
  WHERE id = v_user_id;

  RETURN '{"success": true}'::JSONB;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth, extensions;
