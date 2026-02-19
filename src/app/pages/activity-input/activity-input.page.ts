import { Component, inject, ChangeDetectionStrategy, signal, computed, DestroyRef, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { SnackbarService } from '../../core/services/snackbar.service';
import { toSignal, takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivityService } from '../../core/services/activity.service';
import { AuthService } from '../../core/services/auth.service';
import { PointRulesService } from '../../core/services/point-rules.service';
import { AllianceActivitySettingsService } from '../../core/services/alliance-activity-settings.service';
import { APP_CONSTANTS } from '../../shared/constants/constants';
import { PointCalculationResult } from '../../shared/models';
import { createFieldErrorSignal } from '../../shared/utils/form-validation.utils';
import { LoadingButtonComponent } from '../../shared/components/loading-button/loading-button.component';
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
    MatSlideToggleModule,
    TranslateModule,
    LoadingButtonComponent,
  ],
  templateUrl: './activity-input.page.html',
  styleUrl: './activity-input.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})

export class ActivityInputPage implements OnInit {
    async ngOnInit(): Promise<void> {
      // Charge les activitySettings à chaque affichage de la page
      await this.activitySettingsService.loadSettings();
    }
  private activityService = inject(ActivityService);
  authService = inject(AuthService);
  private pointRulesService = inject(PointRulesService);
  private activitySettingsService = inject(AllianceActivitySettingsService);
  private router = inject(Router);
  private translate = inject(TranslateService);
  private snackbarService = inject(SnackbarService);
  private fb = inject(FormBuilder);
  private destroyRef = inject(DestroyRef);

  calculatedPointsResult = signal<PointCalculationResult | null>(null);
  isSubmitting = signal<boolean>(false);

  // Reactive form
  activityForm: FormGroup = this.fb.group({
    week: [0, Validators.required],
    activityType: ['', Validators.required],
    position: [1, [Validators.required, Validators.min(1)]],
    participated: [false]
  });

  // Convert form value changes to signals
  private weekValue = toSignal(
    this.activityForm.get('week')!.valueChanges.pipe(takeUntilDestroyed(this.destroyRef)),
    { initialValue: 0 }
  );

  private activityTypeValue = toSignal(
    this.activityForm.get('activityType')!.valueChanges.pipe(takeUntilDestroyed(this.destroyRef)),
    { initialValue: '' }
  );

  private participatedValue = toSignal(
    this.activityForm.get('participated')!.valueChanges.pipe(takeUntilDestroyed(this.destroyRef)),
    { initialValue: false }
  );

  // Participation mode (reactive: re-evaluates when settings or activityType changes)
  isParticipationMode = computed(() => {
    const type = this.activityTypeValue();
    return type ? this.activitySettingsService.isParticipationMode(type) : false;
  });

  participationPoints = computed(() => {
    const type = this.activityTypeValue();
    return type ? this.activitySettingsService.getParticipationPoints(type) : 5;
  });

  // Points to display: participation points or calculated points
  points = computed<number | null>(() => {
    if (this.isParticipationMode()) {
      return this.activityTypeValue() ? this.participationPoints() : null;
    }
    return this.calculatedPointsResult()?.points ?? null;
  });

  // Submit is valid when required fields are filled and participation toggle is on (if applicable)
  canSubmit = computed(() => {
    const activityType = this.activityTypeValue();
    if (!activityType || this.activityForm.get('week')?.invalid) return false;
    if (this.isParticipationMode()) {
      return this.participatedValue();
    }
    const position = this.activityForm.get('position')?.value;
    return position >= 1;
  });

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
    // Calculate points when activity type or position changes (normal mode only)
    this.activityForm.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        const type = this.activityForm.value.activityType;
        const pos = this.activityForm.value.position;
        if (type && pos > 0 && !this.isParticipationMode()) {
          const result = this.pointRulesService.calculatePoints(type, pos);
          this.calculatedPointsResult.set(result);
        } else {
          this.calculatedPointsResult.set(null);
        }
      });

    // Clear activity selection when week changes
    this.activityForm.get('week')?.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        this.calculatedPointsResult.set(null);
        this.activityForm.patchValue({
          activityType: '',
          position: 1,
          participated: false
        }, { emitEvent: false });
      });

    // Reset participation state when activity type changes
    this.activityForm.get('activityType')?.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        this.activityForm.get('participated')?.setValue(false);
        this.calculatedPointsResult.set(null);
      });
  }

  async onSubmit(): Promise<void> {
    if (!this.canSubmit()) {
      this.activityForm.markAllAsTouched();
      this.snackbarService.error(this.translate.instant('activityInput.fillAllFields'));
      return;
    }

    this.isSubmitting.set(true);

    const formValue = this.activityForm.value;

    // Calculate the date for the selected week (start of week)
    const currentWeekStart = getWeekStart(new Date());
    const activityDate = new Date(currentWeekStart);
    activityDate.setDate(currentWeekStart.getDate() - (formValue.week * 7));

    const { error } = this.isParticipationMode()
      ? await this.activityService.addActivity({
          activityType: formValue.activityType,
          position: null,
          points: this.participationPoints(),
          date: activityDate
        })
      : await this.activityService.addActivity({
          activityType: formValue.activityType,
          position: formValue.position as number,
          date: activityDate
        });

    if (error) {
      this.snackbarService.error(this.translate.instant('activityInput.error'));
      this.isSubmitting.set(false);
      return;
    }

    // Reset form keeping the week selection
    this.activityForm.patchValue({
      activityType: '',
      position: 1,
      participated: false
    });
    this.activityForm.markAsUntouched();
    this.activityForm.markAsPristine();
    this.calculatedPointsResult.set(null);
    this.isSubmitting.set(false);

    this.snackbarService.success(this.translate.instant('activityInput.success'));
  }

  viewDashboard(): void {
    this.router.navigate(['/management-dashboard']);
  }
}
