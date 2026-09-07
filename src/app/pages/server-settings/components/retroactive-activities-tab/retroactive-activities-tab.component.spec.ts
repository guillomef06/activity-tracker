import { ComponentFixture, TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { signal } from '@angular/core';
import { RetroactiveActivitiesTabComponent } from './retroactive-activities-tab.component';
import { ActivityService } from '@app/core/services';
import { ServerService } from '@app/core/services/server.service';
import { SeasonService } from '@app/core/services/season.service';
import { APP_CONSTANTS } from '@app/shared/constants/constants';
import { TranslateModule } from '@ngx-translate/core';
import { MatSnackBar } from '@angular/material/snack-bar';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { provideZonelessChangeDetection } from '@angular/core';

describe('RetroactiveActivitiesTabComponent', () => {
  let component: RetroactiveActivitiesTabComponent;
  let fixture: ComponentFixture<RetroactiveActivitiesTabComponent>;
  let activityServiceSpy: { addActivityForMember: ReturnType<typeof vi.fn> };
  let serverServiceSpy: {
    isActivityEnabled: ReturnType<typeof vi.fn>;
    isParticipationMode: ReturnType<typeof vi.fn>;
    getParticipationPoints: ReturnType<typeof vi.fn>;
    scoringWeeks: ReturnType<typeof signal<number>>;
  };
  let snackBarSpy: { open: ReturnType<typeof vi.fn> };
  let seasonServiceSpy: {
    seasons: ReturnType<typeof signal>;
    loadSeasons: ReturnType<typeof vi.fn>;
    getSeasonForDate: ReturnType<typeof vi.fn>;
    getAvailableActivityTypesForDate: ReturnType<typeof vi.fn>;
    getEarliestAllowedDate: ReturnType<typeof vi.fn>;
    suggestNextSeasonStartDate: ReturnType<typeof vi.fn>;
  };

  const patchModel = (
    partial: Partial<{ member: string; week: number; activity: string; position: number; participated: boolean }>
  ): void => {
    (
      component as unknown as { retroactiveModel: { update: (fn: (c: unknown) => unknown) => void } }
    ).retroactiveModel.update(current => ({ ...(current as object), ...partial }));
  };

  beforeEach(async () => {
    activityServiceSpy = { addActivityForMember: vi.fn() };
    serverServiceSpy = {
      isActivityEnabled: vi.fn().mockReturnValue(true),
      isParticipationMode: vi.fn().mockReturnValue(false),
      getParticipationPoints: vi.fn().mockReturnValue(5),
      scoringWeeks: signal(6),
    };
    snackBarSpy = { open: vi.fn() };
    // Default: earliest date far in the past and every activity type available,
    // so existing tests (written against the old "always enabled" cycle logic)
    // keep behaving the same. Blocked-state behavior is covered separately below.
    seasonServiceSpy = {
      seasons: signal([]),
      loadSeasons: vi.fn().mockResolvedValue(undefined),
      getSeasonForDate: vi.fn().mockReturnValue(null),
      getAvailableActivityTypesForDate: vi.fn().mockReturnValue(APP_CONSTANTS.ACTIVITY_TYPES),
      getEarliestAllowedDate: vi.fn().mockReturnValue(new Date('2000-01-01T00:00:00Z')),
      suggestNextSeasonStartDate: vi.fn().mockReturnValue(new Date()),
    };

    await TestBed.configureTestingModule({
      imports: [RetroactiveActivitiesTabComponent, TranslateModule.forRoot(), NoopAnimationsModule],
      providers: [
        { provide: ActivityService, useValue: activityServiceSpy },
        { provide: ServerService, useValue: serverServiceSpy },
        { provide: SeasonService, useValue: seasonServiceSpy },
        { provide: MatSnackBar, useValue: snackBarSpy },
        provideZonelessChangeDetection(),
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(RetroactiveActivitiesTabComponent);
    component = fixture.componentInstance;

    // Set required input
    fixture.componentRef.setInput('members', [
      { id: 'user1', display_name: 'John Doe', username: 'john' },
      { id: 'user2', display_name: 'Jane Doe', username: 'jane' },
    ]);

    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should initialize with empty form values', () => {
    const model = (
      component as unknown as {
        retroactiveModel: () => { member: string; week: number; activity: string; position: number };
      }
    ).retroactiveModel();
    expect(model.member).toBe('');
    expect(model.week).toBe(0);
    expect(model.activity).toBe('');
    expect(model.position).toBe(1);
  });

  it('should generate 6 week options when scoringWeeks is 6', () => {
    serverServiceSpy.scoringWeeks.set(6);
    fixture.detectChanges();

    const weekOptions = component.weekOptions();
    expect(weekOptions).toHaveLength(6);
    expect(weekOptions[0].value).toBe(0);
    expect(weekOptions[5].value).toBe(5);
  });

  it('should generate 12 week options when scoringWeeks is 12 (multiplier x2)', () => {
    serverServiceSpy.scoringWeeks.set(12);
    fixture.detectChanges();

    const weekOptions = component.weekOptions();
    expect(weekOptions).toHaveLength(12);
    expect(weekOptions[0].value).toBe(0);
    expect(weekOptions[11].value).toBe(11);
  });

  it('should generate 18 week options when scoringWeeks is 18 (multiplier x3)', () => {
    serverServiceSpy.scoringWeeks.set(18);
    fixture.detectChanges();

    const weekOptions = component.weekOptions();
    expect(weekOptions).toHaveLength(18);
    expect(weekOptions[17].value).toBe(17);
  });

  it('should filter activities based on selected week cycle', () => {
    patchModel({ week: 0 });

    const activities = component.availableActivities();
    expect(activities.length).toBeGreaterThan(0);
  });

  it('should exclude disabled activities from availableActivities', () => {
    serverServiceSpy.isActivityEnabled.mockReturnValue(false);
    // Use week: 1 (different from initial 0) to force the computed signal to re-evaluate
    patchModel({ week: 1 });

    const activities = component.availableActivities();
    expect(activities).toHaveLength(0);
  });

  it('should calculate points correctly', () => {
    patchModel({ activity: 'golden expedition', position: 1 });

    const points = component.calculatedPoints();
    expect(points).toBe(5); // Golden expedition base points
  });

  it('should disable submit when required fields are empty', () => {
    patchModel({ member: '', activity: '' });

    expect(component.canSubmit()).toBe(false);
  });

  it('should show success message after successful submission', async () => {
    activityServiceSpy.addActivityForMember.mockResolvedValue({ error: null });

    patchModel({ member: 'user1', activity: 'legion', position: 3 });

    await component.onSubmit();

    expect(snackBarSpy.open).toHaveBeenCalled();
  });

  it('should reset activity and position after successful submission', async () => {
    activityServiceSpy.addActivityForMember.mockResolvedValue({ error: null });

    patchModel({ member: 'user1', activity: 'legion', position: 3 });

    await component.onSubmit();

    const model = (
      component as unknown as { retroactiveModel: () => { activity: string; position: number } }
    ).retroactiveModel();
    expect(model.activity).toBe('');
    expect(model.position).toBe(1);
  });

  it('should reset all form fields when resetForm is called', () => {
    patchModel({ member: 'user1', activity: 'legion', position: 5, week: 2 });

    component.resetForm();

    const model = (
      component as unknown as {
        retroactiveModel: () => { member: string; activity: string; position: number; week: number };
      }
    ).retroactiveModel();
    expect(model.member).toBe('');
    expect(model.activity).toBe('');
    expect(model.position).toBe(1);
    expect(model.week).toBe(0);
  });

  describe('season-driven blocked state', () => {
    it('should filter availableActivities to only the types the season assigns to the selected date', () => {
      const legionOnly = APP_CONSTANTS.ACTIVITY_TYPES.filter(t => t.value === 'legion');
      seasonServiceSpy.getAvailableActivityTypesForDate.mockReturnValue(legionOnly);
      // Use week: 2 (different from the default 0) to force the computed signal to re-evaluate
      patchModel({ week: 2 });

      expect(component.availableActivities()).toEqual(legionOnly);
      expect(component.isBlockedForSelectedWeek()).toBe(false);
    });

    it('should block submission and expose isBlockedForSelectedWeek when no season covers the selected date', () => {
      seasonServiceSpy.getAvailableActivityTypesForDate.mockReturnValue([]);
      // Use week: 2 (different from the default 0) to force the computed signal to re-evaluate
      patchModel({ member: 'user1', week: 2 });

      expect(component.isBlockedForSelectedWeek()).toBe(true);
      expect(component.availableActivities()).toHaveLength(0);
      expect(component.canSubmit()).toBe(false);
    });

    it('should have no week options when there are no seasons at all (earliest date is null)', () => {
      // weekOptions has no other reactive signal dependency, so the mock must be set
      // BEFORE the component (and its computed) is first created/read.
      seasonServiceSpy.getEarliestAllowedDate.mockReturnValue(null);
      const localFixture = TestBed.createComponent(RetroactiveActivitiesTabComponent);
      localFixture.componentRef.setInput('members', []);
      const localComponent = localFixture.componentInstance;

      expect(localComponent.weekOptions()).toEqual([]);
    });

    it('should render the no-active-season banner and disable position input when blocked', () => {
      seasonServiceSpy.getAvailableActivityTypesForDate.mockReturnValue([]);
      // Use week: 2 (different from the default 0) to force the computed signal to re-evaluate
      patchModel({ week: 2 });
      fixture.detectChanges();

      const banner = fixture.nativeElement.querySelector('.no-season-banner');
      expect(banner).not.toBeNull();

      const positionInput = fixture.nativeElement.querySelector('input[type="number"]');
      expect(positionInput?.disabled).toBe(true);
    });

    it('should not render the no-active-season banner when a season covers the selected date', () => {
      seasonServiceSpy.getAvailableActivityTypesForDate.mockReturnValue(APP_CONSTANTS.ACTIVITY_TYPES);
      // Use week: 2 (different from the default 0) to force the computed signal to re-evaluate
      patchModel({ week: 2 });
      fixture.detectChanges();

      const banner = fixture.nativeElement.querySelector('.no-season-banner');
      expect(banner).toBeNull();
    });

    it('should distinguish "no season" (blocked) from "season exists but alliance disabled all activities" (not blocked)', () => {
      seasonServiceSpy.getAvailableActivityTypesForDate.mockReturnValue(APP_CONSTANTS.ACTIVITY_TYPES);
      serverServiceSpy.isActivityEnabled.mockReturnValue(false);
      // Use week: 2 (different from the default 0) to force the computed signal to re-evaluate
      patchModel({ week: 2 });

      expect(component.isBlockedForSelectedWeek()).toBe(false);
      expect(component.availableActivities()).toHaveLength(0);
    });
  });
});
