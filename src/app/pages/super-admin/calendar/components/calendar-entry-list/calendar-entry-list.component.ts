import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatChipsModule } from '@angular/material/chips';
import { MatIconModule } from '@angular/material/icon';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { map } from 'rxjs';

import type { CalendarEntryState, CalendarEntryType } from '@shared/models';
import { formatTimestampWithZone, formatUtcDay } from '@shared/utils/calendar-datetime.util';
import type { CalendarRowVm } from '../../calendar-page.models';

const FALLBACK_LOCALE = 'en';
const DATE_RANGE_SEPARATOR = ' – ';

const STATE_KEYS: Record<CalendarEntryState, string> = {
  planned: 'superAdmin.calendar.state.planned',
  registration_open: 'superAdmin.calendar.state.registrationOpen',
  awaiting_start: 'superAdmin.calendar.state.awaitingStart',
  ongoing: 'superAdmin.calendar.state.ongoing',
  finished: 'superAdmin.calendar.state.finished',
  cancelled: 'superAdmin.calendar.state.cancelled',
};

const TYPE_KEYS: Record<CalendarEntryType, string> = {
  mg: 'superAdmin.calendar.type.mg',
  pvp: 'superAdmin.calendar.type.pvp',
};

/** Display-ready row: every label is computed once, never from the template. */
interface CalendarRowView {
  readonly row: CalendarRowVm;
  readonly isMg: boolean;
  readonly typeKey: string;
  readonly stateKey: string;
  readonly stateClass: string;
  /** Title of a non-MG entry, translated type label key for an MG. */
  readonly title: string | null;
  readonly datesLabel: string;
  /** Timestamped entries only: start and end in the viewer's zone with the zone abbreviation. */
  readonly timeLabels: { readonly start: string; readonly end: string } | null;
  readonly openingLabel: string | null;
  readonly closingLabel: string | null;
  readonly showImpact: boolean;
}

function buildDatesLabel(row: CalendarRowVm, locale: string): string {
  const start = formatUtcDay(row.startDay, locale);
  const end = formatUtcDay(row.endDay, locale);
  return row.startDay === row.endDay ? start : `${start}${DATE_RANGE_SEPARATOR}${end}`;
}

function buildTimeLabels(row: CalendarRowVm, locale: string): CalendarRowView['timeLabels'] {
  if (row.isAllDay || row.type === 'mg') {
    return null;
  }
  return {
    start: formatTimestampWithZone(row.startsAt, locale),
    end: formatTimestampWithZone(row.endsAt, locale),
  };
}

function buildRowView(row: CalendarRowVm, locale: string): CalendarRowView {
  const isMg = row.type === 'mg';
  return {
    row,
    isMg,
    typeKey: TYPE_KEYS[row.type],
    stateKey: STATE_KEYS[row.state],
    stateClass: `state-${row.state}`,
    title: row.title,
    datesLabel: buildDatesLabel(row, locale),
    timeLabels: buildTimeLabels(row, locale),
    openingLabel: row.openingDay ? formatUtcDay(row.openingDay, locale) : null,
    closingLabel: row.closingDay ? formatUtcDay(row.closingDay, locale) : null,
    showImpact: isMg && row.servers > 0,
  };
}

/** Dumb list of calendar entries, stacked cards so it stays readable from 320px. */
@Component({
  selector: 'app-calendar-entry-list',
  imports: [MatButtonModule, MatCardModule, MatChipsModule, MatIconModule, TranslateModule],
  templateUrl: './calendar-entry-list.component.html',
  styleUrl: './calendar-entry-list.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CalendarEntryListComponent {
  private readonly translate = inject(TranslateService);

  readonly rows = input.required<readonly CalendarRowVm[]>();

  readonly shiftRequested = output<string>();
  readonly cancelRequested = output<string>();
  readonly editRequested = output<string>();
  readonly deleteRequested = output<string>();

  // A language switch is a genuine event stream, so the locale comes from toSignal, not a resource.
  private readonly language = toSignal(this.translate.onLangChange.pipe(map(event => event.lang)), {
    initialValue: this.translate.getCurrentLang(),
  });

  protected readonly views = computed<readonly CalendarRowView[]>(() => {
    const locale = this.language() || FALLBACK_LOCALE;
    return this.rows().map(row => buildRowView(row, locale));
  });
}
