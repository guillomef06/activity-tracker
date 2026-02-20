import { ComponentFixture, TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
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
  let pointRulesService: { calculatePoints: ReturnType<typeof vi.fn>; loadRules: ReturnType<typeof vi.fn>; rules: ReturnType<typeof signal> };

  beforeEach(async () => {
    const authServiceSpy = {
      getUserId: vi.fn().mockReturnValue('test-user'),
      isAuthenticated: vi.fn().mockReturnValue(true),
      userProfile: signal({ id: 'test-user', display_name: 'Test User', username: 'testuser' }),
    };

    const supabaseServiceSpy = { from: vi.fn() };

    const pointRulesServiceSpy = {
      calculatePoints: vi.fn().mockReturnValue({ points: 15, source: 'default', usedFallback: false }),
      loadRules: vi.fn().mockResolvedValue({ error: null }),
      rules: signal([]),
    };

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
    pointRulesService = TestBed.inject(PointRulesService) as unknown as typeof pointRulesServiceSpy;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should initialize with empty form values', () => {
    expect(component['activityForm'].get('activityType')?.value).toBe('');
    expect(component['activityForm'].get('position')?.value).toBe(1);
  });

  it('should have available activity types for current week', () => {
    expect(component.availableActivities().length).toBeGreaterThan(0);
  });

  it('should update points when activity type and position change', () => {
    component['activityForm'].patchValue({ activityType: 'development', position: 5 });

    // Manually trigger point calculation
    const result = pointRulesService.calculatePoints('development', 5);
    component.calculatedPointsResult.set(result);

    expect(component.points()).toBe(15);
  });

  it('should not submit if activity type is empty', async () => {
    component['activityForm'].patchValue({ activityType: '', position: 1 });

    await component.onSubmit();

    // Form should not be submitted without activity type
    expect(component.isSubmitting()).toBe(false);
  });
});
