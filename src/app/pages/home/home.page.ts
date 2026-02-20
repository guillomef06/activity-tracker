import {
  Component,
  inject,
  ChangeDetectionStrategy,
  signal,
  computed,
  DestroyRef,
  OnInit,
} from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatChipsModule } from '@angular/material/chips';
import { MatBadgeModule } from '@angular/material/badge';
import { NgClass } from '@angular/common';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { toSignal, takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivityService } from '../../core/services/activity.service';
import { AuthService } from '../../core/services/auth.service';
import { PointRulesService } from '../../core/services/point-rules.service';
import { AllianceActivitySettingsService } from '../../core/services/alliance-activity-settings.service';
import { ProgressBarService } from '../../core/services/progress-bar.service';
import { SnackbarService } from '../../core/services/snackbar.service';
import { APP_CONSTANTS } from '../../shared/constants/constants';
import { PointCalculationResult } from '../../shared/models';
import { UserScore } from '../../shared/models/activity.model';
import { createFieldErrorSignal } from '../../shared/utils/form-validation.utils';
import { LoadingButtonComponent } from '../../shared/components/loading-button/loading-button.component';
import { ActivityLabelPipe } from '../../shared/pipes/activity-label.pipe';
import { WeekLabelPipe } from '../../shared/pipes/week-label.pipe';
import { ShortDatePipe } from '../../shared/pipes/short-date.pipe';
import {
  getWeekNumberForWeeksAgo,
  getWeekStart,
  getDateForWeeksAgo,
  getWeekEnd,
} from '../../shared/utils/date.util';

interface WeekOption {
  value: number;
  label: string;
  dateRange: string;
}

@Component({
  selector: 'app-home-page',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    NgClass,
    MatCardModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatButtonModule,
    MatIconModule,
    MatSlideToggleModule,
    MatExpansionModule,
    MatChipsModule,
    MatBadgeModule,
    TranslateModule,
    LoadingButtonComponent,
    ActivityLabelPipe,
    WeekLabelPipe,
    ShortDatePipe,
  ],
  templateUrl: './home.page.html',
  styleUrl: './home.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HomePage implements OnInit {
  private readonly activityService = inject(ActivityService);
  readonly authService = inject(AuthService);
  private readonly pointRulesService = inject(PointRulesService);
  private readonly activitySettingsService = inject(AllianceActivitySettingsService);
  private readonly progressBarService = inject(ProgressBarService);
  private readonly snackbarService = inject(SnackbarService);
  private readonly translate = inject(TranslateService);
  private readonly fb = inject(FormBuilder);
  private readonly destroyRef = inject(DestroyRef);

  // ── Scores (reactive: auto-updates when activities signal changes) ──
  readonly userScores = computed<UserScore[]>(() => this.activityService.getUserScores());

  // TrackBy functions for performance
  readonly trackByUserId = (_index: number, user: UserScore) => user.userId;
  readonly trackByIndex = (index: number) => index;

  protected readonly selectedUserId = signal<string | null>(null);

  // ── Form ──
  readonly calculatedPointsResult = signal<PointCalculationResult | null>(null);
  readonly isSubmitting = signal<boolean>(false);

  readonly activityForm: FormGroup = this.fb.group({
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

  readonly isParticipationMode = computed(() => {
    const type = this.activityTypeValue();
    return type ? this.activitySettingsService.isParticipationMode(type) : false;
  });

  readonly participationPoints = computed(() => {
    const type = this.activityTypeValue();
    return type ? this.activitySettingsService.getParticipationPoints(type) : 5;
  });

  readonly points = computed<number | null>(() => {
    if (this.isParticipationMode()) {
      return this.activityTypeValue() ? this.participationPoints() : null;
    }
    return this.calculatedPointsResult()?.points ?? null;
  });

  readonly canSubmit = computed(() => {
    const activityType = this.activityTypeValue();
    if (!activityType || this.activityForm.get('week')?.invalid) return false;
    if (this.isParticipationMode()) {
      return this.participatedValue();
    }
    const position = this.activityForm.get('position')?.value;
    return position >= 1;
  });

  protected readonly activityTypeError = createFieldErrorSignal(
    this.activityForm,
    'activityType',
    this.destroyRef
  );
  protected readonly positionError = createFieldErrorSignal(
    this.activityForm,
    'position',
    this.destroyRef
  );

  readonly weekOptions = computed<WeekOption[]>(() => {
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
        dateRange,
      });
    }

    return options;
  });

  readonly availableActivities = computed(() => {
    const selectedWeekNumber = getWeekNumberForWeeksAgo(this.weekValue() ?? 0);
    return APP_CONSTANTS.ACTIVITY_TYPES.filter(type =>
      type.availableWeeks.includes(selectedWeekNumber)
    );
  });

  constructor() {
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

    this.activityForm.get('week')?.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        this.calculatedPointsResult.set(null);
        this.activityForm.patchValue(
          { activityType: '', position: 1, participated: false },
          { emitEvent: false }
        );
      });

    this.activityForm.get('activityType')?.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        this.activityForm.get('participated')?.setValue(false);
        this.calculatedPointsResult.set(null);
      });
  }

  async ngOnInit(): Promise<void> {
    await this.progressBarService.withProgress(async () => {
      await Promise.all([
        this.activitySettingsService.loadSettings(),
        this.activityService.initialize(),
      ]);
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
    const currentWeekStart = getWeekStart(new Date());
    const activityDate = new Date(currentWeekStart);
    activityDate.setDate(currentWeekStart.getDate() - formValue.week * 7);

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

  protected toggleUserDetails(userId: string): void {
    this.selectedUserId.update(current => (current === userId ? null : userId));
  }
}
