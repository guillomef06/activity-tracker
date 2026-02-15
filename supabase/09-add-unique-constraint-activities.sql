-- Migration: Add unique constraint on activities (user_id, activity_type, date)
ALTER TABLE activities
ADD CONSTRAINT activities_user_activitytype_date_unique
UNIQUE (user_id, activity_type, date);