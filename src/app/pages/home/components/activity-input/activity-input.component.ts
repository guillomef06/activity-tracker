import { Component, inject, ChangeDetectionStrategy, signal, computed } from '@angular/core';
import { form, FormField, required, min, disabled } from '@angular/forms/signals';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { ActivityService } from '@core/services/activity.service';
import { AuthService } from '@core/services/auth.service';
import { ServerService } from '@core/services/server.service';
import { SnackbarService } from '@core/services/snackbar.service';
import { SeasonService } from '@core/services/season.service';
import { ActivityType } from '@shared/constants/constants';
import { PointCalculationResult } from '@shared/models';
import { getFieldErrorKey } from '@shared/utils/form-validation.utils';
import { LoadingButtonComponent } from '@shared/components/loading-button/loading-button.component';
import { DiscordInviteBannerComponent } from '@app/pages/home/components/discord-invite-banner/discord-invite-banner.component';
import { ActivityConflictComponent } from '@app/pages/home/components/activity-conflict/activity-conflict.component';
import { getWeekStart, getDateForWeeksAgo, getWeekEnd } from '@shared/utils/date.util';

interface WeekOption {
  value: number;
  label: string;
  dateRange: string;
}

interface ActivityFormModel {
  week: number;
  activityType: string;
  position: number | null;
  participated: boolean;
}

const DEFAULT_ACTIVITY_FORM_MODEL: ActivityFormModel = {
  week: 0,
  activityType: '',
  position: null,
  participated: false,
};

const MAX_WEEKS_LOOKBACK = 5;
const MIN_POSITION = 1;
const DEFAULT_PARTICIPATION_POINTS = 5;

