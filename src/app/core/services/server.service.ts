import { Injectable, signal, inject, computed } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { AuthService } from './auth.service';
import {
  Server,
  ServerActivitySettings,
  ActivityPointRule,
  InvitationWithStats,
  UpdateServerRequest,
  UserProfile,
  CreateInvitationResponse,
  ValidateInvitationResponse,
  CreatePointRuleRequest,
  UpdatePointRuleRequest,
  PointCalculationResult,
  UpsertActivitySettingsRequest,
} from '@shared/models';
import { getActivityTypePoints, APP_CONSTANTS } from '@shared/constants/constants';

type ServerWithRelations = Server & {
  user_profiles: UserProfile[];
  activity_point_rules: ActivityPointRule[];
  server_activity_settings: ServerActivitySettings[];
};

/**
 * Server Service
 * Manages server operations, invitations, members, point rules and activity settings.
 */
@Injectable({
  providedIn: 'root',
})
export class ServerService {
  private supabase = inject(SupabaseService);
  private authService = inject(AuthService);

  private serverSignal = signal<Server | null>(null);
  private membersSignal = signal<UserProfile[]>([]);
  private invitationsSignal = signal<InvitationWithStats[]>([]);
  private rulesSignal = signal<ActivityPointRule[]>([]);
  private settingsSignal = signal<ServerActivitySettings[]>([]);

  readonly server = this.serverSignal.asReadonly();
  readonly members = this.membersSignal.asReadonly();
  readonly invitations = this.invitationsSignal.asReadonly();
  readonly rules = this.rulesSignal.asReadonly();
  readonly settings = this.settingsSignal.asReadonly();

  /** Number of weeks included in the leaderboard ranking (multiplier × 6). */
  readonly scoringWeeks = computed(
    () => (this.serverSignal()?.scoring_weeks_multiplier ?? 1) * APP_CONSTANTS.SCORING.WEEKS_TO_TRACK
  );

