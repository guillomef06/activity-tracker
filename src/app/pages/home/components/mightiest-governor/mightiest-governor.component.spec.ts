import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideAnimations } from '@angular/platform-browser/animations';
import { provideZonelessChangeDetection } from '@angular/core';
import { TranslateModule } from '@ngx-translate/core';
import { vi } from 'vitest';
import { MightiestGovernorComponent } from './mightiest-governor.component';
import { MgEventService } from '@app/core/services/mg-event.service';
import { AuthService } from '@app/core/services/auth.service';
import { SnackbarService } from '@app/core/services';

const mockMgEventService = {
  loadCurrentEvent: vi.fn().mockResolvedValue(null),
  loadUserRegistration: vi.fn().mockResolvedValue(null),
  loadSelection: vi.fn().mockResolvedValue([]),
  loadSlotConfig: vi.fn().mockResolvedValue([]),
  registerPlayer: vi.fn().mockResolvedValue({ error: null }),
  unregisterPlayer: vi.fn().mockResolvedValue({ error: null }),
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
        { provide: AuthService, useValue: mockAuthService },
        { provide: SnackbarService, useValue: mockSnackbarService },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(MightiestGovernorComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should have 10 slots', () => {
    expect(component.slots()).toHaveLength(10);
  });

  it('should have rank 1 cost 150 and medal 100', () => {
    expect(component.slots()[0].cost).toBe(150);
    expect(component.slots()[0].medal).toBe(100);
    expect(component.slots()[0].rankLabel).toBe('1');
  });

  it('should have last slot cover rank 26-50 with cost 60', () => {
    expect(component.slots()[9].rankLabel).toBe('26-50');
    expect(component.slots()[9].cost).toBe(60);
    expect(component.slots()[9].medal).toBe(5);
  });

  it('should build targetLabel as single value for individual ranks', () => {
    expect(component.slots()[0].targetLabel).toBe('30M');
    expect(component.slots()[4].targetLabel).toBe('26M');
  });

  it('should build targetLabel as range for grouped ranks', () => {
    expect(component.slots()[5].targetLabel).toBe('24M-26M');
    expect(component.slots()[9].targetLabel).toBe('10M-15M');
  });

  it('costs should be non-increasing', () => {
    const slots = component.slots();
    for (let i = 0; i < slots.length - 1; i++) {
      expect(slots[i].cost).toBeGreaterThanOrEqual(slots[i + 1].cost);
    }
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

    expect(component.slots()[0].cost).toBe(150);
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

    expect(component.slots()[0].cost).toBe(999);
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
  });
});
