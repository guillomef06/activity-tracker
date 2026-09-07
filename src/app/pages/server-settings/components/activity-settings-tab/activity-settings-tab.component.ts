import { Component, inject, input, output, signal, computed, ChangeDetectionStrategy } from '@angular/core';
import { form, required, min, max, FormField } from '@angular/forms/signals';
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
import { MatExpansionModule } from '@angular/material/expansion';
import { SnackbarService } from '@app/core/services';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { ConfirmDialogComponent } from '@app/shared/components/confirm-dialog/confirm-dialog.component';
import { ServerService, PARTIAL_REPLACE_FAILURE_PREFIX } from '@app/core/services/server.service';
import { ActivityService } from '@app/core/services/activity.service';
import { getFieldErrorKey, validateMultipleOf } from '@app/shared/utils/form-validation.utils';
import { PositionRangePipe } from '@app/shared/pipes/position-range.pipe';
import { LoadingButtonComponent } from '@app/shared/components/loading-button/loading-button.component';
import type { ActivityPointRule, CreatePointRuleRequest, ServerActivitySettings } from '@app/shared/models';
import { APP_CONSTANTS } from '@app/shared/constants/constants';
import { firstValueFrom } from 'rxjs';

/** Range size must be a multiple of this step (admin-facing tranche generator). */
const RANGE_SIZE_STEP = 5;
/** Default form values — also used to reset the generator after a successful submit. */
const DEFAULT_RANGE_SIZE = 5;
const DEFAULT_POINTS = 10;
const DEFAULT_DECREASED_NEXT_RANGE_POINTS = 1;
/** Upper bounds on the tranche generator's numeric inputs, to cap client-side row generation. */
const MAX_POINTS = 10000;
const MAX_RANGE_SIZE = 1000;
const MIN_POINTS = 1;
const MIN_DECREASED_NEXT_RANGE_POINTS = 1;

/** One row of the grouped point rules table, keyed by activity type. */
interface PointRuleGroup {
  readonly activityType: string;
  readonly labelKey: string;
  readonly rules: readonly ActivityPointRule[];
}

/** Values driving tranche generation — mirrors the 3 numeric fields of `pointRuleForm`. */
interface TrancheGeneratorConfig {
  readonly range_size: number;
  readonly points: number;
  readonly decreased_next_range_points: number;
}

interface PointRuleFormModel {
  activity_type: string;
  range_size: number;
  points: number;
  decreased_next_range_points: number;
}

function defaultPointRuleModel(): PointRuleFormModel {
  return {
    activity_type: '',
    range_size: DEFAULT_RANGE_SIZE,
    points: DEFAULT_POINTS,
    decreased_next_range_points: DEFAULT_DECREASED_NEXT_RANGE_POINTS,
  };
}

