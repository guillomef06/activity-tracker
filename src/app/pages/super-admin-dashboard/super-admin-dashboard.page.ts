import { Component, inject, signal, OnInit, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { TranslateModule } from '@ngx-translate/core';
import { SupabaseService } from '@app/core/services/supabase.service';

interface DashboardStats {
  totalAlliances: number;
  totalUsers: number;
  totalActivities: number;
  activeInvitations: number;
}

@Component({
  selector: 'app-super-admin-dashboard',
  standalone: true,
  imports: [
    CommonModule,
    RouterLink,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    TranslateModule,
  ],
  templateUrl: './super-admin-dashboard.page.html',
  styleUrl: './super-admin-dashboard.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class SuperAdminDashboardPage implements OnInit {
  private readonly supabase = inject(SupabaseService);

  protected readonly isLoading = signal(false);
  protected readonly stats = signal<DashboardStats>({
    totalAlliances: 0,
    totalUsers: 0,
    totalActivities: 0,
    activeInvitations: 0,
  });

  async ngOnInit(): Promise<void> {
    await this.loadStats();
  }

  private async loadStats(): Promise<void> {
    this.isLoading.set(true);
    try {
      const [alliances, users, activities, invitations] = await Promise.all([
        this.supabase.client.from('alliances').select('count', { count: 'exact', head: true }),
        this.supabase.client.from('user_profiles').select('count', { count: 'exact', head: true }),
        this.supabase.client.from('activities').select('count', { count: 'exact', head: true }),
        this.supabase.client
          .from('invitation_tokens')
          .select('count', { count: 'exact', head: true })
          .gt('expires_at', new Date().toISOString()),
      ]);

      this.stats.set({
        totalAlliances: alliances.count || 0,
        totalUsers: users.count || 0,
        totalActivities: activities.count || 0,
        activeInvitations: invitations.count || 0,
      });
    } catch (error) {
      console.error('Error loading stats:', error);
    } finally {
      this.isLoading.set(false);
    }
  }

  protected async refreshStats(): Promise<void> {
    await this.loadStats();
  }
}
