-- Add tiebreaker activity column to alliances
-- Allows admins to designate one activity as tiebreaker for equal-score ranking
-- Only one activity can be tiebreaker at a time (natural radio-button behavior via single value)
-- NULL means no tiebreaker is configured
ALTER TABLE alliances
  ADD COLUMN IF NOT EXISTS tiebreaker_activity_type TEXT NULL;