@Component({
  selector: 'app-activity-input',
  imports: [
    FormField,
    MatCardModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatButtonModule,
    MatIconModule,
    MatSlideToggleModule,
    TranslateModule,
    LoadingButtonComponent,
    DiscordInviteBannerComponent,
    ActivityConflictComponent,
  ],
  templateUrl: './activity-input.component.html',
  styleUrl: './activity-input.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ActivityInputComponent {
  private readonly activityService = inject(ActivityService);
  protected readonly authService = inject(AuthService);
  private readonly serverService = inject(ServerService);
  private readonly snackbarService = inject(SnackbarService);
  private readonly seasonService = inject(SeasonService);
  private readonly translate = inject(TranslateService);

  protected readonly isSubmitting = signal<boolean>(false);
  protected readonly conflictAcknowledged = signal<boolean>(false);

  // Explicitly reads activityService.activities (a Signal) to register the reactive dependency.
  // When activities updates, Angular invalidates this computed and the template re-evaluates.
  protected readonly conflicts = computed(() => {
    void this.activityService.activities(); // register signal dependency
    return this.activityService.getConflictsForCurrentUser();
  });

  /**
   * True when a conflict exists AND the user has acknowledged it but not yet resolved it.
   * In this state the form is visible but week/activityType/position fields are locked.
   */
  protected readonly isInForcedEditMode = computed(() => this.conflicts().length > 0 && this.conflictAcknowledged());

  /**
   * The week index (0 = current week, 1 = last week, …) for the first conflict's date.
   * Used to pre-fill the week selector when entering forced-edit mode.
   */
  protected readonly conflictWeekIndex = computed<number>(() => {
    const conflict = this.conflicts()[0];
    if (!conflict) return 0;
    const currentWeekStart = getWeekStart(new Date());
    const conflictWeekStart = getWeekStart(conflict.date);
    const diffMs = currentWeekStart.getTime() - conflictWeekStart.getTime();
    return Math.round(diffMs / (7 * 24 * 60 * 60 * 1000));
  });

  protected readonly activityModel = signal<ActivityFormModel>(DEFAULT_ACTIVITY_FORM_MODEL);

  protected readonly activityForm = form(this.activityModel, path => {
    required(path.week);
    required(path.activityType);
    required(path.position);
    min(path.position, MIN_POSITION);

    // Only the conflict forced-edit-mode actually locks these fields at the form level,
    // matching the original FormGroup's .disable()/.enable() contract. availableActivities
    // being empty and isBlockedForSelectedWeek are presentation-only concerns (empty option
    // list / banner) and must not exclude fields from validation.
    disabled(path.week, { when: () => this.isInForcedEditMode() });
    disabled(path.activityType, { when: () => this.isInForcedEditMode() });
    disabled(path.position, { when: () => this.isBlockedForSelectedWeek() });
  });

  private readonly weekValue = computed(() => this.activityModel().week);
  private readonly activityTypeValue = computed(() => this.activityModel().activityType);
  private readonly participatedValue = computed(() => this.activityModel().participated);
  private readonly positionValue = computed(() => this.activityModel().position);

  protected readonly isParticipationMode = computed(() => {
    const type = this.activityTypeValue();
    return type ? this.serverService.isParticipationMode(type) : false;
  });

  protected readonly participationPoints = computed(() => {
    const type = this.activityTypeValue();
    return type ? this.serverService.getParticipationPoints(type) : DEFAULT_PARTICIPATION_POINTS;
  });

  protected readonly calculatedPointsResult = computed<PointCalculationResult | null>(() => {
    if (this.isParticipationMode()) return null;
    const type = this.activityTypeValue();
    const position = this.positionValue();
    if (!type || position === null || position <= 0) return null;
    return this.serverService.calculatePoints(type, position);
  });

  protected readonly points = computed<number | null>(() => {
    if (this.isParticipationMode()) {
      return this.activityTypeValue() ? this.participationPoints() : null;
    }
    return this.calculatedPointsResult()?.points ?? null;
  });

  protected readonly canSubmit = computed(() => {
    if (this.isBlockedForSelectedWeek()) return false;
    const activityType = this.activityTypeValue();
    if (!activityType || this.activityForm.week().invalid()) return false;
    if (this.isParticipationMode()) {
      return this.participatedValue();
    }
    const position = this.positionValue();
    return position !== null && position >= MIN_POSITION;
  });

  protected readonly activityTypeError = computed(() => getFieldErrorKey(this.activityForm.activityType().errors()));
  protected readonly positionError = computed(() => getFieldErrorKey(this.activityForm.position().errors()));
  protected readonly discordInviteUrl = computed(() => this.serverService.server()?.discord_invite_url ?? null);

  protected readonly weekOptions = computed<WeekOption[]>(() => {
    const earliestAllowedDate = this.seasonService.getEarliestAllowedDate();
    if (!earliestAllowedDate) return [];

    const currentWeekLabel = this.translate.instant('server.retroactive.currentWeek');
    const weeksAgoLabel = this.translate.instant('server.retroactive.weeksAgo');
    const options: WeekOption[] = [];

    for (let i = 0; i <= MAX_WEEKS_LOOKBACK; i++) {
      const weekStart = getWeekStart(getDateForWeeksAgo(i));
      if (weekStart < earliestAllowedDate) break;
      const weekEnd = getWeekEnd(weekStart);
      const dateRange = `${weekStart.toLocaleDateString('en-US', { timeZone: 'UTC' })} - ${weekEnd.toLocaleDateString('en-US', { timeZone: 'UTC' })}`;

      options.push({
        value: i,
        label: i === 0 ? currentWeekLabel : weeksAgoLabel.replace('{{count}}', i.toString()),
        dateRange,
      });
    }

    return options;
  });

  /**
   * The activity types the current season assigns to the selected week, before
   * filtering by alliance-level enable/disable. An empty array here is the sole
   * "no season configured for this date" signal per SeasonService contract.
   */
  private readonly seasonActivityTypes = computed<ActivityType[]>(() => {
    const targetDate = getWeekStart(getDateForWeeksAgo(this.weekValue()));
    return this.seasonService.getAvailableActivityTypesForDate(targetDate);
  });

  /**
   * True when no season covers the currently selected week — submission must be
   * totally blocked (not merely "no activities enabled") in this state.
   *
   * Explicitly reads weekValue() itself (not solely through seasonActivityTypes()) so it
   * still re-evaluates even if SeasonService ever returns a referentially-stable array
   * across two different weeks — computed() only notifies dependents when the value it
   * produces actually changes by reference, not merely because a dependency was read.
   */
  protected readonly isBlockedForSelectedWeek = computed(() => {
    void this.weekValue();
    return this.seasonActivityTypes().length === 0;
  });

  protected readonly availableActivities = computed(() => {
    void this.weekValue(); // register signal dependency — see isBlockedForSelectedWeek note above
    return this.seasonActivityTypes().filter(type => this.serverService.isActivityEnabled(type.value));
  });

  /**
   * Resets dependent fields when the user changes the selected week, unless the
   * form is locked into forced-edit mode for an existing conflict.
   */
  protected onWeekChange(): void {
    if (this.isInForcedEditMode()) return;
    this.activityModel.update(current => ({ ...current, activityType: '', position: null, participated: false }));
  }

  /**
   * Resets the participation toggle when the activity type changes, unless the
   * form is locked into forced-edit mode for an existing conflict.
   */
  protected onActivityTypeChange(): void {
    if (this.isInForcedEditMode()) return;
    this.activityModel.update(current => ({ ...current, participated: false }));
  }

  protected async onSubmit(event: Event): Promise<void> {
    event.preventDefault();

    if (!this.canSubmit()) {
      this.activityForm().markAsTouched();
      this.snackbarService.error(this.translate.instant('activityInput.fillAllFields'));
      return;
    }

    this.isSubmitting.set(true);

    const formValue = this.activityModel();
    const currentWeekStart = getWeekStart(new Date());
    const activityDate = new Date(currentWeekStart);
    activityDate.setUTCDate(currentWeekStart.getUTCDate() - formValue.week * 7);

    const { error } = this.isParticipationMode()
      ? await this.activityService.addActivity({
          activityType: formValue.activityType,
          position: null,
          points: this.participationPoints(),
          date: activityDate,
        })
      : await this.activityService.addActivity({
          activityType: formValue.activityType,
          position: formValue.position as number,
          date: activityDate,
        });

    if (error) {
      this.snackbarService.error(this.translate.instant('activityInput.error'));
      this.isSubmitting.set(false);
      return;
    }

    // If the conflict is now resolved (signal becomes empty), return to normal mode.
    // The conflicts signal is re-evaluated after activities signal updates inside addActivity.
    // Fields locked by disabled() re-enable automatically once isInForcedEditMode recomputes to false.
    this.activityModel.update(current => ({ ...current, activityType: '', position: null, participated: false }));
    this.conflictAcknowledged.set(false);
    this.isSubmitting.set(false);

    this.snackbarService.success(this.translate.instant('activityInput.success'));
  }

  /**
   * Called when the user clicks "J'ai compris" on the conflict card.
   * Transitions to forced-edit mode: pre-fills the form with the conflicting
   * activity data. week/activityType/position lock and unlock automatically
   * via the schema's disabled() rules reacting to isInForcedEditMode.
   */
  protected onConflictAcknowledged(): void {
    const conflict = this.conflicts()[0];
    if (!conflict) return;

    this.activityModel.set({
      week: this.conflictWeekIndex(),
      activityType: conflict.activityType,
      position: conflict.position,
      participated: false,
    });

    this.conflictAcknowledged.set(true);
  }
}
