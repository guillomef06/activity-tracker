import { Injectable, signal, inject } from '@angular/core';
import { AuthService } from './auth.service';
import { SupabaseService } from './supabase.service';
import type { UserPreferences } from '@app/shared/models/user.model';

export type ColorScheme = 'light' | 'dark' | 'auto';

export interface ColorSchemeInfo {
  value: ColorScheme;
  labelKey: string;
  icon: string;
}

/**
 * ThemeService
 * Manages the application color scheme (light / dark / auto).
 * Priority: User DB preference → auto (OS via CSS media query)
 *
 * "auto" is handled entirely by CSS (@media prefers-color-scheme),
 * so no JS listener is needed — zero flash on initial load.
 */
@Injectable({
  providedIn: 'root',
})
export class ThemeService {
  private readonly authService = inject(AuthService);
  private readonly supabase = inject(SupabaseService);

  public readonly colorSchemes: ColorSchemeInfo[] = [
    { value: 'light', labelKey: 'accountSettings.colorScheme.light', icon: 'light_mode' },
    { value: 'dark', labelKey: 'accountSettings.colorScheme.dark', icon: 'dark_mode' },
    { value: 'auto', labelKey: 'accountSettings.colorScheme.auto', icon: 'brightness_auto' },
  ];

  public readonly currentScheme = signal<ColorScheme>('auto');

  /**
   * Initialize color scheme from user preference, falling back to 'auto'.
   * Call once on app startup, after user profile is available.
   */
  public initializeTheme(): void {
    const saved = this.authService.userProfile()?.preferences?.colorScheme;
    this.applyScheme(saved ?? 'auto', false);
  }

  /**
   * Change and persist the color scheme.
   */
  public async setColorScheme(scheme: ColorScheme, saveToProfile = true): Promise<void> {
    this.applyScheme(scheme, saveToProfile);
  }

  private applyScheme(scheme: ColorScheme, save: boolean): void {
    this.currentScheme.set(scheme);

    const html = document.documentElement;
    html.classList.remove('theme-light', 'theme-dark');

    if (scheme === 'dark') html.classList.add('theme-dark');
    if (scheme === 'light') html.classList.add('theme-light');
    // 'auto' → no class, CSS @media handles it

    if (save && this.authService.isAuthenticated()) {
      void this.savePreference(scheme);
    }
  }

  private async savePreference(scheme: ColorScheme): Promise<void> {
    const profile = this.authService.userProfile();
    if (!profile) return;

    const updated: UserPreferences = { ...profile.preferences, colorScheme: scheme };
    const { error } = await this.supabase.client
      .from('user_profiles')
      .update({ preferences: updated })
      .eq('id', profile.id);

    if (error) {
      console.error('Failed to save color scheme preference:', error);
    }
  }
}
