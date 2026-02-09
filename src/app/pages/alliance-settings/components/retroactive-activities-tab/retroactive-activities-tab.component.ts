import { Component, input, computed, signal, inject, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { MatSnackBar } from '@angular/material/snack-bar';

import { ActivityService } from '@app/core/services';
import { APP_CONSTANTS, ActivityType } from '@app/shared/constants/constants';
import { getWeekNumberForWeeksAgo, getDateForWeeksAgo, getWeekStart, getWeekEnd } from '@app/shared/utils/date.util';
import type { UserProfile } from '@app/shared/models';

interface WeekOption {
  value: number;
  label: string;
  dateRange: string;
}

@Component({
  selector: 'app-retroactive-activities-tab',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatCardModule,
    MatFormFieldModule,
    MatSelectModule,
    MatInputModule,
    MatButtonModule,
    MatIconModule,
    TranslateModule,
  ],
  templateUrl: './retroactive-activities-tab.component.html',
  styleUrl: './retroactive-activities-tab.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class RetroactiveActivitiesTabComponent {
  private readonly activityService = inject(ActivityService);
  private readonly translate = inject(TranslateService);
  private readonly snackBar = inject(MatSnackBar);

  // Inputs
  members = input.required<UserProfile[]>();

  // Form state - Initialize selectedWeeksAgo to 0 to ensure activities load immediately
  selectedMember = signal<string>('');
  selectedWeeksAgo = signal<number>(0);
  selectedActivity = signal<string>('');
  position = signal<number>(1);
  isSubmitting = signal<boolean>(false);

  // Computed values
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

  availableActivities = computed(() => {
    const weekNumber = getWeekNumberForWeeksAgo(this.selectedWeeksAgo());
    return APP_CONSTANTS.ACTIVITY_TYPES
      .filter((type: ActivityType) => type.availableWeeks.includes(weekNumber))
      .map((type: ActivityType) => ({
        ...type,
        label: this.translate.instant(type.labelKey)
      }));
  });

  calculatedPoints = computed(() => {
    const activity = APP_CONSTANTS.ACTIVITY_TYPES.find((t: ActivityType) => t.value === this.selectedActivity());
    if (!activity) return 0;
    
    const pos = this.position();
    if (!pos || pos < 1) return 0;
    
    return Math.max(0, activity.points - (pos - 1));
  });

  canSubmit = computed(() => {
    return this.selectedMember() !== '' && 
           this.selectedActivity() !== '' && 
           this.position() >= 1 &&
           !this.isSubmitting();
  });

  async onSubmit(): Promise<void> {
    if (!this.canSubmit()) return;

    this.isSubmitting.set(true);

    try {
      const activityDate = getDateForWeeksAgo(this.selectedWeeksAgo());
      
      await this.activityService.addActivityForMember(this.selectedMember(), {
        activityType: this.selectedActivity(),
        position: this.position(),
        date: activityDate
      });

      this.snackBar.open(
        this.translate.instant('alliance.retroactive.success'),
        this.translate.instant('common.close'),
        { duration: 3000 }
      );

      // Reset form
      this.selectedActivity.set('');
      this.position.set(1);

    } catch (error) {
      console.error('Error submitting retroactive activity:', error);
      this.snackBar.open(
        this.translate.instant('alliance.retroactive.error'),
        this.translate.instant('common.close'),
        { duration: 5000 }
      );
    } finally {
      this.isSubmitting.set(false);
    }
  }

  resetForm(): void {
    this.selectedMember.set('');
    this.selectedWeeksAgo.set(0);
    this.selectedActivity.set('');
    this.position.set(1);
  }
}
