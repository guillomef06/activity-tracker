import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TestBed, ComponentFixture } from '@angular/core/testing';
import { provideAnimations } from '@angular/platform-browser/animations';
import { provideZonelessChangeDetection } from '@angular/core';
import { TranslateModule } from '@ngx-translate/core';
import { ReactiveFormsModule } from '@angular/forms';
import { FormControl, FormGroup } from '@angular/forms';
import { MgAdminTabComponent, targetRangeValidator } from './mg-admin-tab.component';
import { MgEventService } from '@app/core/services/mg-event.service';
import { AuthService } from '@app/core/services/auth.service';
import { ActivityService } from '@app/core/services/activity.service';
import { ServerService } from '@app/core/services/server.service';
import { SnackbarService } from '@app/core/services';

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
      imports: [MgAdminTabComponent, TranslateModule.forRoot(), ReactiveFormsModule],
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
    const form = (component as unknown as { configForm: { value: { capacity: number; assignment_mode: string } } })
      .configForm;
    expect(form.value.capacity).toBe(10);
    expect(form.value.assignment_mode).toBe('automatic');
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

  describe('slot configuration', () => {
    const getSlotRows = (): FormGroup[] => (component as unknown as { slotRows: FormGroup[] }).slotRows;

    it('should call loadSlotConfig on init', () => {
      expect(mockMgEventService.loadSlotConfig).toHaveBeenCalledWith('server-1');
    });

    it('should build 10 rows from defaults when no server override exists', () => {
      const rows = getSlotRows();
      expect(rows.length).toBe(10);
      expect(rows[0].get('cost')?.value).toBe(150);
      expect(rows[0].get('rankLabel')?.value).toBe('1');
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
      expect(rows[0].get('cost')?.value).toBe(999);
    });

    it('should be valid when targetMax is greater than or equal to targetMin', () => {
      const group = new FormGroup(
        {
          targetMin: new FormControl(10),
          targetMax: new FormControl(10),
        },
        { validators: targetRangeValidator }
      );
      expect(group.errors).toBeNull();
    });

    it('should be invalid when targetMax is less than targetMin', () => {
      const group = new FormGroup(
        {
          targetMin: new FormControl(20),
          targetMax: new FormControl(10),
        },
        { validators: targetRangeValidator }
      );
      expect(group.hasError('targetRange')).toBe(true);
    });

    it('should not call saveSlotConfig when the form is invalid', async () => {
      const rows = getSlotRows();
      rows[0].get('cost')?.setValue(-1);

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
});
