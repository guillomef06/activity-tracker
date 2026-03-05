import { Component, inject, ChangeDetectionStrategy, computed, signal, OnInit } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { TranslateModule } from '@ngx-translate/core';
import { ActivityService } from '../../core/services/activity.service';
import { AllianceService } from '../../core/services/alliance.service';
import { ProgressBarService } from '../../core/services/progress-bar.service';
import { PwaService } from '../../core/services/pwa.service';
import { UserScore } from '../../shared/models/activity.model';
import { ActivityInputComponent } from './components/activity-input/activity-input.component';
import { ActivitiesDetailsComponent } from './components/activities-details/activities-details.component';
import { GemCalculatorComponent } from './components/gem-calculator/gem-calculator.component';

@Component({
  selector: 'app-home-page',
  imports: [
    MatButtonModule,
    TranslateModule,
    ActivityInputComponent,
    ActivitiesDetailsComponent,
    GemCalculatorComponent,
  ],
  templateUrl: './home.page.html',
  styleUrl: './home.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HomePage implements OnInit {
  private readonly activityService = inject(ActivityService);
  private readonly allianceService = inject(AllianceService);
  private readonly progressBarService = inject(ProgressBarService);
  protected readonly pwaService = inject(PwaService);

  readonly userScores = computed<UserScore[]>(() => this.activityService.getUserScores());
  protected readonly nerdModeActive = signal(false);

  async ngOnInit(): Promise<void> {
    await this.progressBarService.withProgress(() =>
      Promise.all([this.allianceService.loadSettings(), this.activityService.initialize()])
    );
  }
}
