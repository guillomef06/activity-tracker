/**
 * Invitation Models
 * Request/Response interfaces for invitation token operations
 */

import { Server } from './server.model';

/**
 * Invitation Token model
 */
export interface InvitationToken {
  id: string;
  server_id: string;
  token: string;
  expires_at: string;
  used_at: string | null;
  used_by: string | null;
  created_by: string | null;
  created_at: string;
}

/**
 * Request to create an invitation token
 */
export interface CreateInvitationRequest {
  server_id: string;
  expires_in_days?: number; // Default: 7 days
}

/**
 * Response when creating an invitation
 */
export interface CreateInvitationResponse {
  token: string;
  url: string;
  expires_at: string;
}

/**
 * Request to validate an invitation token
 */
export interface ValidateInvitationRequest {
  token: string;
}

/**
 * Response when validating an invitation
 */
export interface ValidateInvitationResponse {
  valid: boolean;
  server: Server | null;
  error: string | null;
}

/**
 * Invitation token with server details
 */
export interface InvitationWithServer extends InvitationToken {
  server: Server;
}

/**
 * Member information for invitation stats
 */
export interface InvitationMember {
  id: string;
  display_name: string;
  username: string;
  created_at: string;
}

/**
 * Invitation token with usage statistics
 * Retrieved from invitation_stats view
 */
export interface InvitationWithStats extends InvitationToken {
  usage_count: number;
  members: InvitationMember[];
}
