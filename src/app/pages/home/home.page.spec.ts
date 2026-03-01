import { ComponentFixture, TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { HomePage } from './home.page';
import { TranslateModule } from '@ngx-translate/core';
import { provideAnimations } from '@angular/platform-browser/animations';
import { provideRouter } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { ActivityService } from '../../core/services/activity.service';
import { AllianceService } from '../../core/services/alliance.service';
import { AuthService } from '../../core/services/auth.service';
import { SupabaseService } from '../../core/services/supabase.service';
import { PwaService } from '../../core/services/pwa.service';
import { signal } from '@angular/core';

describe('HomePage', () => {
  let component: HomePage;
  let fixture: ComponentFixture<HomePage>;

  const authServiceSpy = {
    getUserId: vi.fn().mockReturnValue('test-user'),
    isAuthenticated: vi.fn().mockReturnValue(true),
    userProfile: signal({ id: 'test-user', display_name: 'Test User', username: 'testuser' }),
    getAllianceId: vi.fn().mockReturnValue('alliance-1'),
  };

  const supabaseServiceSpy = { from: vi.fn() };

  const allianceServiceSpy = {
    calculatePoints: vi.fn().mockReturnValue({ points: 15, source: 'default', usedFallback: false }),
    loadRules: vi.fn().mockResolvedValue({ error: null }),
    loadSettings: vi.fn().mockResolvedValue({ error: null }),
    isParticipationMode: vi.fn().mockReturnValue(false),
    getParticipationPoints: vi.fn().mockReturnValue(5),
    rules: signal([]),
    settings: signal([]),
  };

  const pwaServiceSpy = {
    isOnline: signal(true),
    canInstall: signal(false),
    promptInstall: vi.fn(),
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [HomePage, TranslateModule.forRoot()],
      providers: [
        provideAnimations(),
        provideRouter([]),
        provideHttpClient(),
        ActivityService,
        { provide: AuthService, useValue: authServiceSpy },
        { provide: SupabaseService, useValue: supabaseServiceSpy },
        { provide: AllianceService, useValue: allianceServiceSpy },
        { provide: PwaService, useValue: pwaServiceSpy },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(HomePage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should expose userScores as a computed signal', () => {
    expect(Array.isArray(component.userScores())).toBe(true);
  });

  it('should show child components when online', () => {
    pwaServiceSpy.isOnline.set(true);
    fixture.detectChanges();
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('app-activity-input')).toBeTruthy();
    expect(compiled.querySelector('app-activities-details')).toBeTruthy();
    expect(compiled.querySelector('.offline-card')).toBeFalsy();
  });

  it('should show nerd mode button when offline', () => {
    pwaServiceSpy.isOnline.set(false);
    fixture.detectChanges();
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('.nerd-mode-container')).toBeTruthy();
    expect(compiled.querySelector('app-activity-input')).toBeFalsy();
    expect(compiled.querySelector('app-gem-calculator')).toBeFalsy();
  });

  it('should show gem calculator after clicking nerd mode button', () => {
    pwaServiceSpy.isOnline.set(false);
    component['nerdModeActive'].set(true);
    fixture.detectChanges();
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('app-gem-calculator')).toBeTruthy();
    expect(compiled.querySelector('.nerd-mode-container')).toBeFalsy();
  });
});
