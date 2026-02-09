-- Delete User Function (RPC)
-- This function allows super admins to delete users completely (from both user_profiles and auth.users)
-- SECURITY DEFINER allows it to bypass RLS and delete from auth.users

CREATE OR REPLACE FUNCTION delete_user_complete(user_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER -- Run with the permissions of the function owner (bypasses RLS)
SET search_path = public
AS $$
DECLARE
  requesting_user_id UUID;
  requesting_user_role TEXT;
BEGIN
  -- Get the requesting user's ID and role
  requesting_user_id := auth.uid();
  
  SELECT role INTO requesting_user_role
  FROM user_profiles
  WHERE id = requesting_user_id;
  
  -- Only allow super_admin to delete users
  IF requesting_user_role != 'super_admin' THEN
    RAISE EXCEPTION 'Only super admins can delete users';
  END IF;
  
  -- Prevent super admin from deleting themselves
  IF user_id = requesting_user_id THEN
    RAISE EXCEPTION 'Cannot delete your own account';
  END IF;
  
  -- Delete from user_profiles first (this will cascade to activities, etc.)
  DELETE FROM user_profiles WHERE id = user_id;
  
  -- Delete from auth.users (requires SECURITY DEFINER)
  DELETE FROM auth.users WHERE id = user_id;
  
  RETURN TRUE;
EXCEPTION
  WHEN OTHERS THEN
    RAISE EXCEPTION 'Failed to delete user: %', SQLERRM;
END;
$$;

-- Grant execute permission to authenticated users (the function itself checks for super_admin)
GRANT EXECUTE ON FUNCTION delete_user_complete(UUID) TO authenticated;

COMMENT ON FUNCTION delete_user_complete IS 'Delete a user completely from both user_profiles and auth.users. Only super_admin can execute this.';
