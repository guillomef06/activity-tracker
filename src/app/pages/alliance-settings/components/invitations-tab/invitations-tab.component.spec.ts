import { ComponentFixture, TestBed } from '@angular/core/testing';
import { vi, Mocked } from 'vitest';
import { InvitationsTabComponent } from './invitations-tab.component';
import { AllianceService } from '@app/core/services/alliance.service';
import { Clipboard } from '@angular/cdk/clipboard';
import { TranslateModule } from '@ngx-translate/core';
import { provideAnimations } from '@angular/platform-browser/animations';

describe('InvitationsTabComponent', () => {
  let component: InvitationsTabComponent;
  let fixture: ComponentFixture<InvitationsTabComponent>;
  let allianceService: Mocked<AllianceService>;
  let clipboard: { copy: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    const allianceServiceSpy = {
      createInvitation: vi.fn().mockResolvedValue({ token: 'test-token-123' }),
      revokeInvitation: vi.fn().mockResolvedValue({ error: null }),
    };
    const clipboardSpy = { copy: vi.fn().mockReturnValue(true) };

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
    allianceService = TestBed.inject(AllianceService) as unknown as Mocked<AllianceService>;
    clipboard = TestBed.inject(Clipboard) as unknown as typeof clipboardSpy;

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

  it('should return correct CSS class for invitation status', () => {
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

    expect(component['getInvitationStatusClass'](activeInvitation)).toBe('status-active');
    expect(component['getInvitationStatusClass'](expiredInvitation)).toBe('status-expired');
  });

  it('should check if invitation is expired', () => {
    const futureDate = new Date(Date.now() + 86400000).toISOString();
    const pastDate = new Date(Date.now() - 86400000).toISOString();

    expect(component['isInvitationExpired'](futureDate)).toBe(false);
    expect(component['isInvitationExpired'](pastDate)).toBe(true);
  });
});
