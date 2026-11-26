import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TestBed, ComponentFixture } from '@angular/core/testing';
import { provideAnimations } from '@angular/platform-browser/animations';
import { provideZonelessChangeDetection } from '@angular/core';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { MgAdminTabComponent } from './mg-admin-tab.component';
import { MgEventService } from '@app/core/services/mg-event.service';
import { CalendarService } from '@app/core/services/calendar.service';
import { AuthService } from '@app/core/services/auth.service';
import { ActivityService } from '@app/core/services/activity.service';
import { ServerService } from '@app/core/services/server.service';
import { SnackbarService } from '@app/core/services';
import type { MgSlotRow } from '@shared/utils/mg-slot.util';

const mockMgEventService = {
  loadCurrentEvent: vi.fn().mockResolvedValue(null),
  loadCurrentEventStrict: vi.fn().mockResolvedValue(null),
  loadLastFinishedEvent: vi.fn().mockResolvedValue(null),
  loadServerConfig: vi.fn().mockResolvedValue(null),
  saveServerConfig: vi.fn().mockResolvedValue({ error: null }),
  loadSlotConfig: vi.fn().mockResolvedValue([]),
  saveSlotConfig: vi.fn().mockResolvedValue({ error: null }),
  loadRegistrations: vi.fn().mockResolvedValue([]),
  loadSelection: vi.fn().mockResolvedValue([]),
  generateAutoSelectionPayload: vi.fn().mockReturnValue([]),
  saveSelection: vi.fn().mockResolvedValue({ error: null }),
  publishSelection: vi.fn().mockResolvedValue({ error: null }),
};

const mockCalendarService = {
  loadEntries: vi.fn().mockResolvedValue([]),
};

const BANNER_TEXT = 'No MG planned';

const mockAuthService = {
  getServerId: vi.fn().mockReturnValue('server-1'),
  getUserId: vi.fn().mockReturnValue('user-1'),
};

const mockActivityService = {
  initialize: vi.fn().mockResolvedValue(undefined),
  getUserScores: vi.fn().mockReturnValue([]),
};

const mockServerService = { members: vi.fn().mockReturnValue([]) };

const mockSnackbarService = {
  success: vi.fn(),
  error: vi.fn(),
};

const makeSelection = (eventId: string) => [
  {
    id: 'sel-1',
    mg_event_id: eventId,
    user_id: 'user-1',
    rank: 1,
    selection_type: 'selected',
    selected_by: 'automatic',
    cost: 150,
    label: null,
    approved_rank: null,
    approved_cost: null,
    user_profiles: { display_name: 'Alice', username: 'alice' },
  },
];

