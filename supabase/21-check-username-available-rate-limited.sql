-- ============================================================
-- Migration 21: check_username_available with rate limiting
-- ============================================================
-- The function is callable by anon (needed at signup time before auth).
-- Without rate limiting, a script could enumerate all usernames in the
-- database, then pivot to the account recovery flow to attack victims.
--
-- Fix:
--   1. Table username_check_rate_limits tracks call counts per IP/minute.
--   2. Function raises P0001 after 20 checks/minute from the same IP.
--   3. Frontend catchError already returns null on error → form stays
--      submittable; the real duplicate check still happens on signup.
-- ============================================================

-- 1. Rate limiting table (not exposed to any role — only the SECURITY DEFINER function writes to it)
CREATE TABLE IF NOT EXISTS public.username_check_rate_limits (
  ip_hash      TEXT        NOT NULL,
  window_start TIMESTAMPTZ NOT NULL,
  count        INT         NOT NULL DEFAULT 1,
  PRIMARY KEY (ip_hash, window_start)
);

CREATE INDEX IF NOT EXISTS idx_username_check_rate_limits_window
  ON public.username_check_rate_limits (window_start);

-- No direct access — the function handles all reads/writes
REVOKE ALL ON public.username_check_rate_limits FROM anon, authenticated;

-- 2. Replace the function (was STABLE + no writes; now VOLATILE + rate limiting)
CREATE OR REPLACE FUNCTION public.check_username_available(p_username text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ip      text;
  v_ip_hash text;
  v_window  timestamptz;
  v_count   int;
  v_limit   CONSTANT int := 20; -- max 20 checks per minute per IP
BEGIN
  -- Extract client IP from PostgREST request headers.
  -- x-forwarded-for may contain a comma-separated list; take the first entry.
  BEGIN
    v_ip := split_part(
      coalesce(
        nullif(current_setting('request.headers', true), '')::jsonb->>'x-forwarded-for',
        'unknown'
      ),
      ',', 1
    );
  EXCEPTION WHEN OTHERS THEN
    v_ip := 'unknown';
  END;

  v_ip_hash := md5(trim(v_ip));
  v_window  := date_trunc('minute', now());

  -- Increment counter for this IP / minute window
  INSERT INTO public.username_check_rate_limits (ip_hash, window_start, count)
  VALUES (v_ip_hash, v_window, 1)
  ON CONFLICT (ip_hash, window_start)
  DO UPDATE SET count = public.username_check_rate_limits.count + 1
  RETURNING count INTO v_count;

  -- Purge windows older than 10 minutes to keep the table small
  DELETE FROM public.username_check_rate_limits
  WHERE window_start < now() - interval '10 minutes';

  IF v_count > v_limit THEN
    RAISE EXCEPTION 'rate_limit_exceeded'
      USING HINT    = 'Too many username checks. Please wait before trying again.',
            ERRCODE = 'P0001';
  END IF;

  RETURN NOT EXISTS (
    SELECT 1 FROM public.user_profiles WHERE lower(username) = lower(p_username)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.check_username_available(text) TO anon;
