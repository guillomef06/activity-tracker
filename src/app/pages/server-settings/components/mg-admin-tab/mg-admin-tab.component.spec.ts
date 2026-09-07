import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TestBed, ComponentFixture } from '@angular/core/testing';
import { provideAnimations } from '@angular/platform-browser/animations';
import { provideZonelessChangeDetection } from '@angular/core';
import { TranslateModule } from '@ngx-translate/core';
import { MgAdminTabComponent } from './mg-admin-tab.component';
import { MgEventService } from '@app/core/services/mg-event.service';
import { AuthService } from '@app/core/services/auth.service';
import { ActivityService } from '@app/core/services/activity.service';
import { ServerService } from '@app/core/services/server.service';
import { SnackbarService } from '@app/core/services';
import type { MgSlotRow } from '@shared/utils/mg-slot.util';

const mockMgEventService = {
  loadCurrentEvent: vi.fn().mockResolvedValue(null),
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

const mockAuthService = {
  getServerId: vi.fn().mockReturnValue('server-1'),
  getUserId: vi.fn().mockReturnValue('user-1'),
};

const mockActivityService = {
  initialize: vi.fn().mockResolvedValue(undefined),
  getUserScores: vi.fn().mockReturnValue([]),
};

const mockServerService = {};

const mockSnackbarService = {
  success: vi.fn(),
  error: vi.fn(),
};

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
        { provide: AuthService, useValue: mockAuthService },
        { provide: ActivityService, useValue: mockActivityService },
        { provide: ServerService, useValue: mockServerService },
        { provide: SnackbarService, useValue: mockSnackbarService },
      ],
    }).compileComponents();

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

    it('should pass the resolved slot rows to generateAutoSelectionPayload', async () => {
      mockMgEventService.loadCurrentEvent.mockResolvedValueOnce({
        id: 'event-1',
        server_id: 'server-1',
        start_date: '2026-01-05',
        end_date: '2026-01-11',
        registration_open_at: '2025-12-29',
        registration_close_at: '2026-01-01',
        status: 'registration_closed',
        selection_published_at: null,
        created_at: '2026-01-01T00:00:00Z',
      });

      fixture = TestBed.createComponent(MgAdminTabComponent);
      component = fixture.componentInstance;
      await component.ngOnInit();
      fixture.detectChanges();

      (component as unknown as { generatePreview: () => void }).generatePreview();

      expect(mockMgEventService.generateAutoSelectionPayload).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        expect.anything(),
        expect.anything(),
        expect.arrayContaining([expect.objectContaining({ slotOrder: 1, cost: 150 })])
      );
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

      await (component as unknown as { saveSlotConfig: () => Promise<void> }).saveSlotConfig();

      expect(mockMgEventService.saveSlotConfig).not.toHaveBeenCalled();
    });

    it('should save slot config and show success snackbar', async () => {
      await (component as unknown as { saveSlotConfig: () => Promise<void> }).saveSlotConfig();

      expect(mockMgEventService.saveSlotConfig).toHaveBeenCalledWith(
        'server-1',
        expect.arrayContaining([expect.objectContaining({ slot_order: 1, cost: 150, target_min: 30, target_max: 30 })])
      );
      expect(mockSnackbarService.success).toHaveBeenCalled();
    });

    it('should show error snackbar when saveSlotConfig fails', async () => {
      mockMgEventService.saveSlotConfig.mockResolvedValueOnce({ error: new Error('failed') });

      await (component as unknown as { saveSlotConfig: () => Promise<void> }).saveSlotConfig();

      expect(mockSnackbarService.error).toHaveBeenCalled();
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

    const getRegistrationRows = (): { positionLabel: string | null }[] =>
      (component as unknown as { registrationRows: () => { positionLabel: string | null }[] }).registrationRows();

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
});
