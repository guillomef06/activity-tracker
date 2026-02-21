import { Injectable, signal, computed, inject } from '@angular/core';
import { Router } from '@angular/router';
import { User, AuthError } from '@supabase/supabase-js';
import { SupabaseService } from './supabase.service';
import { UserProfile, AdminSignUpRequest, MemberSignUpRequest, SignInRequest } from '../../shared/models';

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
   * onAuthStateChange handles all subsequent events (SIGNED_IN, SIGNED_OUT, TOKEN_REFRESHED…)
   * but skips INITIAL_SESSION to avoid a duplicate user_profiles query.
   */
  private async initializeAuth(): Promise<void> {
    try {
      const {
        data: { session },
      } = await this.supabase.auth.getSession();

      if (session?.user) {
        this.currentUserSignal.set(session.user);
        await this.loadUserProfile(session.user.id);
      }

      this.supabase.auth.onAuthStateChange(async (event, session) => {
        if (event === 'INITIAL_SESSION') return;

        if (session?.user) {
          this.currentUserSignal.set(session.user);
          await this.loadUserProfile(session.user.id);
        } else {
          this.currentUserSignal.set(null);
          this.userProfileSignal.set(null);
        }
      });
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
        const { data, error } = await this.supabase.from('user_profiles').select('*').eq('id', userId).single();

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
   * Admin signup - Create account and new alliance
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

      const { data: allianceData, error: allianceError } = await this.supabase
        .from('alliances')
        .insert({
          name: data.allianceName,
          owner_id: authData.user.id,
        })
        .select()
        .single();

      if (allianceError) {
        console.error('Failed to create alliance after user creation:', allianceError);
        return { error: new Error('Failed to create alliance. Please contact support.') };
      }

      const now = new Date().toISOString();
      const newProfile: UserProfile = {
        id: authData.user.id,
        alliance_id: allianceData.id,
        invitation_token_id: null,
        display_name: data.displayName,
        username: data.username,
        role: 'admin',
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
      console.error('Error during admin signup:', error);
      return { error: error as Error };
    }
  }

  /**
   * Super Admin signup - Create super admin account (no alliance)
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
   * Member signup - Join existing alliance via invitation token
   */
  async signUpMember(data: MemberSignUpRequest): Promise<{ error: AuthError | Error | null }> {
    try {
      const { data: tokenData, error: tokenError } = await this.supabase
        .from('invitation_tokens')
        .select('*, alliances(*)')
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

      const { error: profileError } = await this.supabase.from('user_profiles').insert(newProfile);

      if (profileError) {
        return { error: profileError };
      }

      this.userProfileSignal.set(newProfile);

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

    const { error } = await this.supabase.auth.signInWithPassword({
      email,
      password: data.password,
    });

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
   * Get current user's alliance ID
   */
  getAllianceId(): string | null {
    return this.userProfileSignal()?.alliance_id || null;
  }

  /**
   * Get current user ID
   */
  getUserId(): string | null {
    return this.currentUserSignal()?.id || null;
  }
}
