import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivityInputComponent } from './activity-input.component';
import { ActivityService } from '@core/services/activity.service';
import { ServerService } from '@core/services/server.service';
import { AuthService } from '@core/services/auth.service';
import { SnackbarService } from '@core/services/snackbar.service';
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

  const mockServerService = {
    isParticipationMode: vi.fn().mockReturnValue(false),
    getParticipationPoints: vi.fn().mockReturnValue(5),
    calculatePoints: vi.fn().mockReturnValue({ points: 10 }),
    loadSettings: vi.fn().mockResolvedValue(undefined),
    isActivityEnabled: vi.fn().mockReturnValue(true),
    server: signal(null as { discord_invite_url: string | null } | null),
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
        { provide: ServerService, useValue: mockServerService },
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
    mockServerService.isParticipationMode.mockReturnValue(false);
    component['activityForm'].patchValue({ activityType: 'kvk-prep', position: 3 });
    await component['onSubmit']();
    expect(mockActivityService.addActivity).toHaveBeenCalled();
  });

  it('should exclude disabled activities from availableActivities', () => {
    mockServerService.isActivityEnabled.mockReturnValue(false);
    // Change week to force the computed signal to re-evaluate
    component['activityForm'].patchValue({ week: 1 });
    expect(component['availableActivities']().length).toBe(0);
  });

  it('should include enabled activities in availableActivities', () => {
    mockServerService.isActivityEnabled.mockReturnValue(true);
    // Change week to force the computed signal to re-evaluate with updated mock
    component['activityForm'].patchValue({ week: 1 });
    expect(component['availableActivities']().length).toBeGreaterThan(0);
  });

  it('should return null for discordInviteUrl when server is null', () => {
    mockServerService.server.set(null);
    fixture.detectChanges();

    expect(component['discordInviteUrl']()).toBeNull();
  });

  it('should return discord_invite_url from server signal when set', () => {
    mockServerService.server.set({ discord_invite_url: 'https://discord.gg/test' });
    fixture.detectChanges();

    expect(component['discordInviteUrl']()).toBe('https://discord.gg/test');
  });
});
