-- ============================================
-- Migration 16: Fix mutable search_path on functions
-- ============================================
-- Supabase security advisor warns when functions don't have a fixed search_path.
-- Without it, a malicious user could shadow public schema objects via search_path
-- manipulation, causing the function to operate on wrong objects.
-- SECURITY DEFINER functions are especially at risk since they run with elevated privileges.
--
-- Fix: add SET search_path = public to all affected functions.
-- ============================================

CREATE OR REPLACE FUNCTION get_user_alliance_id(user_uuid UUID)
RETURNS UUID AS $$
  SELECT alliance_id FROM public.user_profiles WHERE id = user_uuid;
$$ LANGUAGE sql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION is_user_admin(user_uuid UUID)
RETURNS BOOLEAN AS $$
  SELECT role IN ('admin', 'super_admin') FROM public.user_profiles WHERE id = user_uuid;
$$ LANGUAGE sql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION is_super_admin(user_uuid UUID)
RETURNS BOOLEAN AS $$
  SELECT role = 'super_admin' FROM public.user_profiles WHERE id = user_uuid;
$$ LANGUAGE sql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION calculate_activity_points(
  p_alliance_id UUID,
  p_activity_type TEXT,
  p_position INTEGER
)
RETURNS INTEGER AS $$
DECLARE
  v_points INTEGER;
  v_default_points INTEGER;
BEGIN
  SELECT points INTO v_points
  FROM public.activity_point_rules
  WHERE alliance_id = p_alliance_id
    AND activity_type = p_activity_type
    AND position_min <= p_position
    AND position_max >= p_position
  LIMIT 1;

  IF v_points IS NOT NULL THEN
    RETURN v_points;
  END IF;

  CASE p_activity_type
    WHEN 'kvk prep' THEN v_default_points := 15;
    WHEN 'kvk cross border' THEN v_default_points := 10;
    WHEN 'legion' THEN v_default_points := 8;
    WHEN 'desolate desert' THEN v_default_points := 8;
    WHEN 'golden expedition' THEN v_default_points := 5;
    ELSE v_default_points := 5;
  END CASE;

  RETURN v_default_points;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;
