import { Component, inject, input, output, signal, computed, ChangeDetectionStrategy, DestroyRef } from '@angular/core';
import { CommonModule } from '@angular/common';
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
import { PointRulesService } from '@app/core/services/point-rules.service';
import { AllianceActivitySettingsService } from '@app/core/services/alliance-activity-settings.service';
import { createFieldErrorSignal } from '@app/shared/utils/form-validation.utils';
import { PositionRangePipe } from '@app/shared/pipes/position-range.pipe';
import type { ActivityPointRule, AllianceActivitySettings } from '@app/shared/models';
import { APP_CONSTANTS } from '@app/shared/constants/constants';

@Component({
  selector: 'app-point-rules-tab',
  standalone: true,
  imports: [
    CommonModule,
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
  ],
  templateUrl: './point-rules-tab.component.html',
  styleUrl: './point-rules-tab.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class PointRulesTabComponent {
  private readonly pointRulesService = inject(PointRulesService);
  private readonly activitySettingsService = inject(AllianceActivitySettingsService);
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
  protected readonly activityTypes = APP_CONSTANTS.ACTIVITY_TYPES;
  protected readonly pointRuleColumns: string[] = ['activityType', 'positionRange', 'points', 'actions'];

  // Merged list of activity types with their current settings for the participation section
  protected readonly activitySettingsList = computed(() => {
    const settings = this.activitySettingsService.settings();
    const settingsMap = new Map<string, AllianceActivitySettings>(
      settings.map(s => [s.activity_type, s])
    );
    return this.activityTypes.map(type => ({
      type,
      setting: settingsMap.get(type.value)
    }));
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
      this.snackbarService.error(this.translate.instant('alliance.settings.pointRules.positionRangeError'));
      return;
    }

    this.isSubmitting.set(true);
    try {
      const { error } = await this.pointRulesService.createRule({
        activity_type: formValue.activity_type,
        position_min: formValue.position_min,
        position_max: formValue.position_max,
        points: formValue.points,
      });

      if (error) {
        throw error;
      }

      this.snackbarService.success(this.translate.instant('alliance.settings.pointRules.created'));

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
      this.snackbarService.error(error instanceof Error ? error.message : this.translate.instant('alliance.settings.pointRules.createFailed'), 5000);
    } finally {
      this.isSubmitting.set(false);
    }
  }

  protected async deletePointRule(id: string): Promise<void> {
    const confirmed = await this.dialog.open(ConfirmDialogComponent, {
      data: {
        message: this.translate.instant('alliance.settings.pointRules.deleteConfirm'),
      }
    }).afterClosed().toPromise();

    if (!confirmed) {
      return;
    }

    this.isSubmitting.set(true);
    try {
      const { error } = await this.pointRulesService.deleteRule(id);

      if (error) {
        throw error;
      }

      this.snackbarService.success(this.translate.instant('alliance.settings.pointRules.deleted'));

      // Notify parent to reload
      this.ruleDeleted.emit();
    } catch (error) {
      console.error('Error deleting point rule:', error);
      this.snackbarService.error(this.translate.instant('alliance.settings.pointRules.deleteFailed'));
    } finally {
      this.isSubmitting.set(false);
    }
  }

  protected async toggleParticipationMode(activityType: string, event: MatSlideToggleChange): Promise<void> {
    this.isUpdatingSetting.set(activityType);
    try {
      const currentPoints = this.activitySettingsService.getParticipationPoints(activityType);
      const { error } = await this.activitySettingsService.upsertSetting({
        activity_type: activityType,
        participation_mode: event.checked,
        participation_points: currentPoints
      });
      if (error) throw error;
    } catch (error) {
      console.error('Error toggling participation mode:', error);
      this.snackbarService.error(this.translate.instant('alliance.settings.pointRules.participationModeFailed'));
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
      const { error } = await this.activitySettingsService.upsertSetting({
        activity_type: activityType,
        participation_mode: true,
        participation_points: points
      });
      if (error) throw error;
    } catch (error) {
      console.error('Error updating participation points:', error);
      this.snackbarService.error(this.translate.instant('alliance.settings.pointRules.participationPointsFailed'));
    } finally {
      this.isUpdatingSetting.set(null);
    }
  }

  protected getActivityTypeLabel(value: string): string {
    const activityType = this.activityTypes.find(type => type.value === value);
    return activityType?.labelKey || value;
  }
}
