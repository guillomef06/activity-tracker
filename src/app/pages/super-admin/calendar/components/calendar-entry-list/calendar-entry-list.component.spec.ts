import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TranslateModule, TranslateService } from '@ngx-translate/core';

import type { CalendarRowVm } from '../../calendar-page.models';
import { CalendarEntryListComponent } from './calendar-entry-list.component';

const TRANSLATIONS = {
  superAdmin: {
    calendar: {
      empty: 'No entry',
      type: { mg: 'Mightiest Governor', pvp: 'PvP' },
      state: {
        planned: 'Planned',
        registrationOpen: 'Registration open',
        awaitingStart: 'Awaiting start',
        ongoing: 'In progress',
        finished: 'Finished',
        cancelled: 'Cancelled',
      },
      list: {
        columnServers: 'Servers',
        columnRegistrations: 'Registrations',
        shift: 'Shift',
        cancel: 'Cancel',
        edit: 'Edit',
        delete: 'Delete',
        registrationOpenOn: 'Opens {{ date }}',
        closesOn: 'Closes {{ date }}',
      },
    },
  },
};

const MG_ROW: CalendarRowVm = {
  id: 'mg-1',
  type: 'mg',
  title: null,
  startsAt: '2027-05-31T00:00:00.000Z',
  endsAt: '2027-06-07T00:00:00.000Z',
  startDay: '2027-05-31',
  endDay: '2027-06-06',
  isAllDay: true,
  state: 'registration_open',
  openingDay: '2027-05-24',
  closingDay: '2027-05-27',
  servers: 3,
  registrations: 12,
  canShift: true,
  canCancel: true,
  canEdit: false,
  canDelete: false,
};

const PVP_ROW: CalendarRowVm = {
  id: 'pvp-1',
  type: 'pvp',
  title: 'Kingdom war',
  startsAt: '2027-01-05T19:00:00.000Z',
  endsAt: '2027-01-05T21:00:00.000Z',
  startDay: '2027-01-05',
  endDay: '2027-01-05',
  isAllDay: false,
  state: 'planned',
  openingDay: null,
  closingDay: null,
  servers: 0,
  registrations: 0,
  canShift: false,
  canCancel: false,
  canEdit: true,
  canDelete: true,
};