@Component({
  selector: 'app-activity-settings-tab',
  imports: [
    FormField,
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
    MatExpansionModule,
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
  private readonly snackbarService = inject(SnackbarService);
  private readonly dialog = inject(MatDialog);
  private readonly translate = inject(TranslateService);

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
  protected readonly isDeletingByType = signal(false);
  protected readonly selectedTypeForDeletion = signal<string>('');
  protected readonly activityTypes = APP_CONSTANTS.ACTIVITY_TYPES;
  protected readonly previewColumns: string[] = ['positionRange', 'points'];
  protected readonly groupColumns: string[] = ['positionRange', 'points', 'actions'];

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

  protected readonly pointRuleModel = signal<PointRuleFormModel>(defaultPointRuleModel());

  protected readonly pointRuleForm = form(this.pointRuleModel, path => {
    required(path.activity_type);
    required(path.range_size);
    min(path.range_size, RANGE_SIZE_STEP);
    max(path.range_size, MAX_RANGE_SIZE);
    validateMultipleOf(path.range_size, RANGE_SIZE_STEP);
    required(path.points);
    min(path.points, MIN_POINTS);
    max(path.points, MAX_POINTS);
    required(path.decreased_next_range_points);
    min(path.decreased_next_range_points, MIN_DECREASED_NEXT_RANGE_POINTS);
  });

  // Error signals for validation
  protected readonly activityTypeError = computed(() =>
    this.pointRuleForm.activity_type().touched() ? getFieldErrorKey(this.pointRuleForm.activity_type().errors()) : ''
  );
  protected readonly rangeSizeError = computed(() =>
    this.pointRuleForm.range_size().touched()
      ? getFieldErrorKey(this.pointRuleForm.range_size().errors(), {
          multipleOf: 'server.settings.pointRules.rangeSizeMultipleError',
        })
      : ''
  );
  protected readonly pointsError = computed(() =>
    this.pointRuleForm.points().touched() ? getFieldErrorKey(this.pointRuleForm.points().errors()) : ''
  );
  protected readonly decreasedNextRangePointsError = computed(() =>
    this.pointRuleForm.decreased_next_range_points().touched()
      ? getFieldErrorKey(this.pointRuleForm.decreased_next_range_points().errors())
      : ''
  );

  // Live preview of the tranches that would be generated — empty while the 3 generator fields are invalid.
  // Signal Forms fields are already signals, so this reads pointRuleModel() directly — no
  // toSignal()/valueChanges bridge needed (see class doc comment on the Resource API decision).
  protected readonly trancheePreview = computed<CreatePointRuleRequest[]>(() => {
    const { activity_type, range_size, points, decreased_next_range_points } = this.pointRuleModel();
    if (!this.isGeneratorConfigValid()) {
      return [];
    }
    return ActivitySettingsTabComponent.generateTranches(activity_type, {
      range_size,
      points,
      decreased_next_range_points,
    });
  });

  // Existing rules for the currently selected activity type — non-empty means submit will replace them
  protected readonly existingRulesForSelectedType = computed<ActivityPointRule[]>(() => {
    const activityType = this.pointRuleModel().activity_type;
    if (!activityType) {
      return [];
    }
    return this.serverService.getRulesForActivityType(activityType);
  });

  // Point rules grouped by activity_type — pointRules() already arrives sorted by activity_type then position_min
  protected readonly groupedPointRules = computed<PointRuleGroup[]>(() => {
    const groups = new Map<string, ActivityPointRule[]>();
    for (const rule of this.pointRules()) {
      const existing = groups.get(rule.activity_type);
      if (existing) {
        existing.push(rule);
      } else {
        groups.set(rule.activity_type, [rule]);
      }
    }
    return Array.from(groups.entries()).map(([activityType, rules]) => ({
      activityType,
      labelKey: this.getActivityTypeLabel(activityType),
      rules,
    }));
  });

  private isGeneratorConfigValid(): boolean {
    return (
      this.pointRuleForm.range_size().valid() &&
      this.pointRuleForm.points().valid() &&
      this.pointRuleForm.decreased_next_range_points().valid()
    );
  }

  /**
   * Pure tranche generator: turns 3 numeric inputs into contiguous, non-overlapping point rules.
   * Tranche N (1-indexed) covers positions [(N-1)*range_size+1, N*range_size] with
   * points - (N-1)*decreased_next_range_points points. Stops before a tranche whose points
   * would drop to zero or below — guaranteed to terminate since decreased_next_range_points >= 1.
   */
  private static generateTranches(activityType: string, config: TrancheGeneratorConfig): CreatePointRuleRequest[] {
    const { range_size, points, decreased_next_range_points } = config;
    const tranches: CreatePointRuleRequest[] = [];
    let tranche = 1;
    let tranchePoints = points;

    while (tranchePoints > 0) {
      tranches.push({
        activity_type: activityType,
        position_min: (tranche - 1) * range_size + 1,
        position_max: tranche * range_size,
        points: tranchePoints,
      });
      tranche++;
      tranchePoints = points - (tranche - 1) * decreased_next_range_points;
    }

    return tranches;
  }

  protected async generateRules(): Promise<void> {
    if (this.pointRuleForm().invalid()) {
      this.pointRuleForm().markAsTouched();
      return;
    }

    const { activity_type, range_size, points, decreased_next_range_points } = this.pointRuleModel();
    const tranches = ActivitySettingsTabComponent.generateTranches(activity_type, {
      range_size,
      points,
      decreased_next_range_points,
    });

    const existingRules = this.serverService.getRulesForActivityType(activity_type);
    if (existingRules.length > 0) {
      const confirmed = await this.confirmReplaceExistingRules(existingRules.length);
      if (!confirmed) {
        return;
      }
    }

    await this.submitTranches(activity_type, tranches);
  }

  private async confirmReplaceExistingRules(count: number): Promise<boolean> {
    return firstValueFrom(
      this.dialog
        .open(ConfirmDialogComponent, {
          data: {
            title: this.translate.instant('server.settings.pointRules.replaceConfirmTitle'),
            message: this.translate.instant('server.settings.pointRules.replaceConfirmMessage', { count }),
          },
        })
        .afterClosed()
    );
  }

  private async submitTranches(activityType: string, tranches: CreatePointRuleRequest[]): Promise<void> {
    this.isSubmitting.set(true);
    try {
      const { error } = await this.serverService.replaceRulesForActivityType(activityType, tranches);

      if (error) {
        throw error;
      }

      this.snackbarService.success(this.translate.instant('server.settings.pointRules.generated'));

      this.pointRuleModel.set(defaultPointRuleModel());

      this.ruleCreated.emit();
    } catch (error) {
      console.error('Error generating point rules:', error);
      const isPartialFailure = error instanceof Error && error.message.startsWith(PARTIAL_REPLACE_FAILURE_PREFIX);
      this.snackbarService.error(
        isPartialFailure
          ? this.translate.instant('server.settings.pointRules.generatePartialFailed')
          : this.translate.instant('server.settings.pointRules.generateFailed'),
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

  protected async deleteActivitiesByType(): Promise<void> {
    const type = this.selectedTypeForDeletion();
    if (!type) return;

    const typeLabel = this.translate.instant(this.getActivityTypeLabel(type));

    const confirmed = await firstValueFrom(
      this.dialog
        .open(ConfirmDialogComponent, {
          data: {
            title: this.translate.instant('server.settings.dangerZone.title'),
            message: this.translate.instant('server.settings.dangerZone.deleteByTypeConfirm', { type: typeLabel }),
            confirmText: this.translate.instant('server.settings.dangerZone.deleteAllActivities'),
            cancelText: this.translate.instant('common.cancel'),
          },
        })
        .afterClosed()
    );

    if (!confirmed) return;

    this.isDeletingByType.set(true);
    try {
      const { error } = await this.activityService.deleteActivitiesByType(type);
      if (error) throw error;
      this.selectedTypeForDeletion.set('');
      this.snackbarService.success(
        this.translate.instant('server.settings.dangerZone.deleteByTypeSuccess', { type: typeLabel })
      );
    } catch (error) {
      console.error('Error deleting activities by type:', error);
      this.snackbarService.error(this.translate.instant('server.settings.dangerZone.deleteByTypeFailed'));
    } finally {
      this.isDeletingByType.set(false);
    }
  }

  protected getActivityTypeLabel(value: string): string {
    const activityType = this.activityTypes.find(type => type.value === value);
    return activityType?.labelKey || value;
  }
}