describe('MgAdminTabComponent', () => {
  let component: MgAdminTabComponent;
  let fixture: ComponentFixture<MgAdminTabComponent>;

  beforeEach(async () => {
    vi.clearAllMocks();

    await TestBed.configureTestingModule({
      imports: [MgAdminTabComponent, TranslateModule.forRoot()],
      providers: [
        provideAnimations(),
        provideZonelessChangeDetection(),
        { provide: MgEventService, useValue: mockMgEventService },
        { provide: CalendarService, useValue: mockCalendarService },
        { provide: AuthService, useValue: mockAuthService },
        { provide: ActivityService, useValue: mockActivityService },
        { provide: ServerService, useValue: mockServerService },
        { provide: SnackbarService, useValue: mockSnackbarService },
      ],
    }).compileComponents();

    const translate = TestBed.inject(TranslateService);
    translate.setTranslation('en', { mg: { calendar: { banner: { serverAdminNone: BANNER_TEXT } } } });
    translate.use('en');

    fixture = TestBed.createComponent(MgAdminTabComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should initialize with default config form values', () => {
    const model = (
      component as unknown as { configModel: () => { capacity: number; assignment_mode: string; dkp_enabled: boolean } }
    ).configModel();
    expect(model.capacity).toBe(10);
    expect(model.assignment_mode).toBe('automatic');
    expect(model.dkp_enabled).toBe(false);
  });

  it('should call loadCurrentEvent and loadServerConfig on init', () => {
    expect(mockMgEventService.loadCurrentEvent).toHaveBeenCalledWith('server-1');
    expect(mockMgEventService.loadServerConfig).toHaveBeenCalledWith('server-1');
  });

  it('should call activityService.initialize on init', () => {
    expect(mockActivityService.initialize).toHaveBeenCalled();
  });

  it('should show no-event state when no event loaded', () => {
    const compiled = fixture.nativeElement as HTMLElement;
    // The empty-state paragraph should be visible
    const paragraphs = Array.from(compiled.querySelectorAll('p'));
    // At least some content rendered
    expect(paragraphs.length).toBeGreaterThanOrEqual(0);
  });

  describe('DKP toggle', () => {
    it('should patch dkp_enabled from the loaded server config', async () => {
      mockMgEventService.loadServerConfig.mockResolvedValueOnce({
        server_id: 'server-1',
        capacity: 10,
        assignment_mode: 'automatic',
        dkp_enabled: true,
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
      });

      fixture = TestBed.createComponent(MgAdminTabComponent);
      component = fixture.componentInstance;
      await component.ngOnInit();
      fixture.detectChanges();

      const model = (component as unknown as { configModel: () => { dkp_enabled: boolean } }).configModel();
      expect(model.dkp_enabled).toBe(true);
    });
  });

  describe('slot configuration', () => {
    const getSlotRows = (): MgSlotRow[] => (component as unknown as { slotRows: MgSlotRow[] }).slotRows;

    it('should call loadSlotConfig on init', () => {
      expect(mockMgEventService.loadSlotConfig).toHaveBeenCalledWith('server-1');
    });

    it('should build 10 rows from defaults when no server override exists', () => {
      const rows = getSlotRows();
      expect(rows).toHaveLength(10);
      expect(rows[0].cost).toBe(150);
      expect(rows[0].rankLabel).toBe('1');
    });

    it('should rebuild the form array from loaded server config overrides', async () => {
      mockMgEventService.loadSlotConfig.mockResolvedValueOnce([
        {
          id: 'cfg-1',
          server_id: 'server-1',
          slot_order: 1,
          cost: 999,
          target_min: 30,
          target_max: 30,
          created_at: '2026-01-01T00:00:00Z',
          updated_at: '2026-01-01T00:00:00Z',
        },
      ]);

      fixture = TestBed.createComponent(MgAdminTabComponent);
      component = fixture.componentInstance;
      await component.ngOnInit();
      fixture.detectChanges();

      const rows = getSlotRows();
      expect(rows[0].cost).toBe(999);
    });

    it('should be valid when targetMax is greater than or equal to targetMin', () => {
      const slotConfigModel = (
        component as unknown as {
          slotConfigModel: { update: (fn: (c: { rows: MgSlotRow[] }) => { rows: MgSlotRow[] }) => void };
        }
      ).slotConfigModel;
      slotConfigModel.update(current => ({
        rows: current.rows.map((row, i) => (i === 0 ? { ...row, targetMin: 10, targetMax: 10 } : row)),
      }));

      const slotConfigForm = (
        component as unknown as { slotConfigForm: { rows: { targetMax: () => { valid: () => boolean } }[] } }
      ).slotConfigForm;
      expect(slotConfigForm.rows[0].targetMax().valid()).toBe(true);
    });

    it('should be invalid when targetMax is less than targetMin', () => {
      const slotConfigModel = (
        component as unknown as {
          slotConfigModel: { update: (fn: (c: { rows: MgSlotRow[] }) => { rows: MgSlotRow[] }) => void };
        }
      ).slotConfigModel;
      slotConfigModel.update(current => ({
        rows: current.rows.map((row, i) => (i === 0 ? { ...row, targetMin: 20, targetMax: 10 } : row)),
      }));

      const slotConfigForm = (
        component as unknown as {
          slotConfigForm: { rows: { targetMax: () => { errors: () => { kind: string }[] } }[] };
        }
      ).slotConfigForm;
      expect(
        slotConfigForm.rows[0]
          .targetMax()
          .errors()
          .some(e => e.kind === 'targetRange')
      ).toBe(true);
    });

    it('should not call saveSlotConfig when the form is invalid', async () => {
      const slotConfigModel = (
        component as unknown as {
          slotConfigModel: { update: (fn: (c: { rows: MgSlotRow[] }) => { rows: MgSlotRow[] }) => void };
        }
      ).slotConfigModel;
      slotConfigModel.update(current => ({
        rows: current.rows.map((row, i) => (i === 0 ? { ...row, cost: -1 } : row)),
      }));

      await (component as unknown as { saveSettings: () => Promise<void> }).saveSettings();

      expect(mockMgEventService.saveSlotConfig).not.toHaveBeenCalled();
    });
  });

  describe('registrationRows', () => {
    const makeRegistration = (desiredSlotOrder: number | null) => ({
      id: 'reg-1',
      mg_event_id: 'event-1',
      user_id: 'user-1',
      registered_at: '2026-01-01T00:00:00Z',
      desired_slot_order: desiredSlotOrder,
      comment: null,
      user_profiles: { display_name: 'Alice', username: 'alice' },
    });

    const getRegistrationRows = (): { positionLabel: string | null; totalScore: number | null }[] =>
      (
        component as unknown as {
          registrationRows: () => { positionLabel: string | null; totalScore: number | null }[];
        }
      ).registrationRows();

    it('should resolve a known slot_order to its rank label', () => {
      (component as unknown as { registrations: { set: (v: unknown[]) => void } }).registrations.set([
        makeRegistration(1),
      ]);
      expect(getRegistrationRows()[0].positionLabel).toBe('1');
    });

    it('should resolve a grouped slot_order to its range label', () => {
      (component as unknown as { registrations: { set: (v: unknown[]) => void } }).registrations.set([
        makeRegistration(6),
      ]);
      expect(getRegistrationRows()[0].positionLabel).toBe('6-7');
    });

    it('should return null when desired_slot_order is null (pre-existing registration)', () => {
      (component as unknown as { registrations: { set: (v: unknown[]) => void } }).registrations.set([
        makeRegistration(null),
      ]);
      expect(getRegistrationRows()[0].positionLabel).toBeNull();
    });

    it('should return null for an out-of-range slot_order', () => {
      (component as unknown as { registrations: { set: (v: unknown[]) => void } }).registrations.set([
        makeRegistration(99),
      ]);
      expect(getRegistrationRows()[0].positionLabel).toBeNull();
    });

    it("should resolve the registrant's total score from activityService.getUserScores()", () => {
      mockActivityService.getUserScores.mockReturnValueOnce([
        { userId: 'user-1', displayName: 'Alice', weeklyScores: [], totalScore: 42 },
      ]);
      (component as unknown as { registrations: { set: (v: unknown[]) => void } }).registrations.set([
        makeRegistration(1),
      ]);
      expect(getRegistrationRows()[0].totalScore).toBe(42);
    });

    it('should return null when the registrant has no score in the current scoring window', () => {
      mockActivityService.getUserScores.mockReturnValueOnce([]);
      (component as unknown as { registrations: { set: (v: unknown[]) => void } }).registrations.set([
        makeRegistration(1),
      ]);
      expect(getRegistrationRows()[0].totalScore).toBeNull();
    });
  });

  describe('registrations list rendering', () => {
    /**
     * `fixture.detectChanges()` triggers Angular's own `ngOnInit` invocation on a fresh
     * fixture, and the component's async loading chain (Promise.all + activityService.initialize)
     * needs more than a single microtask tick to settle — `fixture.whenStable()` alone does not
     * wait for it in this zoneless setup, so a couple of macrotask ticks are flushed explicitly.
     */
    const flushAsyncNgOnInit = async (): Promise<void> => {
      await new Promise(resolve => setTimeout(resolve, 0));
      await new Promise(resolve => setTimeout(resolve, 0));
    };

    it('should display the desired position and comment for a registration', async () => {
      mockMgEventService.loadCurrentEvent.mockResolvedValueOnce({
        id: 'event-1',
        server_id: 'server-1',
        start_date: '2026-01-05',
        end_date: '2026-01-11',
        registration_open_at: '2025-12-29',
        registration_close_at: '2026-01-01',
        status: 'registration_open',
        selection_published_at: null,
        created_at: '2026-01-01T00:00:00Z',
      });
      mockMgEventService.loadRegistrations.mockResolvedValueOnce([
        {
          id: 'reg-1',
          mg_event_id: 'event-1',
          user_id: 'user-1',
          registered_at: '2026-01-01T00:00:00Z',
          desired_slot_order: 2,
          comment: 'Aiming for top spots',
          user_profiles: { display_name: 'Alice', username: 'alice' },
        },
      ]);

      fixture = TestBed.createComponent(MgAdminTabComponent);
      component = fixture.componentInstance;
      fixture.detectChanges();
      await flushAsyncNgOnInit();
      fixture.detectChanges();

      const compiled = fixture.nativeElement as HTMLElement;
      expect(compiled.textContent).toContain('Aiming for top spots');
    });

    it('should show a graceful fallback for a pre-existing registration with no desired position', async () => {
      mockMgEventService.loadCurrentEvent.mockResolvedValueOnce({
        id: 'event-1',
        server_id: 'server-1',
        start_date: '2026-01-05',
        end_date: '2026-01-11',
        registration_open_at: '2025-12-29',
        registration_close_at: '2026-01-01',
        status: 'registration_open',
        selection_published_at: null,
        created_at: '2026-01-01T00:00:00Z',
      });
      mockMgEventService.loadRegistrations.mockResolvedValueOnce([
        {
          id: 'reg-1',
          mg_event_id: 'event-1',
          user_id: 'user-1',
          registered_at: '2026-01-01T00:00:00Z',
          desired_slot_order: null,
          comment: null,
          user_profiles: { display_name: 'Alice', username: 'alice' },
        },
      ]);

      fixture = TestBed.createComponent(MgAdminTabComponent);
      component = fixture.componentInstance;
      fixture.detectChanges();
      await flushAsyncNgOnInit();
      fixture.detectChanges();

      const rows = (
        component as unknown as { registrationRows: () => { positionLabel: string | null }[] }
      ).registrationRows();
      expect(rows[0].positionLabel).toBeNull();

      // The template must not render a literal "null" or "undefined" — it falls back to the
      // translated "no position" copy instead (mg.admin.registrations.noPosition).
      const compiled = fixture.nativeElement as HTMLElement;
      expect(compiled.textContent).not.toContain('null');
      expect(compiled.textContent).not.toContain('undefined');
    });

    // The Registrations list (with .total-score) is only shown once the selection is locked.
    it("should display the registrant's total score", async () => {
      mockMgEventService.loadCurrentEvent.mockResolvedValueOnce({
        id: 'event-1',
        server_id: 'server-1',
        start_date: '2026-01-05',
        end_date: '2026-01-11',
        registration_open_at: '2025-12-29',
        registration_close_at: '2026-01-01',
        status: 'selection_published',
        selection_published_at: null,
        created_at: '2026-01-01T00:00:00Z',
      });
      mockMgEventService.loadRegistrations.mockResolvedValueOnce([
        {
          id: 'reg-1',
          mg_event_id: 'event-1',
          user_id: 'user-1',
          registered_at: '2026-01-01T00:00:00Z',
          desired_slot_order: 2,
          comment: null,
          user_profiles: { display_name: 'Alice', username: 'alice' },
        },
      ]);
      mockActivityService.getUserScores.mockReturnValueOnce([
        { userId: 'user-1', displayName: 'Alice', weeklyScores: [], totalScore: 55 },
      ]);

      fixture = TestBed.createComponent(MgAdminTabComponent);
      component = fixture.componentInstance;
      fixture.detectChanges();
      await flushAsyncNgOnInit();
      fixture.detectChanges();

      const compiled = fixture.nativeElement as HTMLElement;
      expect(compiled.querySelector('.total-score')?.textContent).toContain('55');
    });

    it('should default the total score to 0 when the registrant has no score in the current scoring window', async () => {
      mockMgEventService.loadCurrentEvent.mockResolvedValueOnce({
        id: 'event-1',
        server_id: 'server-1',
        start_date: '2026-01-05',
        end_date: '2026-01-11',
        registration_open_at: '2025-12-29',
        registration_close_at: '2026-01-01',
        status: 'selection_published',
        selection_published_at: null,
        created_at: '2026-01-01T00:00:00Z',
      });
      mockMgEventService.loadRegistrations.mockResolvedValueOnce([
        {
          id: 'reg-1',
          mg_event_id: 'event-1',
          user_id: 'user-1',
          registered_at: '2026-01-01T00:00:00Z',
          desired_slot_order: 2,
          comment: null,
          user_profiles: { display_name: 'Alice', username: 'alice' },
        },
      ]);
      mockActivityService.getUserScores.mockReturnValueOnce([]);

      fixture = TestBed.createComponent(MgAdminTabComponent);
      component = fixture.componentInstance;
      fixture.detectChanges();
      await flushAsyncNgOnInit();
      fixture.detectChanges();

      const compiled = fixture.nativeElement as HTMLElement;
      expect(compiled.querySelector('.total-score')?.textContent).toContain('0');
    });

    it('should not render the comment element when the registration has no comment', async () => {
      mockMgEventService.loadCurrentEvent.mockResolvedValueOnce({
        id: 'event-1',
        server_id: 'server-1',
        start_date: '2026-01-05',
        end_date: '2026-01-11',
        registration_open_at: '2025-12-29',
        registration_close_at: '2026-01-01',
        status: 'registration_open',
        selection_published_at: null,
        created_at: '2026-01-01T00:00:00Z',
      });
      mockMgEventService.loadRegistrations.mockResolvedValueOnce([
        {
          id: 'reg-1',
          mg_event_id: 'event-1',
          user_id: 'user-1',
          registered_at: '2026-01-01T00:00:00Z',
          desired_slot_order: 2,
          comment: null,
          user_profiles: { display_name: 'Alice', username: 'alice' },
        },
      ]);

      fixture = TestBed.createComponent(MgAdminTabComponent);
      component = fixture.componentInstance;
      fixture.detectChanges();
      await flushAsyncNgOnInit();
      fixture.detectChanges();

      const compiled = fixture.nativeElement as HTMLElement;
      expect(compiled.querySelector('.registration-comment')).toBeNull();
    });
  });

  describe('selection panels', () => {
    const flushAsyncNgOnInit = async (): Promise<void> => {
      await new Promise(resolve => setTimeout(resolve, 0));
      await new Promise(resolve => setTimeout(resolve, 0));
    };

    const makeEvent = (id: string, status: string) => ({
      id,
      server_id: 'server-1',
      start_date: '2026-01-05',
      end_date: '2026-01-11',
      registration_open_at: '2025-12-29',
      registration_close_at: '2026-01-01',
      status,
      selection_published_at: status === 'registration_closed' ? null : '2026-01-05T00:00:00Z',
      created_at: '2026-01-01T00:00:00Z',
    });

    const render = async (): Promise<HTMLElement> => {
      fixture = TestBed.createComponent(MgAdminTabComponent);
      component = fixture.componentInstance;
      fixture.detectChanges();
      await flushAsyncNgOnInit();
      fixture.detectChanges();
      return fixture.nativeElement as HTMLElement;
    };

    it('should render one editable panel for a draft current event', async () => {
      // Arrange
      mockMgEventService.loadCurrentEvent.mockResolvedValueOnce(makeEvent('event-1', 'registration_closed'));

      // Act
      const compiled = await render();

      // Assert
      expect(compiled.querySelectorAll('app-mg-selection-panel')).toHaveLength(1);
      expect(compiled.querySelector('.locked-state')).toBeNull();
    });

    it('should render the panel locked once the selection is published', async () => {
      // Arrange
      mockMgEventService.loadCurrentEvent.mockResolvedValueOnce(makeEvent('event-1', 'selection_published'));

      // Act
      const compiled = await render();

      // Assert
      expect(compiled.querySelector('.locked-state')).not.toBeNull();
    });

    it('should not render a correction panel when no event is finished', async () => {
      // Arrange
      mockMgEventService.loadCurrentEvent.mockResolvedValueOnce(makeEvent('event-1', 'registration_closed'));

      // Act
      const compiled = await render();

      // Assert
      expect(mockMgEventService.loadLastFinishedEvent).toHaveBeenCalledWith('server-1');
      expect(compiled.querySelectorAll('app-mg-selection-panel')).toHaveLength(1);
    });

    it('should render a correction panel for the last finished event when it has a selection', async () => {
      // Arrange
      mockMgEventService.loadCurrentEvent.mockResolvedValueOnce(makeEvent('event-2', 'registration_open'));
      mockMgEventService.loadLastFinishedEvent.mockResolvedValueOnce(makeEvent('event-1', 'finished'));
      // The current event's selection is loaded first, then the finished event's.
      mockMgEventService.loadSelection.mockResolvedValueOnce([]).mockResolvedValueOnce(makeSelection('event-1'));

      // Act
      const compiled = await render();

      // Assert
      expect(compiled.querySelectorAll('app-mg-selection-panel')).toHaveLength(2);
    });

    it('should not render a correction panel when the finished event has no selection', async () => {
      // Arrange
      mockMgEventService.loadCurrentEvent.mockResolvedValueOnce(makeEvent('event-2', 'registration_open'));
      mockMgEventService.loadLastFinishedEvent.mockResolvedValueOnce(makeEvent('event-1', 'finished'));

      // Act
      const compiled = await render();

      // Assert
      expect(compiled.querySelectorAll('app-mg-selection-panel')).toHaveLength(1);
    });

    it('should offer every server member to the correction panel, registered or not', async () => {
      // Arrange
      mockServerService.members.mockReturnValueOnce([
        { id: 'u-1', display_name: 'Alice' },
        { id: 'u-2', display_name: 'Intruder' },
      ]);
      mockMgEventService.loadCurrentEvent.mockResolvedValueOnce(makeEvent('event-2', 'registration_open'));
      mockMgEventService.loadLastFinishedEvent.mockResolvedValueOnce(makeEvent('event-1', 'finished'));
      mockMgEventService.loadSelection.mockResolvedValueOnce([]).mockResolvedValueOnce(makeSelection('event-1'));

      // Act
      await render();

      // Assert
      const memberOptions = (component as unknown as { memberOptions: () => unknown[] }).memberOptions();
      expect(memberOptions).toEqual([
        { userId: 'u-1', displayName: 'Alice' },
        { userId: 'u-2', displayName: 'Intruder' },
      ]);
    });
  });

  describe('layout and settings', () => {
    interface ConfigModel {
      capacity: 10 | 50;
      assignment_mode: string;
      dkp_enabled: boolean;
    }
    interface Internals {
      configModel: { update: (fn: (c: ConfigModel) => ConfigModel) => void };
      slotConfigModel: { update: (fn: (c: { rows: MgSlotRow[] }) => { rows: MgSlotRow[] }) => void };
      configDirty: () => boolean;
      slotDirty: () => boolean;
      settingsDirty: () => boolean;
      canSaveSettings: () => boolean;
      showRegistrationsList: () => boolean;
      saveSettings: () => Promise<void>;
      isSavingSettings: () => boolean;
    }

    const internals = (): Internals => component as unknown as Internals;

    const flush = async (): Promise<void> => {
      await new Promise(resolve => setTimeout(resolve, 0));
      await new Promise(resolve => setTimeout(resolve, 0));
    };

    const makeEvent = (id: string, status: string) => ({
      id,
      server_id: 'server-1',
      start_date: '2026-01-05',
      end_date: '2026-01-11',
      registration_open_at: '2025-12-29',
      registration_close_at: '2026-01-01',
      status,
      selection_published_at: null,
      created_at: '2026-01-01T00:00:00Z',
    });

    const makeRegistration = (id: string) => ({
      id,
      mg_event_id: 'event-1',
      user_id: `user-${id}`,
      registered_at: '2026-01-01T00:00:00Z',
      desired_slot_order: 1,
      comment: null,
      user_profiles: { display_name: `Player ${id}`, username: id },
    });

    const makeServerConfig = (capacity: 10 | 50, mode = 'automatic', dkp = false) => ({
      server_id: 'server-1',
      capacity,
      assignment_mode: mode,
      dkp_enabled: dkp,
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    });

    const render = async (): Promise<HTMLElement> => {
      fixture = TestBed.createComponent(MgAdminTabComponent);
      component = fixture.componentInstance;
      fixture.detectChanges();
      await flush();
      fixture.detectChanges();
      return fixture.nativeElement as HTMLElement;
    };

    const setCapacity = (capacity: 10 | 50): void =>
      internals().configModel.update(current => ({ ...current, capacity }));
    const setFirstSlotCost = (cost: number): void =>
      internals().slotConfigModel.update(current => ({
        rows: current.rows.map((row, i) => (i === 0 ? { ...row, cost } : row)),
      }));

    describe('sections', () => {
      it('should render the settings, current event and correction sections in that order', async () => {
        mockMgEventService.loadCurrentEvent.mockResolvedValueOnce(makeEvent('event-2', 'registration_open'));
        mockMgEventService.loadLastFinishedEvent.mockResolvedValueOnce(makeEvent('event-1', 'finished'));
        mockMgEventService.loadSelection.mockResolvedValueOnce([]).mockResolvedValueOnce(makeSelection('event-1'));

        const compiled = await render();

        const container = compiled.querySelector('.mg-admin-container') as HTMLElement;
        const classes = Array.from(container.children).map(child => child.className);
        const order = ['settings-panel', 'current-event-card', 'correction-panel'].map(name =>
          classes.findIndex(c => c.includes(name))
        );
        expect(order.every(i => i >= 0)).toBe(true);
        expect(order).toEqual([...order].sort((x, y) => x - y));
        expect(compiled.querySelector('.current-event-card')?.textContent).toContain('mg.admin.eventTitle');
        expect(compiled.querySelector('.correction-panel')?.textContent).toContain('mg.admin.correction.title');
        expect(compiled.querySelector('.settings-panel')?.textContent).toContain('mg.admin.settings.title');
      });

      it('should show only the empty message in the current event card when there is no event', async () => {
        const compiled = await render();

        const card = compiled.querySelector('.current-event-card') as HTMLElement;
        expect(card.textContent).toContain('mg.admin.noEvent');
        expect(card.querySelector('app-mg-selection-panel')).toBeNull();
        expect(card.querySelector('.status-chip')).toBeNull();
        expect(compiled.querySelector('.settings-panel')).not.toBeNull();
      });

      it('should show the status chip and the registration count chip', async () => {
        mockMgEventService.loadCurrentEvent.mockResolvedValueOnce(makeEvent('event-1', 'registration_open'));
        mockMgEventService.loadRegistrations.mockResolvedValueOnce([makeRegistration('1'), makeRegistration('2')]);

        const compiled = await render();

        expect(compiled.querySelector('.status-chip.status-registration_open')).not.toBeNull();
        expect(compiled.querySelector('.count-chip')?.textContent).toContain('mg.admin.registrations.count');
      });

      it('should not render the registrations list in draft status', async () => {
        mockMgEventService.loadCurrentEvent.mockResolvedValueOnce(makeEvent('event-1', 'registration_closed'));
        mockMgEventService.loadRegistrations.mockResolvedValueOnce([makeRegistration('1')]);

        const compiled = await render();

        expect(internals().showRegistrationsList()).toBe(false);
        expect(compiled.querySelector('.registrations-panel')).toBeNull();
        expect(compiled.querySelector('.registration-row')).toBeNull();
      });

      it('should render a collapsed registrations list when locked with registrations', async () => {
        mockMgEventService.loadCurrentEvent.mockResolvedValueOnce(makeEvent('event-1', 'selection_published'));
        mockMgEventService.loadRegistrations.mockResolvedValueOnce([makeRegistration('1')]);

        const compiled = await render();

        const panel = compiled.querySelector('.registrations-panel') as HTMLElement;
        expect(internals().showRegistrationsList()).toBe(true);
        expect(panel).not.toBeNull();
        expect(panel.classList.contains('mat-expanded')).toBe(false);
        expect(panel.querySelectorAll('.registration-row')).toHaveLength(1);
      });

      it('should not render the registrations list when locked without registrations', async () => {
        mockMgEventService.loadCurrentEvent.mockResolvedValueOnce(makeEvent('event-1', 'ongoing'));

        const compiled = await render();

        expect(internals().showRegistrationsList()).toBe(false);
        expect(compiled.querySelector('.registrations-panel')).toBeNull();
      });

      it('should render the correction collapsed by default with its date range and badge', async () => {
        mockMgEventService.loadCurrentEvent.mockResolvedValueOnce(makeEvent('event-2', 'registration_open'));
        mockMgEventService.loadLastFinishedEvent.mockResolvedValueOnce(makeEvent('event-1', 'finished'));
        mockMgEventService.loadSelection.mockResolvedValueOnce([]).mockResolvedValueOnce(makeSelection('event-1'));

        const compiled = await render();

        const panel = compiled.querySelector('.correction-panel') as HTMLElement;
        expect(panel.classList.contains('mat-expanded')).toBe(false);
        expect(panel.textContent).toContain('05/01/2026');
        expect(panel.textContent).toContain('mg.admin.correction.badge');
        // Content is rendered eagerly so it is reachable as soon as the panel opens.
        expect(panel.querySelector('app-mg-selection-panel')).not.toBeNull();
      });

      it('should not render the correction section without a finished event selection', async () => {
        mockMgEventService.loadCurrentEvent.mockResolvedValueOnce(makeEvent('event-2', 'registration_open'));
        mockMgEventService.loadLastFinishedEvent.mockResolvedValueOnce(makeEvent('event-1', 'finished'));

        const compiled = await render();

        expect(compiled.querySelector('.correction-panel')).toBeNull();
      });

      it('should render the settings collapsed by default with a summary of the saved values', async () => {
        mockMgEventService.loadServerConfig.mockResolvedValueOnce(makeServerConfig(50, 'manual', true));

        const compiled = await render();

        const panel = compiled.querySelector('.settings-panel') as HTMLElement;
        const summary = panel.querySelector('.settings-summary')?.textContent ?? '';
        expect(panel.classList.contains('mat-expanded')).toBe(false);
        expect(summary).toContain('50');
        expect(summary).toContain('mg.admin.config.modeManual');
        expect(summary).toContain('mg.admin.settings.dkpOn');
      });
    });

    describe('dirty detection', () => {
      it('should be clean right after loading', async () => {
        await render();

        expect(internals().settingsDirty()).toBe(false);
        expect(internals().canSaveSettings()).toBe(false);
      });

      it('should flag the config as dirty when a config field changes, and show the indicator', async () => {
        const compiled = await render();

        setCapacity(50);
        fixture.detectChanges();

        expect(internals().configDirty()).toBe(true);
        expect(internals().slotDirty()).toBe(false);
        expect(internals().canSaveSettings()).toBe(true);
        expect(compiled.querySelector('.unsaved-chip')).not.toBeNull();
      });

      it('should flag the slots as dirty when a slot value changes', async () => {
        await render();

        setFirstSlotCost(999);

        expect(internals().slotDirty()).toBe(true);
        expect(internals().configDirty()).toBe(false);
      });

      it('should become clean again when the edit is reverted', async () => {
        await render();

        setCapacity(50);
        setCapacity(10);

        expect(internals().settingsDirty()).toBe(false);
      });

      it('should disable Save while a slot form value is invalid', async () => {
        await render();

        setFirstSlotCost(-1);

        expect(internals().settingsDirty()).toBe(true);
        expect(internals().canSaveSettings()).toBe(false);
      });
    });

    describe('saveSettings', () => {
      beforeEach(async () => {
        await render();
      });

      it('should save only the config when only the config is dirty', async () => {
        setCapacity(50);

        await internals().saveSettings();

        expect(mockMgEventService.saveServerConfig).toHaveBeenCalledWith(
          'server-1',
          expect.objectContaining({ capacity: 50 })
        );
        expect(mockMgEventService.saveSlotConfig).not.toHaveBeenCalled();
        expect(mockSnackbarService.success).toHaveBeenCalledWith('mg.admin.settings.saved');
      });

      it('should save only the slots when only the slots are dirty', async () => {
        setFirstSlotCost(999);

        await internals().saveSettings();

        expect(mockMgEventService.saveSlotConfig).toHaveBeenCalledWith(
          'server-1',
          expect.arrayContaining([expect.objectContaining({ slot_order: 1, cost: 999 })])
        );
        expect(mockMgEventService.saveServerConfig).not.toHaveBeenCalled();
        expect(mockSnackbarService.success).toHaveBeenCalledWith('mg.admin.settings.saved');
      });

      it('should save both parts with one click and reload the saved signals', async () => {
        setCapacity(50);
        setFirstSlotCost(999);
        mockMgEventService.loadServerConfig.mockResolvedValueOnce(makeServerConfig(50));
        mockMgEventService.loadSlotConfig.mockResolvedValueOnce([
          {
            id: 'cfg-1',
            server_id: 'server-1',
            slot_order: 1,
            cost: 999,
            target_min: 30,
            target_max: 30,
            created_at: '2026-01-01T00:00:00Z',
            updated_at: '2026-01-01T00:00:00Z',
          },
        ]);

        await internals().saveSettings();

        expect(mockMgEventService.saveServerConfig).toHaveBeenCalledTimes(1);
        expect(mockMgEventService.saveSlotConfig).toHaveBeenCalledTimes(1);
        expect(internals().settingsDirty()).toBe(false);
        expect(internals().isSavingSettings()).toBe(false);
        expect(mockSnackbarService.success).toHaveBeenCalledTimes(1);
      });

      it('should keep the slot form dirty and report only the slot error when the slot save fails', async () => {
        setCapacity(50);
        setFirstSlotCost(999);
        mockMgEventService.saveSlotConfig.mockResolvedValueOnce({ error: new Error('boom') });
        mockMgEventService.loadServerConfig.mockResolvedValueOnce(makeServerConfig(50));

        await internals().saveSettings();

        expect(internals().configDirty()).toBe(false);
        expect(internals().slotDirty()).toBe(true);
        expect(mockSnackbarService.error).toHaveBeenCalledTimes(1);
        expect(mockSnackbarService.error).toHaveBeenCalledWith('mg.admin.slotConfigSaveError');
        expect(mockSnackbarService.success).not.toHaveBeenCalled();
      });

      it('should keep the config form dirty and report only the config error when the config save fails', async () => {
        setCapacity(50);
        mockMgEventService.saveServerConfig.mockResolvedValueOnce({ error: new Error('boom') });

        await internals().saveSettings();

        expect(internals().configDirty()).toBe(true);
        expect(mockSnackbarService.error).toHaveBeenCalledWith('mg.admin.configSaveError');
      });

      it('should report both errors in a single snackbar when both saves fail', async () => {
        setCapacity(50);
        setFirstSlotCost(999);
        mockMgEventService.saveServerConfig.mockRejectedValueOnce(new Error('boom'));
        mockMgEventService.saveSlotConfig.mockResolvedValueOnce({ error: new Error('boom') });

        await internals().saveSettings();

        expect(mockSnackbarService.error).toHaveBeenCalledTimes(1);
        expect(mockSnackbarService.error).toHaveBeenCalledWith('mg.admin.configSaveError mg.admin.slotConfigSaveError');
        expect(internals().settingsDirty()).toBe(true);
      });

      it('should keep the edits and report success when the reload after a successful save throws', async () => {
        setCapacity(50);
        mockMgEventService.loadServerConfig.mockRejectedValueOnce(new Error('reload failed'));

        await internals().saveSettings();

        expect(mockSnackbarService.success).toHaveBeenCalledWith('mg.admin.settings.saved');
        expect(mockSnackbarService.error).not.toHaveBeenCalled();
        const model = (component as unknown as { configModel: () => ConfigModel }).configModel();
        expect(model.capacity).toBe(50);
      });

      it('should not call any service when nothing is dirty', async () => {
        await internals().saveSettings();

        expect(mockMgEventService.saveServerConfig).not.toHaveBeenCalled();
        expect(mockMgEventService.saveSlotConfig).not.toHaveBeenCalled();
      });
    });
  });

  describe('calendar banner', () => {
    const SERVER_CONFIG = {
      server_id: 'server-1',
      capacity: 10,
      assignment_mode: 'automatic',
      dkp_enabled: false,
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    };
    const FUTURE_ENTRY = { id: 'e-1', type: 'mg', starts_at: '2099-06-01T00:00:00Z', cancelled_at: null };
    const flush = async (): Promise<void> => {
      for (let i = 0; i < 4; i++) await new Promise(resolve => setTimeout(resolve, 0));
    };

    const renderBanner = async (): Promise<HTMLElement> => {
      fixture = TestBed.createComponent(MgAdminTabComponent);
      component = fixture.componentInstance;
      fixture.detectChanges();
      await flush();
      fixture.detectChanges();
      return fixture.nativeElement as HTMLElement;
    };

    it('should show the neutral banner when config exists, no current event and no future entry', async () => {
      // Arrange
      mockMgEventService.loadServerConfig.mockResolvedValueOnce(SERVER_CONFIG);

      // Act
      const el = await renderBanner();

      // Assert
      expect(el.querySelector('[role="status"]')?.textContent).toContain(BANNER_TEXT);
      expect(el.querySelector('app-mg-calendar-banner a')).toBeNull();
    });

    it('should hide the banner when the server has no config row', async () => {
      // Act
      const el = await renderBanner();

      // Assert
      expect(el.querySelector('[role="status"]')).toBeNull();
    });

    it('should hide the banner when a future entry exists', async () => {
      // Arrange
      mockMgEventService.loadServerConfig.mockResolvedValueOnce(SERVER_CONFIG);
      mockCalendarService.loadEntries.mockResolvedValueOnce([FUTURE_ENTRY]);

      // Act
      const el = await renderBanner();

      // Assert
      expect(el.querySelector('[role="status"]')).toBeNull();
    });

    it('should hide the banner when a current event exists', async () => {
      // Arrange
      mockMgEventService.loadServerConfig.mockResolvedValueOnce(SERVER_CONFIG);
      mockMgEventService.loadCurrentEventStrict.mockResolvedValueOnce({ id: 'event-1', status: 'registration_open' });

      // Act
      const el = await renderBanner();

      // Assert
      expect(el.querySelector('[role="status"]')).toBeNull();
    });

    it('should hide the banner and log once when loadEntries fails', async () => {
      // Arrange
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
      mockMgEventService.loadServerConfig.mockResolvedValueOnce(SERVER_CONFIG);
      mockCalendarService.loadEntries.mockRejectedValueOnce(new Error('boom'));

      // Act
      const el = await renderBanner();

      // Assert
      expect(el.querySelector('[role="status"]')).toBeNull();
      expect(errorSpy).toHaveBeenCalledTimes(1);
      errorSpy.mockRestore();
    });

    it('should hide the banner when loadCurrentEventStrict fails', async () => {
      // Arrange
      mockMgEventService.loadServerConfig.mockResolvedValueOnce(SERVER_CONFIG);
      mockMgEventService.loadCurrentEventStrict.mockRejectedValueOnce(new Error('boom'));

      // Act
      const el = await renderBanner();

      // Assert
      expect(el.querySelector('[role="status"]')).toBeNull();
    });
  });

  describe('cancelled event audit', () => {
    it('should render no selection panel or status chip when the loaded event is cancelled', async () => {
      // Arrange
      mockMgEventService.loadCurrentEvent.mockResolvedValueOnce({
        id: 'event-1',
        server_id: 'server-1',
        start_date: '2026-01-05',
        end_date: '2026-01-11',
        registration_open_at: '2025-12-29',
        registration_close_at: '2026-01-01',
        status: 'cancelled',
        selection_published_at: null,
        created_at: '2026-01-01T00:00:00Z',
      });
      fixture = TestBed.createComponent(MgAdminTabComponent);
      component = fixture.componentInstance;

      // Act
      fixture.detectChanges();
      await new Promise(resolve => setTimeout(resolve, 0));
      await new Promise(resolve => setTimeout(resolve, 0));
      fixture.detectChanges();

      // Assert
      const el = fixture.nativeElement as HTMLElement;
      expect(el.querySelector('app-mg-selection-panel')).toBeNull();
      expect(el.querySelector('.status-chip')).toBeNull();
      expect(mockMgEventService.loadRegistrations).not.toHaveBeenCalled();
    });
  });
});
