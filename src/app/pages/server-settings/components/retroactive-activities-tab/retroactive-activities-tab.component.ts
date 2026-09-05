import { Component, input, computed, signal, inject, effect, untracked, ChangeDetectionStrategy } from '@angular/core';
import { form, required, min, disabled, FormField } from '@angular/forms/signals';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { TranslateModule, TranslateService } from '@ngx-translate/core';

import { ActivityService, SnackbarService } from '@app/core/services';
import { ServerService } from '@app/core/services/server.service';
import { SeasonService } from '@app/core/services/season.service';
import { APP_CONSTANTS, ActivityType } from '@app/shared/constants/constants';
import { getDateForWeeksAgo, getWeekStart, getWeekEnd } from '@app/shared/utils/date.util';
import { getFieldErrorKey } from '@app/shared/utils/form-validation.utils';
import { LoadingButtonComponent } from '@app/shared/components/loading-button/loading-button.component';
import type { UserProfile } from '@app/shared/models';

const DEFAULT_POSITION = 1;
const MIN_POSITION = 1;
const DEFAULT_PARTICIPATION_POINTS = 5;

interface WeekOption {
  value: number;
  label: string;
  dateRange: string;
}

interface RetroactiveFormModel {
  member: string;
  week: number;
  activity: string;
  position: number;
  participated: boolean;
}

function defaultRetroactiveModel(): RetroactiveFormModel {
  return { member: '', week: 0, activity: '', position: DEFAULT_POSITION, participated: false };
}

