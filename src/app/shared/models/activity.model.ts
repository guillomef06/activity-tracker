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
  userName: string;
  activityType: string;
  points: number;
  date: Date;
  timestamp: number;
}

/**
 * Request to create a new activity
 */
export interface ActivityRequest {
  activityType: string;
  points: number;
  date: Date;
}

/**
 * Response when creating/fetching an activity
 */
export interface ActivityResponse {
  id: string;
  user_id: string;
  activity_type: string;
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
}

/**
 * User score over 6 weeks
 */
export interface UserScore {
  userId: string;
  userName: string;
  weeklyScores: WeeklyScore[];
  sixWeekTotal: number;
  averageWeekly: number;
}
