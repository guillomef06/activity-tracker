/**
 * Authentication Models
 * Request/Response interfaces for authentication operations
 */

/**
 * Request to sign up as admin (creates alliance)
 */
export interface AdminSignUpRequest {
  email: string;
  password: string;
  displayName: string;
  allianceName: string;
}

/**
 * Request to sign up as member (joins existing alliance)
 */
export interface MemberSignUpRequest {
  email: string;
  password: string;
  displayName: string;
  invitationToken: string;
}

/**
 * Request to sign in
 */
export interface SignInRequest {
  email: string;
  password: string;
}

/**
 * Authentication response (success)
 */
export interface AuthResponse {
  user: {
    id: string;
    email: string;
  };
  session: {
    access_token: string;
    refresh_token: string;
  };
}

/**
 * Authentication error response
 */
export interface AuthErrorResponse {
  error: {
    message: string;
    status: number;
  };
}
