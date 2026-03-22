import { ComponentFixture, TestBed } from '@angular/core/testing';
import { vi, Mocked } from 'vitest';
import { AllianceSettingsPage } from './alliance-settings.page';
import { AllianceService } from '@app/core/services/alliance.service';
import { AuthService } from '@app/core/services/auth.service';
import { provideRouter } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { provideAnimations } from '@angular/platform-browser/animations';
import { TranslateModule } from '@ngx-translate/core';
import { signal, provideZonelessChangeDetection } from '@angular/core';

describe('AllianceSettingsPage', () => {
  let component: AllianceSettingsPage;
  let fixture: ComponentFixture<AllianceSettingsPage>;
  let allianceService: Mocked<AllianceService>;

  beforeEach(async () => {
    const allianceServiceSpy = {
      loadAllSettings: vi.fn().mockResolvedValue(undefined),
      loadAlliance: vi.fn().mockResolvedValue(undefined),
      loadInvitations: vi.fn().mockResolvedValue(undefined),
      loadRules: vi.fn().mockResolvedValue({ error: null }),
      createInvitation: vi.fn(),
      revokeInvitation: vi.fn(),
      updateAlliance: vi.fn(),
      setTiebreakerActivity: vi.fn().mockResolvedValue({ error: null }),
      isActivityEnabled: vi.fn().mockReturnValue(true),
      isParticipationMode: vi.fn().mockReturnValue(false),
      getParticipationPoints: vi.fn().mockReturnValue(5),
      upsertSetting: vi.fn().mockResolvedValue({ error: null }),
      calculatePoints: vi.fn().mockReturnValue({ points: 0, usedFallback: true }),
      validateNoOverlap: vi.fn().mockReturnValue({ valid: true }),
      createRule: vi.fn().mockResolvedValue({ error: null }),
      deleteRule: vi.fn().mockResolvedValue({ error: null }),
      alliance: signal(null),
      members: signal([]),
      invitations: signal([]),
      rules: signal([]),
      settings: signal([]),
    };

    const authServiceSpy = {
      userProfile: signal({ alliance_id: 'test-alliance-id' }),
    };

    await TestBed.configureTestingModule({
      imports: [AllianceSettingsPage, TranslateModule.forRoot()],
      providers: [
        { provide: AllianceService, useValue: allianceServiceSpy },
        { provide: AuthService, useValue: authServiceSpy },
        provideRouter([]),
        provideHttpClient(),
        provideAnimations(),
        provideZonelessChangeDetection(),
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(AllianceSettingsPage);
    component = fixture.componentInstance;
    allianceService = TestBed.inject(AllianceService) as unknown as Mocked<AllianceService>;

    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should load data on init', async () => {
    await component.ngOnInit();

    expect(allianceService.loadAllSettings).toHaveBeenCalled();
    expect(allianceService.loadInvitations).toHaveBeenCalled();
  });

  it('should expose alliance signal from service', () => {
    const alliance = component['alliance']();
    expect(alliance).toBeNull(); // Initially null from spy
  });

  it('should handle alliance updated event', async () => {
    await component['handleAllianceUpdated']();

    expect(allianceService.loadAlliance).toHaveBeenCalled();
  });

  it('should handle invitation created event', async () => {
    await component['handleInvitationCreated']();

    expect(allianceService.loadInvitations).toHaveBeenCalled();
  });

  it('should handle rule created event', async () => {
    await component['handleRuleCreated']();

    expect(allianceService.loadRules).toHaveBeenCalled();
  });
});
