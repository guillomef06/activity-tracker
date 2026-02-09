import { Component, OnInit, inject, ChangeDetectionStrategy, signal, computed } from '@angular/core';
import { Router } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatChipsModule } from '@angular/material/chips';
import { MatBadgeModule } from '@angular/material/badge';
import { MatTooltipModule } from '@angular/material/tooltip';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { ActivityService } from '../../core/services/activity.service';
import { UserScore } from '../../shared/models/activity.model';
import { RankingChartComponent } from '../../shared/components/ranking-chart/ranking-chart.component';
import { getWeekLabel, formatShortDate, getCurrentWeekNumber } from '../../shared/utils/date.util';
import { APP_CONSTANTS } from '../../shared/constants/constants';

@Component({
  selector: 'app-management-dashboard-page',
  standalone: true,
  imports: [
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
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
  private translate = inject(TranslateService);
  
  hasData = signal<boolean>(false);
  loading = signal<boolean>(true);
  
  // Available activities for current week
  availableActivitiesThisWeek = computed(() => {
    const currentWeek = getCurrentWeekNumber();
    return APP_CONSTANTS.ACTIVITY_TYPES
      .filter(type => type.availableWeeks.includes(currentWeek))
      .map(type => ({
        ...type,
        label: this.translate.instant(type.labelKey)
      }));
  });
  
  // Utility functions exposed to template
  readonly getWeekLabel = (weekIndex: number) => getWeekLabel(weekIndex, this.translate);
  readonly formatDate = (date: Date) => formatShortDate(date);
  
  // TrackBy functions for performance
  readonly trackByUserId = (_index: number, user: UserScore) => user.userId;
  readonly trackByIndex = (index: number) => index;

  ngOnInit(): void {
    this.initialize();
  }

  async initialize(): Promise<void> {
    this.loading.set(true);
    await this.activityService.initialize();
    this.loading.set(false);
  }

  async resetData(): Promise<void> {
    if (confirm(this.translate.instant('dashboard.resetConfirm'))) {
      this.loading.set(true);
      this.activityService.resetToInitialData();
      await this.initialize();
    }
  }

  viewAllDetails(): void {
    this.router.navigate(['/activities-details']);
  }

  goToActivityInput(): void {
    this.router.navigate(['/']);
  }

  refresh(): void {
    this.initialize();
  }

  onDataLoaded(hasData: boolean): void {
    this.hasData.set(hasData);
  }
}
