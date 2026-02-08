/**
 * Alliance Models
 * Request/Response interfaces for alliance (team/organization) operations
 */

/**
 * Alliance (Team/Organization) model
 */
export interface Alliance {
  id: string;
  name: string;
  owner_id: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Request to create a new alliance
 */
export interface CreateAllianceRequest {
  name: string;
  owner_id: string;
}

/**
 * Request to update alliance
 */
export interface UpdateAllianceRequest {
  name?: string;
}

/**
 * Alliance with member count
 */
export interface AllianceWithStats extends Alliance {
  member_count: number;
  total_activities: number;
}
