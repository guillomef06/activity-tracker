import { Component, input, computed, signal, inject, ChangeDetectionStrategy, DestroyRef } from '@angular/core';

import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { toSignal, takeUntilDestroyed } from '@angular/core/rxjs-interop';

import { ActivityService, SnackbarService } from '@app/core/services';
import { ServerService } from '@app/core/services/server.service';
import { SeasonService } from '@app/core/services/season.service';
import { APP_CONSTANTS, ActivityType } from '@app/shared/constants/constants';
import { getDateForWeeksAgo, getWeekStart, getWeekEnd } from '@app/shared/utils/date.util';
import { createFieldErrorSignal } from '@app/shared/utils/form-validation.utils';
import { LoadingButtonComponent } from '@app/shared/components/loading-button/loading-button.component';
import type { UserProfile } from '@app/shared/models';

interface WeekOption {
  value: number;
  label: string;
  dateRange: string;
}

@Component({
  selector: 'app-retroactive-activities-tab',
  imports: [
    ReactiveFormsModule,
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
  private readonly fb = inject(FormBuilder);
  private readonly destroyRef = inject(DestroyRef);

  // Inputs
  members = input.required<UserProfile[]>();

  // Form state
  isSubmitting = signal<boolean>(false);

  // Reactive form
  retroactiveForm: FormGroup = this.fb.group({
    member: ['', Validators.required],
    week: [0, Validators.required],
    activity: ['', Validators.required],
    position: [1, [Validators.required, Validators.min(1)]],
    participated: [false],
  });

  // Convert form value changes to signals
  private weekValue = toSignal(
    this.retroactiveForm.get('week')!.valueChanges.pipe(takeUntilDestroyed(this.destroyRef)),
    { initialValue: 0 }
  );

  private activityValue = toSignal(
    this.retroactiveForm.get('activity')!.valueChanges.pipe(takeUntilDestroyed(this.destroyRef)),
    { initialValue: '' }
  );

  private participatedValue = toSignal(
    this.retroactiveForm.get('participated')!.valueChanges.pipe(takeUntilDestroyed(this.destroyRef)),
    { initialValue: false }
  );

  private positionValue = toSignal(
    this.retroactiveForm.get('position')!.valueChanges.pipe(takeUntilDestroyed(this.destroyRef)),
    { initialValue: 1 }
  );

  // Participation mode (reactive)
  isParticipationMode = computed(() => {
    const type = this.activityValue();
    return type ? this.serverService.isParticipationMode(type) : false;
  });

  participationPoints = computed(() => {
    const type = this.activityValue();
    return type ? this.serverService.getParticipationPoints(type) : 5;
  });

  // Error signals for validation
  protected readonly memberError = createFieldErrorSignal(this.retroactiveForm, 'member', this.destroyRef);
  protected readonly activityError = createFieldErrorSignal(this.retroactiveForm, 'activity', this.destroyRef);
  protected readonly positionError = createFieldErrorSignal(this.retroactiveForm, 'position', this.destroyRef);

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
   * Computeds derived from this one also explicitly read weekValue() themselves
   * (rather than relying solely on this computed's output) so they still
   * re-evaluate even if SeasonService ever returns a referentially-stable array
   * across two different weeks.
   */
  private readonly seasonActivityTypes = computed<ActivityType[]>(() => {
    const targetDate = getWeekStart(getDateForWeeksAgo(this.weekValue() ?? 0));
    return this.seasonService.getAvailableActivityTypesForDate(targetDate);
  });

  /**
   * True when no season covers the currently selected week — submission must be
   * totally blocked (not merely "no activities enabled") in this state.
   */
  isBlockedForSelectedWeek = computed(() => {
    void this.weekValue(); // register signal dependency — see seasonActivityTypes note above
    return this.seasonActivityTypes().length === 0;
  });

  availableActivities = computed(() => {
    void this.weekValue(); // register signal dependency — see seasonActivityTypes note above
    return this.seasonActivityTypes().filter((type: ActivityType) => this.serverService.isActivityEnabled(type.value));
  });

  calculatedPoints = computed(() => {
    if (this.isParticipationMode()) {
      return this.activityValue() ? this.participationPoints() : 0;
    }

    const activity = APP_CONSTANTS.ACTIVITY_TYPES.find((t: ActivityType) => t.value === this.activityValue());
    if (!activity) return 0;

    const pos = this.positionValue() ?? 1;
    if (!pos || pos < 1) return 0;

    return Math.max(0, activity.points - (pos - 1));
  });

  canSubmit = computed(() => {
    if (this.isSubmitting()) return false;
    if (this.isBlockedForSelectedWeek()) return false;
    const member = this.retroactiveForm.get('member')?.value;
    const activity = this.activityValue();
    if (!member || !activity) return false;
    if (this.isParticipationMode()) {
      return this.participatedValue();
    }
    return this.retroactiveForm.valid;
  });

  constructor() {
    // Clear activity and position when week changes
    this.retroactiveForm
      .get('week')
      ?.valueChanges.pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        this.retroactiveForm.patchValue(
          {
            activity: '',
            position: 1,
            participated: false,
          },
          { emitEvent: false }
        );
      });

    // Reset participated when activity changes
    this.retroactiveForm
      .get('activity')
      ?.valueChanges.pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        this.retroactiveForm.get('participated')?.setValue(false);
      });
  }

  async onSubmit(): Promise<void> {
    if (!this.canSubmit()) {
      this.retroactiveForm.markAllAsTouched();
      return;
    }

    this.isSubmitting.set(true);

    try {
      const formValue = this.retroactiveForm.value;
      const activityDate = getDateForWeeksAgo(formValue.week);

      await this.activityService.addActivityForMember(formValue.member, {
        activityType: formValue.activity,
        position: this.isParticipationMode() ? null : formValue.position,
        points: this.isParticipationMode() ? this.participationPoints() : undefined,
        date: activityDate,
      });

      this.snackbarService.success(this.translate.instant('server.retroactive.success'));

      // Reset form keeping member and week
      this.retroactiveForm.patchValue({
        activity: '',
        position: 1,
        participated: false,
      });
    } catch (error) {
      console.error('Error submitting retroactive activity:', error);
      this.snackbarService.error(this.translate.instant('server.retroactive.error'), 5000);
    } finally {
      this.isSubmitting.set(false);
    }
  }

  resetForm(): void {
    this.retroactiveForm.reset({
      member: '',
      week: 0,
      activity: '',
      position: 1,
      participated: false,
    });
  }
}