describe('CalendarEntryListComponent', () => {
  let fixture: ComponentFixture<CalendarEntryListComponent>;

  const render = (rows: readonly CalendarRowVm[]): HTMLElement => {
    fixture.componentRef.setInput('rows', rows);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  };

  const button = (el: HTMLElement, selector: string): HTMLButtonElement => {
    const found = el.querySelector<HTMLButtonElement>(selector);
    if (!found) {
      throw new Error(`Missing ${selector}`);
    }
    return found;
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CalendarEntryListComponent, TranslateModule.forRoot()],
      providers: [provideZonelessChangeDetection()],
    }).compileComponents();

    const translate = TestBed.inject(TranslateService);
    translate.setTranslation('en', TRANSLATIONS);
    translate.use('en');
    fixture = TestBed.createComponent(CalendarEntryListComponent);
  });

  it('should render the empty message when there is no row', () => {
    const el = render([]);

    expect(el.textContent).toContain('No entry');
    expect(el.querySelectorAll('li')).toHaveLength(0);
  });

  it('should render one card per row with type, state and dates', () => {
    const el = render([MG_ROW, PVP_ROW]);

    const cards = el.querySelectorAll('li');
    expect(cards).toHaveLength(2);
    expect(cards[0].textContent).toContain('Mightiest Governor');
    expect(cards[0].textContent).toContain('Registration open');
    expect(cards[0].querySelector('.entry-dates-text')?.textContent).toContain('May 31, 2027 – Jun 6, 2027');
    expect(cards[1].textContent).toContain('Kingdom war');
    expect(cards[1].textContent).toContain('Planned');
  });

  it('should show the registration window and impact when an MG is open', () => {
    const el = render([MG_ROW]);

    expect(el.querySelector('.entry-registration')?.textContent).toContain('Opens May 24, 2027');
    expect(el.querySelector('.entry-registration')?.textContent).toContain('Closes May 27, 2027');
    expect(el.querySelector('.impact-servers')?.textContent).toContain('3');
    expect(el.querySelector('.impact-registrations')?.textContent).toContain('12');
  });

  it('should hide the impact when no server has opened the MG', () => {
    const el = render([{ ...MG_ROW, servers: 0, registrations: 0 }]);

    expect(el.querySelector('.entry-impact')).toBeNull();
  });

  it('should show a zone abbreviation next to the time of a timestamped entry', () => {
    const el = render([PVP_ROW]);

    const times = el.querySelector('.entry-times-text')?.textContent ?? '';
    expect(times).toMatch(/\d{1,2}:\d{2}/);
    expect(times).toMatch(/(UTC|GMT|[A-Z]{2,5})/);
    expect(times).toContain('–');
  });

  it('should not show a time and keep the same day when the entry is an all-day one', () => {
    const el = render([{ ...PVP_ROW, isAllDay: true, startsAt: '2027-01-05T00:00:00.000Z' }]);

    expect(el.querySelector('.entry-times')).toBeNull();
    expect(el.querySelector('.entry-dates-text')?.textContent).toContain('Jan 5, 2027');
  });

  it('should not show a time for an MG entry and never shift its days', () => {
    const el = render([MG_ROW]);

    expect(el.querySelector('.entry-times')).toBeNull();
    expect(el.querySelector('.entry-dates-text')?.textContent).toContain('May 31, 2027');
  });

  it('should show MG actions enabled according to the flags', () => {
    const el = render([MG_ROW]);

    expect(button(el, '.action-shift').disabled).toBe(false);
    expect(button(el, '.action-cancel').disabled).toBe(false);
    expect(el.querySelector('.action-edit')).toBeNull();
    expect(el.querySelector('.action-delete')).toBeNull();
  });

  it('should disable MG actions when the flags are false', () => {
    const el = render([{ ...MG_ROW, canShift: false, canCancel: false }]);

    expect(button(el, '.action-shift').disabled).toBe(true);
    expect(button(el, '.action-cancel').disabled).toBe(true);
  });

  it('should disable non-MG actions when the flags are false', () => {
    const el = render([{ ...PVP_ROW, canEdit: false, canDelete: false }]);

    expect(button(el, '.action-edit').disabled).toBe(true);
    expect(button(el, '.action-delete').disabled).toBe(true);
  });

  it('should give each action an accessible name including the date', () => {
    const el = render([MG_ROW, PVP_ROW]);

    expect(button(el, '.action-shift').getAttribute('aria-label')).toBe('Shift 2027-05-31');
    expect(button(el, '.action-cancel').getAttribute('aria-label')).toBe('Cancel 2027-05-31');
    expect(button(el, '.action-edit').getAttribute('aria-label')).toBe('Edit Kingdom war 2027-01-05');
    expect(button(el, '.action-delete').getAttribute('aria-label')).toBe('Delete Kingdom war 2027-01-05');
  });

  it('should emit the entry id for each action', () => {
    const el = render([MG_ROW, PVP_ROW]);
    const shift = vi.fn();
    const cancel = vi.fn();
    const edit = vi.fn();
    const remove = vi.fn();
    fixture.componentInstance.shiftRequested.subscribe(shift);
    fixture.componentInstance.cancelRequested.subscribe(cancel);
    fixture.componentInstance.editRequested.subscribe(edit);
    fixture.componentInstance.deleteRequested.subscribe(remove);

    button(el, '.action-shift').click();
    button(el, '.action-cancel').click();
    button(el, '.action-edit').click();
    button(el, '.action-delete').click();

    expect(shift).toHaveBeenCalledWith('mg-1');
    expect(cancel).toHaveBeenCalledWith('mg-1');
    expect(edit).toHaveBeenCalledWith('pvp-1');
    expect(remove).toHaveBeenCalledWith('pvp-1');
  });

  it('should not emit when a disabled action is clicked', () => {
    const el = render([{ ...MG_ROW, canShift: false }]);
    const shift = vi.fn();
    fixture.componentInstance.shiftRequested.subscribe(shift);

    button(el, '.action-shift').click();

    expect(shift).not.toHaveBeenCalled();
  });
});
