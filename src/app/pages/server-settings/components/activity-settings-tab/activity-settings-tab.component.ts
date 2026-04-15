import { Component, inject, input, output, signal, computed, ChangeDetectionStrategy, DestroyRef } from '@angular/core';

import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTableModule } from '@angular/material/table';
import { MatChipsModule } from '@angular/material/chips';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatSlideToggleChange } from '@angular/material/slide-toggle';
import { SnackbarService } from '@app/core/services';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { ConfirmDialogComponent } from '@app/shared/components/confirm-dialog/confirm-dialog.component';
import { ServerService } from '@app/core/services/server.service';
import { ActivityService } from '@app/core/services/activity.service';
import { createFieldErrorSignal } from '@app/shared/utils/form-validation.utils';
import { PositionRangePipe } from '@app/shared/pipes/position-range.pipe';
import { LoadingButtonComponent } from '@app/shared/components/loading-button/loading-button.component';
import type { ActivityPointRule, ServerActivitySettings } from '@app/shared/models';
import { APP_CONSTANTS } from '@app/shared/constants/constants';
import { firstValueFrom } from 'rxjs';

@Component({
  selector: 'app-activity-settings-tab',
  imports: [
    ReactiveFormsModule,
    MatCardModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatButtonModule,
    MatIconModule,
    MatTableModule,
    MatChipsModule,
    MatTooltipModule,
    MatSlideToggleModule,
    MatDialogModule,
    TranslateModule,
    PositionRangePipe,
    LoadingButtonComponent,
  ],
  templateUrl: './activity-settings-tab.component.html',
  styleUrl: './activity-settings-tab.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ActivitySettingsTabComponent {
  private readonly serverService = inject(ServerService);
  private readonly activityService = inject(ActivityService);
  private readonly fb = inject(FormBuilder);
  private readonly snackbarService = inject(SnackbarService);
  private readonly dialog = inject(MatDialog);
  private readonly translate = inject(TranslateService);
  private readonly destroyRef = inject(DestroyRef);

  // Inputs
  pointRules = input.required<ActivityPointRule[]>();
  isLoading = input.required<boolean>();

  // Outputs
  ruleCreated = output<void>();
  ruleDeleted = output<void>();

  // State
  protected readonly isSubmitting = signal(false);
  protected readonly isUpdatingSetting = signal<string | null>(null);
  protected readonly isUpdatingTiebreaker = signal(false);
  protected readonly isDeletingAll = signal(false);
  protected readonly activityTypes = APP_CONSTANTS.ACTIVITY_TYPES;
  protected readonly pointRuleColumns: string[] = ['activityType', 'positionRange', 'points', 'actions'];

  // Current tiebreaker activity (derived from server signal)
  protected readonly tiebreakerActivity = computed(() => this.serverService.server()?.tiebreaker_activity_type ?? null);

  // Scoring weeks multiplier (1, 2 or 3) and resulting week count
  protected readonly scoringWeeksMultiplier = computed(
    () => (this.serverService.server()?.scoring_weeks_multiplier ?? 1) as 1 | 2 | 3
  );
  protected readonly scoringWeeks = computed(() => this.serverService.scoringWeeks());
  protected readonly isUpdatingMultiplier = signal(false);
  protected readonly multiplierOptions = [1, 2, 3] as const;

  // Merged list of activity types with their current settings for the participation section
  protected readonly activitySettingsList = computed(() => {
    const settings = this.serverService.settings();
    const settingsMap = new Map<string, ServerActivitySettings>(settings.map(s => [s.activity_type, s]));
    return this.activityTypes.map(type => ({
      type,
      setting: settingsMap.get(type.value),
    }));
  });

  // Only enabled activity types — used in the "Add rule" dropdown
  // Depends on settings() signal to stay reactive to admin toggles
  protected readonly enabledActivityTypes = computed(() => {
    const settings = this.serverService.settings();
    return this.activityTypes.filter(type => settings.find(s => s.activity_type === type.value)?.enabled ?? true);
  });

  protected readonly pointRuleForm: FormGroup = this.fb.group({
    activity_type: ['', Validators.required],
    position_min: [1, [Validators.required, Validators.min(1)]],
    position_max: [1, [Validators.required, Validators.min(1)]],
    points: [10, [Validators.required, Validators.min(0)]],
  });

  // Error signals for validation
  protected readonly activityTypeError = createFieldErrorSignal(this.pointRuleForm, 'activity_type', this.destroyRef);
  protected readonly positionMinError = createFieldErrorSignal(this.pointRuleForm, 'position_min', this.destroyRef);
  protected readonly positionMaxError = createFieldErrorSignal(this.pointRuleForm, 'position_max', this.destroyRef);
  protected readonly pointsError = createFieldErrorSignal(this.pointRuleForm, 'points', this.destroyRef);

  protected async createPointRule(): Promise<void> {
    if (this.pointRuleForm.invalid) {
      return;
    }

    const formValue = this.pointRuleForm.value;

    // Validate position range
    if (formValue.position_min > formValue.position_max) {
      this.snackbarService.error(this.translate.instant('server.settings.pointRules.positionRangeError'));
      return;
    }

    this.isSubmitting.set(true);
    try {
      const { error } = await this.serverService.createRule({
        activity_type: formValue.activity_type,
        position_min: formValue.position_min,
        position_max: formValue.position_max,
        points: formValue.points,
      });

      if (error) {
        throw error;
      }

      this.snackbarService.success(this.translate.instant('server.settings.pointRules.created'));

      // Reset form
      this.pointRuleForm.reset({
        activity_type: '',
        position_min: 1,
        position_max: 1,
        points: 10,
      });

      // Notify parent to reload
      this.ruleCreated.emit();
    } catch (error) {
      console.error('Error creating point rule:', error);
      this.snackbarService.error(
        error instanceof Error ? error.message : this.translate.instant('server.settings.pointRules.createFailed'),
        5000
      );
    } finally {
      this.isSubmitting.set(false);
    }
  }

  protected async deletePointRule(id: string): Promise<void> {
    const confirmed = await firstValueFrom(
      this.dialog
        .open(ConfirmDialogComponent, {
          data: {
            message: this.translate.instant('server.settings.pointRules.deleteConfirm'),
          },
        })
        .afterClosed()
    );

    if (!confirmed) {
      return;
    }

    this.isSubmitting.set(true);
    try {
      const { error } = await this.serverService.deleteRule(id);

      if (error) {
        throw error;
      }

      this.snackbarService.success(this.translate.instant('server.settings.pointRules.deleted'));

      // Notify parent to reload
      this.ruleDeleted.emit();
    } catch (error) {
      console.error('Error deleting point rule:', error);
      this.snackbarService.error(this.translate.instant('server.settings.pointRules.deleteFailed'));
    } finally {
      this.isSubmitting.set(false);
    }
  }

  protected async toggleActivityEnabled(activityType: string, event: MatSlideToggleChange): Promise<void> {
    this.isUpdatingSetting.set(activityType);
    try {
      const { error } = await this.serverService.upsertSetting({
        activity_type: activityType,
        enabled: event.checked,
        participation_mode: this.serverService.isParticipationMode(activityType),
        participation_points: this.serverService.getParticipationPoints(activityType),
      });
      if (error) throw error;

      // If the activity is being disabled and it was the tiebreaker, clear it
      if (!event.checked && this.tiebreakerActivity() === activityType) {
        await this.serverService.setTiebreakerActivity(null);
      }
    } catch (error) {
      console.error('Error toggling activity enabled:', error);
      this.snackbarService.error(this.translate.instant('server.settings.pointRules.activityEnabledFailed'));
    } finally {
      this.isUpdatingSetting.set(null);
    }
  }

  protected async toggleParticipationMode(activityType: string, event: MatSlideToggleChange): Promise<void> {
    this.isUpdatingSetting.set(activityType);
    try {
      const currentPoints = this.serverService.getParticipationPoints(activityType);
      const { error } = await this.serverService.upsertSetting({
        activity_type: activityType,
        enabled: this.serverService.isActivityEnabled(activityType),
        participation_mode: event.checked,
        participation_points: currentPoints,
      });
      if (error) throw error;
    } catch (error) {
      console.error('Error toggling participation mode:', error);
      this.snackbarService.error(this.translate.instant('server.settings.pointRules.participationModeFailed'));
    } finally {
      this.isUpdatingSetting.set(null);
    }
  }

  protected onPointsChange(activityType: string, event: Event): void {
    const value = (event.target as HTMLInputElement).valueAsNumber;
    if (!isNaN(value) && value >= 0) {
      this.updateParticipationPoints(activityType, value);
    }
  }

  private async updateParticipationPoints(activityType: string, points: number): Promise<void> {
    this.isUpdatingSetting.set(activityType);
    try {
      const { error } = await this.serverService.upsertSetting({
        activity_type: activityType,
        enabled: this.serverService.isActivityEnabled(activityType),
        participation_mode: true,
        participation_points: points,
      });
      if (error) throw error;
    } catch (error) {
      console.error('Error updating participation points:', error);
      this.snackbarService.error(this.translate.instant('server.settings.pointRules.participationPointsFailed'));
    } finally {
      this.isUpdatingSetting.set(null);
    }
  }

  protected async onMultiplierChange(multiplier: 1 | 2 | 3): Promise<void> {
    this.isUpdatingMultiplier.set(true);
    try {
      const { error } = await this.serverService.setScoringWeeksMultiplier(multiplier);
      if (error) throw error;
      this.snackbarService.success(this.translate.instant('server.settings.leaderboard.multiplierUpdated'));
    } catch (error) {
      console.error('Error updating scoring weeks multiplier:', error);
      this.snackbarService.error(this.translate.instant('server.settings.leaderboard.multiplierFailed'));
    } finally {
      this.isUpdatingMultiplier.set(false);
    }
  }

  protected async toggleTiebreakerActivity(activityType: string, event: MatSlideToggleChange): Promise<void> {
    this.isUpdatingTiebreaker.set(true);
    try {
      const newValue = event.checked ? activityType : null;
      const { error } = await this.serverService.setTiebreakerActivity(newValue);
      if (error) throw error;
    } catch (error) {
      console.error('Error updating tiebreaker activity:', error);
      this.snackbarService.error(this.translate.instant('server.settings.pointRules.tiebreakerFailed'));
    } finally {
      this.isUpdatingTiebreaker.set(false);
    }
  }

  protected async deleteAllActivities(): Promise<void> {
    const confirmed = await firstValueFrom(
      this.dialog
        .open(ConfirmDialogComponent, {
          data: {
            title: this.translate.instant('server.settings.dangerZone.title'),
            message: this.translate.instant('server.settings.dangerZone.deleteAllActivitiesConfirm'),
            confirmText: this.translate.instant('server.settings.dangerZone.deleteAllActivities'),
            cancelText: this.translate.instant('common.cancel'),
          },
        })
        .afterClosed()
    );

    if (!confirmed) return;

    this.isDeletingAll.set(true);
    try {
      const { error } = await this.activityService.deleteAllActivities();
      if (error) throw error;
      this.snackbarService.success(this.translate.instant('server.settings.dangerZone.deleteAllActivitiesSuccess'));
    } catch (error) {
      console.error('Error deleting all activities:', error);
      this.snackbarService.error(this.translate.instant('server.settings.dangerZone.deleteAllActivitiesFailed'));
    } finally {
      this.isDeletingAll.set(false);
    }
  }

  protected getActivityTypeLabel(value: string): string {
    const activityType = this.activityTypes.find(type => type.value === value);
    return activityType?.labelKey || value;
  }
}
