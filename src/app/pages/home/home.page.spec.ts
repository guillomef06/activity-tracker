import { ComponentFixture, TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { HomePage } from './home.page';
import { TranslateModule } from '@ngx-translate/core';
import { provideAnimations } from '@angular/platform-browser/animations';
import { provideRouter } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { ActivityService } from '../../core/services/activity.service';
import { PointRulesService } from '../../core/services/point-rules.service';
import { AuthService } from '../../core/services/auth.service';
import { SupabaseService } from '../../core/services/supabase.service';
import { AllianceActivitySettingsService } from '../../core/services/alliance-activity-settings.service';
import { signal } from '@angular/core';

describe('HomePage', () => {
  let component: HomePage;
  let fixture: ComponentFixture<HomePage>;

  beforeEach(async () => {
    const authServiceSpy = {
      getUserId: vi.fn().mockReturnValue('test-user'),
      isAuthenticated: vi.fn().mockReturnValue(true),
      userProfile: signal({ id: 'test-user', display_name: 'Test User', username: 'testuser' }),
      getAllianceId: vi.fn().mockReturnValue('alliance-1'),
    };

    const supabaseServiceSpy = { from: vi.fn() };

    const pointRulesServiceSpy = {
      calculatePoints: vi.fn().mockReturnValue({ points: 15, source: 'default', usedFallback: false }),
      loadRules: vi.fn().mockResolvedValue({ error: null }),
      rules: signal([]),
    };

    const activitySettingsServiceSpy = {
      loadSettings: vi.fn().mockResolvedValue(undefined),
      isParticipationMode: vi.fn().mockReturnValue(false),
      getParticipationPoints: vi.fn().mockReturnValue(5),
    };

    await TestBed.configureTestingModule({
      imports: [
        HomePage,
        TranslateModule.forRoot(),
      ],
      providers: [
        provideAnimations(),
        provideRouter([]),
        provideHttpClient(),
        ActivityService,
        { provide: AuthService, useValue: authServiceSpy },
        { provide: SupabaseService, useValue: supabaseServiceSpy },
        { provide: PointRulesService, useValue: pointRulesServiceSpy },
        { provide: AllianceActivitySettingsService, useValue: activitySettingsServiceSpy },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(HomePage);
    component = fixture.componentInstance;
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

  it('should not submit when activity type is empty', async () => {
    component['activityForm'].patchValue({ activityType: '', position: 1 });
    await component.onSubmit();
    expect(component.isSubmitting()).toBe(false);
  });

  it('should expose userScores as a computed signal', () => {
    expect(Array.isArray(component.userScores())).toBe(true);
  });
});
