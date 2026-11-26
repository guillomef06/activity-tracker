import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { TranslateModule } from '@ngx-translate/core';

import { MG_CALENDAR_ROUTE } from '@shared/constants/mg-calendar.constant';
import type { IsoDate, MgBannerState } from '@shared/models/calendar-entry.model';

/**
 * Presentational banner for the global MG calendar (alerts for admins, next MG for players,
 * cancellation notice). The parent resolves the state; nothing is rendered for `none`.
 * Dates are date-only strings: the `date` pipe reads them as local calendar days, so no timezone shift.
 */
@Component({
  selector: 'app-mg-calendar-banner',
  imports: [DatePipe, RouterLink, MatButtonModule, MatIconModule, TranslateModule],
  templateUrl: './mg-calendar-banner.component.html',
  styleUrl: './mg-calendar-banner.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MgCalendarBannerComponent {
  readonly state = input.required<MgBannerState>();
  readonly actionLink = input<string | null>(null);

  protected readonly link = computed<string>(() => this.actionLink() ?? MG_CALENDAR_ROUTE);

  protected readonly futureCount = computed<number>(() => {
    const state = this.state();
    return state.kind === 'superAdminLow' ? state.futureCount : 0;
  });

  protected readonly nextMg = computed<{ start: IsoDate; opening: IsoDate; messageKey: string } | null>(() => {
    const state = this.state();
    if (state.kind !== 'playerNext') return null;
    const messageKey = state.afterCurrent ? 'mg.calendar.banner.playerFollowing' : 'mg.calendar.banner.playerNext';
    return { start: state.mgStart, opening: state.openingDate, messageKey };
  });

  protected readonly cancelledStart = computed<IsoDate | null>(() => {
    const state = this.state();
    return state.kind === 'cancelled' ? state.mgStart : null;
  });
}