@Component({
  selector: 'app-retroactive-activities-tab',
  imports: [
    FormField,
    MatCardModule,
    MatFormFieldModule,
    MatSelectModule,
    MatInputModule,
    MatButtonModule,
    MatIconModule,
    MatSlideToggleModule,
    TranslateModule,
    LoadingButtonComponent,
  ],
  templateUrl: './retroactive-activities-tab.component.html',
  styleUrl: './retroactive-activities-tab.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RetroactiveActivitiesTabComponent {
  private readonly activityService = inject(ActivityService);
  private readonly serverService = inject(ServerService);
  private readonly seasonService = inject(SeasonService);
  private readonly translate = inject(TranslateService);
  private readonly snackbarService = inject(SnackbarService);

  // Inputs
  members = input.required<UserProfile[]>();

  // Form state
  isSubmitting = signal<boolean>(false);

  // Signal Forms model and field tree
  protected readonly retroactiveModel = signal<RetroactiveFormModel>(defaultRetroactiveModel());
  protected readonly retroactiveForm = form(this.retroactiveModel, path => {
    required(path.member);
    required(path.week);
    required(path.activity);
    disabled(path.activity, {
      when: () => this.availableActivities().length === 0 || this.isBlockedForSelectedWeek(),
    });
    required(path.position);
    min(path.position, MIN_POSITION);
    disabled(path.position, { when: () => this.isBlockedForSelectedWeek() });
  });

  // Participation mode (reactive)
  isParticipationMode = computed(() => {
    const type = this.retroactiveModel().activity;
    return type ? this.serverService.isParticipationMode(type) : false;
  });

  participationPoints = computed(() => {
    const type = this.retroactiveModel().activity;
    return type ? this.serverService.getParticipationPoints(type) : DEFAULT_PARTICIPATION_POINTS;
  });

  // Error signals for validation
  protected readonly memberError = computed(() =>
    this.retroactiveForm.member().touched() ? getFieldErrorKey(this.retroactiveForm.member().errors()) : ''
  );
  protected readonly activityError = computed(() =>
    this.retroactiveForm.activity().touched() ? getFieldErrorKey(this.retroactiveForm.activity().errors()) : ''
  );
  protected readonly positionError = computed(() =>
    this.retroactiveForm.position().touched() ? getFieldErrorKey(this.retroactiveForm.position().errors()) : ''
  );

  // Computed values
  readonly scoringWeeks = computed(() => this.serverService.scoringWeeks());

  weekOptions = computed<WeekOption[]>(() => {
    const earliestAllowedDate = this.seasonService.getEarliestAllowedDate();
    if (!earliestAllowedDate) return [];

    const options: WeekOption[] = [];
    const currentWeekLabel = this.translate.instant('server.retroactive.currentWeek');
    const weeksAgoLabel = this.translate.instant('server.retroactive.weeksAgo');
    const totalWeeks = this.scoringWeeks();

    for (let i = 0; i < totalWeeks; i++) {
      const date = getDateForWeeksAgo(i);
      const weekStart = getWeekStart(date);
      if (weekStart < earliestAllowedDate) break;
      const weekEnd = getWeekEnd(date);
      const dateRange = `${weekStart.toLocaleDateString()} - ${weekEnd.toLocaleDateString()}`;

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
   *
   * `equal: () => false` forces this to always be treated as "changed" on recompute —
   * without it, a season service returning a referentially-stable array across two
   * different weeks (e.g. a constant mock, or a real implementation caching by content)
   * would make Angular's `computed()` skip notifying `isBlockedForSelectedWeek` and
   * `availableActivities` below, leaving them stale after a week change.
   */
  private readonly seasonActivityTypes = computed<ActivityType[]>(
    () => {
      const targetDate = getWeekStart(getDateForWeeksAgo(this.retroactiveModel().week));
      return this.seasonService.getAvailableActivityTypesForDate(targetDate);
    },
    { equal: () => false }
  );

  /**
   * True when no season covers the currently selected week — submission must be
   * totally blocked (not merely "no activities enabled") in this state.
   */
  isBlockedForSelectedWeek = computed(() => this.seasonActivityTypes().length === 0);

  availableActivities = computed(() =>
    this.seasonActivityTypes().filter((type: ActivityType) => this.serverService.isActivityEnabled(type.value))
  );

  calculatedPoints = computed(() => {
    const model = this.retroactiveModel();
    if (this.isParticipationMode()) {
      return model.activity ? this.participationPoints() : 0;
    }

    const activity = APP_CONSTANTS.ACTIVITY_TYPES.find((t: ActivityType) => t.value === model.activity);
    if (!activity) return 0;

    const pos = model.position ?? DEFAULT_POSITION;
    if (!pos || pos < MIN_POSITION) return 0;

    return Math.max(0, activity.points - (pos - 1));
  });

  canSubmit = computed(() => {
    if (this.isSubmitting()) return false;
    if (this.isBlockedForSelectedWeek()) return false;
    const model = this.retroactiveModel();
    if (!model.member || !model.activity) return false;
    if (this.isParticipationMode()) {
      return model.participated;
    }
    return this.retroactiveForm().valid();
  });

  constructor() {
    // Clear activity and position when the selected week changes
    effect(() => {
      this.retroactiveForm.week().value();
      untracked(() => {
        this.retroactiveModel.update(current => ({
          ...current,
          activity: '',
          position: DEFAULT_POSITION,
          participated: false,
        }));
      });
    });

    // Reset participated when activity changes
    effect(() => {
      this.retroactiveForm.activity().value();
      untracked(() => {
        this.retroactiveModel.update(current => ({ ...current, participated: false }));
      });
    });
  }

  async onSubmit(): Promise<void> {
    if (!this.canSubmit()) {
      this.retroactiveForm().markAsTouched();
      return;
    }

    this.isSubmitting.set(true);

    try {
      const model = this.retroactiveModel();
      const activityDate = getDateForWeeksAgo(model.week);

      await this.activityService.addActivityForMember(model.member, {
        activityType: model.activity,
        position: this.isParticipationMode() ? null : model.position,
        points: this.isParticipationMode() ? this.participationPoints() : undefined,
        date: activityDate,
      });

      this.snackbarService.success(this.translate.instant('server.retroactive.success'));

      // Reset form keeping member and week
      this.retroactiveModel.update(current => ({
        ...current,
        activity: '',
        position: DEFAULT_POSITION,
        participated: false,
      }));
    } catch (error) {
      console.error('Error submitting retroactive activity:', error);
      this.snackbarService.error(this.translate.instant('server.retroactive.error'), 5000);
    } finally {
      this.isSubmitting.set(false);
    }
  }

  resetForm(): void {
    this.retroactiveModel.set(defaultRetroactiveModel());
  }
}
