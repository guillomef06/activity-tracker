-- Migration: Add user preferences column
-- Description: Adds a JSONB column to store user preferences (language, theme, notifications, etc.)
-- Date: 2026-02-10

-- Add preferences column to user_profiles table
ALTER TABLE user_profiles 
ADD COLUMN IF NOT EXISTS preferences JSONB DEFAULT '{}'::jsonb;

-- Add comment for documentation
COMMENT ON COLUMN user_profiles.preferences IS 'User preferences stored as JSON (language, theme, notifications, etc.)';

-- Create GIN index for efficient querying of JSONB data
CREATE INDEX IF NOT EXISTS idx_user_preferences ON user_profiles USING GIN (preferences);
