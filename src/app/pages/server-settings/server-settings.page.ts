import { Component, inject, signal, OnInit, computed, ChangeDetectionStrategy } from '@angular/core';

import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatTabsModule } from '@angular/material/tabs';
import { TranslateModule } from '@ngx-translate/core';
import { ServerService } from '@app/core/services/server.service';
import { ProgressBarService } from '@app/core/services/progress-bar.service';
import type { InvitationWithStats, UserProfile, ActivityPointRule } from '@app/shared/models';

// Child components
import { ServerOverviewTabComponent } from './components/server-overview-tab/server-overview-tab.component';
import { ActivitySettingsTabComponent } from './components/activity-settings-tab/activity-settings-tab.component';
import { RetroactiveActivitiesTabComponent } from './components/retroactive-activities-tab/retroactive-activities-tab.component';
import { ImportExcelTabComponent } from './components/import-excel-tab/import-excel-tab.component';
import { DiscordTabComponent } from './components/discord-tab/discord-tab.component';
import { MgAdminTabComponent } from './components/mg-admin-tab/mg-admin-tab.component';
import { SwipeTabsDirective } from '@app/shared/directives/swipe-tabs/swipe-tabs.directive';

@Component({
  selector: 'app-server-settings',
  imports: [
    MatCardModule,
    MatIconModule,
    MatTabsModule,
    TranslateModule,
    ServerOverviewTabComponent,
    ActivitySettingsTabComponent,
    RetroactiveActivitiesTabComponent,
    ImportExcelTabComponent,
    DiscordTabComponent,
    MgAdminTabComponent,
    SwipeTabsDirective,
  ],
  templateUrl: './server-settings.page.html',
  styleUrl: './server-settings.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ServerSettingsPage implements OnInit {
  private readonly serverService = inject(ServerService);
  protected readonly progressBarService = inject(ProgressBarService);

  protected readonly members = signal<UserProfile[]>([]);
  protected readonly invitations = signal<InvitationWithStats[]>([]);
  protected readonly pointRules = signal<ActivityPointRule[]>([]);
  protected readonly server = computed(() => this.serverService.server());

  async ngOnInit(): Promise<void> {
    await this.loadData();
  }

  private async loadData(): Promise<void> {
    await this.progressBarService.withProgress(async () => {
      try {
        // 2 requests instead of 5: server + members + rules + settings in one, invitations separate (view)
        await Promise.all([this.serverService.loadAllSettings(), this.loadInvitations()]);
        this.members.set(this.serverService.members());
        this.pointRules.set(this.serverService.rules());
      } catch (error) {
        console.error('Error loading server data:', error);
      }
    });
  }

  protected async loadMembers(): Promise<void> {
    await this.serverService.loadMembers();
    this.members.set(this.serverService.members());
  }

  protected async loadInvitations(): Promise<void> {
    await this.serverService.loadInvitations();
    this.invitations.set(this.serverService.invitations());
  }

  protected async loadPointRules(): Promise<void> {
    await this.serverService.loadRules();
    this.pointRules.set(this.serverService.rules());
  }

  // Event handlers for child components
  protected async handleServerUpdated(): Promise<void> {
    await this.serverService.loadServer();
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
