/**
 * Server Models
 * Request/Response interfaces for server (team/organization) operations
 */

/**
 * Server (Team/Organization) model
 */
export interface Server {
  id: string;
  name: string;
  tag: string | null;
  owner_id: string | null;
  tiebreaker_activity_type: string | null;
  scoring_weeks_multiplier: number;
  discord_invite_url: string | null;
  external_link_label: string | null;
  external_link_url: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Request to create a new server
 */
export interface CreateServerRequest {
  name: string;
  owner_id: string;
}

/**
 * Request to update server
 */
export interface UpdateServerRequest {
  name?: string;
  tag?: string | null;
  tiebreaker_activity_type?: string | null;
  scoring_weeks_multiplier?: number;
  discord_invite_url?: string | null;
  external_link_label?: string | null;
  external_link_url?: string | null;
}

/**
 * Server with member count
 */
export interface ServerWithStats extends Server {
  member_count: number;
  total_activities: number;
}
