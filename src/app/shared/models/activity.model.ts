/**
 * Activity Models
 * Request/Response interfaces for activity-related operations
 */

/**
 * Core Activity model (application-level)
 */
export interface Activity {
  id: string;
  userId: string;
  displayName: string;
  activityType: string;
  position: number | null; // null when participation_mode is active
  points: number;
  date: Date;
  timestamp: number;
}

/**
 * Request to create a new activity
 */
export interface ActivityRequest {
  activityType: string;
  position: number | null; // null when participation_mode is active
  date: Date;
  points?: number; // pre-calculated for participation mode
}

/**
 * Response when creating/fetching an activity
 */
export interface ActivityResponse {
  id: string;
  user_id: string;
  activity_type: string;
  position: number | null; // null when participation_mode is active
  points: number;
  date: string; // ISO timestamp from database
  created_at: string;
  updated_at: string;
}

/**
 * Activity with user details (for queries with joins)
 */
export interface ActivityWithUser extends ActivityResponse {
  user_profiles: {
    display_name: string;
  };
}

/**
 * Weekly score aggregation
 */
export interface WeeklyScore {
  weekStart: Date;
  weekEnd: Date;
  totalPoints: number;
  activities: Activity[];
  conflictingPositions?: Set<string>;
}

/**
 * User score over 6 weeks
 */
export interface UserScore {
  userId: string;
  displayName: string;
  weeklyScores: WeeklyScore[];
  sixWeekTotal: number;
}

/**
 * Single entry for batch import (admin Excel import)
 */
export interface BatchImportEntry {
  userId: string;
  activityType: string;
  position: number | null;
  points: number;
  date: Date;
}
