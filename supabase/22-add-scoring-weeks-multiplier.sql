-- Add scoring weeks multiplier to alliances
-- Allows admins to configure how many weeks count for the leaderboard ranking
-- The actual weeks = multiplier × 6 (base weeks constant)
-- Valid values: 1 (6 weeks), 2 (12 weeks), 3 (18 weeks)
-- Activity input form is unaffected — it always shows the last 6 weeks
ALTER TABLE alliances
  ADD COLUMN IF NOT EXISTS scoring_weeks_multiplier INTEGER NOT NULL DEFAULT 1
  CHECK (scoring_weeks_multiplier IN (1, 2, 3));
