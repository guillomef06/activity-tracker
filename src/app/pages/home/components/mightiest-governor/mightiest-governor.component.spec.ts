import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideAnimations } from '@angular/platform-browser/animations';
import { provideZonelessChangeDetection } from '@angular/core';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { vi } from 'vitest';
import { MightiestGovernorComponent } from './mightiest-governor.component';
import { MgEventService } from '@app/core/services/mg-event.service';
import { CalendarService } from '@app/core/services/calendar.service';
import { AuthService } from '@app/core/services/auth.service';
import { SnackbarService } from '@app/core/services';
import type { MgSelectionWithUser } from '@shared/models';

const mockMgEventService = {
  loadCurrentEvent: vi.fn().mockResolvedValue(null),
  loadUserRegistration: vi.fn().mockResolvedValue(null),
  loadSelection: vi.fn().mockResolvedValue([]),
  loadSlotConfig: vi.fn().mockResolvedValue([]),
  loadServerConfig: vi.fn().mockResolvedValue(null),
  loadRecentCancelledEvent: vi.fn().mockResolvedValue(null),
  registerPlayer: vi.fn().mockResolvedValue({ error: null }),
  unregisterPlayer: vi.fn().mockResolvedValue({ error: null }),
};

const mockCalendarService = {
  loadEntries: vi.fn().mockResolvedValue([]),
};

const mockAuthService = {
  getServerId: vi.fn().mockReturnValue('server-1'),
  getUserId: vi.fn().mockReturnValue('user-1'),
};

const mockSnackbarService = {
  success: vi.fn(),
  error: vi.fn(),
};

