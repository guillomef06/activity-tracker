import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TestBed, ComponentFixture } from '@angular/core/testing';
import { provideAnimations } from '@angular/platform-browser/animations';
import { provideZonelessChangeDetection, signal } from '@angular/core';
import { TranslateModule } from '@ngx-translate/core';
import { of } from 'rxjs';
import { PointAdjustmentsTabComponent } from './point-adjustments-tab.component';
import { PointAdjustmentService } from '@app/core/services/point-adjustment.service';
import { AuthService } from '@app/core/services/auth.service';
import { ServerService } from '@app/core/services/server.service';
import { SnackbarService } from '@app/core/services';
import type { UserProfile } from '@shared/models';

const member = (id: string, name: string): UserProfile => ({
  id,
  server_id: 'server-1',
  invitation_token_id: null,
  display_name: name,
  username: name.toLowerCase(),
  role: 'member',
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
});

const mockPointAdjustmentService = {
  loadAdjustments: vi.fn().mockResolvedValue([]),
  createAdjustment: vi.fn().mockResolvedValue({ error: null }),
  deleteAdjustment: vi.fn().mockResolvedValue({ error: null }),
};

const mockAuthService = {
  getServerId: vi.fn().mockReturnValue('server-1'),
  getUserId: vi.fn().mockReturnValue('admin-1'),
};

const mockServerService = {
  members: signal<UserProfile[]>([member('u1', 'TommyTorpedo'), member('u2', 'AllyCat')]),
};

const mockSnackbarService = {
  success: vi.fn(),
  error: vi.fn(),
};

describe('PointAdjustmentsTabComponent', () => {
  let component: PointAdjustmentsTabComponent;
  let fixture: ComponentFixture<PointAdjustmentsTabComponent>;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockPointAdjustmentService.loadAdjustments.mockResolvedValue([]);
    mockPointAdjustmentService.createAdjustment.mockResolvedValue({ error: null });
    mockPointAdjustmentService.deleteAdjustment.mockResolvedValue({ error: null });

    await TestBed.configureTestingModule({
      imports: [PointAdjustmentsTabComponent, TranslateModule.forRoot()],
      providers: [
        provideAnimations(),
        provideZonelessChangeDetection(),
        { provide: PointAdjustmentService, useValue: mockPointAdjustmentService },
        { provide: AuthService, useValue: mockAuthService },
        { provide: ServerService, useValue: mockServerService },
        { provide: SnackbarService, useValue: mockSnackbarService },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(PointAdjustmentsTabComponent);
    component = fixture.componentInstance;
    await component.ngOnInit();
    fixture.detectChanges();
  });

  it('should create and load adjustments on init', () => {
    expect(component).toBeTruthy();
    expect(mockPointAdjustmentService.loadAdjustments).toHaveBeenCalledWith('server-1');
  });

  it('should filter members by the player search text', () => {
    component['onPlayerSearch']('ally');
    expect(component['filteredMembers']().map(m => m.id)).toEqual(['u2']);
  });

  it('should return all members when the search is empty', () => {
    component['onPlayerSearch']('');
    expect(component['filteredMembers']()).toHaveLength(2);
  });

  it('should resolve a member id to its display name for the autocomplete', () => {
    expect(component['displayMemberName']('u1')).toBe('TommyTorpedo');
    expect(component['displayMemberName']('missing')).toBe('');
  });

  it('should not submit an invalid form', async () => {
    // Empty form → invalid.
    await component['submit']();
    expect(mockPointAdjustmentService.createAdjustment).not.toHaveBeenCalled();
  });

  it('should flag a zero delta as invalid via the nonZero validator', () => {
    component['adjustmentModel'].set({ userId: 'u1', delta: 0, reason: 'x' });
    expect(
      component['adjustmentForm']
        .delta()
        .errors()
        .some(e => e.kind === 'nonZero')
    ).toBe(true);
  });

  it('should create an adjustment and reset the form on success', async () => {
    component['onPlayerSelected']('u1');
    component['adjustmentModel'].update(m => ({ ...m, delta: -80, reason: '  Rule violation  ' }));

    await component['submit']();

    expect(mockPointAdjustmentService.createAdjustment).toHaveBeenCalledWith('server-1', {
      userId: 'u1',
      delta: -80,
      reason: 'Rule violation', // trimmed
    });
    expect(mockSnackbarService.success).toHaveBeenCalled();
    expect(component['adjustmentModel']()).toEqual({ userId: null, delta: null, reason: '' });
  });

  it('should show an error snackbar when create fails', async () => {
    mockPointAdjustmentService.createAdjustment.mockResolvedValueOnce({ error: new Error('DB') });
    component['onPlayerSelected']('u1');
    component['adjustmentModel'].update(m => ({ ...m, delta: 50, reason: 'Bonus' }));

    await component['submit']();

    expect(mockSnackbarService.error).toHaveBeenCalled();
  });

  it('should delete an adjustment after confirmation', async () => {
    component['dialog'].open = vi.fn().mockReturnValue({ afterClosed: () => of(true) });

    await component['deleteAdjustment']('adj-1');

    expect(mockPointAdjustmentService.deleteAdjustment).toHaveBeenCalledWith('adj-1');
    expect(mockSnackbarService.success).toHaveBeenCalled();
  });

  it('should not delete when the confirmation is cancelled', async () => {
    component['dialog'].open = vi.fn().mockReturnValue({ afterClosed: () => of(false) });

    await component['deleteAdjustment']('adj-1');

    expect(mockPointAdjustmentService.deleteAdjustment).not.toHaveBeenCalled();
  });
});
