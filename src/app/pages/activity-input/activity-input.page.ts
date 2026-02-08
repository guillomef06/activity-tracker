import { Component, OnInit, inject, ChangeDetectionStrategy, signal, computed, effect } from '@angular/core';
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
import { PointRulesService } from '../../core/services/point-rules.service';
import { StorageService } from '../../core/services/storage.service';
import { APP_CONSTANTS } from '../../shared/constants/constants';
import { createUserIdFromName } from '../../shared/utils/id-generator.util';
import { PointCalculationResult } from '../../shared/models';

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
export class ActivityInputPage implements OnInit {
  private activityService = inject(ActivityService);
  private pointRulesService = inject(PointRulesService);
  private router = inject(Router);
  private storage = inject(StorageService);
  private snackBar = inject(MatSnackBar);
  private translate = inject(TranslateService);
  
  userName = '';
  activityType = '';
  position = 1;
  points = 0;
  submitting = signal<boolean>(false);
  calculatedPointsResult = signal<PointCalculationResult | null>(null);

  // Use computed signal for reactive translations
  activityTypes = computed(() => 
    APP_CONSTANTS.ACTIVITY_TYPES.map(type => ({
      ...type,
      label: this.translate.instant(type.labelKey)
    }))
  );

  constructor() {
    // Automatically calculate points when activity type or position changes
    effect(() => {
      if (this.activityType && this.position > 0) {
        const result = this.pointRulesService.calculatePoints(this.activityType, this.position);
        this.calculatedPointsResult.set(result);
        this.points = result.points;
      }
    });
  }

  ngOnInit(): void {
    // Load saved user name from storage
    const savedUserName = this.storage.get<string>(APP_CONSTANTS.STORAGE_KEYS.USER_NAME);
    if (savedUserName) {
      this.userName = savedUserName;
    }
  }

  onActivityTypeChange(): void {
    // Points will be calculated automatically by the effect
    // Just trigger change detection by updating the activity type
  }

  async onSubmit(): Promise<void> {
    if (!this.userName.trim() || !this.activityType || this.position <= 0) {
      this.snackBar.open('Please fill in all fields', 'Close', {
        duration: 3000,
        horizontalPosition: 'center',
        verticalPosition: 'top'
      });
      return;
    }

    this.submitting.set(true);

    // Save user name for future use
    this.storage.set(APP_CONSTANTS.STORAGE_KEYS.USER_NAME, this.userName);

    // Add activity with position
    const { error } = await this.activityService.addActivity({
      activityType: this.activityType,
      position: this.position,
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
    this.activityType = '';
    this.position = 1;
    this.points = 0;
    this.calculatedPointsResult.set(null);
    this.submitting.set(false);

    this.snackBar.open(this.translate.instant('activityInput.success'), this.translate.instant('common.close'), {
      duration: 3000,
      horizontalPosition: 'center',
      verticalPosition: 'top'
    });
  }

  viewDashboard(): void {
    this.router.navigate(['/management']);
  }
}
