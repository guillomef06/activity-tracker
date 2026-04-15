/**
 * Authentication Models
 * Request/Response interfaces for authentication operations
 */

/**
 * Request to sign up as admin (creates server)
 */
export interface AdminSignUpRequest {
  username: string;
  password: string;
  displayName: string;
  serverName: string;
  recoveryQuestionId: number;
  recoveryAnswer: string;
}

/**
 * Request to sign up as member (joins existing server)
 */
export interface MemberSignUpRequest {
  username: string;
  password: string;
  displayName: string;
  invitationToken: string;
  recoveryQuestionId: number;
  recoveryAnswer: string;
}

/**
 * Request to sign in
 */
export interface SignInRequest {
  username: string;
  password: string;
}

/**
 * Authentication response (success)
 */
export interface AuthResponse {
  user: {
    id: string;
    username: string;
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
