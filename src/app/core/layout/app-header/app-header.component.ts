import { Component, inject, effect, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatMenuModule } from '@angular/material/menu';
import { MatDividerModule } from '@angular/material/divider';
import { TranslateModule } from '@ngx-translate/core';
import { AuthService } from '@app/core/services/auth.service';
import { AllianceService } from '@app/core/services/alliance.service';

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
    TranslateModule
  ],
  templateUrl: './app-header.component.html',
  styleUrl: './app-header.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class AppHeaderComponent {
  protected readonly authService = inject(AuthService);
  protected readonly allianceService = inject(AllianceService);

  constructor() {
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
}
