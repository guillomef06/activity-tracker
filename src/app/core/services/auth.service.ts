import { Injectable, signal, computed, inject } from '@angular/core';
import { Router } from '@angular/router';
import { User, AuthError } from '@supabase/supabase-js';
import { SupabaseService } from './supabase.service';
import { UserProfile, AdminSignUpRequest, MemberSignUpRequest, SignInRequest } from '@shared/models';

/**
 * Authentication Service
 * Manages user authentication, signup, and session state using Supabase Auth
 */
@Injectable({
  providedIn: 'root',
})
export class AuthService {
  private supabase = inject(SupabaseService);
  private router = inject(Router);

  // Reactive state using Angular signals
  private currentUserSignal = signal<User | null>(null);
  private userProfileSignal = signal<UserProfile | null>(null);
  private loadingSignal = signal<boolean>(true);

  // Computed signals
  readonly currentUser = this.currentUserSignal.asReadonly();
  readonly userProfile = this.userProfileSignal.asReadonly();
  readonly isAuthenticated = computed(() => this.currentUserSignal() !== null);
  readonly isAdmin = computed(() => {
    const role = this.userProfileSignal()?.role;
    return role === 'admin' || role === 'super_admin';
  });
  readonly isSuperAdmin = computed(() => this.userProfileSignal()?.role === 'super_admin');
  readonly isLoading = this.loadingSignal.asReadonly();

  constructor() {
    this.initializeAuth();
  }

  /**
   * Generate internal email from username
   * Supabase requires an email, so we use: username@app.tracker
   */
  private generateEmailFromUsername(username: string): string {
    return `${username.toLowerCase()}@app.tracker`;
  }

