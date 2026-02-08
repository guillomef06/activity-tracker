import { ComponentFixture, TestBed } from '@angular/core/testing';
import { AllianceSettingsPage } from './alliance-settings.page';
import { AllianceService } from '@app/core/services/alliance.service';
import { AuthService } from '@app/core/services/auth.service';
import { PointRulesService } from '@app/core/services/point-rules.service';
import { provideRouter } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { provideAnimations } from '@angular/platform-browser/animations';
import { TranslateModule } from '@ngx-translate/core';
import { signal } from '@angular/core';

describe('AllianceSettingsPage', () => {
  let component: AllianceSettingsPage;
  let fixture: ComponentFixture<AllianceSettingsPage>;
  let allianceService: jasmine.SpyObj<AllianceService>;
  let pointRulesService: jasmine.SpyObj<PointRulesService>;

  beforeEach(async () => {
    const allianceServiceSpy = jasmine.createSpyObj('AllianceService', [
      'getAllianceById',
      'updateAllianceName',
      'getMembers',
      'getInvitations',
      'createInvitation',
      'revokeInvitation',
      'loadAlliance',
      'loadMembers',
      'loadInvitations',
    ], {
      alliance: signal(null),
      members: signal([]),
      invitations: signal([]),
    });
    
    const authServiceSpy = jasmine.createSpyObj('AuthService', [], {
      userProfile: signal({ alliance_id: 'test-alliance-id' }),
    });
    
    const pointRulesServiceSpy = jasmine.createSpyObj('PointRulesService', ['loadRules'], {
      rules: signal([]),
    });

    await TestBed.configureTestingModule({
      imports: [AllianceSettingsPage, TranslateModule.forRoot()],
      providers: [
        { provide: AllianceService, useValue: allianceServiceSpy },
        { provide: AuthService, useValue: authServiceSpy },
        { provide: PointRulesService, useValue: pointRulesServiceSpy },
        provideRouter([]),
        provideHttpClient(),
        provideAnimations(),
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(AllianceSettingsPage);
    component = fixture.componentInstance;
    allianceService = TestBed.inject(AllianceService) as jasmine.SpyObj<AllianceService>;
    pointRulesService = TestBed.inject(PointRulesService) as jasmine.SpyObj<PointRulesService>;
    
    // Setup spy return values
    allianceService.loadAlliance.and.returnValue(Promise.resolve());
    allianceService.loadMembers.and.returnValue(Promise.resolve());
    allianceService.loadInvitations.and.returnValue(Promise.resolve());
    pointRulesService.loadRules.and.returnValue(Promise.resolve({ error: null }));
    
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should load data on init', async () => {
    await component.ngOnInit();
    
    expect(allianceService.loadAlliance).toHaveBeenCalled();
    expect(allianceService.loadMembers).toHaveBeenCalled();
    expect(allianceService.loadInvitations).toHaveBeenCalled();
    expect(pointRulesService.loadRules).toHaveBeenCalled();
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
    
    expect(pointRulesService.loadRules).toHaveBeenCalled();
  });
});
