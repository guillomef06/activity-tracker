-- Add enabled column to alliance_activity_settings
-- Allows admins to disable specific activities for their alliance
-- Default TRUE preserves backward compatibility: all existing activities remain active
ALTER TABLE alliance_activity_settings
  ADD COLUMN IF NOT EXISTS enabled BOOLEAN NOT NULL DEFAULT TRUE;
