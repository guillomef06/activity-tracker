import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivityInputComponent } from './activity-input.component';
import { ActivityService } from '@core/services/activity.service';
import { ServerService } from '@core/services/server.service';
import { SeasonService } from '@core/services/season.service';
import { AuthService } from '@core/services/auth.service';
import { SnackbarService } from '@core/services/snackbar.service';
import { TranslateModule } from '@ngx-translate/core';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { signal, provideZonelessChangeDetection } from '@angular/core';
import { vi } from 'vitest';
import { PositionConflict } from '@shared/models';
import { APP_CONSTANTS } from '@shared/constants/constants';

function submitEvent(): Event {
  return new Event('submit', { cancelable: true });
}

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

  // Default: earliest date far in the past and every activity type available,
  // so existing tests (written against the old "always enabled" cycle logic)
  // keep behaving the same. Blocked-state behavior is covered separately below.
  const mockSeasonService = {
    seasons: signal([]),
    loadSeasons: vi.fn().mockResolvedValue(undefined),
    getSeasonForDate: vi.fn().mockReturnValue(null),
    getAvailableActivityTypesForDate: vi.fn().mockReturnValue(APP_CONSTANTS.ACTIVITY_TYPES),
    getEarliestAllowedDate: vi.fn().mockReturnValue(new Date('2000-01-01T00:00:00Z')),
    suggestNextSeasonStartDate: vi.fn().mockReturnValue(new Date()),
  };

  beforeEach(async () => {
    mockActivityService.getConflictsForCurrentUser.mockReturnValue([]);
    mockActivityService.addActivity.mockResolvedValue({ error: null });
    mockSeasonService.getAvailableActivityTypesForDate.mockReturnValue(APP_CONSTANTS.ACTIVITY_TYPES);
    mockSeasonService.getEarliestAllowedDate.mockReturnValue(new Date('2000-01-01T00:00:00Z'));

    await TestBed.configureTestingModule({
      imports: [ActivityInputComponent, TranslateModule.forRoot(), NoopAnimationsModule],
      providers: [
        { provide: ActivityService, useValue: mockActivityService },
        { provide: ServerService, useValue: mockServerService },
        { provide: SeasonService, useValue: mockSeasonService },
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
    const model = component['activityModel']();
    expect(model.week).toBe(0);
    expect(model.activityType).toBe('');
    expect(model.position).toBeNull();
    expect(model.participated).toBe(false);
  });

  it('should not submit when form is invalid', async () => {
    await component['onSubmit'](submitEvent());
    expect(mockActivityService.addActivity).not.toHaveBeenCalled();
  });

  it('should call addActivity on valid submission in position mode', async () => {
    mockServerService.isParticipationMode.mockReturnValue(false);
    component['activityModel'].update(v => ({ ...v, activityType: 'kvk-prep', position: 3 }));
    await component['onSubmit'](submitEvent());
    expect(mockActivityService.addActivity).toHaveBeenCalled();
  });

  it('should enable submit when position is entered after selecting activity type', () => {
    // Arrange
    mockServerService.isParticipationMode.mockReturnValue(false);

    // Act — user selects activity type before entering a position
    component['activityModel'].update(v => ({ ...v, activityType: 'primordial conflict' }));

    // Assert — canSubmit is false while position is still null
    expect(component['canSubmit']()).toBe(false);

    // Act — user types their rank
    component['activityModel'].update(v => ({ ...v, position: 50 }));

    // Assert — canSubmit now re-evaluates and returns true
    expect(component['canSubmit']()).toBe(true);
  });

  it('should exclude disabled activities from availableActivities', () => {
    mockServerService.isActivityEnabled.mockReturnValue(false);
    // Change week to force the computed signal to re-evaluate
    component['activityModel'].update(v => ({ ...v, week: 1 }));
    expect(component['availableActivities']()).toHaveLength(0);
  });

  it('should include enabled activities in availableActivities', () => {
    mockServerService.isActivityEnabled.mockReturnValue(true);
    // Change week to force the computed signal to re-evaluate
    component['activityModel'].update(v => ({ ...v, week: 1 }));
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

  describe('weekOptions date restriction (season earliest allowed date Apr 27, 2026)', () => {
    // Each test creates a fresh component AFTER setting the fake time,
    // because weekOptions is a computed() evaluated on first access.
    function createComponentAt(isoDate: string): ActivityInputComponent {
      vi.useFakeTimers();
      vi.setSystemTime(new Date(isoDate));
      const localFixture = TestBed.createComponent(ActivityInputComponent);
      localFixture.detectChanges();
      return localFixture.componentInstance;
    }

    beforeEach(() => {
      mockSeasonService.getEarliestAllowedDate.mockReturnValue(new Date('2026-04-27T00:00:00Z'));
    });

    afterEach(() => {
      vi.useRealTimers();
      mockSeasonService.getEarliestAllowedDate.mockReturnValue(new Date('2000-01-01T00:00:00Z'));
    });

    it('should only show current week when cycle just started (Apr 29, 2026)', () => {
      const c = createComponentAt('2026-04-29T12:00:00Z');

      const options = c['weekOptions']();

      expect(options).toHaveLength(1);
      expect(options[0].value).toBe(0);
    });

    it('should show 2 weeks when in week 2 of cycle (May 6, 2026)', () => {
      const c = createComponentAt('2026-05-06T12:00:00Z');

      const options = c['weekOptions']();

      expect(options).toHaveLength(2);
      expect(options[0].value).toBe(0);
      expect(options[1].value).toBe(1);
    });

    it('should not exceed 6 options even after many cycles', () => {
      const c = createComponentAt('2026-07-01T12:00:00Z');

      const options = c['weekOptions']();

      expect(options.length).toBeLessThanOrEqual(6);
    });

    it('should have no week options when there are no seasons at all (earliest date is null)', () => {
      mockSeasonService.getEarliestAllowedDate.mockReturnValue(null);
      const c = createComponentAt('2026-05-06T12:00:00Z');

      expect(c['weekOptions']()).toEqual([]);
    });
  });

  describe('season-driven blocked state', () => {
    it('should filter availableActivities to only the types the season assigns to the selected date', () => {
      const legionOnly = APP_CONSTANTS.ACTIVITY_TYPES.filter(t => t.value === 'legion');
      mockSeasonService.getAvailableActivityTypesForDate.mockReturnValue(legionOnly);
      mockServerService.isActivityEnabled.mockReturnValue(true);
      // Use week: 2 (different from the default 0) to force the computed signal to re-evaluate
      component['activityModel'].update(v => ({ ...v, week: 2 }));

      const activities = component['availableActivities']();

      expect(activities).toEqual(legionOnly);
      expect(component['isBlockedForSelectedWeek']()).toBe(false);
    });

    it('should block submission and expose isBlockedForSelectedWeek when no season covers the selected date', () => {
      mockSeasonService.getAvailableActivityTypesForDate.mockReturnValue([]);
      // Use week: 2 (different from the default 0) to force the computed signal to re-evaluate
      component['activityModel'].update(v => ({ ...v, week: 2 }));

      expect(component['isBlockedForSelectedWeek']()).toBe(true);
      expect(component['availableActivities']()).toHaveLength(0);
      expect(component['canSubmit']()).toBe(false);
    });

    it('should render the no-active-season banner and disable position input when blocked', () => {
      mockSeasonService.getAvailableActivityTypesForDate.mockReturnValue([]);
      // Use week: 2 (different from the default 0) to force the computed signal to re-evaluate
      component['activityModel'].update(v => ({ ...v, week: 2 }));
      fixture.detectChanges();

      const banner = fixture.nativeElement.querySelector('.no-season-banner');
      expect(banner).not.toBeNull();

      expect(component['activityForm'].position().disabled()).toBe(true);
    });

    it('should not render the no-active-season banner when a season covers the selected date', () => {
      mockSeasonService.getAvailableActivityTypesForDate.mockReturnValue(APP_CONSTANTS.ACTIVITY_TYPES);
      // Use week: 2 (different from the default 0) to force the computed signal to re-evaluate
      component['activityModel'].update(v => ({ ...v, week: 2 }));
      fixture.detectChanges();

      const banner = fixture.nativeElement.querySelector('.no-season-banner');
      expect(banner).toBeNull();
    });

    it('should distinguish "no season" (blocked) from "season exists but alliance disabled all activities" (not blocked)', () => {
      mockSeasonService.getAvailableActivityTypesForDate.mockReturnValue(APP_CONSTANTS.ACTIVITY_TYPES);
      mockServerService.isActivityEnabled.mockReturnValue(false);
      // Use week: 2 (different from the default 0) to force the computed signal to re-evaluate
      component['activityModel'].update(v => ({ ...v, week: 2 }));

      expect(component['isBlockedForSelectedWeek']()).toBe(false);
      expect(component['availableActivities']()).toHaveLength(0);
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
      const model = component['activityModel']();
      expect(model.activityType).toBe(mockConflict.activityType);
      expect(model.position).toBe(mockConflict.position);
    });

    it('should disable week and activityType fields in forced-edit mode', () => {
      // Arrange
      mockActivityService.getConflictsForCurrentUser.mockReturnValue([mockConflict]);
      triggerConflictRefresh();
      fixture.detectChanges();

      // Act
      component['onConflictAcknowledged']();
      fixture.detectChanges();

      // Assert
      expect(component['activityForm'].week().disabled()).toBe(true);
      expect(component['activityForm'].activityType().disabled()).toBe(true);
      expect(component['activityForm'].position().disabled()).toBe(false);
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

    it('should re-enable all fields and reset to creation mode after successful submit', async () => {
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
      component['activityModel'].update(v => ({ ...v, activityType: 'kvk prep', position: 5 }));

      // Act
      await component['onSubmit'](submitEvent());
      fixture.detectChanges();

      // Assert — fields re-enabled, conflictAcknowledged reset
      expect(component['activityForm'].week().disabled()).toBe(false);
      expect(component['activityForm'].activityType().disabled()).toBe(false);
      expect(component['conflictAcknowledged']()).toBe(false);
    });
  });

  describe('field reset side effects', () => {
    it('should reset activityType, position and participated when week changes outside forced-edit mode', () => {
      component['activityModel'].update(v => ({ ...v, activityType: 'legion', position: 7, participated: true }));

      component['onWeekChange']();

      const model = component['activityModel']();
      expect(model.activityType).toBe('');
      expect(model.position).toBeNull();
      expect(model.participated).toBe(false);
    });

    it('should not reset fields on week change while in forced-edit mode', () => {
      mockActivityService.getConflictsForCurrentUser.mockReturnValue([
        {
          activityId: 'act-1',
          activityType: 'kvk prep',
          position: 3,
          date: new Date('2026-05-05'),
          conflictingDisplayName: 'Rival',
        },
      ]);
      activitiesRefreshSignal.update(v => v + 1);
      component['onConflictAcknowledged']();

      component['onWeekChange']();

      const model = component['activityModel']();
      expect(model.activityType).toBe('kvk prep');
      expect(model.position).toBe(3);
    });

    it('should reset participated when activityType changes outside forced-edit mode', () => {
      component['activityModel'].update(v => ({ ...v, participated: true }));

      component['onActivityTypeChange']();

      expect(component['activityModel']().participated).toBe(false);
    });
  });

  describe('validation error signals', () => {
    it('should expose a required error kind on activityType when empty', () => {
      component['activityForm'].activityType().markAsTouched();
      expect(component['activityTypeError']()).toBe('errors.required');
    });

    it('should expose a required error kind on position when empty', () => {
      component['activityForm'].position().markAsTouched();
      expect(component['positionError']()).toBe('errors.required');
    });

    it('should clear the activityType error once a value is set', () => {
      component['activityModel'].update(v => ({ ...v, activityType: 'legion' }));
      expect(component['activityTypeError']()).toBe('');
    });
  });
});
