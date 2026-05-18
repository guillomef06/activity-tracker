import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivityInputComponent } from './activity-input.component';
import { ActivityService } from '@core/services/activity.service';
import { ServerService } from '@core/services/server.service';
import { AuthService } from '@core/services/auth.service';
import { SnackbarService } from '@core/services/snackbar.service';
import { TranslateModule } from '@ngx-translate/core';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { signal, provideZonelessChangeDetection } from '@angular/core';
import { vi } from 'vitest';
import { PositionConflict } from '@shared/models';

describe('ActivityInputComponent', () => {
  let component: ActivityInputComponent;
  let fixture: ComponentFixture<ActivityInputComponent>;

  // Used to force-invalidate the `conflicts` computed in tests
  const activitiesRefreshSignal = signal(0);

  const mockActivityService = {
    addActivity: vi.fn().mockResolvedValue({ error: null }),
    getUserScores: vi.fn().mockReturnValue([]),
    getConflictsForCurrentUser: vi.fn().mockReturnValue([]),
    activities: activitiesRefreshSignal,
  };

  const mockServerService = {
    isParticipationMode: vi.fn().mockReturnValue(false),
    getParticipationPoints: vi.fn().mockReturnValue(5),
    calculatePoints: vi.fn().mockReturnValue({ points: 10 }),
    loadSettings: vi.fn().mockResolvedValue(undefined),
    isActivityEnabled: vi.fn().mockReturnValue(true),
    server: signal(null as { discord_invite_url: string | null } | null),
  };

  const mockAuthService = {
    userProfile: signal({ display_name: 'Test User', id: '1' }),
  };

  const mockSnackbarService = {
    success: vi.fn(),
    error: vi.fn(),
  };

  beforeEach(async () => {
    mockActivityService.getConflictsForCurrentUser.mockReturnValue([]);
    mockActivityService.addActivity.mockResolvedValue({ error: null });

    await TestBed.configureTestingModule({
      imports: [ActivityInputComponent, TranslateModule.forRoot(), NoopAnimationsModule],
      providers: [
        { provide: ActivityService, useValue: mockActivityService },
        { provide: ServerService, useValue: mockServerService },
        { provide: AuthService, useValue: mockAuthService },
        { provide: SnackbarService, useValue: mockSnackbarService },
        provideZonelessChangeDetection(),
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(ActivityInputComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should initialize the form with default values', () => {
    const form = component['activityForm'];
    expect(form.get('week')?.value).toBe(0);
    expect(form.get('activityType')?.value).toBe('');
    expect(form.get('position')?.value).toBeNull();
    expect(form.get('participated')?.value).toBe(false);
  });

  it('should not submit when form is invalid', async () => {
    await component['onSubmit']();
    expect(mockActivityService.addActivity).not.toHaveBeenCalled();
  });

  it('should call addActivity on valid submission in position mode', async () => {
    mockServerService.isParticipationMode.mockReturnValue(false);
    component['activityForm'].patchValue({ activityType: 'kvk-prep', position: 3 });
    await component['onSubmit']();
    expect(mockActivityService.addActivity).toHaveBeenCalled();
  });

  it('should enable submit when position is entered after selecting activity type', () => {
    // Arrange
    mockServerService.isParticipationMode.mockReturnValue(false);

    // Act — user selects activity type before entering a position
    component['activityForm'].get('activityType')?.setValue('primordial conflict');

    // Assert — canSubmit is false while position is still null
    expect(component['canSubmit']()).toBe(false);

    // Act — user types their rank
    component['activityForm'].get('position')?.setValue(50);

    // Assert — canSubmit now re-evaluates and returns true
    expect(component['canSubmit']()).toBe(true);
  });

  it('should exclude disabled activities from availableActivities', () => {
    mockServerService.isActivityEnabled.mockReturnValue(false);
    // Change week to force the computed signal to re-evaluate
    component['activityForm'].patchValue({ week: 1 });
    expect(component['availableActivities']().length).toBe(0);
  });

  it('should include enabled activities in availableActivities', () => {
    mockServerService.isActivityEnabled.mockReturnValue(true);
    // Change week to force the computed signal to re-evaluate with updated mock
    component['activityForm'].patchValue({ week: 1 });
    expect(component['availableActivities']().length).toBeGreaterThan(0);
  });

  it('should return null for discordInviteUrl when server is null', () => {
    mockServerService.server.set(null);
    fixture.detectChanges();

    expect(component['discordInviteUrl']()).toBeNull();
  });

  it('should return discord_invite_url from server signal when set', () => {
    mockServerService.server.set({ discord_invite_url: 'https://discord.gg/test' });
    fixture.detectChanges();

    expect(component['discordInviteUrl']()).toBe('https://discord.gg/test');
  });

  describe('weekOptions date restriction (Stellar Dynasty start Apr 27, 2026)', () => {
    // Each test creates a fresh component AFTER setting the fake time,
    // because weekOptions is a computed() evaluated on first access.
    function createComponentAt(isoDate: string): ActivityInputComponent {
      vi.useFakeTimers();
      vi.setSystemTime(new Date(isoDate));
      const localFixture = TestBed.createComponent(ActivityInputComponent);
      localFixture.detectChanges();
      return localFixture.componentInstance;
    }

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should only show current week when cycle just started (Apr 29, 2026)', () => {
      const c = createComponentAt('2026-04-29T12:00:00Z');

      const options = c['weekOptions']();

      expect(options.length).toBe(1);
      expect(options[0].value).toBe(0);
    });

    it('should show 2 weeks when in week 2 of cycle (May 6, 2026)', () => {
      const c = createComponentAt('2026-05-06T12:00:00Z');

      const options = c['weekOptions']();

      expect(options.length).toBe(2);
      expect(options[0].value).toBe(0);
      expect(options[1].value).toBe(1);
    });

    it('should not exceed 6 options even after many cycles', () => {
      const c = createComponentAt('2026-07-01T12:00:00Z');

      const options = c['weekOptions']();

      expect(options.length).toBeLessThanOrEqual(6);
    });
  });

  describe('conflict card visibility', () => {
    const mockConflict: PositionConflict = {
      activityId: 'act-1',
      activityType: 'kvk prep',
      position: 3,
      date: new Date('2026-05-05'),
      conflictingDisplayName: 'Rival',
    };

    let refreshCount = 0;

    function triggerConflictRefresh(): void {
      activitiesRefreshSignal.set(++refreshCount);
    }

    it('should not show conflict card when there are no conflicts', () => {
      // Arrange
      mockActivityService.getConflictsForCurrentUser.mockReturnValue([]);
      triggerConflictRefresh();
      fixture.detectChanges();

      // Assert — new selector after rename
      const card = fixture.nativeElement.querySelector('app-activity-conflict');
      expect(card).toBeNull();
    });

    it('should show conflict card when conflicts exist and not yet acknowledged', () => {
      // Arrange
      mockActivityService.getConflictsForCurrentUser.mockReturnValue([mockConflict]);
      triggerConflictRefresh();
      fixture.detectChanges();

      // Assert — new selector after rename
      const card = fixture.nativeElement.querySelector('app-activity-conflict');
      expect(card).not.toBeNull();
    });

    it('should hide conflict card and show form after onConflictAcknowledged is called', () => {
      // Arrange
      mockActivityService.getConflictsForCurrentUser.mockReturnValue([mockConflict]);
      triggerConflictRefresh();
      fixture.detectChanges();

      // Act
      component['onConflictAcknowledged']();
      fixture.detectChanges();

      // Assert — conflict card gone, form visible
      const card = fixture.nativeElement.querySelector('app-activity-conflict');
      expect(card).toBeNull();
      const form = fixture.nativeElement.querySelector('form');
      expect(form).not.toBeNull();
    });

    it('should pre-fill the form with conflict data after acknowledging', () => {
      // Arrange
      mockActivityService.getConflictsForCurrentUser.mockReturnValue([mockConflict]);
      triggerConflictRefresh();
      fixture.detectChanges();

      // Act
      component['onConflictAcknowledged']();
      fixture.detectChanges();

      // Assert form values match conflict
      const form = component['activityForm'];
      expect(form.get('activityType')?.value).toBe(mockConflict.activityType);
      expect(form.get('position')?.value).toBe(mockConflict.position);
    });

    it('should disable week and activityType controls in forced-edit mode', () => {
      // Arrange
      mockActivityService.getConflictsForCurrentUser.mockReturnValue([mockConflict]);
      triggerConflictRefresh();
      fixture.detectChanges();

      // Act
      component['onConflictAcknowledged']();
      fixture.detectChanges();

      // Assert
      expect(component['activityForm'].get('week')?.disabled).toBe(true);
      expect(component['activityForm'].get('activityType')?.disabled).toBe(true);
      expect(component['activityForm'].get('position')?.disabled).toBe(false);
    });

    it('should set isInForcedEditMode to true after acknowledging with active conflict', () => {
      // Arrange
      mockActivityService.getConflictsForCurrentUser.mockReturnValue([mockConflict]);
      triggerConflictRefresh();
      fixture.detectChanges();

      // Act
      component['onConflictAcknowledged']();

      // Assert
      expect(component['isInForcedEditMode']()).toBe(true);
    });

    it('should re-enable all controls and reset to creation mode after successful submit', async () => {
      // Arrange — start with a conflict, acknowledge it
      mockActivityService.getConflictsForCurrentUser.mockReturnValue([mockConflict]);
      triggerConflictRefresh();
      fixture.detectChanges();
      component['onConflictAcknowledged']();
      fixture.detectChanges();

      // After submit, service has resolved the conflict
      mockActivityService.getConflictsForCurrentUser.mockReturnValue([]);
      triggerConflictRefresh();

      // Provide a valid submittable form state (position mode)
      mockServerService.isParticipationMode.mockReturnValue(false);
      component['activityForm'].patchValue({ activityType: 'kvk prep', position: 5 });

      // Act
      await component['onSubmit']();
      fixture.detectChanges();

      // Assert — controls re-enabled, conflictAcknowledged reset
      expect(component['activityForm'].get('week')?.enabled).toBe(true);
      expect(component['activityForm'].get('activityType')?.enabled).toBe(true);
      expect(component['conflictAcknowledged']()).toBe(false);
    });
  });
});
