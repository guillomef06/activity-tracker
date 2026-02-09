-- Migration 07: Allow admins to add activities for members of their alliance
-- Fix RLS policy to enable retroactive activity entry by admins

-- Drop existing insert policy
DROP POLICY IF EXISTS "Users can create their own activities" ON activities;

-- Create new policies:
-- 1. Users can still create their own activities
-- 2. Admins can create activities for members of their alliance
-- 3. Super admins can create activities for any user
CREATE POLICY "Users can create their own activities"
  ON activities FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Admins can create activities for alliance members"
  ON activities FOR INSERT
  WITH CHECK (
    is_user_admin(auth.uid())
    AND NOT is_super_admin(auth.uid())
    AND
    user_id IN (
      SELECT id FROM user_profiles 
      WHERE alliance_id = get_user_alliance_id(auth.uid())
    )
  );

CREATE POLICY "Super admins can create activities for any user"
  ON activities FOR INSERT
  WITH CHECK (is_super_admin(auth.uid()));
