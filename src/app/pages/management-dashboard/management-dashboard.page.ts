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
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { ActivityService } from '../../core/services/activity.service';
import { UserScore } from '../../shared/models/activity.model';
import { RankingChartComponent } from '../../shared/components/ranking-chart/ranking-chart.component';

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
    MatTooltipModule,
    TranslateModule,
    RankingChartComponent
  ],
  templateUrl: './management-dashboard.page.html',
  styleUrl: './management-dashboard.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ManagementDashboardPage implements OnInit {
  private activityService = inject(ActivityService);
  private router = inject(Router);
  private cdr = inject(ChangeDetectorRef);
  private translate = inject(TranslateService);
  
  userScores = signal<UserScore[]>([]);
  loading = signal<boolean>(true);
  selectedUserId = signal<string | null>(null);
  
  // Computed week labels
  weekLabels = computed(() => ['Week 1', 'Week 2', 'Week 3', 'Week 4', 'Week 5', 'Week 6']);

  ngOnInit(): void {
    this.loadScores();
  }

  async loadScores(): Promise<void> {
    this.loading.set(true);
    await this.activityService.initialize();
    setTimeout(() => {
      this.userScores.set(this.activityService.getUserScores());
      this.loading.set(false);
    }, 500);
  }

  async resetData(): Promise<void> {
    if (confirm(this.translate.instant('dashboard.resetConfirm'))) {
      this.loading.set(true);
      this.activityService.resetToInitialData();
      await this.loadScores();
    }
  }

  toggleUserDetails(userId: string): void {
    this.selectedUserId.update(current => current === userId ? null : userId);
  }

  getWeekLabel(weekIndex: number): string {
    if (weekIndex === 0) {
      return this.translate.instant('dashboard.currentWeek');
    } else if (weekIndex === 1) {
      return this.translate.instant('dashboard.lastWeek');
    } else {
      return `${weekIndex} ${this.translate.instant('dashboard.weeksAgo')}`;
    }
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
