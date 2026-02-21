import { ComponentFixture, TestBed } from '@angular/core/testing';
import { vi, Mocked } from 'vitest';
import { AllianceOverviewTabComponent } from './alliance-overview-tab.component';
import { AllianceService } from '@app/core/services/alliance.service';
import { Clipboard } from '@angular/cdk/clipboard';
import { TranslateModule } from '@ngx-translate/core';
import { provideAnimations } from '@angular/platform-browser/animations';

describe('AllianceOverviewTabComponent', () => {
  let component: AllianceOverviewTabComponent;
  let fixture: ComponentFixture<AllianceOverviewTabComponent>;
  let allianceService: Mocked<AllianceService>;
  let clipboard: { copy: ReturnType<typeof vi.fn> };

  const mockAlliance = {
    id: '1',
    name: 'Test Alliance',
    tag: 'TST',
    created_at: new Date().toISOString(),
  };

  beforeEach(async () => {
    const allianceServiceSpy = {
      updateAlliance: vi.fn().mockResolvedValue({ error: null }),
      createInvitation: vi.fn().mockResolvedValue({ token: 'test-token-123' }),
      revokeInvitation: vi.fn().mockResolvedValue({ error: null }),
    };
    const clipboardSpy = { copy: vi.fn().mockReturnValue(true) };

    await TestBed.configureTestingModule({
      imports: [AllianceOverviewTabComponent, TranslateModule.forRoot()],
      providers: [
        { provide: AllianceService, useValue: allianceServiceSpy },
        { provide: Clipboard, useValue: clipboardSpy },
        provideAnimations(),
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(AllianceOverviewTabComponent);
    component = fixture.componentInstance;
    allianceService = TestBed.inject(AllianceService) as unknown as Mocked<AllianceService>;
    clipboard = TestBed.inject(Clipboard) as unknown as typeof clipboardSpy;

    // Set required inputs
    fixture.componentRef.setInput('alliance', mockAlliance);
    fixture.componentRef.setInput('members', []);
    fixture.componentRef.setInput('invitations', []);
    fixture.componentRef.setInput('isLoading', false);

    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  // Alliance form
  it('should have alliance form with name and tag fields', () => {
    expect(component['allianceForm']).toBeDefined();
    expect(component['allianceForm'].get('name')).toBeDefined();
    expect(component['allianceForm'].get('tag')).toBeDefined();
  });

  it('should populate form when alliance input is set', () => {
    expect(component['allianceForm'].get('name')?.value).toBe('Test Alliance');
    expect(component['allianceForm'].get('tag')?.value).toBe('TST');
  });

  it('should update form when alliance input changes', () => {
    fixture.componentRef.setInput('alliance', { ...mockAlliance, name: 'New Name', tag: null });
    fixture.detectChanges();

    expect(component['allianceForm'].get('name')?.value).toBe('New Name');
    expect(component['allianceForm'].get('tag')?.value).toBe('');
  });

  it('should call updateAlliance on submit', async () => {
    component['allianceForm'].patchValue({ name: 'Updated Alliance', tag: 'UPD' });

    await component['updateAlliance']();

    expect(allianceService.updateAlliance).toHaveBeenCalledWith({
      name: 'Updated Alliance',
      tag: 'UPD',
    });
  });

  // Invitation form
  it('should have invitation form with durationDays field', () => {
    expect(component['invitationForm']).toBeDefined();
    expect(component['invitationForm'].get('durationDays')).toBeDefined();
    expect(component['invitationForm'].get('durationDays')?.value).toBe(7);
  });

  it('should create invitation and copy link to clipboard', async () => {
    component['invitationForm'].patchValue({ durationDays: 7 });

    await component['createInvitation']();

    expect(allianceService.createInvitation).toHaveBeenCalledWith(7);
    expect(clipboard.copy).toHaveBeenCalled();
  });

  it('should copy invitation link to clipboard', () => {
    component['copyInvitationLink']('test-token');

    expect(clipboard.copy).toHaveBeenCalled();
  });

  // Enriched invitations
  it('should compute enrichedInvitations with isExpired and statusClass', () => {
    const activeInvitation = {
      id: '1',
      token: 'active-token',
      expires_at: new Date(Date.now() + 86400000).toISOString(),
      created_at: new Date().toISOString(),
      usage_count: 0,
      members: [],
      alliance_id: 'alliance-1',
      used_at: null,
      used_by: null,
      created_by: 'user-1',
    };
    const expiredInvitation = {
      id: '2',
      token: 'expired-token',
      expires_at: new Date(Date.now() - 86400000).toISOString(),
      created_at: new Date().toISOString(),
      usage_count: 0,
      members: [],
      alliance_id: 'alliance-1',
      used_at: null,
      used_by: null,
      created_by: 'user-1',
    };

    fixture.componentRef.setInput('invitations', [activeInvitation, expiredInvitation]);
    fixture.detectChanges();

    const enriched = component['enrichedInvitations']();
    expect(enriched[0].isExpired).toBe(false);
    expect(enriched[0].statusClass).toBe('status-active');
    expect(enriched[1].isExpired).toBe(true);
    expect(enriched[1].statusClass).toBe('status-expired');
  });

  // Enriched members
  it('should compute enrichedMembers with roleClass', () => {
    const mockMembers = [
      {
        id: '1',
        display_name: 'Admin User',
        username: 'admin',
        role: 'admin' as const,
        alliance_id: 'alliance-1',
        invitation_token_id: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      {
        id: '2',
        display_name: 'Regular User',
        username: 'member',
        role: 'member' as const,
        alliance_id: 'alliance-1',
        invitation_token_id: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    ];

    fixture.componentRef.setInput('members', mockMembers);
    fixture.detectChanges();

    const enriched = component['enrichedMembers']();
    expect(enriched[0].roleClass).toBe('role-admin');
    expect(enriched[1].roleClass).toBe('role-member');
  });

  it('should show empty state when no members', () => {
    expect(component['enrichedMembers']().length).toBe(0);
  });
});
