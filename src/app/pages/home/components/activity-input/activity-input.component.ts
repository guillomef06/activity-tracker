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
import { ActivityService } from '../../../../core/services/activity.service';
import { AuthService } from '../../../../core/services/auth.service';
import { AllianceService } from '../../../../core/services/alliance.service';
import { SnackbarService } from '../../../../core/services/snackbar.service';
import { APP_CONSTANTS } from '../../../../shared/constants/constants';
import { PointCalculationResult } from '../../../../shared/models';
import { createFieldErrorSignal } from '../../../../shared/utils/form-validation.utils';
import { LoadingButtonComponent } from '../../../../shared/components/loading-button/loading-button.component';
import {
  getWeekNumberForWeeksAgo,
  getWeekStart,
  getDateForWeeksAgo,
  getWeekEnd,
} from '../../../../shared/utils/date.util';

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
  ],
  templateUrl: './activity-input.component.html',
  styleUrl: './activity-input.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ActivityInputComponent {
  private readonly activityService = inject(ActivityService);
  protected readonly authService = inject(AuthService);
  private readonly allianceService = inject(AllianceService);
  private readonly snackbarService = inject(SnackbarService);
  private readonly translate = inject(TranslateService);
  private readonly fb = inject(FormBuilder);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly isSubmitting = signal<boolean>(false);
  protected readonly calculatedPointsResult = signal<PointCalculationResult | null>(null);

  protected readonly activityForm: FormGroup = this.fb.group({
    week: [0, Validators.required],
    activityType: ['', Validators.required],
    position: [1, [Validators.required, Validators.min(1)]],
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

  protected readonly isParticipationMode = computed(() => {
    const type = this.activityTypeValue();
    return type ? this.allianceService.isParticipationMode(type) : false;
  });

  protected readonly participationPoints = computed(() => {
    const type = this.activityTypeValue();
    return type ? this.allianceService.getParticipationPoints(type) : 5;
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
    const position = this.activityForm.get('position')?.value;
    return position >= 1;
  });

  protected readonly activityTypeError = createFieldErrorSignal(this.activityForm, 'activityType', this.destroyRef);
  protected readonly positionError = createFieldErrorSignal(this.activityForm, 'position', this.destroyRef);

  protected readonly weekOptions = computed<WeekOption[]>(() => {
    const currentWeekLabel = this.translate.instant('alliance.retroactive.currentWeek');
    const weeksAgoLabel = this.translate.instant('alliance.retroactive.weeksAgo');
    const options: WeekOption[] = [];

    for (let i = 0; i <= 5; i++) {
      const date = getDateForWeeksAgo(i);
      const weekStart = getWeekStart(date);
      const weekEnd = getWeekEnd(date);
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
      type => type.availableWeeks.includes(selectedWeekNumber) && this.allianceService.isActivityEnabled(type.value)
    );
  });

  constructor() {
    this.activityForm.valueChanges.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {
      const type = this.activityForm.value.activityType;
      const pos = this.activityForm.value.position;
      if (type && pos > 0 && !this.isParticipationMode()) {
        const result = this.allianceService.calculatePoints(type, pos);
        this.calculatedPointsResult.set(result);
      } else {
        this.calculatedPointsResult.set(null);
      }
    });

    this.activityForm
      .get('week')
      ?.valueChanges.pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        this.calculatedPointsResult.set(null);
        this.activityForm.patchValue({ activityType: '', position: 1, participated: false }, { emitEvent: false });
      });

    this.activityForm
      .get('activityType')
      ?.valueChanges.pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        this.activityForm.get('participated')?.setValue(false);
        this.calculatedPointsResult.set(null);
      });
  }

  protected async onSubmit(): Promise<void> {
    if (!this.canSubmit()) {
      this.activityForm.markAllAsTouched();
      this.snackbarService.error(this.translate.instant('activityInput.fillAllFields'));
      return;
    }

    this.isSubmitting.set(true);

    const formValue = this.activityForm.value;
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

    this.activityForm.patchValue({ activityType: '', position: 1, participated: false });
    this.activityForm.markAsUntouched();
    this.activityForm.markAsPristine();
    this.calculatedPointsResult.set(null);
    this.isSubmitting.set(false);

    this.snackbarService.success(this.translate.instant('activityInput.success'));
  }
}
