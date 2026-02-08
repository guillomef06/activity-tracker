import { Component, inject, signal, OnInit, computed, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTabsModule } from '@angular/material/tabs';
import { TranslateModule } from '@ngx-translate/core';
import { AllianceService } from '@app/core/services/alliance.service';
import { PointRulesService } from '@app/core/services/point-rules.service';
import type { InvitationWithStats, UserProfile, ActivityPointRule } from '@app/shared/models';

// Child components
import { AllianceInfoTabComponent } from './components/alliance-info-tab/alliance-info-tab.component';
import { MembersTabComponent } from './components/members-tab/members-tab.component';
import { InvitationsTabComponent } from './components/invitations-tab/invitations-tab.component';
import { PointRulesTabComponent } from './components/point-rules-tab/point-rules-tab.component';

@Component({
  selector: 'app-alliance-settings',
  standalone: true,
  imports: [
    CommonModule,
    MatCardModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatTabsModule,
    TranslateModule,
    AllianceInfoTabComponent,
    MembersTabComponent,
    InvitationsTabComponent,
    PointRulesTabComponent,
  ],
  templateUrl: './alliance-settings.page.html',
  styleUrl: './alliance-settings.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class AllianceSettingsPage implements OnInit {
  private readonly allianceService = inject(AllianceService);
  private readonly pointRulesService = inject(PointRulesService);

  protected readonly isLoading = signal(false);
  protected readonly members = signal<UserProfile[]>([]);
  protected readonly invitations = signal<InvitationWithStats[]>([]);
  protected readonly pointRules = signal<ActivityPointRule[]>([]);
  protected readonly alliance = computed(() => this.allianceService.alliance());

  async ngOnInit(): Promise<void> {
    await this.loadData();
  }

  private async loadData(): Promise<void> {
    this.isLoading.set(true);
    try {
      await Promise.all([
        this.allianceService.loadAlliance(),
        this.loadMembers(),
        this.loadInvitations(),
        this.loadPointRules(),
      ]);
    } catch (error) {
      console.error('Error loading alliance data:', error);
    } finally {
      this.isLoading.set(false);
    }
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
    await this.pointRulesService.loadRules();
    this.pointRules.set(this.pointRulesService.rules());
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
