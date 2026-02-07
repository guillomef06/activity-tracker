import { Component, OnInit, inject, ChangeDetectionStrategy, signal, computed } from '@angular/core';
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
import { StorageService } from '../../core/services/storage.service';
import { APP_CONSTANTS } from '../../shared/constants/constants';
import { createUserIdFromName } from '../../shared/utils/id-generator.util';

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
  private router = inject(Router);
  private storage = inject(StorageService);
  private snackBar = inject(MatSnackBar);
  private translate = inject(TranslateService);
  
  userName = '';
  activityType = '';
  points = 0;
  submitting = signal<boolean>(false);

  // Use computed signal for reactive translations
  activityTypes = computed(() => 
    APP_CONSTANTS.ACTIVITY_TYPES.map(type => ({
      ...type,
      label: this.translate.instant(type.labelKey)
    }))
  );

  ngOnInit(): void {
    // Load saved user name from storage
    const savedUserName = this.storage.get<string>(APP_CONSTANTS.STORAGE_KEYS.USER_NAME);
    if (savedUserName) {
      this.userName = savedUserName;
    }
  }

  onActivityTypeChange(): void {
    const selectedType = this.activityTypes().find(
      type => type.value === this.activityType
    );
    if (selectedType) {
      this.points = selectedType.points;
    }
  }

  onSubmit(): void {
    if (!this.userName.trim() || !this.activityType || this.points <= 0) {
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

    // Create user ID from name using utility function
    const userId = createUserIdFromName(this.userName);

    this.activityService.addActivity({
      userId,
      userName: this.userName,
      activityType: this.activityType,
      points: this.points,
      date: new Date()
    });

    // Reset form
    this.activityType = '';
    this.points = 0;
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
