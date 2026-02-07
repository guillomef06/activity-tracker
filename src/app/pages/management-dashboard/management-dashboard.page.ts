import { Component, OnInit, inject, ChangeDetectionStrategy, signal, computed, ChangeDetectorRef } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { Router } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatChipsModule } from '@angular/material/chips';
import { MatBadgeModule } from '@angular/material/badge';
import { MatTooltipModule } from '@angular/material/tooltip';
import { ActivityService } from '../../core/services/activity.service';
import { UserScore } from '../../shared/models/activity.model';

@Component({
  selector: 'app-management-dashboard-page',
  standalone: true,
  imports: [
    DecimalPipe,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatExpansionModule,
    MatChipsModule,
    MatBadgeModule,
    MatTooltipModule
  ],
  templateUrl: './management-dashboard.page.html',
  styleUrl: './management-dashboard.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ManagementDashboardPage implements OnInit {
  private activityService = inject(ActivityService);
  private router = inject(Router);
  private cdr = inject(ChangeDetectorRef);
  
  userScores = signal<UserScore[]>([]);
  loading = signal<boolean>(true);
  selectedUserId = signal<string | null>(null);
  
  // Computed week labels
  weekLabels = computed(() => ['Week 1', 'Week 2', 'Week 3', 'Week 4', 'Week 5', 'Week 6']);

  ngOnInit(): void {
    this.loadScores();
  }

  loadScores(): void {
    this.loading.set(true);
    setTimeout(() => {
      this.userScores.set(this.activityService.getUserScores());
      this.loading.set(false);
    }, 500);
  }

  toggleUserDetails(userId: string): void {
    this.selectedUserId.update(current => current === userId ? null : userId);
  }

  getWeekLabel(weekIndex: number): string {
    const labels = ['Week 1', 'Week 2', 'Week 3', 'Week 4', 'Week 5', 'Week 6'];
    return labels[weekIndex] || `Week ${weekIndex + 1}`;
  }

  formatDate(date: Date): string {
    return new Date(date).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric'
    });
  }

  goToActivityInput(): void {
    this.router.navigate(['/']);
  }

  refresh(): void {
    this.loadScores();
  }
}
