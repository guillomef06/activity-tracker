/**
 * Point Adjustment models
 *
 * An admin-created signed point delta applied to a player's rolling-window
 * (current) leaderboard total — a manual correction (reward or penalty) outside
 * the normal activity-logging flow. A flat, permanent amount: it does not age
 * out of the rolling window and is reversed by deleting the row.
 */

/** Core application-level point adjustment. */
export interface PointAdjustment {
  id: string;
  userId: string;
  delta: number; // signed: positive rewards, negative penalises
  reason: string;
  date: Date; // created_at, as a Date
  createdBy: string | null; // admin who made it (null if that profile was deleted)
}

/** Row as returned from the DB (snake_case), with the joined player display name. */
export interface PointAdjustmentResponse {
  id: string;
  server_id: string;
  user_id: string;
  delta: number;
  reason: string;
  created_by: string | null;
  created_at: string; // ISO timestamp
  user_profiles: {
    display_name: string;
  } | null;
}

/** Adjustment enriched with the target player's display name, for admin lists. */
export interface PointAdjustmentWithUser extends PointAdjustment {
  displayName: string;
}

/** Payload for creating a new adjustment (server_id + created_by resolved service-side). */
export interface CreatePointAdjustmentPayload {
  userId: string;
  delta: number;
  reason: string;
}
