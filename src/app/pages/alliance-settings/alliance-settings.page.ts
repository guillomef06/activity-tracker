import { Component, inject, signal, OnInit, computed, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatTabsModule } from '@angular/material/tabs';
import { TranslateModule } from '@ngx-translate/core';
import { AllianceService } from '@app/core/services/alliance.service';
import { ProgressBarService } from '@app/core/services/progress-bar.service';
import type { InvitationWithStats, UserProfile, ActivityPointRule } from '@app/shared/models';

// Child components
import { AllianceOverviewTabComponent } from './components/alliance-overview-tab/alliance-overview-tab.component';
import { PointRulesTabComponent } from './components/point-rules-tab/point-rules-tab.component';
import { RetroactiveActivitiesTabComponent } from './components/retroactive-activities-tab/retroactive-activities-tab.component';

@Component({
  selector: 'app-alliance-settings',
  imports: [
    CommonModule,
    MatCardModule,
    MatIconModule,
    MatTabsModule,
    TranslateModule,
    AllianceOverviewTabComponent,
    PointRulesTabComponent,
    RetroactiveActivitiesTabComponent,
  ],
  templateUrl: './alliance-settings.page.html',
  styleUrl: './alliance-settings.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AllianceSettingsPage implements OnInit {
  private readonly allianceService = inject(AllianceService);
  protected readonly progressBarService = inject(ProgressBarService);

  protected readonly members = signal<UserProfile[]>([]);
  protected readonly invitations = signal<InvitationWithStats[]>([]);
  protected readonly pointRules = signal<ActivityPointRule[]>([]);
  protected readonly alliance = computed(() => this.allianceService.alliance());

  async ngOnInit(): Promise<void> {
    await this.loadData();
  }

  private async loadData(): Promise<void> {
    await this.progressBarService.withProgress(async () => {
      try {
        // 2 requests instead of 5: alliance + members + rules + settings in one, invitations separate (view)
        await Promise.all([this.allianceService.loadAllSettings(), this.loadInvitations()]);
        this.members.set(this.allianceService.members());
        this.pointRules.set(this.allianceService.rules());
      } catch (error) {
        console.error('Error loading alliance data:', error);
      }
    });
  }

  protected async loadMembers(): Promise<void> {
    await this.allianceService.loadMembers();
    this.members.set(this.allianceService.members());
  }

  protected async loadInvitations(): Promise<void> {
    await this.allianceService.loadInvitations();
    this.invitations.set(this.allianceService.invitations());
  }

  protected async loadPointRules(): Promise<void> {
    await this.allianceService.loadRules();
    this.pointRules.set(this.allianceService.rules());
  }

  // Event handlers for child components
  protected async handleAllianceUpdated(): Promise<void> {
    await this.allianceService.loadAlliance();
  }

  protected async handleInvitationCreated(): Promise<void> {
    await this.loadInvitations();
  }

  protected async handleInvitationRevoked(): Promise<void> {
    await this.loadInvitations();
  }

  protected async handleRuleCreated(): Promise<void> {
    await this.loadPointRules();
  }

  protected async handleRuleDeleted(): Promise<void> {
    await this.loadPointRules();
  }
}
