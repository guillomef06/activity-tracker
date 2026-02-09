import { ComponentFixture, TestBed } from '@angular/core/testing';
import { PointRulesTabComponent } from './point-rules-tab.component';
import { PointRulesService } from '@app/core/services/point-rules.service';
import { TranslateModule } from '@ngx-translate/core';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';

describe('PointRulesTabComponent', () => {
  let component: PointRulesTabComponent;
  let fixture: ComponentFixture<PointRulesTabComponent>;
  let pointRulesService: jasmine.SpyObj<PointRulesService>;

  beforeEach(async () => {
    const pointRulesServiceSpy = jasmine.createSpyObj('PointRulesService', ['createRule', 'deleteRule']);
    pointRulesServiceSpy.createRule.and.returnValue(Promise.resolve({ error: null }));
    pointRulesServiceSpy.deleteRule.and.returnValue(Promise.resolve({ error: null }));

    await TestBed.configureTestingModule({
      imports: [PointRulesTabComponent, TranslateModule.forRoot(), NoopAnimationsModule],
      providers: [
        { provide: PointRulesService, useValue: pointRulesServiceSpy },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(PointRulesTabComponent);
    component = fixture.componentInstance;
    pointRulesService = TestBed.inject(PointRulesService) as jasmine.SpyObj<PointRulesService>;
    
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
    
    expect(pointRulesService.createRule).toHaveBeenCalledWith({
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
    
    expect(pointRulesService.createRule).not.toHaveBeenCalled();
  });

  it('should get activity type label', () => {
    const label = component['getActivityTypeLabel']('development');
    expect(label).toBeDefined();
  });

  it('should format position range correctly', () => {
    expect(component['formatPositionRange'](1, 10)).toBe('1-10');
    expect(component['formatPositionRange'](5, 5)).toBe('5');
  });
});
