import { Component, inject, ChangeDetectionStrategy, signal, computed, DestroyRef } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar } from '@angular/material/snack-bar';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { toSignal, takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivityService } from '../../core/services/activity.service';
import { AuthService } from '../../core/services/auth.service';
import { PointRulesService } from '../../core/services/point-rules.service';
import { APP_CONSTANTS } from '../../shared/constants/constants';
import { PointCalculationResult } from '../../shared/models';
import { createFieldErrorSignal } from '../../shared/utils/form-validation.utils';
import {
  getWeekNumberForWeeksAgo,
  getWeekLabel as getWeekLabelUtil,
  getWeekStart, getDateForWeeksAgo, getWeekEnd
} from '../../shared/utils/date.util';

interface WeekOption {
  value: number;
  label: string;
  dateRange: string;
}

@Component({
  selector: 'app-activity-input-page',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    MatCardModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatButtonModule,
    MatIconModule,
    TranslateModule
  ],
  templateUrl: './activity-input.page.html',
  styleUrl: './activity-input.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ActivityInputPage {
  private activityService = inject(ActivityService);
  authService = inject(AuthService);
  private pointRulesService = inject(PointRulesService);
  private router = inject(Router);
  private snackBar = inject(MatSnackBar);
  private translate = inject(TranslateService);
  private fb = inject(FormBuilder);
  private destroyRef = inject(DestroyRef);

  calculatedPointsResult = signal<PointCalculationResult | null>(null);
  points = computed(() => this.calculatedPointsResult()?.points ?? 0);
  submitting = signal<boolean>(false);

  // Reactive form
  activityForm: FormGroup = this.fb.group({
    week: [0, Validators.required],
    activityType: ['', Validators.required],
    position: [1, [Validators.required, Validators.min(1)]]
  });

  // Convert form value changes to signals
  private weekValue = toSignal(
    this.activityForm.get('week')!.valueChanges.pipe(takeUntilDestroyed(this.destroyRef)),
    { initialValue: 0 }
  );

  // Error signals for validation
  protected readonly activityTypeError = createFieldErrorSignal(this.activityForm, 'activityType', this.destroyRef);
  protected readonly positionError = createFieldErrorSignal(this.activityForm, 'position', this.destroyRef);

  weekOptions = computed<WeekOption[]>(() => {
    const options: WeekOption[] = [];
    const currentWeekLabel = this.translate.instant('alliance.retroactive.currentWeek');
    const weeksAgoLabel = this.translate.instant('alliance.retroactive.weeksAgo');

    for (let i = 0; i <= 5; i++) {
      const date = getDateForWeeksAgo(i);
      const weekStart = getWeekStart(date);
      const weekEnd = getWeekEnd(date);
      const dateRange = `${weekStart.toLocaleDateString()} - ${weekEnd.toLocaleDateString()}`;

      options.push({
        value: i,
        label: i === 0 ? currentWeekLabel : weeksAgoLabel.replace('{{count}}', i.toString()),
        dateRange
      });
    }

    return options;
  });

  weekLabels = computed(() =>
    this.weekOptions().map(week => getWeekLabelUtil(week.value, this.translate))
  );

  // Filter activity types based on current week only
  availableActivities = computed(() => {
    const selectedWeekNumber = getWeekNumberForWeeksAgo(this.weekValue() ?? 0);
    return APP_CONSTANTS.ACTIVITY_TYPES
      .filter(type => type.availableWeeks.includes(selectedWeekNumber));
  });

  constructor() {
    // Automatically calculate points when activity type or position changes
    this.activityForm.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        const type = this.activityForm.value.activityType;
        const pos = this.activityForm.value.position;
        if (type && pos > 0) {
          const result = this.pointRulesService.calculatePoints(type, pos);
          this.calculatedPointsResult.set(result);
        } else {
          this.calculatedPointsResult.set(null);
        }
      });

    // Clear points, activity and position when week changes
    this.activityForm.get('week')?.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        this.calculatedPointsResult.set(null);
        this.activityForm.patchValue({
          activityType: '',
          position: 1
        }, { emitEvent: false });
      });
  }

  async onSubmit(): Promise<void> {
    if (this.activityForm.invalid) {
      this.activityForm.markAllAsTouched();
      this.snackBar.open('Please fill in all fields', 'Close', {
        duration: 3000,
        horizontalPosition: 'center',
        verticalPosition: 'top'
      });
      return;
    }

    this.submitting.set(true);

    const formValue = this.activityForm.value;

    // Calculate the date for the selected week (start of week)
    const currentWeekStart = getWeekStart(new Date());
    const activityDate = new Date(currentWeekStart);
    activityDate.setDate(currentWeekStart.getDate() - (formValue.week * 7));

    // Add activity with position and selected week date
    const { error } = await this.activityService.addActivity({
      activityType: formValue.activityType,
      position: formValue.position,
      date: activityDate
    });

    if (error) {
      this.snackBar.open(
        this.translate.instant('activityInput.error'),
        this.translate.instant('common.close'),
        {
          duration: 3000,
          horizontalPosition: 'center',
          verticalPosition: 'top',
          panelClass: ['error-snackbar']
        }
      );
      this.submitting.set(false);
      return;
    }

    // Reset form keeping the week selection
    this.activityForm.patchValue({
      activityType: '',
      position: 1
    });
    this.activityForm.markAsUntouched();
    this.activityForm.markAsPristine();
    this.calculatedPointsResult.set(null);
    this.submitting.set(false);

    this.snackBar.open(this.translate.instant('activityInput.success'), this.translate.instant('common.close'), {
      duration: 3000,
      horizontalPosition: 'center',
      verticalPosition: 'top'
    });
  }

  viewDashboard(): void {
    this.router.navigate(['/management-dashboard']);
  }
}
