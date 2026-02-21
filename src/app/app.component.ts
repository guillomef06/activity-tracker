import { ChangeDetectionStrategy, Component, inject, effect } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { TranslateService } from '@ngx-translate/core';
import { LanguageService } from '@app/core/services/language.service';
import { AuthService } from '@app/core/services/auth.service';

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
  private authService = inject(AuthService);

  constructor() {
    // Configure supported languages
    const supportedLanguages = ['en', 'fr', 'it', 'es'];
    this.translate.addLangs(supportedLanguages);

    // Initialize language with user preference priority
    this.languageService.initializeLanguage();

    // Reload language when user logs in or profile changes
    effect(() => {
      const userProfile = this.authService.userProfile();
      if (userProfile?.preferences?.language) {
        this.languageService.setLanguage(userProfile.preferences.language, false);
      }
    });
  }
}
