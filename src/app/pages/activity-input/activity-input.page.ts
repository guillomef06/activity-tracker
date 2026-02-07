import { Component, OnInit, inject, ChangeDetectionStrategy, signal, ChangeDetectorRef } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar } from '@angular/material/snack-bar';
import { ActivityService } from '../../core/services/activity.service';

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
    MatIconModule
  ],
  templateUrl: './activity-input.page.html',
  styleUrl: './activity-input.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ActivityInputPage implements OnInit {
  private activityService = inject(ActivityService);
  private router = inject(Router);
  private cdr = inject(ChangeDetectorRef);
  private snackBar = inject(MatSnackBar);
  
  userName: string = '';
  activityType: string = '';
  description: string = '';
  points: number = 0;
  submitting = signal<boolean>(false);

  activityTypes = [
    { value: 'meeting', label: 'Team Meeting', points: 5 },
    { value: 'training', label: 'Training Session', points: 10 },
    { value: 'project', label: 'Project Contribution', points: 15 },
    { value: 'presentation', label: 'Presentation', points: 20 },
    { value: 'mentoring', label: 'Mentoring', points: 10 },
    { value: 'documentation', label: 'Documentation', points: 8 },
    { value: 'code-review', label: 'Code Review', points: 7 },
    { value: 'other', label: 'Other', points: 5 }
  ];

  ngOnInit(): void {
    // Load saved user name from localStorage
    const savedUserName = localStorage.getItem('userName');
    if (savedUserName) {
      this.userName = savedUserName;
    }
  }

  onActivityTypeChange(): void {
    const selectedType = this.activityTypes.find(
      type => type.value === this.activityType
    );
    if (selectedType) {
      this.points = selectedType.points;
    }
  }

  onSubmit(): void {
    if (!this.userName.trim() || !this.activityType || !this.description.trim() || this.points <= 0) {
      this.snackBar.open('Please fill in all fields', 'Close', {
        duration: 3000,
        horizontalPosition: 'center',
        verticalPosition: 'top'
      });
      return;
    }

    this.submitting.set(true);

    // Save user name for future use
    localStorage.setItem('userName', this.userName);

    // Create user ID from name (simplified - in production use proper auth)
    const userId = this.userName.toLowerCase().replace(/\s+/g, '-');

    this.activityService.addActivity({
      userId,
      userName: this.userName,
      activityType: this.activityType,
      description: this.description,
      points: this.points,
      date: new Date()
    });

    // Reset form
    this.activityType = '';
    this.description = '';
    this.points = 0;
    this.submitting.set(false);
    this.cdr.markForCheck();

    this.snackBar.open('Activity submitted successfully!', 'Close', {
      duration: 3000,
      horizontalPosition: 'center',
      verticalPosition: 'top'
    });
  }

  viewDashboard(): void {
    this.router.navigate(['/management']);
  }
}
