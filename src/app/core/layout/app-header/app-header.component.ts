import { environment } from './../../../../environments/environment';
import { Component, inject, effect, computed, ChangeDetectionStrategy } from '@angular/core';

import { RouterLink, RouterLinkActive } from '@angular/router';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatMenuModule } from '@angular/material/menu';
import { MatDividerModule } from '@angular/material/divider';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatBadgeModule } from '@angular/material/badge';
import { MatDialog } from '@angular/material/dialog';
import { TranslateModule } from '@ngx-translate/core';
import { AuthService } from '@app/core/services/auth.service';
import { AllianceService } from '@app/core/services/alliance.service';
import { ProgressBarService } from '@app/core/services/progress-bar.service';
import { PwaService } from '@app/core/services';
import { ReleaseNotesService } from '@app/core/services/release-notes.service';
import { ReleaseNotesDialogComponent } from '@app/shared/components/release-notes-dialog/release-notes-dialog.component';
import { UserAccountDialogComponent } from '@app/shared/components/user-account-dialog/user-account-dialog.component';

@Component({
  selector: 'app-header',
  imports: [
    RouterLink,
    RouterLinkActive,
    MatToolbarModule,
    MatIconModule,
    MatButtonModule,
    MatMenuModule,
    MatDividerModule,
    MatProgressBarModule,
    MatBadgeModule,
    TranslateModule,
  ],
  templateUrl: './app-header.component.html',
  styleUrl: './app-header.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AppHeaderComponent {
  protected readonly authService = inject(AuthService);
  protected readonly allianceService = inject(AllianceService);
  protected readonly progressBarService = inject(ProgressBarService);
  protected readonly pwaService = inject(PwaService);
  protected readonly releaseNotesService = inject(ReleaseNotesService);
  private readonly dialog = inject(MatDialog);

  protected imageBaseUrl: string;

  /** Combined display: [tag]DisplayName or AllianceName DisplayName or just DisplayName */
  protected readonly headerIdentity = computed(() => {
    const profile = this.authService.userProfile();
    const alliance = this.allianceService.alliance();
    const displayName = profile?.display_name ?? '';

    if (alliance?.tag) {
      return `[${alliance.tag}] ${displayName}`;
    } else if (alliance?.name) {
      return `[${alliance.name}] ${displayName}`;
    }
    return displayName;
  });

  constructor() {
    this.imageBaseUrl = environment.production ? '/activity-tracker/assets/favicon.png' : '/assets/favicon.png';
    // Load alliance for any authenticated user who belongs to one
    effect(() => {
      const profile = this.authService.userProfile();
      if (profile?.alliance_id) {
        this.allianceService.loadAlliance();
      }
    });
  }

  protected async logout(): Promise<void> {
    await this.authService.signOut();
  }

  protected openReleaseNotes(): void {
    this.dialog.open(ReleaseNotesDialogComponent);
  }

  protected openAccountSettings(): void {
    this.dialog.open(UserAccountDialogComponent, {
      width: '480px',
      maxWidth: '95vw',
      panelClass: 'user-account-dialog',
    });
  }
}
