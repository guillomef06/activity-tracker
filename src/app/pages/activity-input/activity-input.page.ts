import { Component, inject, ChangeDetectionStrategy, signal, computed, effect } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar } from '@angular/material/snack-bar';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { ActivityService } from '../../core/services/activity.service';
import { AuthService } from '../../core/services/auth.service';
import { PointRulesService } from '../../core/services/point-rules.service';
import { APP_CONSTANTS } from '../../shared/constants/constants';
import { PointCalculationResult } from '../../shared/models';
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
    FormsModule,
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
  
  calculatedPointsResult = signal<PointCalculationResult | null>(null);
  points = computed(() => this.calculatedPointsResult()?.points ?? 0);
  selectedWeeksAgo = signal<number>(0); // 0 = current week, 1 = last week, ...
  activityType = signal<string>('');
  position = signal<number>(1);
  submitting = signal<boolean>(false);
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
    const selectedWeekNumber = getWeekNumberForWeeksAgo(this.selectedWeeksAgo());
    return APP_CONSTANTS.ACTIVITY_TYPES
      .filter(type => type.availableWeeks.includes(selectedWeekNumber));
  });
  
  constructor() {
    // Automatically calculate points when activity type, position, or week changes
    effect(() => {
      const type = this.activityType();
      const pos = this.position();
      // week is not needed, removed unused variable
      if (type && pos > 0) {
        const result = this.pointRulesService.calculatePoints(type, pos);
        this.calculatedPointsResult.set(result);
      } else {
        this.calculatedPointsResult.set(null);
      }
    });

    // Clear points, activity and position when week changes
    effect(() => {
      this.selectedWeeksAgo();
      this.calculatedPointsResult.set(null);
      this.activityType.set('');
      this.position.set(1);
    });
  }

  async onSubmit(): Promise<void> {
    if (!this.activityType() || this.position() <= 0) {
      this.snackBar.open('Please fill in all fields', 'Close', {
        duration: 3000,
        horizontalPosition: 'center',
        verticalPosition: 'top'
      });
      return;
    }

    this.submitting.set(true);

    // Calculate the date for the selected week (start of week)
    const currentWeekStart = getWeekStart(new Date());
    const activityDate = new Date(currentWeekStart);
    activityDate.setDate(currentWeekStart.getDate() - (this.selectedWeeksAgo() * 7));

    // Add activity with position and selected week date
    const { error } = await this.activityService.addActivity({
      activityType: this.activityType(),
      position: this.position(),
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

    // Reset form
    this.activityType.set('');
    this.position.set(1);
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
