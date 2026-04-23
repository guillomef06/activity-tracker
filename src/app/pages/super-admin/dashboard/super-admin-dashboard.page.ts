import { Component, inject, signal, OnInit, ChangeDetectionStrategy } from '@angular/core';

import { RouterLink } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { TranslateModule } from '@ngx-translate/core';
import { SupabaseService } from '@app/core/services/supabase.service';
import { ProgressBarService } from '@app/core/services/progress-bar.service';

interface DashboardStats {
  totalServers: number;
  totalUsers: number;
  totalActivities: number;
  activeInvitations: number;
}

@Component({
  selector: 'app-super-admin-dashboard',
  imports: [RouterLink, MatCardModule, MatButtonModule, MatIconModule, TranslateModule],
  templateUrl: './super-admin-dashboard.page.html',
  styleUrl: './super-admin-dashboard.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SuperAdminDashboardPage implements OnInit {
  private readonly supabase = inject(SupabaseService);
  protected readonly progressBarService = inject(ProgressBarService);

  protected readonly stats = signal<DashboardStats>({
    totalServers: 0,
    totalUsers: 0,
    totalActivities: 0,
    activeInvitations: 0,
  });

  async ngOnInit(): Promise<void> {
    await this.loadStats();
  }

  private async loadStats(): Promise<void> {
    await this.progressBarService.withProgress(async () => {
      try {
        const [servers, users, activities, invitations] = await Promise.all([
          this.supabase.client.from('servers').select('count', { count: 'exact', head: true }),
          this.supabase.client.from('user_profiles').select('count', { count: 'exact', head: true }),
          this.supabase.client.from('activities').select('count', { count: 'exact', head: true }),
          this.supabase.client
            .from('invitation_tokens')
            .select('count', { count: 'exact', head: true })
            .gt('expires_at', new Date().toISOString()),
        ]);

        this.stats.set({
          totalServers: servers.count || 0,
          totalUsers: users.count || 0,
          totalActivities: activities.count || 0,
          activeInvitations: invitations.count || 0,
        });
      } catch (error) {
        console.error('Error loading stats:', error);
      }
    });
  }

  protected async refreshStats(): Promise<void> {
    await this.loadStats();
  }
}
