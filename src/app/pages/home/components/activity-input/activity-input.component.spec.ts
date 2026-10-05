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

// Node reads TZ at runtime; @types/node is not part of the spec tsconfig.
declare const process: { env: Record<string, string | undefined> };

// UTC-12 → UTC+14, with half-hour offset (Kolkata) and DST zones (Los Angeles, New York, Paris, Auckland).
const TIMEZONES = [
  'Etc/GMT+12',
  'America/Los_Angeles',
  'America/New_York',
  'UTC',
  'Europe/Paris',
  'Asia/Kolkata',
  'Asia/Tokyo',
  'Pacific/Auckland',
  'Pacific/Kiritimati',
];

const RESET_SCENARIOS = [
  {
    resetDate: '2026-10-05',
    previousWeekStart: '2026-09-28',
    currentWeekRange: '10/5/2026',
    previousWeekRange: '9/28/2026',
  },
  // Europe leaves DST the night before this reset (Oct 25)
  {
    resetDate: '2026-10-26',
    previousWeekStart: '2026-10-19',
    currentWeekRange: '10/26/2026',
    previousWeekRange: '10/19/2026',
  },
  // The US leaves DST the day before this reset (Nov 1)
  {
    resetDate: '2026-11-02',
    previousWeekStart: '2026-10-26',
    currentWeekRange: '11/2/2026',
    previousWeekRange: '10/26/2026',
  },
];

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

  // Each test creates a fresh component AFTER setting the fake time,
  // because the week-relative computeds are evaluated from the clock at construction.
  function createFixtureAt(isoDate: string): ComponentFixture<ActivityInputComponent> {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(isoDate));
    const localFixture = TestBed.createComponent(ActivityInputComponent);
    localFixture.detectChanges();
    return localFixture;
  }

  function createComponentAt(isoDate: string): ActivityInputComponent {
    return createFixtureAt(isoDate).componentInstance;
  }

  describe('weekOptions date restriction (season earliest allowed date Apr 27, 2026)', () => {
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

  describe('weekly reset boundary (Monday 00:00 UTC)', () => {
    const SUNDAY_BEFORE_RESET = '2026-10-04T23:59:00Z';
    const MONDAY_AFTER_RESET = '2026-10-05T00:01:00Z';
    const RESET_INSTANT = new Date('2026-10-05T00:00:00Z');
    const LEGION_ONLY = APP_CONSTANTS.ACTIVITY_TYPES.filter(t => t.value === 'legion');
    const LEGION_AND_DESERT = APP_CONSTANTS.ACTIVITY_TYPES.filter(
      t => t.value === 'legion' || t.value === 'desolate desert'
    );

    // Desolate Desert is scheduled only for the week of Sep 28 → Oct 4; the week of Oct 5 has legion only.
    function useDesertLastWeekOnlySchedule(): void {
      mockSeasonService.getAvailableActivityTypesForDate.mockImplementation((date: Date) =>
        date < RESET_INSTANT ? LEGION_AND_DESERT : LEGION_ONLY
      );
    }

    beforeEach(() => {
      mockActivityService.addActivity.mockClear();
      mockServerService.isParticipationMode.mockReturnValue(false);
      mockServerService.isActivityEnabled.mockReturnValue(true);
      useDesertLastWeekOnlySchedule();
    });

    afterEach(() => {
      vi.useRealTimers();
      mockSeasonService.getAvailableActivityTypesForDate.mockReset();
      mockSeasonService.getAvailableActivityTypesForDate.mockReturnValue(APP_CONSTANTS.ACTIVITY_TYPES);
    });

    it('should offer desolate desert on the last second before the reset', () => {
      // Arrange
      const c = createComponentAt(SUNDAY_BEFORE_RESET);

      // Act
      const types = c['availableActivities']().map(t => t.value);

      // Assert
      expect(types).toContain('desolate desert');
    });

    it('should not offer desolate desert for the current week once the reset has passed', () => {
      // Arrange
      const c = createComponentAt(MONDAY_AFTER_RESET);

      // Act
      const types = c['availableActivities']().map(t => t.value);

      // Assert
      expect(types).not.toContain('desolate desert');
    });

    it('should offer desolate desert for last week once the reset has passed', () => {
      // Arrange
      const c = createComponentAt(MONDAY_AFTER_RESET);
      c['activityModel'].update(v => ({ ...v, week: 1 }));

      // Act
      const types = c['availableActivities']().map(t => t.value);

      // Assert
      expect(types).toContain('desolate desert');
    });

    it('should drop desolate desert from availableActivities when the reset passes while the page stays open', () => {
      // Arrange — page opened on Sunday night, desert is legitimately available
      const c = createComponentAt(SUNDAY_BEFORE_RESET);
      expect(c['availableActivities']().map(t => t.value)).toContain('desolate desert');

      // Act — the clock crosses Monday 00:00 UTC and the reset timer fires
      vi.advanceTimersByTime(2 * 60 * 1000);

      // Assert
      expect(c['availableActivities']().map(t => t.value)).not.toContain('desolate desert');
    });

    it('should clear the selected activity when the reset passes while the page stays open', () => {
      // Arrange
      const c = createComponentAt(SUNDAY_BEFORE_RESET);
      c['activityModel'].update(v => ({ ...v, activityType: 'desolate desert', position: 3 }));

      // Act
      vi.advanceTimersByTime(2 * 60 * 1000);

      // Assert
      expect(c['activityModel']().activityType).toBe('');
      expect(c['activityModel']().position).toBeNull();
    });

    it('should refresh the week when a backgrounded page becomes visible again after the reset', () => {
      // Arrange — timers do not fire while a PWA is suspended: move the clock without running them
      const c = createComponentAt(SUNDAY_BEFORE_RESET);
      vi.setSystemTime(new Date(MONDAY_AFTER_RESET));
      expect(c['availableActivities']().map(t => t.value)).toContain('desolate desert');

      // Act
      document.dispatchEvent(new Event('visibilitychange'));

      // Assert
      expect(c['availableActivities']().map(t => t.value)).not.toContain('desolate desert');
    });

    it('should reschedule the reset timer so that a second reset is also handled', () => {
      // Arrange
      const c = createComponentAt(SUNDAY_BEFORE_RESET);
      vi.advanceTimersByTime(2 * 60 * 1000); // first reset (Oct 5)

      // Act — a full week later the next reset (Oct 12) passes
      vi.advanceTimersByTime(7 * 24 * 60 * 60 * 1000);

      // Assert — "last week" now maps to Oct 5, so the current week starts Oct 12
      expect(c['weekOptions']()[0].dateRange.startsWith('10/12/2026')).toBe(true);
    });

    it('should refuse to submit and not call addActivity when the reset passed unnoticed since the selection', async () => {
      // Arrange — user picked "current week" + desert on Sunday night; the clock then moves past the reset
      // without any timer/visibility callback running
      const c = createComponentAt(SUNDAY_BEFORE_RESET);
      c['activityModel'].update(v => ({ ...v, week: 0, activityType: 'desolate desert', position: 3 }));
      vi.setSystemTime(new Date(MONDAY_AFTER_RESET));

      // Act
      await c['onSubmit'](submitEvent());

      // Assert — desert must never be recorded against the new week (Oct 5)
      expect(mockActivityService.addActivity).not.toHaveBeenCalled();
      expect(mockSnackbarService.error).toHaveBeenCalledWith('activityInput.weekChanged');
    });

    it('should stop the reset timer and the visibility listener when the component is destroyed', () => {
      // Arrange
      const localFixture = createFixtureAt(SUNDAY_BEFORE_RESET);
      const c = localFixture.componentInstance;
      const weekStartBefore = c['currentWeekStartMs']();

      // Act
      localFixture.destroy();
      vi.advanceTimersByTime(2 * 60 * 1000); // would fire the reset timer if it were still alive
      document.dispatchEvent(new Event('visibilitychange')); // would refresh if the listener were still attached

      // Assert
      expect(c['currentWeekStartMs']()).toBe(weekStartBefore);
    });

    it('should submit with the Monday 00:00 UTC of the selected week', async () => {
      // Arrange
      const c = createComponentAt(MONDAY_AFTER_RESET);
      c['activityModel'].update(v => ({ ...v, week: 1, activityType: 'desolate desert', position: 3 }));

      // Act
      await c['onSubmit'](submitEvent());

      // Assert
      const [request] = mockActivityService.addActivity.mock.calls[0];
      expect((request.date as Date).toISOString()).toBe('2026-09-28T00:00:00.000Z');
    });
  });

  // The reset is Monday 00:00 UTC for everyone, whatever the device timezone: the same instant must
  // produce the same outcome from UTC-12 to UTC+14, including around DST changes. Node reads TZ at
  // runtime, so each case switches the process timezone before the component is created.
  describe.each(TIMEZONES)('submit around the weekly reset with the device in %s', timezone => {
    describe.each(RESET_SCENARIOS)('reset of $resetDate', scenario => {
      const resetMs = Date.parse(`${scenario.resetDate}T00:00:00Z`);
      const oneMinuteBeforeReset = new Date(resetMs - 60_000).toISOString();
      const oneMinuteAfterReset = new Date(resetMs + 60_000).toISOString();
      const exactlyAtReset = new Date(resetMs).toISOString();
      const previousWeekStartIso = `${scenario.previousWeekStart}T00:00:00.000Z`;
      const resetIso = `${scenario.resetDate}T00:00:00.000Z`;
      const LEGION = APP_CONSTANTS.ACTIVITY_TYPES.filter(t => t.value === 'legion');
      const LEGION_AND_DESERT = APP_CONSTANTS.ACTIVITY_TYPES.filter(
        t => t.value === 'legion' || t.value === 'desolate desert'
      );
      let originalTimezone: string | undefined;

      function submittedDesertDates(): string[] {
        return mockActivityService.addActivity.mock.calls
          .map(([request]) => request)
          .filter(request => request.activityType === 'desolate desert')
          .map(request => (request.date as Date).toISOString());
      }

      beforeEach(() => {
        originalTimezone = process.env['TZ'];
        process.env['TZ'] = timezone;
        mockActivityService.addActivity.mockClear();
        mockSnackbarService.error.mockClear();
        mockServerService.isParticipationMode.mockReturnValue(false);
        mockServerService.isActivityEnabled.mockReturnValue(true);
        // Desolate Desert is scheduled for the week that ends at the reset only
        mockSeasonService.getAvailableActivityTypesForDate.mockImplementation((date: Date) =>
          date.getTime() < resetMs ? LEGION_AND_DESERT : LEGION
        );
      });

      afterEach(() => {
        vi.useRealTimers();
        if (originalTimezone === undefined) delete process.env['TZ'];
        else process.env['TZ'] = originalTimezone;
        mockSeasonService.getAvailableActivityTypesForDate.mockReset();
        mockSeasonService.getAvailableActivityTypesForDate.mockReturnValue(APP_CONSTANTS.ACTIVITY_TYPES);
      });

      it('should date a current-week submit on the ending week one minute before the reset', async () => {
        // Arrange
        const c = createComponentAt(oneMinuteBeforeReset);
        c['activityModel'].update(v => ({ ...v, week: 0, activityType: 'desolate desert', position: 3 }));

        // Act
        await c['onSubmit'](submitEvent());

        // Assert
        expect(submittedDesertDates()).toEqual([previousWeekStartIso]);
      });

      it('should not offer desolate desert for the current week at the exact reset instant', () => {
        // Arrange
        const c = createComponentAt(exactlyAtReset);

        // Act
        const types = c['availableActivities']().map(t => t.value);

        // Assert
        expect(types).not.toContain('desolate desert');
      });

      it('should date a last-week submit on the ended week once the reset has passed', async () => {
        // Arrange
        const c = createComponentAt(oneMinuteAfterReset);
        c['activityModel'].update(v => ({ ...v, week: 1, activityType: 'desolate desert', position: 3 }));

        // Act
        await c['onSubmit'](submitEvent());

        // Assert
        expect(submittedDesertDates()).toEqual([previousWeekStartIso]);
      });

      it('should show the same week ranges whatever the timezone', () => {
        // Arrange
        const before = createComponentAt(oneMinuteBeforeReset)['weekOptions']();
        const after = createComponentAt(oneMinuteAfterReset)['weekOptions']();

        // Assert
        expect(before[0].dateRange.startsWith(`${scenario.previousWeekRange} - `)).toBe(true);
        expect(after[0].dateRange.startsWith(`${scenario.currentWeekRange} - `)).toBe(true);
        expect(after[1].dateRange.startsWith(`${scenario.previousWeekRange} - `)).toBe(true);
      });

      it('should refuse a submit prepared before the reset and never date desolate desert in the new week', async () => {
        // Arrange — selection made before the reset, clock moved past it without any callback running
        const c = createComponentAt(oneMinuteBeforeReset);
        c['activityModel'].update(v => ({ ...v, week: 0, activityType: 'desolate desert', position: 3 }));
        vi.setSystemTime(new Date(oneMinuteAfterReset));

        // Act
        await c['onSubmit'](submitEvent());

        // Assert
        expect(submittedDesertDates()).not.toContain(resetIso);
        expect(mockActivityService.addActivity).not.toHaveBeenCalled();
        expect(mockSnackbarService.error).toHaveBeenCalledWith('activityInput.weekChanged');
      });

      it('should let the user re-select last week and submit after the page crossed the reset', async () => {
        // Arrange — page open across the reset, the timer fires and clears the stale selection
        const c = createComponentAt(oneMinuteBeforeReset);
        c['activityModel'].update(v => ({ ...v, week: 0, activityType: 'desolate desert', position: 3 }));
        vi.advanceTimersByTime(2 * 60_000);
        expect(c['activityModel']().activityType).toBe('');

        // Act
        c['activityModel'].update(v => ({ ...v, week: 1, activityType: 'desolate desert', position: 3 }));
        await c['onSubmit'](submitEvent());

        // Assert
        expect(submittedDesertDates()).toEqual([previousWeekStartIso]);
      });

      it('should refresh a backgrounded page across the reset when it becomes visible again', () => {
        // Arrange — timers are suspended: move the clock without running them
        const c = createComponentAt(oneMinuteBeforeReset);
        vi.setSystemTime(new Date(oneMinuteAfterReset));

        // Act
        document.dispatchEvent(new Event('visibilitychange'));

        // Assert
        expect(c['availableActivities']().map(t => t.value)).not.toContain('desolate desert');
      });
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
