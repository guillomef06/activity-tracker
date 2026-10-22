import { Component, inject, ChangeDetectionStrategy, computed, signal, OnInit } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTabsModule } from '@angular/material/tabs';
import { TranslateModule } from '@ngx-translate/core';
import { ActivityService } from '@core/services/activity.service';
import { ServerService } from '@core/services/server.service';
import { SeasonService } from '@core/services/season.service';
import { MgEventService } from '@core/services/mg-event.service';
import { PointAdjustmentService } from '@core/services/point-adjustment.service';
import { AuthService } from '@core/services/auth.service';
import { ProgressBarService } from '@core/services/progress-bar.service';
import { UserScore } from '@shared/models/activity.model';
import type { PointAdjustment, PointAdjustmentWithUser } from '@shared/models';
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
  private readonly pointAdjustmentService = inject(PointAdjustmentService);
  private readonly authService = inject(AuthService);
  private readonly progressBarService = inject(ProgressBarService);

  private readonly mgDeductions = signal<Map<string, number>>(new Map());
  // null until resolved: a season is active and its per-user totals are loaded.
  // Stays null when no season covers today, so the leaderboard omits the season
  // column/toggle entirely rather than showing a meaningless 0 for everyone.
  private readonly seasonTotals = signal<Map<string, number> | null>(null);

  /** Raw admin point adjustments for the server (newest first). */
  private readonly adjustments = signal<PointAdjustmentWithUser[]>([]);

  /** Per-user net signed delta — the amount folded into each player's total. */
  private readonly adjustmentTotals = computed(() => {
    const map = new Map<string, number>();
    for (const adj of this.adjustments()) {
      map.set(adj.userId, (map.get(adj.userId) ?? 0) + adj.delta);
    }
    return map;
  });

  /** Adjustments grouped by user, passed to the leaderboard for the per-week log. */
  readonly adjustmentsByUser = computed<Map<string, PointAdjustment[]>>(() => {
    const map = new Map<string, PointAdjustment[]>();
    for (const adj of this.adjustments()) {
      const list = map.get(adj.userId) ?? [];
      list.push(adj);
      map.set(adj.userId, list);
    }
    return map;
  });

  readonly userScores = computed<UserScore[]>(() => {
    // DKP first — it clamps against the pure earned total (always ≥ 0) so a slot
    // cost can never push a balance negative. Manual adjustments apply LAST and
    // are unfloored, so an admin penalty is the only thing that can break zero.
    const net = this.activityService.applyMgDeductions(this.activityService.getUserScores(), this.mgDeductions());
    const adjusted = this.activityService.applyPointAdjustments(net, this.adjustmentTotals());
    const totals = this.seasonTotals();
    return totals ? this.activityService.applySeasonTotals(adjusted, totals) : adjusted;
  });

  async ngOnInit(): Promise<void> {
    await this.progressBarService.withProgress(async () => {
      await Promise.all([
        this.serverService.loadSettings(),
        this.activityService.initialize(),
        this.seasonService.loadSeasons(),
      ]);
      await Promise.all([this.loadMgDeductions(), this.loadSeasonTotals(), this.loadAdjustments()]);
    });
  }

  private async loadAdjustments(): Promise<void> {
    const serverId = this.authService.getServerId();
    if (!serverId) return;

    const adjustments = await this.pointAdjustmentService.loadAdjustments(serverId);
    this.adjustments.set(adjustments);
  }

  private async loadSeasonTotals(): Promise<void> {
    const currentSeason = this.seasonService.getSeasonForDate(new Date());
    if (!currentSeason) return;

    const totals = await this.activityService.loadSeasonTotals(currentSeason);
    this.seasonTotals.set(totals);
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
