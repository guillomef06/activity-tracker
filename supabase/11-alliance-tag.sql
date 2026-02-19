-- Migration: Add tag column to alliances table
-- Tag is a nullable 3-character identifier (e.g., "RgW") for the alliance

ALTER TABLE alliances
  ADD COLUMN IF NOT EXISTS tag TEXT CHECK (tag IS NULL OR char_length(tag) = 3);
