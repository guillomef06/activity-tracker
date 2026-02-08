import { Injectable, signal, inject } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { AuthService } from './auth.service';
import { 
  Alliance,
  InvitationWithStats,
  UserProfile,
  CreateInvitationResponse,
  ValidateInvitationResponse
} from '../../shared/models';

/**
 * Alliance Service
 * Manages alliance operations, invitations, and members
 */
@Injectable({
  providedIn: 'root'
})
export class AllianceService {
  private supabase = inject(SupabaseService);
  private authService = inject(AuthService);
  
  private allianceSignal = signal<Alliance | null>(null);
  private membersSignal = signal<UserProfile[]>([]);
  private invitationsSignal = signal<InvitationWithStats[]>([]);

  readonly alliance = this.allianceSignal.asReadonly();
  readonly members = this.membersSignal.asReadonly();
  readonly invitations = this.invitationsSignal.asReadonly();

  /**
   * Load current user's alliance
   */
  async loadAlliance(): Promise<void> {
    const allianceId = this.authService.getAllianceId();
    if (!allianceId) {
      this.allianceSignal.set(null);
      return;
    }

    try {
      const { data, error } = await this.supabase
        .from('alliances')
        .select('*')
        .eq('id', allianceId)
        .single();

      if (error) throw error;
      this.allianceSignal.set(data);
    } catch (error) {
      console.error('Error loading alliance:', error);
      this.allianceSignal.set(null);
    }
  }

  /**
   * Load alliance members
   */
  async loadMembers(): Promise<void> {
    const allianceId = this.authService.getAllianceId();
    if (!allianceId) {
      this.membersSignal.set([]);
      return;
    }

    try {
      const { data, error } = await this.supabase
        .from('user_profiles')
        .select('*')
        .eq('alliance_id', allianceId)
        .order('created_at', { ascending: true });

      if (error) throw error;
      this.membersSignal.set(data || []);
    } catch (error) {
      console.error('Error loading members:', error);
      this.membersSignal.set([]);
    }
  }

  /**
   * Create invitation token (admin only)
   * @param expiresInDays Number of days until token expires (default: 7)
   */
  async createInvitation(expiresInDays = 7): Promise<CreateInvitationResponse | { error: Error }> {
    const allianceId = this.authService.getAllianceId();
    const userId = this.authService.getUserId();

    if (!allianceId || !userId) {
      return { error: new Error('User not authenticated') };
    }

    if (!this.authService.isAdmin()) {
      return { error: new Error('Only admins can create invitations') };
    }

    try {
      // Generate secure random token
      const token = this.generateSecureToken();
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + expiresInDays);

      const { data, error } = await this.supabase
        .from('invitation_tokens')
        .insert({
          alliance_id: allianceId,
          token: token,
          expires_at: expiresAt.toISOString(),
          created_by: userId
        })
        .select()
        .single();

      if (error) throw error;

      // Generate invitation URL with proper base-href support
      const base = typeof document !== 'undefined' 
        ? (document.querySelector('base')?.getAttribute('href') || '/')
        : '/';
      const basePath = base.endsWith('/') ? base.slice(0, -1) : base;
      const baseUrl = typeof window !== 'undefined' 
        ? `${window.location.origin}${basePath}`
        : '';
      const invitationUrl = `${baseUrl}/join?token=${token}`;

      // Reload invitations
      await this.loadInvitations();

      return { 
        token: data.token, 
        url: invitationUrl,
        expires_at: data.expires_at
      };
    } catch (error) {
      console.error('Error creating invitation:', error);
      return { error: error as Error };
    }
  }

  /**
   * Validate invitation token
   * Supports multi-use tokens (no used_at check)
   */
  async validateInvitation(token: string): Promise<ValidateInvitationResponse> {
    try {
      const { data, error } = await this.supabase
        .from('invitation_tokens')
        .select('*, alliances(*)')
        .eq('token', token)
        .single();

      if (error || !data) {
        console.error('Token validation error:', error);
        return { 
          valid: false, 
          alliance: null, 
          error: 'Invalid invitation token' 
        };
      }

      // Check if expired
      if (new Date(data.expires_at) < new Date()) {
        return { 
          valid: false, 
          alliance: null, 
          error: 'Invitation token has expired' 
        };
      }

      return { 
        valid: true, 
        alliance: data.alliances as Alliance, 
        error: null 
      };
    } catch (error) {
      console.error('Error validating invitation:', error);
      return { 
        valid: false, 
        alliance: null, 
        error: 'Error validating invitation' 
      };
    }
  }

  /**
   * Load active invitations for alliance (admin only)
   */
  async loadInvitations(): Promise<void> {
    const allianceId = this.authService.getAllianceId();
    
    if (!allianceId || !this.authService.isAdmin()) {
      this.invitationsSignal.set([]);
      return;
    }

    try {
      const { data, error } = await this.supabase
        .from('invitation_stats')
        .select('*')
        .eq('alliance_id', allianceId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      this.invitationsSignal.set(data || []);
    } catch (error) {
      console.error('Error loading invitations:', error);
      this.invitationsSignal.set([]);
    }
  }

  /**
   * Delete/revoke an invitation (admin only)
   * Uses soft delete by setting expires_at to current timestamp
   */
  async revokeInvitation(invitationId: string): Promise<{ error: Error | null }> {
    if (!this.authService.isAdmin()) {
      return { error: new Error('Only admins can revoke invitations') };
    }

    try {
      const { error } = await this.supabase
        .from('invitation_tokens')
        .update({ expires_at: new Date().toISOString() })
        .eq('id', invitationId);

      if (error) throw error;

      // Reload invitations
      await this.loadInvitations();

      return { error: null };
    } catch (error) {
      console.error('Error revoking invitation:', error);
      return { error: error as Error };
    }
  }

  /**
   * Generate a secure random token
   */
  private generateSecureToken(): string {
    const array = new Uint8Array(32);
    crypto.getRandomValues(array);
    return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
  }

  /**
   * Update alliance name (admin only)
   */
  async updateAllianceName(newName: string): Promise<{ error: Error | null }> {
    const allianceId = this.authService.getAllianceId();

    if (!allianceId || !this.authService.isAdmin()) {
      return { error: new Error('Only admins can update alliance name') };
    }

    try {
      const { error } = await this.supabase
        .from('alliances')
        .update({ name: newName })
        .eq('id', allianceId);

      if (error) throw error;

      // Reload alliance
      await this.loadAlliance();

      return { error: null };
    } catch (error) {
      console.error('Error updating alliance name:', error);
      return { error: error as Error };
    }
  }
}
