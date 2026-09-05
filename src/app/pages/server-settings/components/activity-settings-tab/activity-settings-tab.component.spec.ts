import { ComponentFixture, TestBed } from '@angular/core/testing';
import { vi, Mocked } from 'vitest';
import { of } from 'rxjs';
import { ActivitySettingsTabComponent } from './activity-settings-tab.component';
import { ServerService, PARTIAL_REPLACE_FAILURE_PREFIX } from '@app/core/services/server.service';
import { ActivityService } from '@app/core/services/activity.service';
import { TranslateModule } from '@ngx-translate/core';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { signal, WritableSignal, provideZonelessChangeDetection } from '@angular/core';
import type { Server } from '@app/shared/models/server.model';
import type { ActivityPointRule } from '@app/shared/models';

/** Builds a minimal, valid ActivityPointRule for test data — overrides only what a test cares about. */
const buildRule = (overrides: Partial<ActivityPointRule> = {}): ActivityPointRule => ({
  id: 'rule-1',
  server_id: 'server-1',
  activity_type: 'development',
  position_min: 1,
  position_max: 10,
  points: 50,
  created_at: '',
  updated_at: '',
  ...overrides,
});

describe('ActivitySettingsTabComponent', () => {
  let component: ActivitySettingsTabComponent;
  let fixture: ComponentFixture<ActivitySettingsTabComponent>;
  let serverService: Mocked<ServerService>;

  beforeEach(async () => {
    const serverServiceSpy = {
      createRule: vi.fn().mockResolvedValue({ error: null }),
      deleteRule: vi.fn().mockResolvedValue({ error: null }),
      replaceRulesForActivityType: vi.fn().mockResolvedValue({ error: null }),
      getRulesForActivityType: vi.fn().mockReturnValue([]),
      getParticipationPoints: vi.fn().mockReturnValue(5),
      upsertSetting: vi.fn().mockResolvedValue({ error: null }),
      isActivityEnabled: vi.fn().mockReturnValue(true),
      isParticipationMode: vi.fn().mockReturnValue(false),
      setTiebreakerActivity: vi.fn().mockResolvedValue({ error: null }),
      setScoringWeeksMultiplier: vi.fn().mockResolvedValue({ error: null }),
      server: signal<Server | null>(null),
      settings: signal([]),
      scoringWeeks: signal(6),
    };

    const activityServiceSpy = {
      deleteAllActivities: vi.fn().mockResolvedValue({ error: null }),
      deleteActivitiesByType: vi.fn().mockResolvedValue({ error: null }),
    };

    await TestBed.configureTestingModule({
      imports: [ActivitySettingsTabComponent, TranslateModule.forRoot(), NoopAnimationsModule],
      providers: [
        { provide: ServerService, useValue: serverServiceSpy },
        { provide: ActivityService, useValue: activityServiceSpy },
        provideZonelessChangeDetection(),
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(ActivitySettingsTabComponent);
    component = fixture.componentInstance;
    serverService = TestBed.inject(ServerService) as unknown as Mocked<ServerService>;

    // Set required inputs
    fixture.componentRef.setInput('pointRules', []);
    fixture.componentRef.setInput('isLoading', false);

    fixture.detectChanges();
  });

  const patchValidGenerator = (): void => {
    component['pointRuleModel'].set({
      activity_type: 'development',
      range_size: 10,
      points: 50,
      decreased_next_range_points: 10,
    });
  };

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should have point rule form', () => {
    expect(component['pointRuleForm'].activity_type).toBeDefined();
    expect(component['pointRuleForm'].range_size).toBeDefined();
    expect(component['pointRuleForm'].points).toBeDefined();
    expect(component['pointRuleForm'].decreased_next_range_points).toBeDefined();
  });

  it('should generate point rules on valid submission', async () => {
    patchValidGenerator();

    await component['generateRules']();

    expect(serverService.replaceRulesForActivityType).toHaveBeenCalledWith('development', [
      { activity_type: 'development', position_min: 1, position_max: 10, points: 50 },
      { activity_type: 'development', position_min: 11, position_max: 20, points: 40 },
      { activity_type: 'development', position_min: 21, position_max: 30, points: 30 },
      { activity_type: 'development', position_min: 31, position_max: 40, points: 20 },
      { activity_type: 'development', position_min: 41, position_max: 50, points: 10 },
    ]);
  });

  it('should not submit when the generator form is invalid', async () => {
    component['pointRuleModel'].set({
      activity_type: '',
      range_size: 7,
      points: 50,
      decreased_next_range_points: 10,
    });

    await component['generateRules']();

    expect(serverService.replaceRulesForActivityType).not.toHaveBeenCalled();
  });

  it('should get activity type label', () => {
    const label = component['getActivityTypeLabel']('development');
    expect(label).toBeDefined();
  });

  it('should call upsertSetting with enabled=false when toggleActivityEnabled is called with checked=false', async () => {
    const event = { checked: false } as import('@angular/material/slide-toggle').MatSlideToggleChange;
    await component['toggleActivityEnabled']('development', event);

    expect(serverService.upsertSetting).toHaveBeenCalledWith(
      expect.objectContaining({ activity_type: 'development', enabled: false })
    );
  });

  it('should only include enabled activities in enabledActivityTypes', () => {
    // Update settings signal so all activities are marked disabled — triggers computed re-evaluation
    const APP_CONSTANTS_TYPES = (component as unknown as { activityTypes: { value: string }[] }).activityTypes;
    (
      serverService.settings as unknown as import('@angular/core').WritableSignal<
        import('@app/shared/models').ServerActivitySettings[]
      >
    ).set(
      APP_CONSTANTS_TYPES.map(t => ({
        id: t.value,
        server_id: 'a1',
        activity_type: t.value,
        enabled: false,
        participation_mode: false,
        participation_points: 5,
        created_at: '',
        updated_at: '',
      }))
    );
    const enabled = component['enabledActivityTypes']();
    expect(enabled).toHaveLength(0);
  });

  it('should call setTiebreakerActivity with activityType when toggleTiebreakerActivity is called with checked=true', async () => {
    const event = { checked: true } as import('@angular/material/slide-toggle').MatSlideToggleChange;
    await component['toggleTiebreakerActivity']('legion', event);

    expect(serverService.setTiebreakerActivity).toHaveBeenCalledWith('legion');
  });

  it('should call setTiebreakerActivity with null when toggleTiebreakerActivity is called with checked=false', async () => {
    const event = { checked: false } as import('@angular/material/slide-toggle').MatSlideToggleChange;
    await component['toggleTiebreakerActivity']('legion', event);

    expect(serverService.setTiebreakerActivity).toHaveBeenCalledWith(null);
  });

  it('should clear tiebreaker when disabling the current tiebreaker activity', async () => {
    // Set server signal so tiebreakerActivity() returns 'legion'
    (serverService.server as unknown as WritableSignal<Server | null>).set({
      id: '1',
      name: 'test',
      tag: null,
      owner_id: null,
      tiebreaker_activity_type: 'legion',
      scoring_weeks_multiplier: 1,
      discord_invite_url: null,
      external_link_label: null,
      external_link_url: null,
      created_at: '',
      updated_at: '',
    });
    fixture.detectChanges();

    const event = { checked: false } as import('@angular/material/slide-toggle').MatSlideToggleChange;
    await component['toggleActivityEnabled']('legion', event);

    expect(serverService.setTiebreakerActivity).toHaveBeenCalledWith(null);
  });

  it('should have isDeletingAll signal initialized to false', () => {
    expect(component['isDeletingAll']()).toBe(false);
  });

  it('should expose deleteAllActivities method and isDeletingAll signal', () => {
    expect(typeof component['deleteAllActivities']).toBe('function');
    expect(component['isDeletingAll']()).toBe(false);
  });

  it('should call setScoringWeeksMultiplier with selected value when onMultiplierChange is called', async () => {
    // Arrange — done in beforeEach

    // Act
    await component['onMultiplierChange'](2);

    // Assert
    expect(serverService.setScoringWeeksMultiplier).toHaveBeenCalledWith(2);
  });

  it('should not clear tiebreaker when disabling a non-tiebreaker activity', async () => {
    (serverService.server as unknown as WritableSignal<Server | null>).set({
      id: '1',
      name: 'test',
      tag: null,
      owner_id: null,
      tiebreaker_activity_type: 'kvk prep',
      scoring_weeks_multiplier: 1,
      discord_invite_url: null,
      external_link_label: null,
      external_link_url: null,
      created_at: '',
      updated_at: '',
    });
    fixture.detectChanges();

    const event = { checked: false } as import('@angular/material/slide-toggle').MatSlideToggleChange;
    await component['toggleActivityEnabled']('legion', event);

    expect(serverService.setTiebreakerActivity).not.toHaveBeenCalled();
  });

  describe('trancheePreview / generateTranches', () => {
    it('should compute contiguous decreasing tranches for a typical config', () => {
      // Arrange
      component['pointRuleModel'].set({
        activity_type: 'development',
        range_size: 10,
        points: 50,
        decreased_next_range_points: 2,
      });

      // Act
      const preview = component['trancheePreview']();

      // Assert — 25 tranches, points strictly decreasing by 2, last one at [241-250]=2, none <= 0
      expect(preview).toHaveLength(25);
      expect(preview[0]).toEqual({ activity_type: 'development', position_min: 1, position_max: 10, points: 50 });
      expect(preview[1]).toEqual({ activity_type: 'development', position_min: 11, position_max: 20, points: 48 });
      expect(preview[24]).toEqual({
        activity_type: 'development',
        position_min: 241,
        position_max: 250,
        points: 2,
      });
      expect(preview.every(t => t.points > 0)).toBe(true);
    });

    it('should generate a single tranche when the decrease exhausts points after tranche 1', () => {
      // Arrange — points=10, decrease=20 => tranche 2 would be 10 - 1*20 = -10 <= 0, stop
      component['pointRuleModel'].set({
        activity_type: 'legion',
        range_size: 5,
        points: 10,
        decreased_next_range_points: 20,
      });

      // Act
      const preview = component['trancheePreview']();

      // Assert
      expect(preview).toEqual([{ activity_type: 'legion', position_min: 1, position_max: 5, points: 10 }]);
    });

    it('should return an empty preview when range_size is not a multiple of 5', () => {
      // Arrange
      component['pointRuleModel'].set({
        activity_type: 'legion',
        range_size: 7,
        points: 50,
        decreased_next_range_points: 2,
      });

      // Act
      const preview = component['trancheePreview']();

      // Assert
      expect(preview).toEqual([]);
      expect(
        component['pointRuleForm']
          .range_size()
          .errors()
          .some(e => e.kind === 'multipleOf')
      ).toBe(true);
    });
  });

  describe('existingRulesForSelectedType', () => {
    it('should reflect rules returned by the service for the currently selected activity type', () => {
      // Arrange
      const rules = [buildRule({ id: 'r1', activity_type: 'development' })];
      serverService.getRulesForActivityType.mockImplementation(type => (type === 'development' ? rules : []));
      component['pointRuleModel'].update(current => ({ ...current, activity_type: 'development' }));

      // Act
      const result = component['existingRulesForSelectedType']();

      // Assert
      expect(result).toEqual(rules);
      expect(serverService.getRulesForActivityType).toHaveBeenCalledWith('development');
    });

    it('should be empty for an activity type with no existing rules', () => {
      // Arrange
      serverService.getRulesForActivityType.mockReturnValue([]);
      component['pointRuleModel'].update(current => ({ ...current, activity_type: 'legion' }));

      // Act
      const result = component['existingRulesForSelectedType']();

      // Assert
      expect(result).toEqual([]);
    });

    it('should be empty when no activity type is selected', () => {
      // Arrange
      component['pointRuleModel'].update(current => ({ ...current, activity_type: '' }));

      // Act
      const result = component['existingRulesForSelectedType']();

      // Assert
      expect(result).toEqual([]);
    });
  });

  describe('groupedPointRules', () => {
    it('should group a flat list of rules by activity_type', () => {
      // Arrange
      const rules = [
        buildRule({ id: 'r1', activity_type: 'development', position_min: 1, position_max: 10 }),
        buildRule({ id: 'r2', activity_type: 'development', position_min: 11, position_max: 20 }),
        buildRule({ id: 'r3', activity_type: 'legion', position_min: 1, position_max: 5 }),
      ];
      fixture.componentRef.setInput('pointRules', rules);
      fixture.detectChanges();

      // Act
      const groups = component['groupedPointRules']();

      // Assert
      expect(groups).toHaveLength(2);
      const developmentGroup = groups.find(g => g.activityType === 'development');
      const legionGroup = groups.find(g => g.activityType === 'legion');
      expect(developmentGroup?.rules).toEqual([rules[0], rules[1]]);
      expect(developmentGroup?.labelKey).toBe(component['getActivityTypeLabel']('development'));
      expect(legionGroup?.rules).toEqual([rules[2]]);
      expect(legionGroup?.labelKey).toBe(component['getActivityTypeLabel']('legion'));
    });

    it('should return a single group when all rules share the same activity_type', () => {
      // Arrange
      const rules = [
        buildRule({ id: 'r1', activity_type: 'development' }),
        buildRule({ id: 'r2', activity_type: 'development' }),
      ];
      fixture.componentRef.setInput('pointRules', rules);
      fixture.detectChanges();

      // Act
      const groups = component['groupedPointRules']();

      // Assert
      expect(groups).toHaveLength(1);
      expect(groups[0].activityType).toBe('development');
      expect(groups[0].rules).toHaveLength(2);
    });

    it('should return an empty array when there are no point rules', () => {
      // Arrange
      fixture.componentRef.setInput('pointRules', []);
      fixture.detectChanges();

      // Act
      const groups = component['groupedPointRules']();

      // Assert
      expect(groups).toEqual([]);
    });
  });

  describe('generateRules() confirm-replace flow', () => {
    it('should call replaceRulesForActivityType directly without opening a confirm dialog when there are no existing rules', async () => {
      // Arrange
      serverService.getRulesForActivityType.mockReturnValue([]);
      const openSpy = vi.fn();
      component['dialog'].open = openSpy;
      patchValidGenerator();

      // Act
      await component['generateRules']();

      // Assert
      expect(openSpy).not.toHaveBeenCalled();
      expect(serverService.replaceRulesForActivityType).toHaveBeenCalledWith('development', expect.any(Array));
    });

    it('should open a confirm dialog before replacing when existing rules are present', async () => {
      // Arrange
      serverService.getRulesForActivityType.mockReturnValue([buildRule()]);
      component['dialog'].open = vi.fn().mockReturnValue({ afterClosed: () => of(true) });
      patchValidGenerator();

      // Act
      await component['generateRules']();

      // Assert
      expect(component['dialog'].open).toHaveBeenCalled();
      expect(serverService.replaceRulesForActivityType).toHaveBeenCalledWith('development', expect.any(Array));
    });

    it('should not call replaceRulesForActivityType when the confirm dialog is dismissed (false)', async () => {
      // Arrange
      serverService.getRulesForActivityType.mockReturnValue([buildRule()]);
      component['dialog'].open = vi.fn().mockReturnValue({ afterClosed: () => of(false) });
      patchValidGenerator();

      // Act
      await component['generateRules']();

      // Assert
      expect(serverService.replaceRulesForActivityType).not.toHaveBeenCalled();
    });

    it('should not call replaceRulesForActivityType when the confirm dialog is dismissed (undefined)', async () => {
      // Arrange
      serverService.getRulesForActivityType.mockReturnValue([buildRule()]);
      component['dialog'].open = vi.fn().mockReturnValue({ afterClosed: () => of(undefined) });
      patchValidGenerator();

      // Act
      await component['generateRules']();

      // Assert
      expect(serverService.replaceRulesForActivityType).not.toHaveBeenCalled();
    });
  });

  describe('submitTranches() outcomes (via generateRules())', () => {
    beforeEach(() => {
      serverService.getRulesForActivityType.mockReturnValue([]);
    });

    it('should show a success snackbar, reset the form and emit ruleCreated on success', async () => {
      // Arrange
      const successSpy = vi.spyOn(component['snackbarService'], 'success');
      const ruleCreatedSpy = vi.fn();
      component.ruleCreated.subscribe(ruleCreatedSpy);
      patchValidGenerator();

      // Act
      await component['generateRules']();

      // Assert
      expect(successSpy).toHaveBeenCalled();
      expect(ruleCreatedSpy).toHaveBeenCalled();
      expect(component['pointRuleModel']().activity_type).toBe('');
      expect(component['pointRuleModel']().range_size).toBe(5);
      expect(component['pointRuleModel']().points).toBe(10);
      expect(component['pointRuleModel']().decreased_next_range_points).toBe(1);
    });

    it('should show the generic generateFailed snackbar on a plain (non-prefixed) error', async () => {
      // Arrange
      serverService.replaceRulesForActivityType.mockResolvedValue({ error: new Error('boom') });
      const errorSpy = vi.spyOn(component['snackbarService'], 'error');
      const translateSpy = vi.spyOn(component['translate'], 'instant');
      patchValidGenerator();

      // Act
      await component['generateRules']();

      // Assert
      expect(errorSpy).toHaveBeenCalled();
      expect(translateSpy).toHaveBeenCalledWith('server.settings.pointRules.generateFailed');
      expect(translateSpy).not.toHaveBeenCalledWith('server.settings.pointRules.generatePartialFailed');
    });

    it('should show the generatePartialFailed snackbar when the error is PARTIAL_REPLACE_FAILURE_PREFIX-prefixed', async () => {
      // Arrange
      serverService.replaceRulesForActivityType.mockResolvedValue({
        error: new Error(`${PARTIAL_REPLACE_FAILURE_PREFIX}insert failed`),
      });
      const errorSpy = vi.spyOn(component['snackbarService'], 'error');
      const translateSpy = vi.spyOn(component['translate'], 'instant');
      patchValidGenerator();

      // Act
      await component['generateRules']();

      // Assert
      expect(errorSpy).toHaveBeenCalled();
      expect(translateSpy).toHaveBeenCalledWith('server.settings.pointRules.generatePartialFailed');
    });

    it('should not reset the form or emit ruleCreated on failure', async () => {
      // Arrange
      serverService.replaceRulesForActivityType.mockResolvedValue({ error: new Error('boom') });
      const ruleCreatedSpy = vi.fn();
      component.ruleCreated.subscribe(ruleCreatedSpy);
      patchValidGenerator();

      // Act
      await component['generateRules']();

      // Assert
      expect(ruleCreatedSpy).not.toHaveBeenCalled();
      expect(component['pointRuleModel']().activity_type).toBe('development');
    });

    it('should set isSubmitting true during the call and reset to false on success', async () => {
      // Arrange
      let resolveReplace!: (value: { error: Error | null }) => void;
      serverService.replaceRulesForActivityType.mockReturnValue(
        new Promise(resolve => {
          resolveReplace = resolve;
        })
      );
      patchValidGenerator();

      // Act
      const promise = component['generateRules']();
      expect(component['isSubmitting']()).toBe(true);
      resolveReplace({ error: null });
      await promise;

      // Assert
      expect(component['isSubmitting']()).toBe(false);
    });

    it('should reset isSubmitting to false on full failure', async () => {
      // Arrange
      serverService.replaceRulesForActivityType.mockResolvedValue({ error: new Error('boom') });
      patchValidGenerator();

      // Act
      await component['generateRules']();

      // Assert
      expect(component['isSubmitting']()).toBe(false);
    });

    it('should reset isSubmitting to false on partial failure', async () => {
      // Arrange
      serverService.replaceRulesForActivityType.mockResolvedValue({
        error: new Error(`${PARTIAL_REPLACE_FAILURE_PREFIX}insert failed`),
      });
      patchValidGenerator();

      // Act
      await component['generateRules']();

      // Assert
      expect(component['isSubmitting']()).toBe(false);
    });
  });

  describe('deleteActivitiesByType', () => {
    it('should call activityService.deleteActivitiesByType with the selected type after confirmation', async () => {
      // Arrange
      const activityService = TestBed.inject(ActivityService) as unknown as Mocked<ActivityService>;
      component['selectedTypeForDeletion'].set('legion');
      component['dialog'].open = vi.fn().mockReturnValue({ afterClosed: () => of(true) });

      // Act
      await component['deleteActivitiesByType']();

      // Assert
      expect(activityService.deleteActivitiesByType).toHaveBeenCalledWith('legion');
    });

    it('should do nothing when no type is selected for deletion', async () => {
      // Arrange
      const activityService = TestBed.inject(ActivityService) as unknown as Mocked<ActivityService>;
      component['selectedTypeForDeletion'].set('');
      const openSpy = vi.fn();
      component['dialog'].open = openSpy;

      // Act
      await component['deleteActivitiesByType']();

      // Assert
      expect(openSpy).not.toHaveBeenCalled();
      expect(activityService.deleteActivitiesByType).not.toHaveBeenCalled();
    });
  });
});
