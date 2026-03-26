import { Component, inject, ChangeDetectionStrategy, computed, OnInit } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTabsModule } from '@angular/material/tabs';
import { TranslateModule } from '@ngx-translate/core';
import { ActivityService } from '@core/services/activity.service';
import { AllianceService } from '@core/services/alliance.service';
import { ProgressBarService } from '@core/services/progress-bar.service';
import { UserScore } from '@shared/models/activity.model';
import { ActivityInputComponent } from './components/activity-input/activity-input.component';
import { ActivitiesDetailsComponent } from './components/activities-details/activities-details.component';
import { ToolsHubComponent } from './components/tools-hub/tools-hub.component';
import { MightiestGovernorComponent } from './components/mightiest-governor/mightiest-governor.component';
import { SwipeTabsDirective } from '@shared/directives/swipe-tabs/swipe-tabs.directive';

@Component({
  selector: 'app-home-page',
  imports: [
    MatButtonModule,
    MatIconModule,
    MatTabsModule,
    TranslateModule,
    ActivityInputComponent,
    ActivitiesDetailsComponent,
    ToolsHubComponent,
    MightiestGovernorComponent,
    SwipeTabsDirective,
  ],
  templateUrl: './home.page.html',
  styleUrl: './home.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HomePage implements OnInit {
  private readonly activityService = inject(ActivityService);
  private readonly allianceService = inject(AllianceService);
  private readonly progressBarService = inject(ProgressBarService);

  readonly userScores = computed<UserScore[]>(() => this.activityService.getUserScores());

  async ngOnInit(): Promise<void> {
    await this.progressBarService.withProgress(() =>
      Promise.all([this.allianceService.loadSettings(), this.activityService.initialize()])
    );
  }
}
