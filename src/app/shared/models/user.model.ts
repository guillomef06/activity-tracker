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
 * User Preferences model
 * Stored as JSONB in user_profiles.preferences column
 */
export interface UserPreferences {
  language?: 'en' | 'fr' | 'es' | 'it';
  theme?: 'light' | 'dark';
  notifications?: {
    email?: boolean;
    push?: boolean;
  };
}

/**
 * User Profile model (from Supabase database)
 * Extends Supabase Auth User with application-specific data
 */
export interface UserProfile {
  id: string;
  alliance_id: string | null; // null for super_admin
  invitation_token_id: string | null; // The invitation token used to join (null for super_admin and admin)
  display_name: string;
  username: string;
  role: 'super_admin' | 'admin' | 'member';
  preferences?: UserPreferences;
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
  username: string;
  role: 'super_admin' | 'admin' | 'member';
}

/**
 * Request to update user profile
 */
export interface UpdateUserProfileRequest {
  display_name?: string;
  username?: string;
}
