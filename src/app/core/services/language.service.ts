import { Injectable, inject, signal } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import { AuthService } from './auth.service';
import { SupabaseService } from './supabase.service';
import type { UserPreferences } from '@app/shared/models/user.model';

/**
 * Supported languages in the application
 */
export type SupportedLanguage =
  | 'en'
  | 'fr'
  | 'es'
  | 'it'
  | 'de'
  | 'tr'
  | 'pt'
  | 'el'
  | 'ko'
  | 'hi'
  | 'zh'
  | 'ku'
  | 'ar'
  | 'id';

/**
 * Language information with metadata
 */
export interface LanguageInfo {
  code: SupportedLanguage;
  name: string;
  flag: string;
}

/**
 * LanguageService
 * Manages application language with user preference persistence
 * Priority: User DB preference → Browser language → Fallback (en)
 */
@Injectable({
  providedIn: 'root',
})
export class LanguageService {
  private readonly translateService = inject(TranslateService);
  private readonly authService = inject(AuthService);
  private readonly supabaseService = inject(SupabaseService);

  /**
   * Available languages with their metadata
   */
  public readonly availableLanguages: LanguageInfo[] = [
    { code: 'en', name: 'English', flag: '🇬🇧' },
    { code: 'fr', name: 'Français', flag: '🇫🇷' },
    { code: 'es', name: 'Español', flag: '🇪🇸' },
    { code: 'it', name: 'Italiano', flag: '🇮🇹' },
    { code: 'de', name: 'Deutsch', flag: '🇩🇪' },
    { code: 'tr', name: 'Türkçe', flag: '🇹🇷' },
    { code: 'pt', name: 'Português', flag: '🇧🇷' },
    { code: 'el', name: 'Ελληνικά', flag: '🇬🇷' },
    { code: 'ko', name: '한국어', flag: '🇰🇷' },
    { code: 'hi', name: 'हिन्दी', flag: '🇮🇳' },
    { code: 'zh', name: '中文', flag: '🇨🇳' },
    { code: 'ku', name: 'کوردیی ناوەندی', flag: '☀️' },
    { code: 'ar', name: 'العربية', flag: '🇸🇦' },
    { code: 'id', name: 'Bahasa Indonesia', flag: '🇮🇩' },
  ];

  /**
   * Current active language (reactive signal)
   */
  public readonly currentLanguage = signal<SupportedLanguage>('en');

  /**
   * Initialize language based on priority:
   * 1. User preference from database (if logged in)
   * 2. Browser language
   * 3. Fallback to English
   */
  public initializeLanguage(): void {
    const userProfile = this.authService.userProfile();

    // Priority 1: User preference from database
    if (userProfile?.preferences?.language) {
      this.setLanguage(userProfile.preferences.language, false);
      return;
    }

    // Priority 2: Browser language
    const browserLang = this.translateService.getBrowserLang();
    if (browserLang && this.isLanguageSupported(browserLang)) {
      this.setLanguage(browserLang as SupportedLanguage, false);
      return;
    }

    // Priority 3: Fallback to English
    this.setLanguage('en', false);
  }

  /**
   * Change the application language
   * @param language - The language code to switch to
   * @param saveToProfile - Whether to persist to user profile (default: true)
   */
  public async setLanguage(language: SupportedLanguage, saveToProfile = true): Promise<void> {
    if (!this.isLanguageSupported(language)) {
      console.warn(`Language ${language} is not supported. Falling back to English.`);
      language = 'en';
    }

    // Update translation service
    this.translateService.use(language);

    // Update signal for reactive UI
    this.currentLanguage.set(language);

    // Save to user profile if logged in and requested
    if (saveToProfile && this.authService.isAuthenticated()) {
      await this.saveLanguagePreference(language);
    }
  }

  /**
   * Save language preference to user profile in database
   * @param language - The language to save
   */
  private async saveLanguagePreference(language: SupportedLanguage): Promise<void> {
    try {
      const userProfile = this.authService.userProfile();
      if (!userProfile) {
        console.warn('Cannot save language preference: User not logged in');
        return;
      }

      const currentPreferences = userProfile.preferences || {};
      const updatedPreferences: UserPreferences = {
        ...currentPreferences,
        language,
      };

      const { error } = await this.supabaseService.client
        .from('user_profiles')
        .update({ preferences: updatedPreferences })
        .eq('id', userProfile.id);

      if (error) {
        console.error('Error saving language preference:', error);
        return;
      }

      // Language preference saved successfully to database
      // The updated preference will be loaded on next session
    } catch (error) {
      console.error('Failed to save language preference:', error);
    }
  }

  /**
   * Get language information by code
   * @param code - The language code
   * @returns Language metadata or undefined if not found
   */
  public getLanguageInfo(code: SupportedLanguage): LanguageInfo | undefined {
    return this.availableLanguages.find(lang => lang.code === code);
  }

  /**
   * Check if a language code is supported
   * @param language - The language code to check
   * @returns True if supported, false otherwise
   */
  private isLanguageSupported(language: string): language is SupportedLanguage {
    return this.availableLanguages.some(lang => lang.code === language);
  }
}
