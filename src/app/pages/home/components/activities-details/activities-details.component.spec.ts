import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivitiesDetailsComponent } from './activities-details.component';
import { TranslateModule } from '@ngx-translate/core';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { UserScore } from '@shared/models/activity.model';
import { provideZonelessChangeDetection, signal } from '@angular/core';
import { vi } from 'vitest';
import { of } from 'rxjs';
import { AuthService } from '@core/services/auth.service';
import { ActivityService } from '@core/services/activity.service';
import { SnackbarService } from '@core/services/snackbar.service';

const mockUserScores: UserScore[] = [
  {
    userId: 'u1',
    displayName: 'Alice',
    totalScore: 120,
    weeklyScores: [
      {
        weekStart: new Date('2024-01-01'),
        weekEnd: new Date('2024-01-07'),
        totalPoints: 30,
        activities: [
          {
            id: 'a1',
            userId: 'u1',
            displayName: 'Alice',
            activityType: 'kvk-prep',
            position: 1,
            points: 30,
            date: new Date('2024-01-03'),
            timestamp: 1704240000000,
          },
        ],
      },
    ],
  },
];

describe('ActivitiesDetailsComponent', () => {
  let component: ActivitiesDetailsComponent;
  let fixture: ComponentFixture<ActivitiesDetailsComponent>;

  const mockAuthService = {
    isSuperAdmin: signal(false),
  };

  const mockActivityService = {
    deleteActivity: vi.fn().mockResolvedValue({ error: null }),
  };

  const mockSnackbarService = {
    success: vi.fn(),
    error: vi.fn(),
  };

  beforeEach(async () => {
    mockAuthService.isSuperAdmin.set(false);
    mockActivityService.deleteActivity.mockResolvedValue({ error: null });

    await TestBed.configureTestingModule({
      imports: [ActivitiesDetailsComponent, TranslateModule.forRoot(), NoopAnimationsModule],
      providers: [
        provideZonelessChangeDetection(),
        { provide: AuthService, useValue: mockAuthService },
        { provide: ActivityService, useValue: mockActivityService },
        { provide: SnackbarService, useValue: mockSnackbarService },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(ActivitiesDetailsComponent);
    fixture.componentRef.setInput('userScores', mockUserScores);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should display user scores', () => {
    expect(component.userScores()).toEqual(mockUserScores);
  });

  it('should toggle user details on click', () => {
    expect(component['selectedUserId']()).toBeNull();
    component['toggleUserDetails']('u1');
    expect(component['selectedUserId']()).toBe('u1');
    component['toggleUserDetails']('u1');
    expect(component['selectedUserId']()).toBeNull();
  });

  it('should not show delete buttons when user is not super admin', () => {
    // Arrange
    mockAuthService.isSuperAdmin.set(false);
    component['toggleUserDetails']('u1');
    fixture.detectChanges();

    // Assert
    expect(component['isSuperAdmin']()).toBe(false);
  });

  it('should not show the MG deduction badge when mgDeduction is absent', () => {
    // Assert
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('.mg-deduction')).toBeNull();
  });

  it('should show the MG deduction badge when mgDeduction is greater than 0', () => {
    // Arrange
    fixture.componentRef.setInput('userScores', [{ ...mockUserScores[0], mgDeduction: 100 }]);
    fixture.detectChanges();

    // Act
    const compiled = fixture.nativeElement as HTMLElement;
    const badge = compiled.querySelector('.mg-deduction');

    // Assert
    expect(badge).toBeTruthy();
    expect(badge?.textContent).toContain('-100');
  });

  it('should show delete buttons when user is super admin', () => {
    // Arrange
    mockAuthService.isSuperAdmin.set(true);
    fixture.detectChanges();

    // Assert
    expect(component['isSuperAdmin']()).toBe(true);
  });

  it('should show success snackbar after successful activity deletion', async () => {
    // Arrange
    mockActivityService.deleteActivity.mockResolvedValue({ error: null });
    const stopPropagationSpy = vi.fn();
    const fakeEvent = { stopPropagation: stopPropagationSpy } as unknown as Event;

    // Mock dialog to auto-confirm
    const dialogMock = { afterClosed: () => of(true) };
    component['dialog'].open = vi.fn().mockReturnValue(dialogMock);

    // Act
    await component['deleteActivity']('a1', fakeEvent);

    // Assert
    expect(stopPropagationSpy).toHaveBeenCalled();
    expect(mockActivityService.deleteActivity).toHaveBeenCalledWith('a1');
    expect(mockSnackbarService.success).toHaveBeenCalled();
  });

  it('should show error snackbar when activity deletion fails', async () => {
    // Arrange
    mockActivityService.deleteActivity.mockResolvedValue({ error: new Error('DB error') });
    const fakeEvent = { stopPropagation: vi.fn() } as unknown as Event;

    const dialogMock = { afterClosed: () => of(true) };
    component['dialog'].open = vi.fn().mockReturnValue(dialogMock);

    // Act
    await component['deleteActivity']('a1', fakeEvent);

    // Assert
    expect(mockSnackbarService.error).toHaveBeenCalled();
  });

  describe('point adjustments', () => {
    it('should not show the adjustment badge when pointAdjustment is absent or zero', () => {
      const compiled = fixture.nativeElement as HTMLElement;
      expect(compiled.querySelector('.point-adjustment')).toBeNull();
    });

    it('should show a green +N badge for a positive net adjustment', () => {
      fixture.componentRef.setInput('userScores', [{ ...mockUserScores[0], pointAdjustment: 50 }]);
      fixture.detectChanges();

      const badge = (fixture.nativeElement as HTMLElement).querySelector('.point-adjustment');
      expect(badge).toBeTruthy();
      expect(badge?.textContent).toContain('+50');
      expect(badge?.classList).toContain('adjustment-positive');
    });

    it('should show a red -N badge for a negative net adjustment', () => {
      fixture.componentRef.setInput('userScores', [{ ...mockUserScores[0], pointAdjustment: -80 }]);
      fixture.detectChanges();

      const badge = (fixture.nativeElement as HTMLElement).querySelector('.point-adjustment');
      expect(badge?.textContent).toContain('-80');
      expect(badge?.classList).toContain('adjustment-negative');
    });

    it('should bucket an adjustment into the week its date falls in', () => {
      // mockUserScores[0] week runs 2024-01-01..2024-01-07.
      const adj = {
        id: 'adj-1',
        userId: 'u1',
        delta: -80,
        reason: 'Rule violation',
        date: new Date('2024-01-03'),
        createdBy: 'admin',
      };
      fixture.componentRef.setInput('adjustments', new Map([['u1', [adj]]]));
      component['toggleUserDetails']('u1');
      fixture.detectChanges();

      expect(component['adjustmentsByWeek']().get(0)).toEqual([adj]);
      const row = (fixture.nativeElement as HTMLElement).querySelector('.adjustment-row');
      expect(row?.textContent).toContain('Rule violation');
      expect(row?.textContent).toContain('-80');
    });

    it('should bucket no adjustment when its date is outside every rendered week', () => {
      const adj = {
        id: 'adj-2',
        userId: 'u1',
        delta: 25,
        reason: 'Old bonus',
        date: new Date('2023-06-01'), // before the only week
        createdBy: 'admin',
      };
      fixture.componentRef.setInput('adjustments', new Map([['u1', [adj]]]));
      component['toggleUserDetails']('u1');
      fixture.detectChanges();

      expect(component['adjustmentsByWeek']().size).toBe(0);
    });
  });

  describe('season total sorting', () => {
    // Alice has the higher current total; Bob has the higher season total.
    const current = (): UserScore[] => [
      { userId: 'u1', displayName: 'Alice', totalScore: 120, seasonTotal: 300, weeklyScores: [] },
      { userId: 'u2', displayName: 'Bob', totalScore: 90, seasonTotal: 500, weeklyScores: [] },
    ];

    it('should default to the "current" sort key and preserve the parent order', () => {
      fixture.componentRef.setInput('userScores', current());
      fixture.detectChanges();

      expect(component['sortKey']()).toBe('current');
      expect(component['rankedScores']().map(u => u.userId)).toEqual(['u1', 'u2']);
    });

    it('should re-rank by seasonTotal descending when the season sort key is selected', () => {
      fixture.componentRef.setInput('userScores', current());
      component['setSortKey']('season');
      fixture.detectChanges();

      // Bob (500) now outranks Alice (300).
      expect(component['rankedScores']().map(u => u.userId)).toEqual(['u2', 'u1']);
    });

    it('should expose hasSeasonTotals=false when no user has a season total', () => {
      fixture.componentRef.setInput('userScores', [
        { userId: 'u1', displayName: 'Alice', totalScore: 120, weeklyScores: [] },
      ]);
      fixture.detectChanges();

      expect(component['hasSeasonTotals']()).toBe(false);
    });

    it('should show the sort toggle and a season chip only when season totals exist', () => {
      const compiled = fixture.nativeElement as HTMLElement;

      // mockUserScores (default) has no seasonTotal → no toggle, no season chip.
      expect(compiled.querySelector('.sort-toggle')).toBeNull();
      expect(compiled.querySelector('.season-chip')).toBeNull();

      fixture.componentRef.setInput('userScores', current());
      fixture.detectChanges();

      expect(compiled.querySelector('.sort-toggle')).toBeTruthy();
      expect(compiled.querySelector('.season-chip')?.textContent).toContain('300');
    });

    // On mobile the CSS collapses the row to just the active metric's number via
    // the chip-hidden-on-mobile class (applied to the non-active chip) — assert the
    // class tracks the sort key so that behavior can't silently regress.
    it('should mark only the inactive chip as hidden-on-mobile, following the sort key', () => {
      fixture.componentRef.setInput('userScores', current());
      fixture.detectChanges();
      const compiled = fixture.nativeElement as HTMLElement;

      // Default sort = current: season chip is the one hidden on mobile.
      expect(compiled.querySelector('.score-chip')?.classList).not.toContain('chip-hidden-on-mobile');
      expect(compiled.querySelector('.season-chip')?.classList).toContain('chip-hidden-on-mobile');

      // Switch to season: now the current chip is hidden on mobile.
      component['setSortKey']('season');
      fixture.detectChanges();
      expect(compiled.querySelector('.score-chip')?.classList).toContain('chip-hidden-on-mobile');
      expect(compiled.querySelector('.season-chip')?.classList).not.toContain('chip-hidden-on-mobile');
    });

    it('should never hide the current chip on mobile when there are no season totals', () => {
      // Single metric → nothing to toggle, the current chip must always stay visible.
      const compiled = fixture.nativeElement as HTMLElement;
      expect(compiled.querySelector('.score-chip')?.classList).not.toContain('chip-hidden-on-mobile');
    });
  });
});
