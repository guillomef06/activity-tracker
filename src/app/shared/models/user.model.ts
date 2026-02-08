/**
 * User Models
 * Request/Response interfaces for user-related operations
 */

/**
 * Legacy User model (for localStorage mode)
 */
export interface User {
  id: string;
  name: string;
  email?: string;
}

/**
 * User Profile model (from Supabase database)
 * Extends Supabase Auth User with application-specific data
 */
export interface UserProfile {
  id: string;
  alliance_id: string;
  display_name: string;
  email: string;
  role: 'admin' | 'member';
  created_at: string;
  updated_at: string;
}

/**
 * Request to create a user profile
 */
export interface CreateUserProfileRequest {
  id: string; // Supabase Auth user ID
  alliance_id: string;
  display_name: string;
  email: string;
  role: 'admin' | 'member';
}

/**
 * Request to update user profile
 */
export interface UpdateUserProfileRequest {
  display_name?: string;
  email?: string;
}
