import { Injectable, inject, signal, computed } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { AuthService } from './auth.service';
import { AllianceActivitySettings, UpsertActivitySettingsRequest } from '../../shared/models';

@Injectable({
  providedIn: 'root',
})
export class AllianceActivitySettingsService {
  private readonly supabase = inject(SupabaseService);
  private readonly authService = inject(AuthService);

  private readonly settingsSignal = signal<AllianceActivitySettings[]>([]);
  readonly settings = this.settingsSignal.asReadonly();

  /**
   * Returns true if the given activity type has participation_mode enabled
   */
  isParticipationMode(activityType: string): boolean {
    return (
      this.settingsSignal().find(s => s.activity_type === activityType)?.participation_mode ?? false
    );
  }

  /**
   * Returns the fixed points for a participation-mode activity
   */
  getParticipationPoints(activityType: string): number {
    return (
      this.settingsSignal().find(s => s.activity_type === activityType)?.participation_points ?? 5
    );
  }

  /**
   * Computed signal: participation mode for a given activity type (reactive)
   */
  participationModeFor(activityType: string) {
    return computed(
      () =>
        this.settingsSignal().find(s => s.activity_type === activityType)?.participation_mode ??
        false
    );
  }

  /**
   * Load all activity settings for the current user's alliance
   */
  async loadSettings(): Promise<{ error: Error | null }> {
    const profile = this.authService.userProfile();
    if (!profile?.alliance_id) {
      return { error: new Error('No alliance ID') };
    }

    const { data, error } = await this.supabase
      .from('alliance_activity_settings')
      .select('*')
      .eq('alliance_id', profile.alliance_id);

    if (error) {
      return { error: new Error(error.message) };
    }

    this.settingsSignal.set(data || []);
    return { error: null };
  }

  /**
   * Upsert a single activity setting (admin only)
   */
  async upsertSetting(request: UpsertActivitySettingsRequest): Promise<{ error: Error | null }> {
    const profile = this.authService.userProfile();
    if (!profile?.alliance_id) {
      return { error: new Error('No alliance ID') };
    }

    const { error } = await this.supabase.from('alliance_activity_settings').upsert(
      {
        alliance_id: profile.alliance_id,
        activity_type: request.activity_type,
        participation_mode: request.participation_mode,
        participation_points: request.participation_points,
      },
      { onConflict: 'alliance_id,activity_type' }
    );

    if (error) {
      return { error: new Error(error.message) };
    }

    await this.loadSettings();
    return { error: null };
  }

  /**
   * Initialize the service after login
   */
  async initialize(): Promise<void> {
    const profile = this.authService.userProfile();
    if (profile?.alliance_id) {
      await this.loadSettings();
    }
  }

  /**
   * Reset state on logout
   */
  reset(): void {
    this.settingsSignal.set([]);
  }
}
