import { ComponentFixture, TestBed } from '@angular/core/testing';
import { vi, Mocked } from 'vitest';
import { ActivitySettingsTabComponent } from './activity-settings-tab.component';
import { ServerService } from '@app/core/services/server.service';
import { ActivityService } from '@app/core/services/activity.service';
import { TranslateModule } from '@ngx-translate/core';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { signal, WritableSignal, provideZonelessChangeDetection } from '@angular/core';
import type { Server } from '@app/shared/models/server.model';

describe('ActivitySettingsTabComponent', () => {
  let component: ActivitySettingsTabComponent;
  let fixture: ComponentFixture<ActivitySettingsTabComponent>;
  let serverService: Mocked<ServerService>;

  beforeEach(async () => {
    const serverServiceSpy = {
      createRule: vi.fn().mockResolvedValue({ error: null }),
      deleteRule: vi.fn().mockResolvedValue({ error: null }),
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

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should have point rule form', () => {
    expect(component['pointRuleForm']).toBeDefined();
    expect(component['pointRuleForm'].get('activity_type')).toBeDefined();
    expect(component['pointRuleForm'].get('position_min')).toBeDefined();
    expect(component['pointRuleForm'].get('position_max')).toBeDefined();
    expect(component['pointRuleForm'].get('points')).toBeDefined();
  });

  it('should create point rule on valid submission', async () => {
    component['pointRuleForm'].patchValue({
      activity_type: 'development',
      position_min: 1,
      position_max: 10,
      points: 50,
    });

    await component['createPointRule']();

    expect(serverService.createRule).toHaveBeenCalledWith({
      activity_type: 'development',
      position_min: 1,
      position_max: 10,
      points: 50,
    });
  });

  it('should not submit if position_min > position_max', async () => {
    component['pointRuleForm'].patchValue({
      activity_type: 'development',
      position_min: 10,
      position_max: 1,
      points: 50,
    });

    await component['createPointRule']();

    expect(serverService.createRule).not.toHaveBeenCalled();
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
    expect(enabled.length).toBe(0);
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
      created_at: '',
      updated_at: '',
    });
    fixture.detectChanges();

    const event = { checked: false } as import('@angular/material/slide-toggle').MatSlideToggleChange;
    await component['toggleActivityEnabled']('legion', event);

    expect(serverService.setTiebreakerActivity).not.toHaveBeenCalled();
  });
});