describe('MightiestGovernorComponent', () => {
  let component: MightiestGovernorComponent;
  let fixture: ComponentFixture<MightiestGovernorComponent>;

  beforeEach(async () => {
    vi.clearAllMocks();

    await TestBed.configureTestingModule({
      imports: [MightiestGovernorComponent, TranslateModule.forRoot()],
      providers: [
        provideAnimations(),
        provideZonelessChangeDetection(),
        { provide: MgEventService, useValue: mockMgEventService },
        { provide: CalendarService, useValue: mockCalendarService },
        { provide: AuthService, useValue: mockAuthService },
        { provide: SnackbarService, useValue: mockSnackbarService },
      ],
    }).compileComponents();

    const translate = TestBed.inject(TranslateService);
    translate.setTranslation('en', {
      mg: {
        calendar: {
          banner: {
            playerNext: 'NEXT {{ start }} / {{ opening }}',
            playerFollowing: 'FOLLOWING {{ start }} / {{ opening }}',
            playerNotAnnounced: 'NOT ANNOUNCED',
            cancelledNotice: 'CANCELLED {{ start }}',
          },
        },
      },
    });
    translate.use('en');

    fixture = TestBed.createComponent(MightiestGovernorComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  // Unpublished (no selection): rows are the 10 slot-cost ranges, as before.
  it('should render 10 slot rows when unpublished', () => {
    expect(component.isPublished()).toBe(false);
    expect(component.rows()).toHaveLength(10);
  });

  it('should have rank 1 cost 150 and medal 100', () => {
    expect(component.rows()[0].cost).toBe(150);
    expect(component.rows()[0].medal).toBe(100);
    expect(component.rows()[0].rankLabel).toBe('1');
  });

  it('should have last slot cover rank 26-50 with cost 60', () => {
    expect(component.rows()[9].rankLabel).toBe('26-50');
    expect(component.rows()[9].cost).toBe(60);
    expect(component.rows()[9].medal).toBe(5);
  });

  it('should build targetLabel as single value for individual ranks', () => {
    expect(component.rows()[0].targetLabel).toBe('30M');
    expect(component.rows()[4].targetLabel).toBe('26M');
  });

  it('should build targetLabel as range for grouped ranks', () => {
    expect(component.rows()[5].targetLabel).toBe('24M-26M');
    expect(component.rows()[9].targetLabel).toBe('10M-15M');
  });

  it('costs should be non-increasing', () => {
    const rows = component.rows();
    for (let i = 0; i < rows.length - 1; i++) {
      expect(rows[i].cost ?? 0).toBeGreaterThanOrEqual(rows[i + 1].cost ?? 0);
    }
  });

  it('should default the medal/cost toggle ON when unpublished', () => {
    expect(component.showMedalCost()).toBe(true);
  });

  it('should call loadCurrentEvent on init', () => {
    expect(mockMgEventService.loadCurrentEvent).toHaveBeenCalledWith('server-1');
  });

  it('should call loadSlotConfig on init', () => {
    expect(mockMgEventService.loadSlotConfig).toHaveBeenCalledWith('server-1');
  });

  it('should not show event card when no event loaded', () => {
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('app-mg-event-card')).toBeNull();
  });

  it('should fall back to defaults when server returns no slot config', async () => {
    mockMgEventService.loadSlotConfig.mockResolvedValueOnce([]);

    fixture = TestBed.createComponent(MightiestGovernorComponent);
    component = fixture.componentInstance;
    await component.ngOnInit();
    fixture.detectChanges();

    expect(component.rows()[0].cost).toBe(150);
  });

  it('should reflect a per-server override for a given slot', async () => {
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

    fixture = TestBed.createComponent(MightiestGovernorComponent);
    component = fixture.componentInstance;
    await component.ngOnInit();
    fixture.detectChanges();

    expect(component.rows()[0].cost).toBe(999);
  });

  describe('published selection', () => {
    const publishedEvent = {
      id: 'event-1',
      server_id: 'server-1',
      start_date: '2026-01-05',
      end_date: '2026-01-11',
      registration_open_at: '2025-12-29',
      registration_close_at: '2026-01-01',
      status: 'selection_published' as const,
      selection_published_at: '2026-01-02T00:00:00Z',
      created_at: '2026-01-01T00:00:00Z',
    };

    const player = (userId: string, rank: number): MgSelectionWithUser => ({
      id: 'sel-' + rank,
      mg_event_id: 'event-1',
      user_id: userId,
      rank,
      selection_type: 'selected',
      selected_by: 'manual',
      cost: 0,
      label: null,
      approved_rank: null,
      approved_cost: null,
      user_profiles: { display_name: 'Player ' + rank, username: 'player' + rank },
    });

    const ffa = (rank: number): MgSelectionWithUser => ({
      id: 'ffa-' + rank,
      mg_event_id: 'event-1',
      user_id: null,
      rank,
      selection_type: 'ffa',
      selected_by: 'automatic',
      cost: 0,
      label: null,
      approved_rank: null,
      approved_cost: null,
      user_profiles: null,
    });

    const empty = (rank: number, label = 'Empty'): MgSelectionWithUser => ({
      id: 'empty-' + rank,
      mg_event_id: 'event-1',
      user_id: null,
      rank,
      selection_type: 'empty',
      selected_by: 'manual',
      cost: 0,
      label,
      approved_rank: null,
      approved_cost: null,
      user_profiles: null,
    });

    const setup = async (selection: MgSelectionWithUser[]) => {
      mockMgEventService.loadCurrentEvent.mockResolvedValueOnce(publishedEvent);
      mockMgEventService.loadSelection.mockResolvedValueOnce(selection);
      fixture = TestBed.createComponent(MightiestGovernorComponent);
      component = fixture.componentInstance;
      await component.ngOnInit();
      fixture.detectChanges();
    };

    it('should switch to player rows and default the medal/cost toggle OFF when published', async () => {
      await setup([player('user-1', 1), player('user-2', 2)]);

      expect(component.isPublished()).toBe(true);
      expect(component.showMedalCost()).toBe(false);
      expect(component.rows().map(r => r.playerName)).toEqual(['Player 1', 'Player 2']);
    });

    it('should group a multi-rank range: label/medal on the first row, blank on the rest', async () => {
      await setup([player('u1', 11), player('u2', 12), player('u3', 13)]);

      const rows = component.rows();
      expect(rows[0]).toMatchObject({ rankLabel: '11-15', medal: 12, isGroupStart: true });
      expect(rows[1]).toMatchObject({
        rankLabel: null,
        medal: null,
        cost: null,
        targetLabel: null,
        isGroupStart: false,
      });
      expect(rows.map(r => r.playerName)).toEqual(['Player 11', 'Player 12', 'Player 13']);
    });

    it('should flag the current user row', async () => {
      await setup([player('user-1', 1), player('other', 2)]);
      expect(component.rows()[0].isCurrentUser).toBe(true);
      expect(component.rows()[1].isCurrentUser).toBe(false);
    });

    it('should toggle the medal/cost columns on manually', async () => {
      await setup([player('user-1', 1)]);
      expect(component.showMedalCost()).toBe(false);
      component.toggleMedalCost();
      expect(component.showMedalCost()).toBe(true);
    });

    // FFA cap = targetMax of the range one step BELOW the first open slot (buffer).
    it('should cap FFA at 26M when 4 players are assigned', async () => {
      await setup([1, 2, 3, 4].map(r => player('u' + r, r)).concat([ffa(5)]));
      expect(component.ffaTargetCap()).toBe(26);
    });

    it('should cap FFA at 20M when 12 players are assigned', async () => {
      await setup(Array.from({ length: 12 }, (_, i) => player('u' + (i + 1), i + 1)).concat([ffa(13)]));
      expect(component.ffaTargetCap()).toBe(20);
    });

    it('should cap FFA at 15M when 15 players are assigned', async () => {
      await setup(Array.from({ length: 15 }, (_, i) => player('u' + (i + 1), i + 1)).concat([ffa(16)]));
      expect(component.ffaTargetCap()).toBe(15);
    });

    it('should count FFA slots', async () => {
      await setup([player('u1', 1), ffa(2), ffa(3)]);
      expect(component.ffaCount()).toBe(2);
    });

    it('should render an empty placeholder slot by its label, at its rank, not as FFA', async () => {
      await setup([player('u1', 1), empty(2, 'Vacant'), player('u3', 3)]);

      const names = component.rows().map(r => r.playerName);
      expect(names).toEqual(['Player 1', 'Vacant', 'Player 3']);
      // The empty slot is not counted as an FFA slot.
      expect(component.ffaCount()).toBe(0);
      // And it's never flagged as the current user.
      expect(component.rows()[1].isCurrentUser).toBe(false);
    });
  });

  describe('full FFA', () => {
    // Failsafe shape (migration 28): event started with a published timestamp but
    // no selection rows — a free-for-all for everyone, no list ever decided.
    const fullFfaEvent = {
      id: 'event-1',
      server_id: 'server-1',
      start_date: '2026-01-05',
      end_date: '2026-01-11',
      registration_open_at: '2025-12-29',
      registration_close_at: '2026-01-01',
      status: 'ongoing' as const,
      selection_published_at: '2026-01-05T00:00:00Z',
      created_at: '2026-01-01T00:00:00Z',
    };

    const setupEvent = async (event: unknown, selection: MgSelectionWithUser[] = []) => {
      mockMgEventService.loadCurrentEvent.mockResolvedValueOnce(event);
      mockMgEventService.loadSelection.mockResolvedValueOnce(selection);
      fixture = TestBed.createComponent(MightiestGovernorComponent);
      component = fixture.componentInstance;
      await component.ngOnInit();
      fixture.detectChanges();
    };

    it('should flag full FFA when published with an empty selection', async () => {
      await setupEvent(fullFfaEvent, []);
      expect(component.isFullFfa()).toBe(true);
      expect(component.isPublished()).toBe(false);
    });

    it('should NOT flag full FFA when a selection exists', async () => {
      await setupEvent({ ...fullFfaEvent, status: 'selection_published' }, [
        {
          id: 'sel-1',
          mg_event_id: 'event-1',
          user_id: 'user-1',
          rank: 1,
          selection_type: 'selected',
          selected_by: 'manual',
          cost: 0,
          label: null,
          approved_rank: null,
          approved_cost: null,
          user_profiles: { display_name: 'Player 1', username: 'player1' },
        },
      ]);
      expect(component.isFullFfa()).toBe(false);
    });

    it('should NOT flag full FFA when registration is merely closed (no published timestamp)', async () => {
      await setupEvent({ ...fullFfaEvent, status: 'registration_closed', selection_published_at: null }, []);
      expect(component.isFullFfa()).toBe(false);
    });
  });

  describe('onRegister', () => {
    it('should forward the payload to mgEventService.registerPlayer with the event and user ids', async () => {
      // Arrange
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
      fixture = TestBed.createComponent(MightiestGovernorComponent);
      component = fixture.componentInstance;
      await component.ngOnInit();
      fixture.detectChanges();

      // Act
      await (
        component as unknown as {
          onRegister: (payload: { desired_slot_order: number; comment: string | null }) => Promise<void>;
        }
      ).onRegister({ desired_slot_order: 4, comment: 'Targeting rank 4' });

      // Assert
      expect(mockMgEventService.registerPlayer).toHaveBeenCalledWith('event-1', 'user-1', {
        desired_slot_order: 4,
        comment: 'Targeting rank 4',
      });
    });

    it('should show an error snackbar when registration fails', async () => {
      // Arrange
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
      mockMgEventService.registerPlayer.mockResolvedValueOnce({ error: new Error('failed') });
      fixture = TestBed.createComponent(MightiestGovernorComponent);
      component = fixture.componentInstance;
      await component.ngOnInit();
      fixture.detectChanges();

      // Act
      await (
        component as unknown as {
          onRegister: (payload: { desired_slot_order: number; comment: string | null }) => Promise<void>;
        }
      ).onRegister({ desired_slot_order: 1, comment: null });

      // Assert
      expect(mockSnackbarService.error).toHaveBeenCalled();
    });

    it('should NOT register when the window is closed, even if a handler is invoked', async () => {
      // Arrange: registration already closed → the form is hidden, but the action
      // itself must also refuse so a stale view or programmatic call can't slip through.
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
      fixture = TestBed.createComponent(MightiestGovernorComponent);
      component = fixture.componentInstance;
      await component.ngOnInit();
      fixture.detectChanges();

      // Act
      await (
        component as unknown as {
          onRegister: (payload: { desired_slot_order: number; comment: string | null }) => Promise<void>;
        }
      ).onRegister({ desired_slot_order: 1, comment: null });

      // Assert
      expect(mockMgEventService.registerPlayer).not.toHaveBeenCalled();
    });
  });

  describe('calendar banners', () => {
    const SERVER_CONFIG = { server_id: 'server-1', capacity: 10, assignment_mode: 'automatic', dkp_enabled: false };
    const NEXT_ENTRY = { id: 'e-1', type: 'mg', starts_at: '2099-06-01T00:00:00Z', cancelled_at: null };
    const cancelledEvent = (endDate: string) => ({
      id: 'event-c',
      server_id: 'server-1',
      start_date: '2099-01-05',
      end_date: endDate,
      registration_open_at: '2098-12-29',
      registration_close_at: '2099-01-01',
      status: 'cancelled' as const,
      selection_published_at: null,
      created_at: '2026-01-01T00:00:00Z',
    });

    const flush = async (): Promise<void> => {
      for (let i = 0; i < 4; i++) await new Promise(resolve => setTimeout(resolve, 0));
    };

    const render = async (): Promise<HTMLElement> => {
      fixture = TestBed.createComponent(MightiestGovernorComponent);
      component = fixture.componentInstance;
      fixture.detectChanges();
      await flush();
      fixture.detectChanges();
      return fixture.nativeElement as HTMLElement;
    };

    const statuses = (el: HTMLElement): string[] =>
      Array.from(el.querySelectorAll('[role="status"]')).map(node => node.textContent?.trim() ?? '');

    it('should show the next MG banner with start and opening dates when config and a future entry exist', async () => {
      // Arrange
      mockMgEventService.loadServerConfig.mockResolvedValueOnce(SERVER_CONFIG);
      mockCalendarService.loadEntries.mockResolvedValueOnce([NEXT_ENTRY]);

      // Act
      const el = await render();

      // Assert
      expect((component as unknown as { nextMgBanner: () => unknown }).nextMgBanner()).toEqual({
        kind: 'playerNext',
        mgStart: '2099-06-01',
        openingDate: '2099-05-25',
      });
      expect(statuses(el)).toHaveLength(1);
      expect(statuses(el)[0]).toContain('NEXT');
    });

    it('should word the banner as the following MG while an event is open for registration', async () => {
      // Arrange
      mockMgEventService.loadServerConfig.mockResolvedValueOnce(SERVER_CONFIG);
      mockCalendarService.loadEntries.mockResolvedValueOnce([NEXT_ENTRY]);
      mockMgEventService.loadCurrentEvent.mockResolvedValueOnce({
        id: 'event-open',
        server_id: 'server-1',
        start_date: '2098-12-01',
        end_date: '2098-12-07',
        registration_open_at: '2098-11-24',
        registration_close_at: '2098-11-27',
        status: 'registration_open',
        selection_published_at: null,
        created_at: '2026-01-01T00:00:00Z',
      });

      // Act
      const el = await render();

      // Assert
      expect((component as unknown as { nextMgBanner: () => unknown }).nextMgBanner()).toMatchObject({
        kind: 'playerNext',
        afterCurrent: true,
      });
      expect(statuses(el)[0]).toContain('FOLLOWING');
    });

    it('should show the not-announced banner when config exists but no entry is planned', async () => {
      // Arrange
      mockMgEventService.loadServerConfig.mockResolvedValueOnce(SERVER_CONFIG);

      // Act
      const el = await render();

      // Assert
      expect(statuses(el)).toHaveLength(1);
      expect(statuses(el)[0]).toContain('NOT ANNOUNCED');
    });

    it('should show no banner at all when the server has no config row', async () => {
      // Arrange
      mockCalendarService.loadEntries.mockResolvedValueOnce([NEXT_ENTRY]);
      mockMgEventService.loadRecentCancelledEvent.mockResolvedValueOnce(cancelledEvent('2099-01-11'));

      // Act
      const el = await render();

      // Assert
      expect(statuses(el)).toEqual([]);
    });

    it('should hide the next MG banner and log once when loadEntries fails', async () => {
      // Arrange
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
      mockMgEventService.loadServerConfig.mockResolvedValueOnce(SERVER_CONFIG);
      mockCalendarService.loadEntries.mockRejectedValueOnce(new Error('boom'));

      // Act
      const el = await render();

      // Assert
      expect(statuses(el)).toEqual([]);
      expect(errorSpy).toHaveBeenCalledTimes(1);
      errorSpy.mockRestore();
    });

    it('should show the cancellation notice above the next MG banner', async () => {
      // Arrange
      mockMgEventService.loadServerConfig.mockResolvedValueOnce(SERVER_CONFIG);
      mockCalendarService.loadEntries.mockResolvedValueOnce([NEXT_ENTRY]);
      mockMgEventService.loadRecentCancelledEvent.mockResolvedValueOnce(cancelledEvent('2099-01-11'));

      // Act
      const el = await render();

      // Assert
      const texts = statuses(el);
      expect(texts).toHaveLength(2);
      expect(texts[0]).toContain('CANCELLED');
      expect(texts[1]).toContain('NEXT');
    });

    it('should hide the cancellation notice after the end date of the cancelled event', async () => {
      // Arrange
      mockMgEventService.loadServerConfig.mockResolvedValueOnce(SERVER_CONFIG);
      mockMgEventService.loadRecentCancelledEvent.mockResolvedValueOnce(cancelledEvent('2000-01-11'));

      // Act
      const el = await render();

      // Assert
      expect(statuses(el).some(text => text.includes('CANCELLED'))).toBe(false);
    });

    it('should keep the next MG banner when no cancelled event is returned', async () => {
      // Arrange
      mockMgEventService.loadServerConfig.mockResolvedValueOnce(SERVER_CONFIG);
      mockCalendarService.loadEntries.mockResolvedValueOnce([NEXT_ENTRY]);

      // Act
      const el = await render();

      // Assert
      expect(statuses(el)).toHaveLength(1);
      expect(statuses(el)[0]).toContain('NEXT');
    });
  });

  describe('cancelled event audit', () => {
    it('should treat a cancelled event as no current event: no card, no full FFA, no selection load', async () => {
      // Arrange
      mockMgEventService.loadCurrentEvent.mockResolvedValueOnce({
        id: 'event-c',
        server_id: 'server-1',
        start_date: '2026-01-05',
        end_date: '2026-01-11',
        registration_open_at: '2025-12-29',
        registration_close_at: '2026-01-01',
        status: 'cancelled',
        selection_published_at: '2026-01-02T00:00:00Z',
        created_at: '2026-01-01T00:00:00Z',
      });
      fixture = TestBed.createComponent(MightiestGovernorComponent);
      component = fixture.componentInstance;

      // Act
      await component.ngOnInit();
      fixture.detectChanges();

      // Assert
      const el = fixture.nativeElement as HTMLElement;
      expect(component.isFullFfa()).toBe(false);
      expect(el.querySelector('app-mg-event-card')).toBeNull();
      expect(el.querySelector('.full-ffa-notice')).toBeNull();
      expect(component.rows()).toHaveLength(10);
      expect(mockMgEventService.loadSelection).not.toHaveBeenCalled();
    });
  });
});
