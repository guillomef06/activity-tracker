import { ComponentFixture, TestBed } from '@angular/core/testing';
import { AllianceSettingsPage } from './alliance-settings.page';
import { AllianceService } from '@app/core/services/alliance.service';
import { AuthService } from '@app/core/services/auth.service';
import { provideRouter } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { provideAnimations } from '@angular/platform-browser/animations';
import { TranslateModule } from '@ngx-translate/core';
import { signal } from '@angular/core';

describe('AllianceSettingsPage', () => {
  let component: AllianceSettingsPage;
  let fixture: ComponentFixture<AllianceSettingsPage>;
  let allianceService: jasmine.SpyObj<AllianceService>;
  let authService: jasmine.SpyObj<AuthService>;

  beforeEach(async () => {
    const allianceServiceSpy = jasmine.createSpyObj('AllianceService', [
      'getAllianceById',
      'updateAllianceName',
      'getMembers',
      'getInvitations',
      'createInvitation',
      'revokeInvitation',
    ]);
    const authServiceSpy = jasmine.createSpyObj('AuthService', [], {
      userProfile: signal({ alliance_id: 'test-alliance-id' }),
    });

    await TestBed.configureTestingModule({
      imports: [AllianceSettingsPage, TranslateModule.forRoot()],
      providers: [
        { provide: AllianceService, useValue: allianceServiceSpy },
        { provide: AuthService, useValue: authServiceSpy },
        provideRouter([]),
        provideHttpClient(),
        provideAnimations(),
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(AllianceSettingsPage);
    component = fixture.componentInstance;
    allianceService = TestBed.inject(AllianceService) as jasmine.SpyObj<AllianceService>;
    authService = TestBed.inject(AuthService) as jasmine.SpyObj<AuthService>;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should have alliance name form', () => {
    const form = component['allianceNameForm'];
    expect(form).toBeDefined();
    expect(form.get('name')).toBeDefined();
  });

  it('should have invitation form', () => {
    const form = component['invitationForm'];
    expect(form).toBeDefined();
    expect(form.get('durationDays')).toBeDefined();
  });
});
