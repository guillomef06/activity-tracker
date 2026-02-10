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
import { getCurrentWeekNumber } from '../../shared/utils/date.util';

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
  
  activityType = signal<string>('');
  position = signal<number>(1);
  submitting = signal<boolean>(false);
  calculatedPointsResult = signal<PointCalculationResult | null>(null);
  
  points = computed(() => this.calculatedPointsResult()?.points ?? 0);

  // Filter activity types based on current week only
  availableActivities = computed(() => {
    const currentWeek = getCurrentWeekNumber();
    return APP_CONSTANTS.ACTIVITY_TYPES
      .filter(type => type.availableWeeks.includes(currentWeek));
  });

  constructor() {
    // Automatically calculate points when activity type or position changes
    effect(() => {
      const type = this.activityType();
      const pos = this.position();
      
      if (type && pos > 0) {
        const result = this.pointRulesService.calculatePoints(type, pos);
        this.calculatedPointsResult.set(result);
      } else {
        this.calculatedPointsResult.set(null);
      }
    });
  }

  onActivityTypeChange(): void {
    // Points will be calculated automatically by the effect - no action needed
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

    // Add activity with position
    const { error } = await this.activityService.addActivity({
      activityType: this.activityType(),
      position: this.position(),
      date: new Date()
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
