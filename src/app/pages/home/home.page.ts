import { Component, inject, ChangeDetectionStrategy, computed, signal, OnInit } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTabsModule } from '@angular/material/tabs';
import { TranslateModule } from '@ngx-translate/core';
import { ActivityService } from '@core/services/activity.service';
import { ServerService } from '@core/services/server.service';
import { SeasonService } from '@core/services/season.service';
import { MgEventService } from '@core/services/mg-event.service';
import { AuthService } from '@core/services/auth.service';
import { ProgressBarService } from '@core/services/progress-bar.service';
import { UserScore } from '@shared/models/activity.model';
import { getDateForWeeksAgo } from '@shared/utils/date.util';
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
  private readonly serverService = inject(ServerService);
  private readonly seasonService = inject(SeasonService);
  private readonly mgEventService = inject(MgEventService);
  private readonly authService = inject(AuthService);
  private readonly progressBarService = inject(ProgressBarService);

  private readonly mgDeductions = signal<Map<string, number>>(new Map());

  readonly userScores = computed<UserScore[]>(() =>
    this.activityService.applyMgDeductions(this.activityService.getUserScores(), this.mgDeductions())
  );

  async ngOnInit(): Promise<void> {
    await this.progressBarService.withProgress(async () => {
      await Promise.all([
        this.serverService.loadSettings(),
        this.activityService.initialize(),
        this.seasonService.loadSeasons(),
      ]);
      await this.loadMgDeductions();
    });
  }

  private async loadMgDeductions(): Promise<void> {
    const serverId = this.authService.getServerId();
    if (!serverId) return;

    const config = await this.mgEventService.loadServerConfig(serverId);
    if (!config?.dkp_enabled) return;

    // A spend inside the current window may have consumed earning-weeks up to a
    // full window older than itself, so scan spends back 2× the window; FIFO
    // attribution (loadFifoDeductions) then resolves which consumed points are
    // still in-window and therefore still deducted.
    const sinceDate = getDateForWeeksAgo(2 * this.serverService.scoringWeeks() - 1);
    const spends = await this.mgEventService.loadSpends(serverId, sinceDate);
    const deductions = await this.activityService.loadFifoDeductions(spends);
    this.mgDeductions.set(deductions);
  }
}
