import { Component, ChangeDetectionStrategy, input, signal, inject, computed } from '@angular/core';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatChipsModule } from '@angular/material/chips';
import { MatBadgeModule } from '@angular/material/badge';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatDialogModule, MatDialog } from '@angular/material/dialog';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { UserScore } from '@shared/models/activity.model';
import { ActivityLabelPipe } from '@shared/pipes/activity-label.pipe';
import { WeekLabelPipe } from '@shared/pipes/week-label.pipe';
import { ShortDatePipe } from '@shared/pipes/short-date.pipe';
import { AuthService } from '@core/services/auth.service';
import { ActivityService } from '@core/services/activity.service';
import { SnackbarService } from '@core/services/snackbar.service';
import { ConfirmDialogComponent } from '@shared/components/confirm-dialog/confirm-dialog.component';
import { firstValueFrom } from 'rxjs';

@Component({
  selector: 'app-activities-details',
  imports: [
    MatCardModule,
    MatIconModule,
    MatButtonModule,
    MatExpansionModule,
    MatChipsModule,
    MatBadgeModule,
    MatTooltipModule,
    MatDialogModule,
    TranslateModule,
    ActivityLabelPipe,
    WeekLabelPipe,
    ShortDatePipe,
  ],
  templateUrl: './activities-details.component.html',
  styleUrl: './activities-details.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ActivitiesDetailsComponent {
  private readonly authService = inject(AuthService);
  private readonly activityService = inject(ActivityService);
  private readonly snackbarService = inject(SnackbarService);
  private readonly dialog = inject(MatDialog);
  private readonly translate = inject(TranslateService);

  readonly userScores = input.required<UserScore[]>();

  protected readonly selectedUserId = signal<string | null>(null);
  protected readonly deletingActivityId = signal<string | null>(null);
  protected readonly isSuperAdmin = computed(() => this.authService.isSuperAdmin());

  protected readonly trackByUserId = (_index: number, user: UserScore) => user.userId;
  protected readonly trackByIndex = (index: number) => index;

  protected toggleUserDetails(userId: string): void {
    this.selectedUserId.update(current => (current === userId ? null : userId));
  }

  protected async deleteActivity(activityId: string, event: Event): Promise<void> {
    event.stopPropagation();

    const confirmed = await firstValueFrom(
      this.dialog
        .open(ConfirmDialogComponent, {
          data: {
            title: this.translate.instant('activitiesDetails.deleteActivity'),
            message: this.translate.instant('activitiesDetails.deleteActivityConfirm'),
            confirmText: this.translate.instant('common.delete'),
            cancelText: this.translate.instant('common.cancel'),
          },
        })
        .afterClosed()
    );

    if (!confirmed) return;

    this.deletingActivityId.set(activityId);
    const { error } = await this.activityService.deleteActivity(activityId);
    this.deletingActivityId.set(null);

    if (error) {
      this.snackbarService.error(this.translate.instant('activitiesDetails.deleteActivityFailed'));
    } else {
      this.snackbarService.success(this.translate.instant('activitiesDetails.deleteActivitySuccess'));
    }
  }
}
