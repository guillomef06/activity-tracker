import { Component, ChangeDetectionStrategy, input, signal } from '@angular/core';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatChipsModule } from '@angular/material/chips';
import { MatBadgeModule } from '@angular/material/badge';
import { TranslateModule } from '@ngx-translate/core';
import { UserScore } from '@shared/models/activity.model';
import { ActivityLabelPipe } from '@shared/pipes/activity-label.pipe';
import { WeekLabelPipe } from '@shared/pipes/week-label.pipe';
import { ShortDatePipe } from '@shared/pipes/short-date.pipe';

@Component({
  selector: 'app-activities-details',
  imports: [
    MatCardModule,
    MatIconModule,
    MatButtonModule,
    MatExpansionModule,
    MatChipsModule,
    MatBadgeModule,
    TranslateModule,
    ActivityLabelPipe,
    WeekLabelPipe,
    ShortDatePipe,
  ],
  templateUrl: './activities-details.component.html',
  styleUrl: './activities-details.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ActivitiesDetailsComponent {
  readonly userScores = input.required<UserScore[]>();

  protected readonly selectedUserId = signal<string | null>(null);

  protected readonly trackByUserId = (_index: number, user: UserScore) => user.userId;
  protected readonly trackByIndex = (index: number) => index;

  protected toggleUserDetails(userId: string): void {
    this.selectedUserId.update(current => (current === userId ? null : userId));
  }
}
