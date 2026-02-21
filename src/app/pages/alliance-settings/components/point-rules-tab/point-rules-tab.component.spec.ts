import { ComponentFixture, TestBed } from '@angular/core/testing';
import { vi, Mocked } from 'vitest';
import { PointRulesTabComponent } from './point-rules-tab.component';
import { AllianceService } from '@app/core/services/alliance.service';
import { TranslateModule } from '@ngx-translate/core';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { signal } from '@angular/core';

describe('PointRulesTabComponent', () => {
  let component: PointRulesTabComponent;
  let fixture: ComponentFixture<PointRulesTabComponent>;
  let allianceService: Mocked<AllianceService>;

  beforeEach(async () => {
    const allianceServiceSpy = {
      createRule: vi.fn().mockResolvedValue({ error: null }),
      deleteRule: vi.fn().mockResolvedValue({ error: null }),
      getParticipationPoints: vi.fn().mockReturnValue(5),
      upsertSetting: vi.fn().mockResolvedValue({ error: null }),
      settings: signal([]),
    };

    await TestBed.configureTestingModule({
      imports: [PointRulesTabComponent, TranslateModule.forRoot(), NoopAnimationsModule],
      providers: [{ provide: AllianceService, useValue: allianceServiceSpy }],
    }).compileComponents();

    fixture = TestBed.createComponent(PointRulesTabComponent);
    component = fixture.componentInstance;
    allianceService = TestBed.inject(AllianceService) as unknown as Mocked<AllianceService>;

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

    expect(allianceService.createRule).toHaveBeenCalledWith({
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

    expect(allianceService.createRule).not.toHaveBeenCalled();
  });

  it('should get activity type label', () => {
    const label = component['getActivityTypeLabel']('development');
    expect(label).toBeDefined();
  });
});
