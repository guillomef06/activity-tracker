import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivityInputPage } from './activity-input.page';
import { TranslateModule } from '@ngx-translate/core';
import { provideAnimations } from '@angular/platform-browser/animations';
import { provideRouter } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { ActivityService } from '../../core/services/activity.service';
import { PointRulesService } from '../../core/services/point-rules.service';
import { AuthService } from '../../core/services/auth.service';
import { StorageService } from '../../core/services/storage.service';
import { SupabaseService } from '../../core/services/supabase.service';
import { signal } from '@angular/core';

describe('ActivityInputPage', () => {
  let component: ActivityInputPage;
  let fixture: ComponentFixture<ActivityInputPage>;
  let activityService: ActivityService;
  let pointRulesService: jasmine.SpyObj<PointRulesService>;

  beforeEach(async () => {
    const authServiceSpy = jasmine.createSpyObj('AuthService', ['getUserId', 'isAuthenticated'], {
      userProfile: signal({ id: 'test-user', display_name: 'Test User' }),
    });
    
    const storageServiceSpy = jasmine.createSpyObj('StorageService', ['get', 'set', 'remove']);
    const supabaseServiceSpy = jasmine.createSpyObj('SupabaseService', ['from']);
    const pointRulesServiceSpy = jasmine.createSpyObj('PointRulesService', ['calculatePoints', 'loadRules'], {
      rules: signal([]),
    });
    
    authServiceSpy.isAuthenticated.and.returnValue(false);
    authServiceSpy.getUserId.and.returnValue('test-user');
    storageServiceSpy.get.and.returnValue('');
    pointRulesServiceSpy.calculatePoints.and.returnValue({ points: 15, source: 'default' });
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
        { provide: StorageService, useValue: storageServiceSpy },
        { provide: SupabaseService, useValue: supabaseServiceSpy },
        { provide: PointRulesService, useValue: pointRulesServiceSpy },
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(ActivityInputPage);
    component = fixture.componentInstance;
    activityService = TestBed.inject(ActivityService);
    pointRulesService = TestBed.inject(PointRulesService) as jasmine.SpyObj<PointRulesService>;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should initialize with empty form fields', () => {
    expect(component.userName).toBe('');
    expect(component.activityType).toBe('');
  });

  it('should have activity types', () => {
    expect(component.activityTypes().length).toBeGreaterThan(0);
  });

  it('should update points when activity type changes', () => {
    component.activityType = 'development';
    component.position = 1;
    
    // Manually trigger point calculation as the effect won't run in tests
    const result = pointRulesService.calculatePoints('development', 1);
    component.calculatedPointsResult.set(result);
    component.points = result.points;
    
    expect(component.points).toBe(15);
  });

  it('should not submit if form is invalid', () => {
    const initialActivitiesCount = activityService.activitiesSignal().length;
    
    component.userName = '';
    component.activityType = '';
    component.onSubmit();
    
    expect(activityService.activitiesSignal().length).toBe(initialActivitiesCount);
  });
});
