import { ChangeDetectionStrategy, Component, inject, effect } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { MatDialog } from '@angular/material/dialog';
import { TranslateService } from '@ngx-translate/core';
import { LanguageService } from '@app/core/services/language.service';
import { ThemeService } from '@app/core/services/theme.service';
import { AuthService } from '@app/core/services/auth.service';
import { PwaService } from '@app/core/services';
import { ReleaseNotesService } from '@app/core/services/release-notes.service';
import { ReleaseNotesDialogComponent } from '@app/shared/components/release-notes-dialog/release-notes-dialog.component';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AppComponent {
  private translate = inject(TranslateService);
  private languageService = inject(LanguageService);
  private themeService = inject(ThemeService);
  private authService = inject(AuthService);
  private readonly pwaService = inject(PwaService);
  private readonly releaseNotesService = inject(ReleaseNotesService);
  private readonly dialog = inject(MatDialog);

  private autoDialogShown = false;

  constructor() {
    // Configure supported languages
    const supportedLanguages = ['en', 'fr', 'it', 'es'];
    this.translate.addLangs(supportedLanguages);

    // Initialize language with user preference priority
    this.languageService.initializeLanguage();

    // Initialize color scheme with user preference priority
    this.themeService.initializeTheme();

    // Reload language + color scheme when user logs in or profile changes
    effect(() => {
      const userProfile = this.authService.userProfile();
      if (userProfile?.preferences?.language) {
        this.languageService.setLanguage(userProfile.preferences.language, false);
      }
      if (userProfile?.preferences?.colorScheme) {
        void this.themeService.setColorScheme(userProfile.preferences.colorScheme, false);
      }
    });

    // Auto-open release notes dialog when new version is detected, only once the user is authenticated
    effect(() => {
      const notes = this.releaseNotesService.notes();
      const isAuthenticated = !!this.authService.userProfile();
      if (notes.length > 0 && isAuthenticated && this.releaseNotesService.hasUnseenNotes() && !this.autoDialogShown) {
        this.autoDialogShown = true;
        setTimeout(() => this.dialog.open(ReleaseNotesDialogComponent), 300);
      }
    });
  }
}
