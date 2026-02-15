import {
  Component,
  OnInit,
  inject,
  signal,
  ChangeDetectionStrategy,
} from "@angular/core";
import { CommonModule, DecimalPipe } from "@angular/common";
import { Router } from "@angular/router";
import { MatCardModule } from "@angular/material/card";
import { MatButtonModule } from "@angular/material/button";
import { MatIconModule } from "@angular/material/icon";
import { MatExpansionModule } from "@angular/material/expansion";
import { MatChipsModule } from "@angular/material/chips";
import { MatBadgeModule } from "@angular/material/badge";
import { TranslateModule, TranslateService } from "@ngx-translate/core";
import { ActivityService } from "../../core/services/activity.service";
import { ProgressBarService } from "../../core/services/progress-bar.service";
import { UserScore } from "../../shared/models/activity.model";
import { getWeekLabel, formatShortDate } from "../../shared/utils/date.util";
import { ActivityLabelPipe } from "../../shared/pipes/activity-label.pipe";

@Component({
  selector: "app-activities-details",
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
    TranslateModule,
    ActivityLabelPipe,
  ],
  templateUrl: "./activities-details.page.html",
  styleUrl: "./activities-details.page.scss",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ActivitiesDetailsPage implements OnInit {
    /**
     * Retourne un Set des positions en double pour une semaine donnée (par activitéType).
     * Utilisé pour mettre en évidence les doublons dans le template.
     */
    protected getDuplicatePositions(activities: { activityType: string; position: number }[]): Set<string> {
      const seen = new Map<string, Set<number>>();
      const duplicates = new Set<string>();
      for (const act of activities) {
        const key = act.activityType;
        if (!seen.has(key)) seen.set(key, new Set());
        const positions = seen.get(key)!;
        if (positions.has(act.position)) {
          duplicates.add(`${key}|${act.position}`);
        } else {
          positions.add(act.position);
        }
      }
      return duplicates;
    }
  private readonly router = inject(Router);
  private readonly activityService = inject(ActivityService);
  private readonly progressBarService = inject(ProgressBarService);
  private readonly translate = inject(TranslateService);

  protected readonly userScores = signal<UserScore[]>([]);
  protected readonly selectedUserId = signal<string | null>(null);

  // Utility functions exposed to template
  protected readonly getWeekLabel = (weekIndex: number) =>
    getWeekLabel(weekIndex, this.translate);
  protected readonly formatDate = (date: Date) => formatShortDate(date);

  // TrackBy functions for performance
  protected readonly trackByUserId = (_index: number, user: UserScore) =>
    user.userId;
  protected readonly trackByIndex = (index: number) => index;

  ngOnInit(): void {
    this.initialize();
  }

  private async initialize(): Promise<void> {
    await this.progressBarService.withProgress(async () => {
      await this.activityService.initialize();
      this.loadScores();
    });
  }

  private loadScores(): void {
    // On veut détecter les conflits de position entre utilisateurs pour chaque semaine et activité
    // 1. On regroupe les weeklyScores de tous les users par semaine (par index)
    const allUserScores = this.activityService.getUserScores();
    const weeksCount = allUserScores[0]?.weeklyScores.length || 0;
    // Pour chaque semaine, on construit une map activitéType|position -> Set<userId>
    const weekConflicts: Set<string>[] = Array.from({ length: weeksCount }, () => new Set());
    for (let weekIdx = 0; weekIdx < weeksCount; weekIdx++) {
      const positionMap = new Map<string, Set<string>>();
      for (const userScore of allUserScores) {
        const week = userScore.weeklyScores[weekIdx];
        if (!week) continue;
        for (const act of week.activities) {
          const key = act.activityType + '|' + act.position;
          if (!positionMap.has(key)) positionMap.set(key, new Set());
          positionMap.get(key)!.add(act.userId);
        }
      }
      // On garde les couples activitéType|position où il y a plus d'un userId
      for (const [key, userIds] of positionMap.entries()) {
        if (userIds.size > 1) {
          weekConflicts[weekIdx].add(key);
        }
      }
    }

    // On enrichit chaque weeklyScore de chaque user avec la liste des positions en conflit pour la semaine
    this.userScores.set(
      allUserScores.map((userScore) => ({
        ...userScore,
        weeklyScores: [...userScore.weeklyScores].reverse().map((week, idx) => ({
          ...week,
          conflictingPositions: weekConflicts[weeksCount - 1 - idx] // reverse: on aligne l'index
        }))
      }))
    );
  }

  protected toggleUserDetails(userId: string): void {
    this.selectedUserId.update((current) =>
      current === userId ? null : userId,
    );
  }

  protected goBack(): void {
    this.router.navigate(["/management-dashboard"]);
  }
}
