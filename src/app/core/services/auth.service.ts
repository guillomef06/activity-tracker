import { Injectable, signal, computed, inject } from '@angular/core';
import { Router } from '@angular/router';
import { User, AuthError } from '@supabase/supabase-js';
import { SupabaseService } from './supabase.service';
import { 
  UserProfile, 
  AdminSignUpRequest, 
  MemberSignUpRequest, 
  SignInRequest 
} from '../../shared/models';
import { environment } from '../../../environments/environment';
import { validateMockCredentials, MOCK_USERS } from '../../shared/mock-data/mock-users';

/**
 * Authentication Service
 * Manages user authentication, signup, and session state using Supabase Auth
 */
@Injectable({
  providedIn: 'root'
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

  private readonly MOCK_SESSION_KEY = 'mock-auth-session';

  constructor() {
    this.initializeAuth();
  }

  /**
   * Check if mock mode is enabled
   */
  private get isMockMode(): boolean {
    return environment.enableMockData === true;
  }

  /**
   * Save mock session to localStorage
   */
  private saveMockSession(userId: string): void {
    localStorage.setItem(this.MOCK_SESSION_KEY, userId);
  }

  /**
   * Get mock session from localStorage
   */
  private getMockSession(): string | null {
    return localStorage.getItem(this.MOCK_SESSION_KEY);
  }

  /**
   * Clear mock session from localStorage
   */
  private clearMockSession(): void {
    localStorage.removeItem(this.MOCK_SESSION_KEY);
  }

  /**
   * Mock sign in - for development/testing only
   */
  private async mockSignIn(username: string, password: string): Promise<{ error: AuthError | Error | null }> {
    const mockUser = validateMockCredentials(username, password);
    
    if (!mockUser) {
      return { error: new Error('Invalid credentials') as AuthError };
    }

    // Simulate Supabase user object
    const mockAuthUser: User = {
      id: mockUser.id,
      email: `${username}@app.tracker`,
      aud: 'authenticated',
      role: 'authenticated',
      created_at: mockUser.profile.created_at,
      app_metadata: {},
      user_metadata: {
        username: mockUser.username,
        display_name: mockUser.profile.display_name
      }
    } as User;

    // Update signals
    this.currentUserSignal.set(mockAuthUser);
    this.userProfileSignal.set(mockUser.profile);
    
    // Save session
    this.saveMockSession(mockUser.id);

    console.log('🔒 [MOCK MODE] Logged in as:', mockUser.profile.display_name, `(${mockUser.profile.role})`);
    
    return { error: null };
  }

  /**
   * Restore mock session on app init
   */
  private async restoreMockSession(): Promise<boolean> {
    const userId = this.getMockSession();
    if (!userId) return false;

    const mockUser = MOCK_USERS.find(u => u.id === userId);
    if (!mockUser) {
      this.clearMockSession();
      return false;
    }

    // Simulate Supabase user object
    const mockAuthUser: User = {
      id: mockUser.id,
      email: `${mockUser.username}@app.tracker`,
      aud: 'authenticated',
      role: 'authenticated',
      created_at: mockUser.profile.created_at,
      app_metadata: {},
      user_metadata: {
        username: mockUser.username,
        display_name: mockUser.profile.display_name
      }
    } as User;

    this.currentUserSignal.set(mockAuthUser);
    this.userProfileSignal.set(mockUser.profile);

    console.log('🔒 [MOCK MODE] Session restored:', mockUser.profile.display_name, `(${mockUser.profile.role})`);
    
    return true;
  }

  /**
   * Generate internal email from username
   * Supabase requires an email, so we use: username@app.tracker
   */
  private generateEmailFromUsername(username: string): string {
    return `${username.toLowerCase()}@app.tracker`;
  }

  /**
   * Initialize authentication state on app load
   */
  private async initializeAuth(): Promise<void> {
    try {
      // MOCK MODE: Restore from localStorage
      if (this.isMockMode) {
        await this.restoreMockSession();
        this.loadingSignal.set(false);
        return;
      }

      // PRODUCTION MODE: Use Supabase
      // Get current session
      const { data: { session } } = await this.supabase.auth.getSession();
      
      if (session?.user) {
        this.currentUserSignal.set(session.user);
        await this.loadUserProfile(session.user.id);
      }

      // Listen for auth state changes
      this.supabase.auth.onAuthStateChange(async (event, session) => {
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
   */
  private async loadUserProfile(userId: string): Promise<void> {
    try {
      const { data, error } = await this.supabase
        .from('user_profiles')
        .select('*')
        .eq('id', userId)
        .single();

      if (error) throw error;
      this.userProfileSignal.set(data);
    } catch (error) {
      console.error('Error loading user profile:', error);
      this.userProfileSignal.set(null);
    }
  }

  /**
   * Admin signup - Create account and new alliance
   */
  async signUpAdmin(data: AdminSignUpRequest): Promise<{ error: AuthError | Error | null }> {
    try {
      const email = this.generateEmailFromUsername(data.username);

      // 1. Create auth user
      const { data: authData, error: authError } = await this.supabase.auth.signUp({
        email,
        password: data.password,
        options: {
          data: {
            username: data.username,
            display_name: data.displayName
          }
        }
      });

      if (authError) return { error: authError };
      if (!authData.user) return { error: new Error('User creation failed') };

      // 2. Create alliance
      const { data: allianceData, error: allianceError } = await this.supabase
        .from('alliances')
        .insert({
          name: data.allianceName,
          owner_id: authData.user.id
        })
        .select()
        .single();

      if (allianceError) {
        // Rollback: delete auth user if alliance creation fails
        await this.supabase.auth.admin.deleteUser(authData.user.id);
        return { error: allianceError };
      }

      // 3. Create user profile
      const { error: profileError } = await this.supabase
        .from('user_profiles')
        .insert({
          id: authData.user.id,
          alliance_id: allianceData.id,
          display_name: data.displayName,
          username: data.username,
          role: 'admin'
        });

      if (profileError) {
        return { error: profileError };
      }

      // Load profile into state
      await this.loadUserProfile(authData.user.id);

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
  async signUpSuperAdmin(username: string, password: string, displayName: string): Promise<{ error: AuthError | Error | null }> {
    try {
      const email = this.generateEmailFromUsername(username);

      // 1. Create auth user
      const { data: authData, error: authError } = await this.supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            username,
            display_name: displayName,
            is_super_admin: true
          }
        }
      });

      if (authError) return { error: authError };
      if (!authData.user) return { error: new Error('User creation failed') };

      // 2. Create user profile with super_admin role (no alliance needed)
      const { error: profileError } = await this.supabase
        .from('user_profiles')
        .insert({
          id: authData.user.id,
          alliance_id: null, // Super admin doesn't belong to any alliance
          display_name: displayName,
          username,
          role: 'super_admin'
        });

      if (profileError) {
        return { error: profileError };
      }

      // Load profile into state
      await this.loadUserProfile(authData.user.id);

      return { error: null };
    } catch (error) {
      console.error('Error during super admin signup:', error);
      return { error: error as Error };
    }
  }

  /**
   * Member signup - Join existing alliance via invitation token
   * Supports multi-use tokens with invitation_token_id tracking
   */
  async signUpMember(data: MemberSignUpRequest): Promise<{ error: AuthError | Error | null }> {
    try {
      // 1. Validate invitation token
      const { data: tokenData, error: tokenError } = await this.supabase
        .from('invitation_tokens')
        .select('*, alliances(*)')
        .eq('token', data.invitationToken)
        .single();

      if (tokenError || !tokenData) {
        return { error: new Error('Invalid or expired invitation token') };
      }

      // Check if token is expired
      if (new Date(tokenData.expires_at) < new Date()) {
        return { error: new Error('Invitation token has expired') };
      }

      const email = this.generateEmailFromUsername(data.username);

      // 2. Create auth user
      const { data: authData, error: authError } = await this.supabase.auth.signUp({
        email,
        password: data.password,
        options: {
          data: {
            username: data.username,
            display_name: data.displayName
          }
        }
      });

      if (authError) return { error: authError };
      if (!authData.user) return { error: new Error('User creation failed') };

      // 3. Create user profile
      const { error: profileError } = await this.supabase
        .from('user_profiles')
        .insert({
          id: authData.user.id,
          alliance_id: tokenData.alliance_id,
          invitation_token_id: tokenData.id,
          display_name: data.displayName,
          username: data.username,
          role: 'member'
        });

      if (profileError) {
        return { error: profileError };
      }

      // Note: Token tracking is now handled via invitation_token_id in user_profiles
      // No need to update used_at (multi-use tokens)

      // Load profile into state
      await this.loadUserProfile(authData.user.id);

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
    // MOCK MODE: Use mock authentication
    if (this.isMockMode) {
      const result = await this.mockSignIn(data.username, data.password);
      return { error: result.error as AuthError | null };
    }

    // PRODUCTION MODE: Use Supabase
    const email = this.generateEmailFromUsername(data.username);
    
    const { error } = await this.supabase.auth.signInWithPassword({
      email,
      password: data.password
    });

    return { error };
  }

  /**
   * Sign out current user
   */
  async signOut(): Promise<void> {
    // MOCK MODE: Clear mock session
    if (this.isMockMode) {
      this.clearMockSession();
      this.currentUserSignal.set(null);
      this.userProfileSignal.set(null);
      console.log('🔒 [MOCK MODE] Logged out');
      this.router.navigate(['/login']);
      return;
    }

    // PRODUCTION MODE: Use Supabase
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
