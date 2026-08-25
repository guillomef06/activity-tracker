import { ComponentFixture, TestBed } from '@angular/core/testing';
import { vi, Mocked } from 'vitest';
import { ServerSettingsPage } from './server-settings.page';
import { ServerService } from '@app/core/services/server.service';
import { SeasonService } from '@app/core/services/season.service';
import { AuthService } from '@app/core/services/auth.service';
import { provideRouter } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { provideAnimations } from '@angular/platform-browser/animations';
import { TranslateModule } from '@ngx-translate/core';
import { signal, provideZonelessChangeDetection } from '@angular/core';

describe('ServerSettingsPage', () => {
  let component: ServerSettingsPage;
  let fixture: ComponentFixture<ServerSettingsPage>;
  let serverService: Mocked<ServerService>;

  beforeEach(async () => {
    const serverServiceSpy = {
      loadAllSettings: vi.fn().mockResolvedValue(undefined),
      loadServer: vi.fn().mockResolvedValue(undefined),
      loadInvitations: vi.fn().mockResolvedValue(undefined),
      loadRules: vi.fn().mockResolvedValue({ error: null }),
      createInvitation: vi.fn(),
      revokeInvitation: vi.fn(),
      updateServer: vi.fn(),
      setTiebreakerActivity: vi.fn().mockResolvedValue({ error: null }),
      setScoringWeeksMultiplier: vi.fn().mockResolvedValue({ error: null }),
      isActivityEnabled: vi.fn().mockReturnValue(true),
      isParticipationMode: vi.fn().mockReturnValue(false),
      getParticipationPoints: vi.fn().mockReturnValue(5),
      upsertSetting: vi.fn().mockResolvedValue({ error: null }),
      calculatePoints: vi.fn().mockReturnValue({ points: 0, usedFallback: true }),
      validateNoOverlap: vi.fn().mockReturnValue({ valid: true }),
      createRule: vi.fn().mockResolvedValue({ error: null }),
      deleteRule: vi.fn().mockResolvedValue({ error: null }),
      server: signal(null),
      members: signal([]),
      invitations: signal([]),
      rules: signal([]),
      settings: signal([]),
      scoringWeeks: signal(6),
    };

    const authServiceSpy = {
      userProfile: signal({ server_id: 'test-server-id' }),
    };

    const seasonServiceSpy = {
      seasons: signal([]),
      loadSeasons: vi.fn().mockResolvedValue(undefined),
      getSeasonForDate: vi.fn().mockReturnValue(null),
      getAvailableActivityTypesForDate: vi.fn().mockReturnValue([]),
      getEarliestAllowedDate: vi.fn().mockReturnValue(null),
      suggestNextSeasonStartDate: vi.fn().mockReturnValue(new Date()),
    };

    await TestBed.configureTestingModule({
      imports: [ServerSettingsPage, TranslateModule.forRoot()],
      providers: [
        { provide: ServerService, useValue: serverServiceSpy },
        { provide: AuthService, useValue: authServiceSpy },
        { provide: SeasonService, useValue: seasonServiceSpy },
        provideRouter([]),
        provideHttpClient(),
        provideAnimations(),
        provideZonelessChangeDetection(),
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(ServerSettingsPage);
    component = fixture.componentInstance;
    serverService = TestBed.inject(ServerService) as unknown as Mocked<ServerService>;

    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should load data on init', async () => {
    await component.ngOnInit();

    expect(serverService.loadAllSettings).toHaveBeenCalled();
    expect(serverService.loadInvitations).toHaveBeenCalled();
  });

  it('should expose server signal from service', () => {
    const server = component['server']();
    expect(server).toBeNull(); // Initially null from spy
  });

  it('should handle server updated event', async () => {
    await component['handleServerUpdated']();

    expect(serverService.loadServer).toHaveBeenCalled();
  });

  it('should handle invitation created event', async () => {
    await component['handleInvitationCreated']();

    expect(serverService.loadInvitations).toHaveBeenCalled();
  });

  it('should handle rule created event', async () => {
    await component['handleRuleCreated']();

    expect(serverService.loadRules).toHaveBeenCalled();
  });
});
