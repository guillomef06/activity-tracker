/**
 * Invitation Models
 * Request/Response interfaces for invitation token operations
 */

import { Alliance } from './alliance.model';

/**
 * Invitation Token model
 */
export interface InvitationToken {
  id: string;
  alliance_id: string;
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
  alliance_id: string;
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
  alliance: Alliance | null;
  error: string | null;
}

/**
 * Invitation token with alliance details
 */
export interface InvitationWithAlliance extends InvitationToken {
  alliance: Alliance;
}
