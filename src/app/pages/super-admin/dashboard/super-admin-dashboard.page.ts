import { Component, inject, signal, computed, resource, OnInit, ChangeDetectionStrategy } from '@angular/core';

import { RouterLink } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { TranslateModule } from '@ngx-translate/core';
import { SupabaseService } from '@app/core/services/supabase.service';
import { ProgressBarService } from '@app/core/services/progress-bar.service';
import { CalendarService } from '@app/core/services/calendar.service';
import { MgCalendarBannerComponent } from '@shared/components/mg-calendar-banner/mg-calendar-banner.component';
import { MG_CALENDAR_ROUTE } from '@shared/constants/mg-calendar.constant';
import type { CalendarEntry, MgBannerState } from '@shared/models/calendar-entry.model';
import { resolveSuperAdminBanner } from '@shared/utils/mg-calendar.util';

interface DashboardStats {
  totalServers: number;
  totalUsers: number;
  totalActivities: number;
  activeInvitations: number;
}

@Component({
  selector: 'app-super-admin-dashboard',
  imports: [RouterLink, MatCardModule, MatButtonModule, MatIconModule, TranslateModule, MgCalendarBannerComponent],
  templateUrl: './super-admin-dashboard.page.html',
  styleUrl: './super-admin-dashboard.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SuperAdminDashboardPage implements OnInit {
  private readonly supabase = inject(SupabaseService);
  private readonly calendarService = inject(CalendarService);
  protected readonly progressBarService = inject(ProgressBarService);

  protected readonly calendarRoute = MG_CALENDAR_ROUTE;

  /** Clock read once: the banner only needs the day granularity of the page visit. */
  private readonly now = signal(new Date());

  // A load failure must never raise the alarm banner: it is logged once and resolves to no value.
  private readonly calendarEntries = resource<CalendarEntry[] | null, undefined>({
    loader: async () => {
      try {
        return await this.calendarService.loadEntries();
      } catch (error) {
        console.error('Error loading MG calendar entries:', error);
        return null;
      }
    },
  });

  protected readonly calendarBanner = computed<MgBannerState>(() => {
    const entries = this.calendarEntries.hasValue() ? this.calendarEntries.value() : null;
    return entries ? resolveSuperAdminBanner(entries, this.now()) : { kind: 'none' };
  });

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
