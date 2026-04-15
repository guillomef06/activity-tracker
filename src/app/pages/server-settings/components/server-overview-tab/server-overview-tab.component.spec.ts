import { ComponentFixture, TestBed } from '@angular/core/testing';
import { vi, Mocked } from 'vitest';
import { ServerOverviewTabComponent } from './server-overview-tab.component';
import { ServerService } from '@app/core/services/server.service';
import { Clipboard } from '@angular/cdk/clipboard';
import { TranslateModule } from '@ngx-translate/core';
import { provideAnimations } from '@angular/platform-browser/animations';
import { provideZonelessChangeDetection } from '@angular/core';

describe('ServerOverviewTabComponent', () => {
  let component: ServerOverviewTabComponent;
  let fixture: ComponentFixture<ServerOverviewTabComponent>;
  let serverService: Mocked<ServerService>;
  let clipboard: { copy: ReturnType<typeof vi.fn> };

  const mockServer = {
    id: '1',
    name: 'Test Server',
    tag: 'TST',
    created_at: new Date().toISOString(),
  };

  beforeEach(async () => {
    const serverServiceSpy = {
      updateServer: vi.fn().mockResolvedValue({ error: null }),
      createInvitation: vi.fn().mockResolvedValue({ token: 'test-token-123' }),
      revokeInvitation: vi.fn().mockResolvedValue({ error: null }),
    };
    const clipboardSpy = { copy: vi.fn().mockReturnValue(true) };

    await TestBed.configureTestingModule({
      imports: [ServerOverviewTabComponent, TranslateModule.forRoot()],
      providers: [
        { provide: ServerService, useValue: serverServiceSpy },
        { provide: Clipboard, useValue: clipboardSpy },
        provideAnimations(),
        provideZonelessChangeDetection(),
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(ServerOverviewTabComponent);
    component = fixture.componentInstance;
    serverService = TestBed.inject(ServerService) as unknown as Mocked<ServerService>;
    clipboard = TestBed.inject(Clipboard) as unknown as typeof clipboardSpy;

    // Set required inputs
    fixture.componentRef.setInput('server', mockServer);
    fixture.componentRef.setInput('members', []);
    fixture.componentRef.setInput('invitations', []);
    fixture.componentRef.setInput('isLoading', false);

    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  // Server form
  it('should have server form with name and tag fields', () => {
    expect(component['serverForm']).toBeDefined();
    expect(component['serverForm'].get('name')).toBeDefined();
    expect(component['serverForm'].get('tag')).toBeDefined();
  });

  it('should populate form when server input is set', () => {
    expect(component['serverForm'].get('name')?.value).toBe('Test Server');
    expect(component['serverForm'].get('tag')?.value).toBe('TST');
  });

  it('should update form when server input changes', () => {
    fixture.componentRef.setInput('server', { ...mockServer, name: 'New Name', tag: null });
    fixture.detectChanges();

    expect(component['serverForm'].get('name')?.value).toBe('New Name');
    expect(component['serverForm'].get('tag')?.value).toBe('');
  });

  it('should call updateServer on submit', async () => {
    component['serverForm'].patchValue({ name: 'Updated Server', tag: 'UPD' });

    await component['updateServer']();

    expect(serverService.updateServer).toHaveBeenCalledWith({
      name: 'Updated Server',
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

    expect(serverService.createInvitation).toHaveBeenCalledWith(7);
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
      alliance_id: 'server-1',
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
      alliance_id: 'server-1',
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
        alliance_id: 'server-1',
        invitation_token_id: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      {
        id: '2',
        display_name: 'Regular User',
        username: 'member',
        role: 'member' as const,
        alliance_id: 'server-1',
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
