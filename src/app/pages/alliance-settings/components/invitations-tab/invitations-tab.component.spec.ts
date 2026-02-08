import { ComponentFixture, TestBed } from '@angular/core/testing';
import { InvitationsTabComponent } from './invitations-tab.component';
import { AllianceService } from '@app/core/services/alliance.service';
import { Clipboard } from '@angular/cdk/clipboard';
import { TranslateModule } from '@ngx-translate/core';
import { provideAnimations } from '@angular/platform-browser/animations';

describe('InvitationsTabComponent', () => {
  let component: InvitationsTabComponent;
  let fixture: ComponentFixture<InvitationsTabComponent>;
  let allianceService: jasmine.SpyObj<AllianceService>;
  let clipboard: jasmine.SpyObj<Clipboard>;

  beforeEach(async () => {
    const allianceServiceSpy = jasmine.createSpyObj('AllianceService', ['createInvitation', 'revokeInvitation']);
    const clipboardSpy = jasmine.createSpyObj('Clipboard', ['copy']);

    allianceServiceSpy.createInvitation.and.returnValue(Promise.resolve({ token: 'test-token-123' }));
    allianceServiceSpy.revokeInvitation.and.returnValue(Promise.resolve({ error: null }));
    clipboardSpy.copy.and.returnValue(true);

    await TestBed.configureTestingModule({
      imports: [InvitationsTabComponent, TranslateModule.forRoot()],
      providers: [
        { provide: AllianceService, useValue: allianceServiceSpy },
        { provide: Clipboard, useValue: clipboardSpy },
        provideAnimations(),
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(InvitationsTabComponent);
    component = fixture.componentInstance;
    allianceService = TestBed.inject(AllianceService) as jasmine.SpyObj<AllianceService>;
    clipboard = TestBed.inject(Clipboard) as jasmine.SpyObj<Clipboard>;
    
    // Set required inputs
    fixture.componentRef.setInput('invitations', []);
    fixture.componentRef.setInput('isLoading', false);
    
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should have invitation form', () => {
    expect(component['invitationForm']).toBeDefined();
    expect(component['invitationForm'].get('durationDays')).toBeDefined();
  });

  it('should create invitation and copy link', async () => {
    component['invitationForm'].patchValue({ durationDays: 7 });
    
    await component['createInvitation']();
    
    expect(allianceService.createInvitation).toHaveBeenCalledWith(7);
    expect(clipboard.copy).toHaveBeenCalled();
  });

  it('should copy invitation link to clipboard', () => {
    component['copyInvitationLink']('test-token');
    
    expect(clipboard.copy).toHaveBeenCalled();
  });

  it('should determine invitation status correctly', () => {
    const activeInvitation = { 
      id: '1', 
      token: 'active', 
      expires_at: new Date(Date.now() + 86400000).toISOString(),
      created_at: new Date().toISOString(),
      usage_count: 0,
      members: [],
      alliance_id: 'alliance-1',
      used_at: null,
      used_by: null,
      created_by: 'user-1'
    };
    
    const expiredInvitation = { 
      id: '2', 
      token: 'expired', 
      expires_at: new Date(Date.now() - 86400000).toISOString(),
      created_at: new Date().toISOString(),
      usage_count: 0,
      members: [],
      alliance_id: 'alliance-1',
      used_at: null,
      used_by: null,
      created_by: 'user-1'
    };
    
    expect(component['getInvitationStatus'](activeInvitation)).toBe('Active');
    expect(component['getInvitationStatus'](expiredInvitation)).toBe('Expired');
  });

  it('should check if invitation is expired', () => {
    const futureDate = new Date(Date.now() + 86400000).toISOString();
    const pastDate = new Date(Date.now() - 86400000).toISOString();
    
    expect(component['isInvitationExpired'](futureDate)).toBe(false);
    expect(component['isInvitationExpired'](pastDate)).toBe(true);
  });
});
