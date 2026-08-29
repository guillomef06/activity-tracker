import { ComponentFixture, TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { HomePage } from './home.page';
import { TranslateModule } from '@ngx-translate/core';
import { provideAnimations } from '@angular/platform-browser/animations';
import { provideRouter } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { ActivityService } from '@core/services/activity.service';
import { ServerService } from '@core/services/server.service';
import { SeasonService } from '@core/services/season.service';
import { AuthService } from '@core/services/auth.service';
import { MgEventService } from '@core/services/mg-event.service';
import { SupabaseService } from '@core/services/supabase.service';
import { signal, provideZonelessChangeDetection } from '@angular/core';

describe('HomePage', () => {
  let component: HomePage;
  let fixture: ComponentFixture<HomePage>;

  const authServiceSpy = {
    getUserId: vi.fn().mockReturnValue('test-user'),
    isAuthenticated: vi.fn().mockReturnValue(true),
    userProfile: signal({ id: 'test-user', display_name: 'Test User', username: 'testuser' }),
    getServerId: vi.fn().mockReturnValue('server-1'),
  };

  const supabaseServiceSpy = { from: vi.fn() };

  const serverServiceSpy = {
    calculatePoints: vi.fn().mockReturnValue({ points: 15, source: 'default', usedFallback: false }),
    loadServer: vi.fn().mockResolvedValue(undefined),
    loadRules: vi.fn().mockResolvedValue({ error: null }),
    loadSettings: vi.fn().mockResolvedValue({ error: null }),
    isParticipationMode: vi.fn().mockReturnValue(false),
    getParticipationPoints: vi.fn().mockReturnValue(5),
    isActivityEnabled: vi.fn().mockReturnValue(true),
    server: signal(null),
    rules: signal([]),
    settings: signal([]),
    scoringWeeks: signal(6),
  };

  const seasonServiceSpy = {
    seasons: signal([]),
    loadSeasons: vi.fn().mockResolvedValue(undefined),
    getSeasonForDate: vi.fn().mockReturnValue(null),
    getAvailableActivityTypesForDate: vi.fn().mockReturnValue([]),
    getEarliestAllowedDate: vi.fn().mockReturnValue(null),
    suggestNextSeasonStartDate: vi.fn().mockReturnValue(new Date()),
  };

  const mgEventServiceSpy = {
    loadCurrentEvent: vi.fn().mockResolvedValue(null),
    loadServerConfig: vi.fn().mockResolvedValue(null),
    loadSlotConfig: vi.fn().mockResolvedValue([]),
    loadUserRegistration: vi.fn().mockResolvedValue(null),
    loadSelection: vi.fn().mockResolvedValue([]),
    loadCostDeductions: vi.fn().mockResolvedValue(new Map()),
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    mgEventServiceSpy.loadServerConfig.mockResolvedValue(null);
    mgEventServiceSpy.loadCostDeductions.mockResolvedValue(new Map());

    await TestBed.configureTestingModule({
      imports: [HomePage, TranslateModule.forRoot()],
      providers: [
        provideAnimations(),
        provideRouter([]),
        provideHttpClient(),
        ActivityService,
        { provide: AuthService, useValue: authServiceSpy },
        { provide: SupabaseService, useValue: supabaseServiceSpy },
        { provide: ServerService, useValue: serverServiceSpy },
        { provide: SeasonService, useValue: seasonServiceSpy },
        { provide: MgEventService, useValue: mgEventServiceSpy },
        provideZonelessChangeDetection(),
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(HomePage);
    component = fixture.componentInstance;
    fixture.detectChanges();
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should expose userScores as a computed signal', () => {
    expect(Array.isArray(component.userScores())).toBe(true);
  });

  it('should not load MG cost deductions when DKP is disabled for the server', () => {
    expect(mgEventServiceSpy.loadServerConfig).toHaveBeenCalledWith('server-1');
    expect(mgEventServiceSpy.loadCostDeductions).not.toHaveBeenCalled();
  });

  it('should load MG cost deductions when DKP is enabled for the server', async () => {
    mgEventServiceSpy.loadServerConfig.mockResolvedValueOnce({
      server_id: 'server-1',
      capacity: 10,
      assignment_mode: 'automatic',
      dkp_enabled: true,
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    });

    fixture = TestBed.createComponent(HomePage);
    component = fixture.componentInstance;
    await component.ngOnInit();
    fixture.detectChanges();

    expect(mgEventServiceSpy.loadCostDeductions).toHaveBeenCalledWith('server-1', expect.any(Date));
  });

  it('should render the 4 tabs', () => {
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('mat-tab-group')).toBeTruthy();
    // mat-tab-group only renders the active tab content (first tab by default)
    expect(compiled.querySelector('app-activity-input')).toBeTruthy();
    // Check that 4 tab labels are rendered
    expect(compiled.querySelectorAll('.mdc-tab').length).toBe(4);
  });
});
