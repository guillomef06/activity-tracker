import { Component, inject, ChangeDetectionStrategy, signal, computed, DestroyRef } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { toSignal, takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivityService } from '@core/services/activity.service';
import { AuthService } from '@core/services/auth.service';
import { ServerService } from '@core/services/server.service';
import { SnackbarService } from '@core/services/snackbar.service';
import { APP_CONSTANTS } from '@shared/constants/constants';
import { PointCalculationResult } from '@shared/models';
import { createFieldErrorSignal } from '@shared/utils/form-validation.utils';
import { LoadingButtonComponent } from '@shared/components/loading-button/loading-button.component';
import { DiscordInviteBannerComponent } from '@app/pages/home/components/discord-invite-banner/discord-invite-banner.component';
import { ActivityConflictComponent } from '@app/pages/home/components/activity-conflict/activity-conflict.component';
import {
  getWeekNumberForWeeksAgo,
  getWeekStart,
  getDateForWeeksAgo,
  getWeekEnd,
  CYCLE_REFERENCE_DATE,
} from '@shared/utils/date.util';

interface WeekOption {
  value: number;
  label: string;
  dateRange: string;
}

@Component({
  selector: 'app-activity-input',
  imports: [
    ReactiveFormsModule,
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
  private readonly translate = inject(TranslateService);
  private readonly fb = inject(FormBuilder);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly isSubmitting = signal<boolean>(false);
  protected readonly calculatedPointsResult = signal<PointCalculationResult | null>(null);
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

  protected readonly activityForm: FormGroup = this.fb.group({
    week: [0, Validators.required],
    activityType: ['', Validators.required],
    position: [null, [Validators.required, Validators.min(1)]],
    participated: [false],
  });

  private readonly weekValue = toSignal(
    this.activityForm.get('week')!.valueChanges.pipe(takeUntilDestroyed(this.destroyRef)),
    { initialValue: 0 }
  );

  private readonly activityTypeValue = toSignal(
    this.activityForm.get('activityType')!.valueChanges.pipe(takeUntilDestroyed(this.destroyRef)),
    { initialValue: '' }
  );

  private readonly participatedValue = toSignal(
    this.activityForm.get('participated')!.valueChanges.pipe(takeUntilDestroyed(this.destroyRef)),
    { initialValue: false }
  );

  private readonly positionValue = toSignal(
    this.activityForm.get('position')!.valueChanges.pipe(takeUntilDestroyed(this.destroyRef)),
    { initialValue: null as number | null }
  );

  protected readonly isParticipationMode = computed(() => {
    const type = this.activityTypeValue();
    return type ? this.serverService.isParticipationMode(type) : false;
  });

  protected readonly participationPoints = computed(() => {
    const type = this.activityTypeValue();
    return type ? this.serverService.getParticipationPoints(type) : 5;
  });

  protected readonly points = computed<number | null>(() => {
    if (this.isParticipationMode()) {
      return this.activityTypeValue() ? this.participationPoints() : null;
    }
    return this.calculatedPointsResult()?.points ?? null;
  });

  protected readonly canSubmit = computed(() => {
    const activityType = this.activityTypeValue();
    if (!activityType || this.activityForm.get('week')?.invalid) return false;
    if (this.isParticipationMode()) {
      return this.participatedValue();
    }
    const position = this.positionValue();
    return position !== null && position >= 1;
  });

  protected readonly activityTypeError = createFieldErrorSignal(this.activityForm, 'activityType', this.destroyRef);
  protected readonly positionError = createFieldErrorSignal(this.activityForm, 'position', this.destroyRef);
  protected readonly discordInviteUrl = computed(() => this.serverService.server()?.discord_invite_url ?? null);

  protected readonly weekOptions = computed<WeekOption[]>(() => {
    const currentWeekLabel = this.translate.instant('server.retroactive.currentWeek');
    const weeksAgoLabel = this.translate.instant('server.retroactive.weeksAgo');
    const options: WeekOption[] = [];

    for (let i = 0; i <= 5; i++) {
      const weekStart = getWeekStart(getDateForWeeksAgo(i));
      if (weekStart < CYCLE_REFERENCE_DATE) break;
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

  protected readonly availableActivities = computed(() => {
    const selectedWeekNumber = getWeekNumberForWeeksAgo(this.weekValue() ?? 0);
    return APP_CONSTANTS.ACTIVITY_TYPES.filter(
      type => type.availableWeeks.includes(selectedWeekNumber) && this.serverService.isActivityEnabled(type.value)
    );
  });

  constructor() {
    this.activityForm.valueChanges.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {
      const type = this.activityForm.value.activityType;
      const pos = this.activityForm.value.position;
      if (type && pos > 0 && !this.isParticipationMode()) {
        const result = this.serverService.calculatePoints(type, pos);
        this.calculatedPointsResult.set(result);
      } else {
        this.calculatedPointsResult.set(null);
      }
    });

    this.activityForm
      .get('week')
      ?.valueChanges.pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        if (!this.isInForcedEditMode()) {
          this.calculatedPointsResult.set(null);
          this.activityForm.patchValue({ activityType: '', participated: false }, { emitEvent: false });
          // Emit separately so positionValue signal is updated
          this.activityForm.get('position')?.setValue(null);
        }
      });

    this.activityForm
      .get('activityType')
      ?.valueChanges.pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        if (!this.isInForcedEditMode()) {
          this.activityForm.get('participated')?.setValue(false);
          this.calculatedPointsResult.set(null);
        }
      });
  }

  protected async onSubmit(): Promise<void> {
    if (!this.canSubmit()) {
      this.activityForm.markAllAsTouched();
      this.snackbarService.error(this.translate.instant('activityInput.fillAllFields'));
      return;
    }

    this.isSubmitting.set(true);

    const formValue = this.activityForm.getRawValue();
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
    this.activityForm.patchValue({ activityType: '', position: null, participated: false });
    this.activityForm.markAsUntouched();
    this.activityForm.markAsPristine();
    this.calculatedPointsResult.set(null);
    this.conflictAcknowledged.set(false);
    this.isSubmitting.set(false);

    // Re-enable all form controls in case they were locked during forced-edit mode
    this.activityForm.get('week')?.enable({ emitEvent: false });
    this.activityForm.get('activityType')?.enable({ emitEvent: false });
    this.activityForm.get('position')?.enable({ emitEvent: false });

    this.snackbarService.success(this.translate.instant('activityInput.success'));
  }

  /**
   * Called when the user clicks "J'ai compris" on the conflict card.
   * Transitions to forced-edit mode: pre-fills the form with the conflicting
   * activity data and disables week/activityType/position so the user can only
   * correct the position.
   */
  protected onConflictAcknowledged(): void {
    const conflict = this.conflicts()[0];
    if (!conflict) return;

    const weekIndex = this.conflictWeekIndex();

    // Pre-fill form with the conflicting activity data
    this.activityForm.patchValue(
      {
        week: weekIndex,
        activityType: conflict.activityType,
        position: conflict.position,
        participated: false,
      },
      { emitEvent: true }
    );

    // Lock fields that identify the conflicting activity
    this.activityForm.get('week')?.disable({ emitEvent: false });
    this.activityForm.get('activityType')?.disable({ emitEvent: false });
    this.activityForm.get('position')?.enable({ emitEvent: false });

    this.conflictAcknowledged.set(true);
  }
}
