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
    server_id: string;
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
 * User score over n weeks
 */
export interface UserScore {
  userId: string;
  displayName: string;
  weeklyScores: WeeklyScore[];
  totalScore: number;
  /**
   * DISPLAY ONLY — the flat slot cost of the player's in-window TMG purchases
   * (e.g. slot #20 → 100), the red "−N" chip on the leaderboard. This is NOT the
   * amount subtracted from totalScore: the balance follows the FIFO rolling-window
   * mechanic (computeFifoDeductions) and is already baked into totalScore, whereas
   * this field is the flat "what they bought" figure (computeWindowSpendTotals).
   * The two intentionally differ. Undefined/0 = nothing bought in-window.
   */
  mgDeduction?: number;
  /**
   * Total points earned across the full current season, independent of the
   * rolling scoring window and of DKP spending. Undefined when no season
   * covers "now" or season totals haven't been loaded.
   */
  seasonTotal?: number;
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

/**
 * Position conflict: two users claimed the same position for the same activity on the same date.
 * activityId refers to the current user's activity that is in conflict.
 */
export interface PositionConflict {
  activityId: string;
  activityType: string;
  position: number;
  date: Date;
  conflictingDisplayName: string;
}
