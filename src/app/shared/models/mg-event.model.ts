/**
 * Mightiest Governor (MG) Event Models
 */

export type MgEventStatus =
  | 'upcoming'
  | 'registration_open'
  | 'registration_closed'
  | 'selection_published'
  | 'ongoing'
  | 'finished';

export type MgAssignmentMode = 'automatic' | 'manual';
export type MgSelectionType = 'selected' | 'ffa';
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
 * A selection slot (selected player or FFA slot)
 */
export interface MgSelection {
  id: string;
  mg_event_id: string;
  user_id: string | null;
  rank: number;
  selection_type: MgSelectionType;
  selected_by: MgSelectedBy;
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
