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
    sixWeekTotal: 120,
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
});
