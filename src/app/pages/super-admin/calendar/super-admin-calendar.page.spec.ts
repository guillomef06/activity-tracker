import { Component, input, output, provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { MatDialog } from '@angular/material/dialog';
import { provideRouter } from '@angular/router';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { of } from 'rxjs';
import { vi } from 'vitest';

import { CalendarService } from '@app/core/services/calendar.service';
import { SnackbarService } from '@app/core/services';
import type {
  CalendarEntryWithImpact,
  CalendarOperationError,
  CreateEntryResult,
  IsoDate,
  MgEntryLike,
  OtherEntryInput,
} from '@shared/models';
import type { CalendarRowVm } from './calendar-page.models';
import { CalendarConfirmDialogComponent } from './components/calendar-confirm-dialog/calendar-confirm-dialog.component';
import { CalendarEntryListComponent } from './components/calendar-entry-list/calendar-entry-list.component';
import { MgEntryWizardComponent } from './components/mg-entry-wizard/mg-entry-wizard.component';
import { MgShiftDialogComponent } from './components/mg-shift-dialog/mg-shift-dialog.component';
import { OtherEntryFormComponent } from './components/other-entry-form/other-entry-form.component';
import { SuperAdminCalendarPage } from './super-admin-calendar.page';

// ─── Stubs of the dumb components (API agreed with tracks 3B / 3C) ──────────

@Component({ selector: 'app-calendar-entry-list', template: '' })
class StubEntryListComponent {
  readonly rows = input.required<readonly CalendarRowVm[]>();
  readonly shiftRequested = output<string>();
  readonly cancelRequested = output<string>();
  readonly editRequested = output<string>();
  readonly deleteRequested = output<string>();
}

@Component({ selector: 'app-mg-entry-wizard', template: '' })
class StubWizardComponent {
  readonly existing = input.required<readonly MgEntryLike[]>();
  readonly today = input.required<IsoDate>();
  readonly results = input<readonly CreateEntryResult[] | null>(null);
  readonly busy = input(false);
  readonly submitted = output<IsoDate[]>();
  readonly closed = output<void>();
}

@Component({ selector: 'app-other-entry-form', template: '' })
class StubFormComponent {
  readonly initial = input<OtherEntryInput | null>(null);
  readonly busy = input(false);
  readonly saved = output<OtherEntryInput>();
  readonly cancelled = output<void>();
}

// ─── Fixtures ────────────────────────────────────────────────────────────────

const NOW = '2027-06-02T10:00:00Z';

const TRANSLATIONS = {
  common: { retry: 'Retry' },
  superAdmin: {
    calendar: {
      title: 'MG calendar',
      loadFailed: 'Failed to load',
      empty: 'Nothing yet',
      newMg: 'New MG',
      newOther: 'New event',
      futureSection: 'Upcoming',
      historySection: 'History',
      saved: 'Saved',
      shifted: 'Shifted',
      cancelled: 'Cancelled',
      deleted: 'Deleted',
      errors: {
        unknown: 'Unknown error',
        notShiftable: 'Not shiftable',
        tooClose: 'Too close',
        reason: { must_move_later: 'Only later' },
      },
    },
  },
};

const entry = (
  id: string,
  start: string,
  overrides: Partial<CalendarEntryWithImpact> = {}
): CalendarEntryWithImpact => ({
  id,
  type: 'mg',
  title: null,
  starts_at: `${start}T00:00:00Z`,
  ends_at: `${start}T23:59:59Z`,
  all_day: true,
  cancelled_at: null,
  cancelled_by: null,
  created_at: '2027-01-01T00:00:00Z',
  created_by: null,
  updated_at: '2027-01-01T00:00:00Z',
  updated_by: null,
  mg_events: [],
  ...overrides,
});

const UPCOMING_MG = entry('mg-next', '2027-06-07', {
  mg_events: [
    { id: 'e1', server_id: 's1', status: 'registration_open', mg_registrations: [{ count: 4 }] },
    { id: 'e2', server_id: 's2', status: 'registration_open', mg_registrations: [{ count: 3 }] },
  ],
});
const FINISHED_MG = entry('mg-old', '2027-04-05');
const PVP = entry('pvp-1', '2027-06-20', {
  type: 'pvp',
  title: 'PvP night',
  all_day: false,
  ends_at: '2027-06-21T00:00:00Z',
});
const ALL_ENTRIES = [FINISHED_MG, PVP, UPCOMING_MG];

const operationError = (details: Record<string, unknown> | null): CalendarOperationError => ({
  code: 'MG_CAL_NOT_SHIFTABLE',
  details,
});

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('SuperAdminCalendarPage', () => {
  let fixture: ComponentFixture<SuperAdminCalendarPage>;
  let calendarMock: {
    loadEntriesWithImpact: ReturnType<typeof vi.fn>;
    createMgEntries: ReturnType<typeof vi.fn>;
    shiftMgEntry: ReturnType<typeof vi.fn>;
    cancelMgEntry: ReturnType<typeof vi.fn>;
    createOtherEntry: ReturnType<typeof vi.fn>;
    updateOtherEntry: ReturnType<typeof vi.fn>;
    deleteOtherEntry: ReturnType<typeof vi.fn>;
  };
  let snackbarMock: { success: ReturnType<typeof vi.fn>; error: ReturnType<typeof vi.fn> };
  let dialogMock: { open: ReturnType<typeof vi.fn> };

  const flush = async (): Promise<void> => {
    await new Promise(resolve => setTimeout(resolve));
    await fixture.whenStable();
    fixture.detectChanges();
  };

  const mount = async (): Promise<void> => {
    fixture = TestBed.createComponent(SuperAdminCalendarPage);
    fixture.detectChanges();
    await flush();
  };

  const element = (): HTMLElement => fixture.nativeElement as HTMLElement;

  const lists = (): StubEntryListComponent[] =>
    fixture.debugElement.queryAll(By.directive(StubEntryListComponent)).map(d => d.componentInstance);

  const wizard = (): StubWizardComponent | undefined =>
    fixture.debugElement.query(By.directive(StubWizardComponent))?.componentInstance;

  const form = (): StubFormComponent | undefined =>
    fixture.debugElement.query(By.directive(StubFormComponent))?.componentInstance;

  const clickButton = (label: string): void => {
    const button = Array.from(element().querySelectorAll('button')).find(b => b.textContent?.includes(label));
    button?.click();
  };

  const dialogReturns = (value: unknown): void => {
    dialogMock.open.mockReturnValue({ afterClosed: () => of(value) });
  };

  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(NOW));

    calendarMock = {
      loadEntriesWithImpact: vi.fn().mockResolvedValue(ALL_ENTRIES),
      createMgEntries: vi.fn().mockResolvedValue({ results: [], error: null }),
      shiftMgEntry: vi.fn().mockResolvedValue({ moved: [], error: null }),
      cancelMgEntry: vi.fn().mockResolvedValue({ outcome: 'cancelled', error: null }),
      createOtherEntry: vi.fn().mockResolvedValue({ error: null }),
      updateOtherEntry: vi.fn().mockResolvedValue({ error: null }),
      deleteOtherEntry: vi.fn().mockResolvedValue({ error: null }),
    };
    snackbarMock = { success: vi.fn(), error: vi.fn() };
    dialogMock = { open: vi.fn() };

    await TestBed.configureTestingModule({
      imports: [SuperAdminCalendarPage, NoopAnimationsModule, TranslateModule.forRoot()],
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([]),
        { provide: CalendarService, useValue: calendarMock },
        { provide: SnackbarService, useValue: snackbarMock },
        { provide: MatDialog, useValue: dialogMock },
      ],
    })
      .overrideComponent(SuperAdminCalendarPage, {
        remove: { imports: [CalendarEntryListComponent, MgEntryWizardComponent, OtherEntryFormComponent] },
        add: { imports: [StubEntryListComponent, StubWizardComponent, StubFormComponent] },
      })
      .compileComponents();

    const translate = TestBed.inject(TranslateService);
    translate.setTranslation('en', TRANSLATIONS);
    translate.use('en');
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('loading states', () => {
    it('should show a spinner while the entries are loading', async () => {
      calendarMock.loadEntriesWithImpact.mockReturnValue(new Promise(() => undefined));

      fixture = TestBed.createComponent(SuperAdminCalendarPage);
      fixture.detectChanges();

      expect(element().querySelector('mat-spinner')).not.toBeNull();
    });

    it('should show the error card, then reload when retry is clicked', async () => {
      calendarMock.loadEntriesWithImpact.mockRejectedValueOnce(new Error('down'));

      await mount();

      expect(element().textContent).toContain('Failed to load');
      expect(lists()).toHaveLength(0);

      clickButton('Retry');
      await flush();

      expect(calendarMock.loadEntriesWithImpact).toHaveBeenCalledTimes(2);
      expect(element().textContent).not.toContain('Failed to load');
      expect(lists()).toHaveLength(2);
    });

    it('should show the empty state when there is no entry', async () => {
      calendarMock.loadEntriesWithImpact.mockResolvedValue([]);

      await mount();

      expect(element().textContent).toContain('Nothing yet');
    });

    it('should render the back-to-dashboard button in the header', async () => {
      await mount();

      expect(element().querySelector('mat-card-header app-back-to-dashboard-button')).not.toBeNull();
    });
  });

  describe('rows', () => {
    it('should give the upcoming list before the history list, each correctly ordered', async () => {
      await mount();

      const [upcoming, history] = lists();

      expect(upcoming.rows().map(r => r.id)).toEqual(['mg-next', 'pvp-1']);
      expect(history.rows().map(r => r.id)).toEqual(['mg-old']);
    });

    it('should build state, counts and action rights per row', async () => {
      await mount();

      const [mg, pvp] = lists()[0].rows();

      expect(mg).toMatchObject({
        state: 'registration_open',
        servers: 2,
        registrations: 7,
        canShift: true,
        canCancel: true,
        canEdit: false,
        canDelete: false,
        openingDay: '2027-05-31',
      });
      expect(pvp).toMatchObject({ title: 'PvP night', canEdit: true, canDelete: true, canShift: false });
    });

    it('should hide the history section when every entry is upcoming', async () => {
      calendarMock.loadEntriesWithImpact.mockResolvedValue([UPCOMING_MG]);

      await mount();

      expect(lists()).toHaveLength(1);
    });
  });

  describe('shift flow', () => {
    it('should pass the dialog data, shift on confirmation, reload and notify', async () => {
      await mount();
      dialogReturns('2027-06-14');

      lists()[0].shiftRequested.emit('mg-next');
      await flush();

      const [component, config] = dialogMock.open.mock.calls[0];
      expect(component).toBe(MgShiftDialogComponent);
      expect(config.data).toMatchObject({ selectedId: 'mg-next', today: '2027-06-02', servers: 2, registrations: 7 });
      expect(calendarMock.shiftMgEntry).toHaveBeenCalledWith('mg-next', '2027-06-14');
      expect(calendarMock.loadEntriesWithImpact).toHaveBeenCalledTimes(2);
      expect(snackbarMock.success).toHaveBeenCalledWith('Shifted');
    });

    it('should do nothing when the dialog is dismissed', async () => {
      await mount();
      dialogReturns(undefined);

      lists()[0].shiftRequested.emit('mg-next');
      await flush();

      expect(calendarMock.shiftMgEntry).not.toHaveBeenCalled();
      expect(calendarMock.loadEntriesWithImpact).toHaveBeenCalledTimes(1);
    });

    it('should show the precise reason message when the error carries a reason', async () => {
      await mount();
      dialogReturns('2027-06-14');
      calendarMock.shiftMgEntry.mockResolvedValue({ moved: [], error: operationError({ reason: 'must_move_later' }) });

      lists()[0].shiftRequested.emit('mg-next');
      await flush();

      expect(snackbarMock.error).toHaveBeenCalledWith('Only later');
      expect(snackbarMock.success).not.toHaveBeenCalled();
      expect(calendarMock.loadEntriesWithImpact).toHaveBeenCalledTimes(1);
    });

    it('should fall back to the generic message when there is no reason', async () => {
      await mount();
      dialogReturns('2027-06-14');
      calendarMock.shiftMgEntry.mockResolvedValue({ moved: [], error: operationError(null) });

      lists()[0].shiftRequested.emit('mg-next');
      await flush();

      expect(snackbarMock.error).toHaveBeenCalledWith('Not shiftable');
    });
  });

  describe('cancel flow', () => {
    it('should confirm with the impact counts, cancel, reload and notify', async () => {
      await mount();
      dialogReturns(true);

      lists()[0].cancelRequested.emit('mg-next');
      await flush();

      const [component, config] = dialogMock.open.mock.calls[0];
      expect(component).toBe(CalendarConfirmDialogComponent);
      expect(config.data).toEqual({ variant: 'cancel', label: '2027-06-07', servers: 2, registrations: 7 });
      expect(calendarMock.cancelMgEntry).toHaveBeenCalledWith('mg-next');
      expect(calendarMock.loadEntriesWithImpact).toHaveBeenCalledTimes(2);
      expect(snackbarMock.success).toHaveBeenCalledWith('Cancelled');
    });

    it('should not cancel when the confirmation is dismissed', async () => {
      await mount();
      dialogReturns(undefined);

      lists()[0].cancelRequested.emit('mg-next');
      await flush();

      expect(calendarMock.cancelMgEntry).not.toHaveBeenCalled();
    });

    it('should map a cancel error to its translated message', async () => {
      await mount();
      dialogReturns(true);
      calendarMock.cancelMgEntry.mockResolvedValue({
        outcome: null,
        error: { code: 'MG_CAL_TOO_CLOSE', details: null },
      });

      lists()[0].cancelRequested.emit('mg-next');
      await flush();

      expect(snackbarMock.error).toHaveBeenCalledWith('Too close');
    });
  });

  describe('delete flow', () => {
    it('should confirm, delete a non-MG entry, reload and notify', async () => {
      await mount();
      dialogReturns(true);

      lists()[0].deleteRequested.emit('pvp-1');
      await flush();

      expect(dialogMock.open.mock.calls[0][1].data).toMatchObject({ variant: 'delete', label: 'PvP night' });
      expect(calendarMock.deleteOtherEntry).toHaveBeenCalledWith('pvp-1');
      expect(snackbarMock.success).toHaveBeenCalledWith('Deleted');
      expect(calendarMock.loadEntriesWithImpact).toHaveBeenCalledTimes(2);
    });

    it('should show the generic error when the delete fails', async () => {
      await mount();
      dialogReturns(true);
      calendarMock.deleteOtherEntry.mockResolvedValue({ error: { message: 'rls' } });
      const logSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

      lists()[0].deleteRequested.emit('pvp-1');
      await flush();

      expect(snackbarMock.error).toHaveBeenCalledWith('Unknown error');
      expect(calendarMock.loadEntriesWithImpact).toHaveBeenCalledTimes(1);
      logSpy.mockRestore();
    });
  });

  describe('MG creation', () => {
    it('should open the wizard with the entries and today', async () => {
      await mount();

      clickButton('New MG');
      fixture.detectChanges();

      expect(wizard()?.today()).toBe('2027-06-02');
      expect(
        wizard()
          ?.existing()
          .map(e => e.id)
      ).toContain('mg-next');
    });

    it('should create the submitted dates, expose the results, reload and notify', async () => {
      const results: CreateEntryResult[] = [
        { opening_monday: '2027-07-05', mg_start: '2027-07-12', outcome: 'created', entry_id: 'new' },
      ];
      calendarMock.createMgEntries.mockResolvedValue({ results, error: null });
      await mount();
      clickButton('New MG');
      fixture.detectChanges();

      wizard()?.submitted.emit(['2027-07-05']);
      await flush();

      expect(calendarMock.createMgEntries).toHaveBeenCalledWith(['2027-07-05']);
      expect(wizard()?.results()).toEqual(results);
      expect(calendarMock.loadEntriesWithImpact).toHaveBeenCalledTimes(2);
      expect(snackbarMock.success).toHaveBeenCalledWith('Saved');
    });

    it('should show the mapped error and keep the wizard open when creation fails', async () => {
      calendarMock.createMgEntries.mockResolvedValue({ results: [], error: operationError(null) });
      await mount();
      clickButton('New MG');
      fixture.detectChanges();

      wizard()?.submitted.emit(['2027-07-05']);
      await flush();

      expect(snackbarMock.error).toHaveBeenCalledWith('Not shiftable');
      expect(wizard()?.results()).toBeNull();
    });

    it('should close the wizard without writing anything', async () => {
      await mount();
      clickButton('New MG');
      fixture.detectChanges();

      wizard()?.closed.emit();
      fixture.detectChanges();

      expect(wizard()).toBeUndefined();
      expect(calendarMock.createMgEntries).not.toHaveBeenCalled();
    });
  });

  describe('non-MG entries', () => {
    const input: OtherEntryInput = {
      type: 'pvp',
      title: 'Clash',
      starts_at: '2027-07-01T00:00:00Z',
      ends_at: '2027-07-02T00:00:00Z',
      all_day: true,
    };

    it('should create an entry from an empty form, close it, reload and notify', async () => {
      await mount();
      clickButton('New event');
      fixture.detectChanges();

      expect(form()?.initial()).toBeNull();
      form()?.saved.emit(input);
      await flush();

      expect(calendarMock.createOtherEntry).toHaveBeenCalledWith(input);
      expect(form()).toBeUndefined();
      expect(calendarMock.loadEntriesWithImpact).toHaveBeenCalledTimes(2);
      expect(snackbarMock.success).toHaveBeenCalledWith('Saved');
    });

    it('should prefill the form on edit and update the entry on save', async () => {
      await mount();

      lists()[0].editRequested.emit('pvp-1');
      fixture.detectChanges();

      expect(form()?.initial()).toEqual({
        type: 'pvp',
        title: 'PvP night',
        starts_at: PVP.starts_at,
        ends_at: PVP.ends_at,
        all_day: false,
      });

      form()?.saved.emit(input);
      await flush();

      expect(calendarMock.updateOtherEntry).toHaveBeenCalledWith('pvp-1', input);
      expect(calendarMock.createOtherEntry).not.toHaveBeenCalled();
    });

    it('should keep the form open and show an error when the save fails', async () => {
      calendarMock.createOtherEntry.mockResolvedValue({ error: { message: 'boom' } });
      const logSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
      await mount();
      clickButton('New event');
      fixture.detectChanges();

      form()?.saved.emit(input);
      await flush();

      expect(snackbarMock.error).toHaveBeenCalledWith('Unknown error');
      expect(form()).toBeDefined();
      logSpy.mockRestore();
    });

    it('should close the form on cancel', async () => {
      await mount();
      clickButton('New event');
      fixture.detectChanges();

      form()?.cancelled.emit();
      fixture.detectChanges();

      expect(form()).toBeUndefined();
    });
  });
});
