/**
 * Mightiest Governor (MG) Event Models
 */

export type MgEventStatus =
  'upcoming' | 'registration_open' | 'registration_closed' | 'selection_published' | 'ongoing' | 'finished';

export type MgAssignmentMode = 'automatic' | 'manual';
/**
 * - `selected`: a real player assigned a ranked slot (billed).
 * - `ffa`: an unassigned free-for-all slot.
 * - `empty`: a named placeholder (default "Empty", editable) occupying a rank
 *   during a correction — shows the slot cost but bills nobody (user_id null).
 */
export type MgSelectionType = 'selected' | 'ffa' | 'empty';
export type MgSelectedBy = 'automatic' | 'manual';

/**
 * MG Event row from mg_events table
 */
export interface MgEvent {
  id: string;
  server_id: string;
  start_date: string;
  end_date: string;
  registration_open_at: string;
  registration_close_at: string;
  status: MgEventStatus;
  selection_published_at: string | null;
  created_at: string;
}

/**
 * Per-server MG configuration
 */
export interface ServerMgConfig {
  server_id: string;
  capacity: 10 | 50;
  assignment_mode: MgAssignmentMode;
  dkp_enabled: boolean;
  created_at: string;
  updated_at: string;
}

/**
 * A player's registration for an MG event
 */
export interface MgRegistration {
  id: string;
  mg_event_id: string;
  user_id: string;
  registered_at: string;
  desired_slot_order: number | null;
  comment: string | null;
}

/**
 * Registration with joined display_name for admin views
 */
export interface MgRegistrationWithUser extends MgRegistration {
  user_profiles: {
    display_name: string;
    username: string;
  };
}

/**
 * Payload used to register a player for an MG event: the desired slot
 * (one of MG_SLOT_DEFAULTS' slotOrder values) is required so admins have a
 * signal of player intent for manual seat selection; the comment is optional.
 */
export interface RegisterMgPlayerPayload {
  desired_slot_order: number;
  comment: string | null;
}

/**
 * A selection slot (selected player or FFA slot)
 */
export interface MgSelection {
  id: string;
  mg_event_id: string;
  user_id: string | null;
  rank: number;
  selection_type: MgSelectionType;
  selected_by: MgSelectedBy;
  cost: number;
  /** Display name for an `empty` placeholder slot (null for real players / FFA). */
  label: string | null;
  /** Rank/cost this player held on the originally-published ("approved") list,
   * snapshotted at publish. Null for FFA/empty rows and for events published
   * before migration 46. Used to bill a forgiven upward move at the cheaper
   * approved cost instead of the final-rank cost. */
  approved_rank: number | null;
  approved_cost: number | null;
}

/**
 * Selection with joined display_name
 */
export interface MgSelectionWithUser extends MgSelection {
  user_profiles: {
    display_name: string;
    username: string;
  } | null;
}

/**
 * Request to upsert server MG config
 */
export interface UpsertServerMgConfigRequest {
  capacity: 10 | 50;
  assignment_mode: MgAssignmentMode;
  dkp_enabled: boolean;
}

/**
 * Payload used to save a selection row (before persisting)
 */
export interface MgSelectionPayload {
  mg_event_id: string;
  user_id: string | null;
  rank: number;
  selection_type: MgSelectionType;
  selected_by: MgSelectedBy;
  cost: number;
  /** Name for an `empty` placeholder slot; null/omitted for real players and FFA. */
  label?: string | null;
  /** Carried forward from the approved snapshot so corrections never lose it. */
  approved_rank?: number | null;
  approved_cost?: number | null;
}

/**
 * Leaderboard score entry for auto-selection computation
 * Mirrors UserScore structure but is standalone (not from ActivityService signal)
 */
export interface MgLeaderboardEntry {
  user_id: string;
  display_name: string;
  total_points: number;
}

/**
 * Per-server override of a single MG rank slot's cost/target thresholds.
 * Rank labels and medal counts are fixed (see MG_SLOT_DEFAULTS); only
 * cost/target_min/target_max are configurable per server, one row per
 * slot_order. A missing slot_order falls back to the hardcoded default.
 */
export interface ServerMgSlotConfig {
  id: string;
  server_id: string;
  slot_order: number;
  cost: number;
  target_min: number;
  target_max: number;
  created_at: string;
  updated_at: string;
}

/**
 * Row payload used to upsert a server's MG slot config
 */
export interface UpsertMgSlotConfigRow {
  slot_order: number;
  cost: number;
  target_min: number;
  target_max: number;
}
