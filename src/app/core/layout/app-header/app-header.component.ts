import { environment } from './../../../../environments/environment';
import { Component, inject, effect, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatMenuModule } from '@angular/material/menu';
import { MatDividerModule } from '@angular/material/divider';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { TranslateModule } from '@ngx-translate/core';
import { AuthService } from '@app/core/services/auth.service';
import { AllianceService } from '@app/core/services/alliance.service';
import { LanguageService, type SupportedLanguage } from '@app/core/services/language.service';
import { ProgressBarService } from '@app/core/services/progress-bar.service';

@Component({
  selector: 'app-header',
  standalone: true,
  imports: [
    CommonModule,
    RouterLink,
    RouterLinkActive,
    MatToolbarModule,
    MatIconModule,
    MatButtonModule,
    MatMenuModule,
    MatDividerModule,
    MatProgressBarModule,
    TranslateModule
  ],
  templateUrl: './app-header.component.html',
  styleUrl: './app-header.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class AppHeaderComponent {
  protected readonly authService = inject(AuthService);
  protected readonly allianceService = inject(AllianceService);
  protected readonly languageService = inject(LanguageService);
  protected readonly progressBarService = inject(ProgressBarService);

  protected imageBaseUrl: string;

  constructor() {
    this.imageBaseUrl = environment.production ? "/activity-tracker/assets/favicon.png" : "/assets/favicon.png";
    // Reactive loading: automatically load alliance when user profile changes
    effect(() => {
      const profile = this.authService.userProfile();
      if (profile && !this.authService.isSuperAdmin() && profile.alliance_id) {
        this.allianceService.loadAlliance();
      }
    });
  }

  protected async logout(): Promise<void> {
    await this.authService.signOut();
  }

  protected async changeLanguage(language: SupportedLanguage): Promise<void> {
    await this.languageService.setLanguage(language);
  }
}
