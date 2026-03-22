import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivityInputComponent } from './activity-input.component';
import { ActivityService } from '../../../../core/services/activity.service';
import { AllianceService } from '../../../../core/services/alliance.service';
import { AuthService } from '../../../../core/services/auth.service';
import { SnackbarService } from '../../../../core/services/snackbar.service';
import { TranslateModule } from '@ngx-translate/core';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { signal, provideZonelessChangeDetection } from '@angular/core';

describe('ActivityInputComponent', () => {
  let component: ActivityInputComponent;
  let fixture: ComponentFixture<ActivityInputComponent>;

  const mockActivityService = {
    addActivity: vi.fn().mockResolvedValue({ error: null }),
    getUserScores: vi.fn().mockReturnValue([]),
  };

  const mockAllianceService = {
    isParticipationMode: vi.fn().mockReturnValue(false),
    getParticipationPoints: vi.fn().mockReturnValue(5),
    calculatePoints: vi.fn().mockReturnValue({ points: 10 }),
    loadSettings: vi.fn().mockResolvedValue(undefined),
    isActivityEnabled: vi.fn().mockReturnValue(true),
  };

  const mockAuthService = {
    userProfile: signal({ display_name: 'Test User', id: '1' }),
  };

  const mockSnackbarService = {
    success: vi.fn(),
    error: vi.fn(),
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ActivityInputComponent, TranslateModule.forRoot(), NoopAnimationsModule],
      providers: [
        { provide: ActivityService, useValue: mockActivityService },
        { provide: AllianceService, useValue: mockAllianceService },
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
    const form = component['activityForm'];
    expect(form.get('week')?.value).toBe(0);
    expect(form.get('activityType')?.value).toBe('');
    expect(form.get('position')?.value).toBe(1);
    expect(form.get('participated')?.value).toBe(false);
  });

  it('should not submit when form is invalid', async () => {
    await component['onSubmit']();
    expect(mockActivityService.addActivity).not.toHaveBeenCalled();
  });

  it('should call addActivity on valid submission in position mode', async () => {
    mockAllianceService.isParticipationMode.mockReturnValue(false);
    component['activityForm'].patchValue({ activityType: 'kvk-prep', position: 3 });
    await component['onSubmit']();
    expect(mockActivityService.addActivity).toHaveBeenCalled();
  });

  it('should exclude disabled activities from availableActivities', () => {
    mockAllianceService.isActivityEnabled.mockReturnValue(false);
    // Change week to force the computed signal to re-evaluate
    component['activityForm'].patchValue({ week: 1 });
    expect(component['availableActivities']().length).toBe(0);
  });

  it('should include enabled activities in availableActivities', () => {
    mockAllianceService.isActivityEnabled.mockReturnValue(true);
    // Change week to force the computed signal to re-evaluate with updated mock
    component['activityForm'].patchValue({ week: 1 });
    expect(component['availableActivities']().length).toBeGreaterThan(0);
  });
});
