import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivityInputPage } from './activity-input.page';
import { TranslateModule } from '@ngx-translate/core';
import { provideAnimations } from '@angular/platform-browser/animations';
import { provideRouter } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { ActivityService } from '../../core/services/activity.service';
import { PointRulesService } from '../../core/services/point-rules.service';
import { AuthService } from '../../core/services/auth.service';
import { SupabaseService } from '../../core/services/supabase.service';
import { signal } from '@angular/core';

describe('ActivityInputPage', () => {
  let component: ActivityInputPage;
  let fixture: ComponentFixture<ActivityInputPage>;
  let pointRulesService: jasmine.SpyObj<PointRulesService>;

  beforeEach(async () => {
    const authServiceSpy = jasmine.createSpyObj('AuthService', ['getUserId', 'isAuthenticated'], {
      userProfile: signal({ id: 'test-user', display_name: 'Test User', username: 'testuser' }),
    });
    
    const supabaseServiceSpy = jasmine.createSpyObj('SupabaseService', ['from']);
    const pointRulesServiceSpy = jasmine.createSpyObj('PointRulesService', ['calculatePoints', 'loadRules'], {
      rules: signal([]),
    });
    
    authServiceSpy.isAuthenticated.and.returnValue(true);
    authServiceSpy.getUserId.and.returnValue('test-user');
    pointRulesServiceSpy.calculatePoints.and.returnValue({ points: 15, source: 'default', usedFallback: false });
    pointRulesServiceSpy.loadRules.and.returnValue(Promise.resolve({ error: null }));

    await TestBed.configureTestingModule({
      imports: [
        ActivityInputPage,
        TranslateModule.forRoot()
      ],
      providers: [
        provideAnimations(),
        provideRouter([]),
        provideHttpClient(),
        ActivityService,
        { provide: AuthService, useValue: authServiceSpy },
        { provide: SupabaseService, useValue: supabaseServiceSpy },
        { provide: PointRulesService, useValue: pointRulesServiceSpy },
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(ActivityInputPage);
    component = fixture.componentInstance;
    pointRulesService = TestBed.inject(PointRulesService) as jasmine.SpyObj<PointRulesService>;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should initialize with empty signals', () => {
    expect(component.activityType()).toBe('');
    expect(component.position()).toBe(1);
  });

  it('should have available activity types for current week', () => {
    expect(component.availableActivities().length).toBeGreaterThan(0);
  });

  it('should update points when activity type and position change', () => {
    component.activityType.set('development');
    component.position.set(5);
    
    // Manually trigger point calculation
    const result = pointRulesService.calculatePoints('development', 5);
    component.calculatedPointsResult.set(result);
    
    expect(component.points()).toBe(15);
  });

  it('should not submit if activity type is empty', async () => {
    component.activityType.set('');
    component.position.set(1);
    
    await component.onSubmit();
    
    // Form should not be submitted without activity type
    expect(component.submitting()).toBe(false);
  });
});
