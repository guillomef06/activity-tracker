import { Component, OnInit, inject, signal, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule, DecimalPipe } from '@angular/common';
import { Router } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatChipsModule } from '@angular/material/chips';
import { MatBadgeModule } from '@angular/material/badge';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { ActivityService } from '../../core/services/activity.service';
import { UserScore } from '../../shared/models/activity.model';
import { getWeekLabel, formatShortDate } from '../../shared/utils/date.util';

@Component({
  selector: 'app-activities-details',
  standalone: true,
  imports: [
    CommonModule,
    DecimalPipe,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatExpansionModule,
    MatChipsModule,
    MatBadgeModule,
    TranslateModule
  ],
  templateUrl: './activities-details.page.html',
  styleUrl: './activities-details.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ActivitiesDetailsPage implements OnInit {
  private readonly router = inject(Router);
  private readonly activityService = inject(ActivityService);
  private readonly translate = inject(TranslateService);

  protected readonly userScores = signal<UserScore[]>([]);
  protected readonly selectedUserId = signal<string | null>(null);
  
  // Utility functions exposed to template
  protected readonly getWeekLabel = (weekIndex: number) => getWeekLabel(weekIndex, this.translate);
  protected readonly formatDate = (date: Date) => formatShortDate(date);
  
  // TrackBy functions for performance
  protected readonly trackByUserId = (_index: number, user: UserScore) => user.userId;
  protected readonly trackByIndex = (index: number) => index;

  ngOnInit(): void {
    this.loadScores();
  }

  private loadScores(): void {
    this.userScores.set(this.activityService.getUserScores());
  }

  protected toggleUserDetails(userId: string): void {
    this.selectedUserId.update(current => current === userId ? null : userId);
  }

  protected goBack(): void {
    this.router.navigate(['/management']);
  }
}