  /**
   * Load server, members, point rules and activity settings in a single Supabase query (4→1 requests).
   * Updates all signals internally.
   * Individual methods (loadServer, loadMembers, loadRules, loadSettings) are kept for targeted reloads after mutations.
   */
  async loadAllSettings(): Promise<void> {
    const serverId = this.authService.getServerId();
    if (!serverId) {
      this.serverSignal.set(null);
      this.membersSignal.set([]);
      this.rulesSignal.set([]);
      this.settingsSignal.set([]);
      return;
    }

    try {
      const { data, error } = await this.supabase
        .from('servers')
        .select('*, user_profiles(*), activity_point_rules(*), server_activity_settings(*)')
        .eq('id', serverId)
        .single();

      if (error) throw error;

      const { user_profiles, activity_point_rules, server_activity_settings, ...server } = data as ServerWithRelations;

      this.serverSignal.set(server as Server);

      const members = [...(user_profiles ?? [])].sort(
        (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      );
      this.membersSignal.set(members);

      const pointRules = [...(activity_point_rules ?? [])].sort(
        (a, b) => a.activity_type.localeCompare(b.activity_type) || a.position_min - b.position_min
      );
      this.rulesSignal.set(pointRules);
      this.settingsSignal.set(server_activity_settings ?? []);
    } catch (error) {
      console.error('Error loading server settings:', error);
      this.serverSignal.set(null);
      this.membersSignal.set([]);
      this.rulesSignal.set([]);
      this.settingsSignal.set([]);
    }
  }

  /**
   * Load current user's server
   */
  async loadServer(): Promise<void> {
    const serverId = this.authService.getServerId();
    if (!serverId) {
      this.serverSignal.set(null);
      return;
    }

    try {
      const { data, error } = await this.supabase.from('servers').select('*').eq('id', serverId).single();

      if (error) throw error;
      this.serverSignal.set(data);
    } catch (error) {
      console.error('Error loading server:', error);
      this.serverSignal.set(null);
    }
  }

  /**
   * Load server members
   */
  async loadMembers(): Promise<void> {
    const serverId = this.authService.getServerId();
    if (!serverId) {
      this.membersSignal.set([]);
      return;
    }

    try {
      const { data, error } = await this.supabase
        .from('user_profiles')
        .select('*')
        .eq('server_id', serverId)
        .order('created_at', { ascending: true });

      if (error) throw error;
      this.membersSignal.set(data || []);
    } catch (error) {
      console.error('Error loading members:', error);
      this.membersSignal.set([]);
    }
  }

  // ─── Point Rules ───────────────────────────────────────────────────────────

  /**
   * Load all point rules for the current server
   */
  async loadRules(): Promise<{ error: Error | null }> {
    const profile = this.authService.userProfile();
    if (!profile?.server_id) {
      return { error: new Error('No server ID') };
    }

    const { data, error } = await this.supabase
      .from('activity_point_rules')
      .select('*')
      .eq('server_id', profile.server_id)
      .order('activity_type', { ascending: true })
      .order('position_min', { ascending: true });

    if (error) {
      return { error: new Error(error.message) };
    }

    this.rulesSignal.set(data || []);
    return { error: null };
  }

  /**
   * Set rules from externally fetched data
   */
  setRules(rules: ActivityPointRule[]): void {
    this.rulesSignal.set(rules);
  }

  /**
   * Create a new point rule (admin only)
   */
  async createRule(rule: CreatePointRuleRequest): Promise<{ error: Error | null }> {
    const profile = this.authService.userProfile();
    if (!profile?.server_id) {
      return { error: new Error('No server ID') };
    }

    const validation = this.validateNoOverlap(rule, this.rulesSignal());
    if (!validation.valid) {
      const conflict = validation.conflictingRule;
      return {
        error: new Error(
          `Chevauchement avec règle existante: ${conflict?.activity_type} positions ${conflict?.position_min}-${conflict?.position_max}`
        ),
      };
    }

    const { error } = await this.supabase.from('activity_point_rules').insert({
      server_id: profile.server_id,
      ...rule,
    });

    if (error) {
      return { error: new Error(error.message) };
    }

    await this.loadRules();
    return { error: null };
  }

  /**
   * Update an existing point rule
   */
  async updateRule(id: string, updates: UpdatePointRuleRequest): Promise<{ error: Error | null }> {
    const { error } = await this.supabase.from('activity_point_rules').update(updates).eq('id', id);

    if (error) {
      return { error: new Error(error.message) };
    }

    await this.loadRules();
    return { error: null };
  }

  /**
   * Delete a point rule
   */
  async deleteRule(id: string): Promise<{ error: Error | null }> {
    const { error } = await this.supabase.from('activity_point_rules').delete().eq('id', id);

    if (error) {
      return { error: new Error(error.message) };
    }

    await this.loadRules();
    return { error: null };
  }

  /**
   * Calculate points for an activity based on position
   */
  calculatePoints(activityType: string, position: number | null): PointCalculationResult {
    if (position === null) {
      return {
        points: getActivityTypePoints(activityType),
        usedFallback: true,
      };
    }

    const matchedRule = this.rulesSignal().find(
      rule => rule.activity_type === activityType && position >= rule.position_min && position <= rule.position_max
    );

    if (matchedRule) {
      return {
        points: matchedRule.points,
        matchedRule,
        usedFallback: false,
      };
    }

    return {
      points: getActivityTypePoints(activityType),
      usedFallback: true,
    };
  }

  /**
   * Validate that there is no range overlap for a new rule
   */
  validateNoOverlap(
    newRule: CreatePointRuleRequest,
    existingRules: ActivityPointRule[]
  ): { valid: boolean; conflictingRule?: ActivityPointRule } {
    const conflictingRule = existingRules.find(
      rule =>
        rule.activity_type === newRule.activity_type &&
        !(newRule.position_max < rule.position_min || newRule.position_min > rule.position_max)
    );

    return {
      valid: !conflictingRule,
      conflictingRule,
    };
  }

  /**
   * Get all rules for a specific activity type
   */
  getRulesForActivityType(activityType: string): ActivityPointRule[] {
    return this.rulesSignal().filter(rule => rule.activity_type === activityType);
  }

  // ─── Activity Settings ─────────────────────────────────────────────────────

  /**
   * Load all activity settings for the current server
   */
  async loadSettings(): Promise<{ error: Error | null }> {
    const profile = this.authService.userProfile();
    if (!profile?.server_id) {
      return { error: new Error('No server ID') };
    }

    const { data, error } = await this.supabase
      .from('server_activity_settings')
      .select('*')
      .eq('server_id', profile.server_id);

    if (error) {
      return { error: new Error(error.message) };
    }

    this.settingsSignal.set(data || []);
    return { error: null };
  }

  /**
   * Set settings from externally fetched data
   */
  setSettings(settings: ServerActivitySettings[]): void {
    this.settingsSignal.set(settings);
  }

  /**
   * Returns true if the given activity type is enabled for this server (default: true)
   */
  isActivityEnabled(activityType: string): boolean {
    return this.settingsSignal().find(s => s.activity_type === activityType)?.enabled ?? true;
  }

  /**
   * Returns true if the given activity type has participation_mode enabled
   */
  isParticipationMode(activityType: string): boolean {
    return this.settingsSignal().find(s => s.activity_type === activityType)?.participation_mode ?? false;
  }

  /**
   * Returns the fixed points for a participation-mode activity
   */
  getParticipationPoints(activityType: string): number {
    return this.settingsSignal().find(s => s.activity_type === activityType)?.participation_points ?? 5;
  }

  /**
   * Computed signal: participation mode for a given activity type (reactive)
   */
  participationModeFor(activityType: string) {
    return computed(
      () => this.settingsSignal().find(s => s.activity_type === activityType)?.participation_mode ?? false
    );
  }

  /**
   * Upsert a single activity setting (admin only)
   */
  async upsertSetting(request: UpsertActivitySettingsRequest): Promise<{ error: Error | null }> {
    const profile = this.authService.userProfile();
    if (!profile?.server_id) {
      return { error: new Error('No server ID') };
    }

    const { error } = await this.supabase.from('server_activity_settings').upsert(
      {
        server_id: profile.server_id,
        activity_type: request.activity_type,
        enabled: request.enabled,
        participation_mode: request.participation_mode,
        participation_points: request.participation_points,
      },
      { onConflict: 'server_id,activity_type' }
    );

    if (error) {
      return { error: new Error(error.message) };
    }

    await this.loadSettings();
    return { error: null };
  }

  // ─── Invitations ───────────────────────────────────────────────────────────

  /**
   * Create invitation token (admin only)
   * @param expiresInDays Number of days until token expires (default: 7)
   */
  async createInvitation(expiresInDays = 7): Promise<CreateInvitationResponse | { error: Error }> {
    const serverId = this.authService.getServerId();
    const userId = this.authService.getUserId();

    if (!serverId || !userId) {
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
          server_id: serverId,
          token: token,
          expires_at: expiresAt.toISOString(),
          created_by: userId,
        })
        .select()
        .single();

      if (error) throw error;

      // Generate invitation URL with proper base-href support
      const base = typeof document !== 'undefined' ? document.querySelector('base')?.getAttribute('href') || '/' : '/';
      const basePath = base.endsWith('/') ? base.slice(0, -1) : base;
      const baseUrl = typeof window !== 'undefined' ? `${window.location.origin}${basePath}` : '';
      const invitationUrl = `${baseUrl}/join?token=${token}`;

      // Reload invitations
      await this.loadInvitations();

      return {
        token: data.token,
        url: invitationUrl,
        expires_at: data.expires_at,
      };
    } catch (error) {
      console.error('Error creating invitation:', error);
      return { error: error as Error };
    }
  }

  /**
   * Validate invitation token via RPC (bypasses RLS so anon users can validate)
   * Supports multi-use tokens (no used_at check)
   */
  async validateInvitation(token: string): Promise<ValidateInvitationResponse> {
    try {
      const { data, error } = await this.supabase.rpc('validate_invitation_token', {
        p_token: token,
      });

      if (error) {
        console.error('Token validation error:', error);
        return { valid: false, server: null, error: 'Invalid invitation token' };
      }

      if (!data.valid) {
        return { valid: false, server: null, error: data.error };
      }

      return {
        valid: true,
        server: { id: data.server_id, name: data.server_name } as Server,
        error: null,
      };
    } catch (error) {
      console.error('Error validating invitation:', error);
      return { valid: false, server: null, error: 'Error validating invitation' };
    }
  }

  /**
   * Load active invitations for server (admin only)
   */
  async loadInvitations(): Promise<void> {
    const serverId = this.authService.getServerId();

    if (!serverId || !this.authService.isAdmin()) {
      this.invitationsSignal.set([]);
      return;
    }

    try {
      const { data, error } = await this.supabase
        .from('invitation_stats')
        .select('*')
        .eq('server_id', serverId)
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
   * Set or clear the tiebreaker activity for the server (admin only)
   * Only one activity can be tiebreaker at a time — passing null clears it.
   */
  async setTiebreakerActivity(activityType: string | null): Promise<{ error: Error | null }> {
    return this.updateServer({ tiebreaker_activity_type: activityType });
  }

  /**
   * Set the scoring weeks multiplier for the server (admin only).
   * Actual weeks in the leaderboard = multiplier × 6.
   * Valid values: 1, 2, or 3.
   */
  async setScoringWeeksMultiplier(multiplier: 1 | 2 | 3): Promise<{ error: Error | null }> {
    return this.updateServer({ scoring_weeks_multiplier: multiplier });
  }

  /**
   * Update server (admin only)
   */
  async updateServer(updates: UpdateServerRequest): Promise<{ error: Error | null }> {
    const serverId = this.authService.getServerId();

    if (!serverId || !this.authService.isAdmin()) {
      return { error: new Error('Only admins can update server') };
    }

    try {
      const { error } = await this.supabase.from('servers').update(updates).eq('id', serverId);

      if (error) throw error;

      // Reload server
      await this.loadServer();

      return { error: null };
    } catch (error) {
      console.error('Error updating server:', error);
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
}