  /**
   * Initialize authentication state on app load.
   * getSession() handles the initial state (reads from local cache, no network round-trip)
   * and drives the loadingSignal so guards are unblocked only after the profile is ready.
   * onAuthStateChange handles SIGNED_OUT and USER_UPDATED events only.
   * INITIAL_SESSION, SIGNED_IN and TOKEN_REFRESHED are skipped (handled elsewhere or irrelevant).
   */
  private async initializeAuth(): Promise<void> {
    // Register listener FIRST — always active, even if getSession() times out
    this.supabase.auth.onAuthStateChange(async (event, session) => {
      // INITIAL_SESSION: handled by getSession() below to avoid duplicate query
      // SIGNED_IN: handled manually in signIn() / signUpAdmin() / signUpMember()
      // TOKEN_REFRESHED: only the JWT changes, the user profile in DB is unchanged
      if (event === 'INITIAL_SESSION' || event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') return;

      if (session?.user) {
        this.currentUserSignal.set(session.user);
        await this.loadUserProfile(session.user.id);
      } else {
        this.currentUserSignal.set(null);
        this.userProfileSignal.set(null);
      }
    });

    try {
      const fallback = new Promise<{ data: { session: null } }>(resolve =>
        setTimeout(() => resolve({ data: { session: null } }), 5000)
      );
      // .catch() handles thrown errors (AbortError); fallback handles hangs (navigator.locks blocked)
      const {
        data: { session },
      } = await Promise.race([this.supabase.auth.getSession().catch(() => ({ data: { session: null } })), fallback]);

      if (session?.user) {
        this.currentUserSignal.set(session.user);
        await this.loadUserProfile(session.user.id);
      }
    } catch (error) {
      console.error('Error initializing auth:', error);
    } finally {
      this.loadingSignal.set(false);
    }
  }

  /**
   * Load user profile from database
   * Retries up to 3 times with delay to handle timing issues with newly created profiles
   */
  private async loadUserProfile(userId: string, retries = 3): Promise<void> {
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        const { data, error } = await this.supabase
          .from('user_profiles')
          .select(
            'id, alliance_id, invitation_token_id, display_name, username, role, preferences, created_at, updated_at, recovery_question_id'
          )
          .eq('id', userId)
          .single();

        if (error) throw error;
        this.userProfileSignal.set(data);
        return;
      } catch (error) {
        console.error(`Error loading user profile (attempt ${attempt}/${retries}):`, error);

        if (attempt < retries) {
          await new Promise(resolve => setTimeout(resolve, 500 * attempt));
        } else {
          if (!this.userProfileSignal()) {
            this.userProfileSignal.set(null);
          }
        }
      }
    }
  }

  /**
   * Admin signup - Create account and new server
   */
  async signUpAdmin(data: AdminSignUpRequest): Promise<{ error: AuthError | Error | null }> {
    try {
      const email = this.generateEmailFromUsername(data.username);

      const { data: authData, error: authError } = await this.supabase.auth.signUp({
        email,
        password: data.password,
        options: {
          data: {
            username: data.username,
            display_name: data.displayName,
          },
        },
      });

      if (authError) return { error: authError };
      if (!authData.user) return { error: new Error('User creation failed') };

      const { data: serverData, error: serverError } = await this.supabase
        .from('alliances')
        .insert({
          name: data.serverName,
          owner_id: authData.user.id,
        })
        .select()
        .single();

      if (serverError) {
        console.error('Failed to create server after user creation:', serverError);
        return { error: new Error('Failed to create server. Please contact support.') };
      }

      const now = new Date().toISOString();
      const newProfile: UserProfile = {
        id: authData.user.id,
        alliance_id: serverData.id,
        invitation_token_id: null,
        display_name: data.displayName,
        username: data.username,
        role: 'admin',
        created_at: now,
        updated_at: now,
      };

      const { error: profileError } = await this.supabase.from('user_profiles').insert({
        ...newProfile,
        recovery_question_id: data.recoveryQuestionId,
        recovery_answer_hash: data.recoveryAnswer,
      });

      if (profileError) {
        return { error: profileError };
      }

      this.userProfileSignal.set({ ...newProfile, recovery_question_id: data.recoveryQuestionId });

      return { error: null };
    } catch (error) {
      console.error('Error during admin signup:', error);
      return { error: error as Error };
    }
  }

  /**
   * Super Admin signup - Create super admin account (no server)
   * WARNING: This should only be used for initial setup!
   */
  async signUpSuperAdmin(
    username: string,
    password: string,
    displayName: string
  ): Promise<{ error: AuthError | Error | null }> {
    try {
      const email = this.generateEmailFromUsername(username);

      const { data: authData, error: authError } = await this.supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            username,
            display_name: displayName,
            is_super_admin: true,
          },
        },
      });

      if (authError) return { error: authError };
      if (!authData.user) return { error: new Error('User creation failed') };

      const now = new Date().toISOString();
      const newProfile: UserProfile = {
        id: authData.user.id,
        alliance_id: null,
        invitation_token_id: null,
        display_name: displayName,
        username,
        role: 'super_admin',
        created_at: now,
        updated_at: now,
      };

      const { error: profileError } = await this.supabase.from('user_profiles').insert(newProfile);

      if (profileError) {
        return { error: profileError };
      }

      this.userProfileSignal.set(newProfile);

      return { error: null };
    } catch (error) {
      console.error('Error during super admin signup:', error);
      return { error: error as Error };
    }
  }

  /**
   * Member signup - Join existing server via invitation token
   */
  async signUpMember(data: MemberSignUpRequest): Promise<{ error: AuthError | Error | null }> {
    try {
      const { data: tokenData, error: tokenError } = await this.supabase
        .from('invitation_tokens')
        .select('*, servers(*)')
        .eq('token', data.invitationToken)
        .single();

      if (tokenError || !tokenData) {
        return { error: new Error('Invalid or expired invitation token') };
      }

      if (new Date(tokenData.expires_at) < new Date()) {
        return { error: new Error('Invitation token has expired') };
      }

      const email = this.generateEmailFromUsername(data.username);

      const { data: authData, error: authError } = await this.supabase.auth.signUp({
        email,
        password: data.password,
        options: {
          data: {
            username: data.username,
            display_name: data.displayName,
          },
        },
      });

      if (authError) return { error: authError };
      if (!authData.user) return { error: new Error('User creation failed') };

      const now = new Date().toISOString();
      const newProfile: UserProfile = {
        id: authData.user.id,
        alliance_id: tokenData.alliance_id,
        invitation_token_id: tokenData.id,
        display_name: data.displayName,
        username: data.username,
        role: 'member',
        created_at: now,
        updated_at: now,
      };

      const { error: profileError } = await this.supabase.from('user_profiles').insert({
        ...newProfile,
        recovery_question_id: data.recoveryQuestionId,
        recovery_answer_hash: data.recoveryAnswer,
      });

      if (profileError) {
        return { error: profileError };
      }

      this.userProfileSignal.set({ ...newProfile, recovery_question_id: data.recoveryQuestionId });

      return { error: null };
    } catch (error) {
      console.error('Error during member signup:', error);
      return { error: error as Error };
    }
  }

  /**
   * Sign in with username and password
   */
  async signIn(data: SignInRequest): Promise<{ error: AuthError | null }> {
    const email = this.generateEmailFromUsername(data.username);

    const { data: authData, error } = await this.supabase.auth.signInWithPassword({
      email,
      password: data.password,
    });

    if (!error && authData.user) {
      this.currentUserSignal.set(authData.user);
      await this.loadUserProfile(authData.user.id);
    }

    return { error };
  }

  /**
   * Sign out current user
   */
  async signOut(): Promise<void> {
    await this.supabase.auth.signOut();
    this.currentUserSignal.set(null);
    this.userProfileSignal.set(null);
    this.router.navigate(['/login']);
  }

  /**
   * Get the recovery question ID for a given username
   */
  async getRecoveryQuestion(username: string): Promise<{ questionId: number | null; error: string | null }> {
    try {
      const { data, error } = await this.supabase.rpc('get_recovery_question', { p_username: username });
      if (error || !data || data.error) {
        return { questionId: null, error: 'recovery.errors.userNotFound' };
      }
      return { questionId: data.question_id as number, error: null };
    } catch {
      return { questionId: null, error: 'recovery.errors.userNotFound' };
    }
  }

  /**
   * Reset password using secret question/answer recovery flow
   */
  async resetPasswordWithRecovery(
    username: string,
    answer: string,
    newPassword: string
  ): Promise<{ error: string | null; remaining?: number; until?: string }> {
    try {
      const { data, error } = await this.supabase.rpc('reset_password_with_recovery', {
        p_username: username,
        p_answer: answer,
        p_new_password: newPassword,
      });

      if (error || !data) {
        return { error: 'recovery.errors.userNotFound' };
      }

      if (data.success) {
        return { error: null };
      }

      switch (data.error) {
        case 'wrong_answer':
          return { error: 'recovery.errors.wrongAnswer', remaining: data.remaining as number };
        case 'locked':
          return { error: 'recovery.errors.locked', until: data.until as string };
        case 'password_too_short':
          return { error: 'recovery.errors.passwordTooShort' };
        default:
          return { error: 'recovery.errors.userNotFound' };
      }
    } catch {
      return { error: 'recovery.errors.userNotFound' };
    }
  }

  /**
   * Update the current user's display name
   */
  async updateDisplayName(displayName: string): Promise<{ error: string | null }> {
    try {
      const userId = this.getUserId();
      if (!userId) return { error: 'Not authenticated' };

      const { error } = await this.supabase
        .from('user_profiles')
        .update({ display_name: displayName })
        .eq('id', userId);

      if (error) return { error: error.message };

      const profile = this.userProfileSignal();
      if (profile) {
        this.userProfileSignal.set({ ...profile, display_name: displayName });
      }
      return { error: null };
    } catch (err) {
      return { error: (err as Error).message };
    }
  }

  /**
   * Update the current user's password (authenticated context — no old password required)
   */
  async updatePassword(newPassword: string): Promise<{ error: string | null }> {
    try {
      const { error } = await this.supabase.auth.updateUser({ password: newPassword });
      if (error) return { error: error.message };
      return { error: null };
    } catch (err) {
      return { error: (err as Error).message };
    }
  }

  /**
   * Update the current user's recovery question and answer
   * Answer is stored in plain text; the DB trigger hashes it
   */
  async updateRecovery(questionId: number, answer: string): Promise<{ error: string | null }> {
    try {
      const userId = this.getUserId();
      if (!userId) return { error: 'Not authenticated' };

      const { error } = await this.supabase
        .from('user_profiles')
        .update({ recovery_question_id: questionId, recovery_answer_hash: answer })
        .eq('id', userId);

      if (error) return { error: error.message };

      const profile = this.userProfileSignal();
      if (profile) {
        this.userProfileSignal.set({ ...profile, recovery_question_id: questionId });
      }
      return { error: null };
    } catch (err) {
      return { error: (err as Error).message };
    }
  }

  /**
   * Get current user's server ID
   */
  getServerId(): string | null {
    return this.userProfileSignal()?.alliance_id || null;
  }

  /**
   * Get current user ID
   */
  getUserId(): string | null {
    return this.currentUserSignal()?.id || null;
  }

  /**
   * Check if a username is available (not already taken).
   * Calls a SECURITY DEFINER RPC accessible to anon — safe to call before signup.
   */
  async checkUsernameAvailable(username: string): Promise<boolean> {
    const { data } = await this.supabase.rpc('check_username_available', { p_username: username });
    return (data as boolean) ?? false;
  }
}
