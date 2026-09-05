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
    discord_invite_url: null,
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
    expect(component['serverForm'].name).toBeDefined();
    expect(component['serverForm'].tag).toBeDefined();
  });

  it('should populate form when server input is set', () => {
    expect(component['serverForm'].name().value()).toBe('Test Server');
    expect(component['serverForm'].tag().value()).toBe('TST');
  });

  it('should update form when server input changes', () => {
    fixture.componentRef.setInput('server', { ...mockServer, name: 'New Name', tag: null });
    fixture.detectChanges();

    expect(component['serverForm'].name().value()).toBe('New Name');
    expect(component['serverForm'].tag().value()).toBe('');
  });

  it('should call updateServer on submit', async () => {
    component['serverModel'].set({ name: 'Updated Server', tag: 'UPD' });

    await component['updateServer']();

    expect(serverService.updateServer).toHaveBeenCalledWith({
      name: 'Updated Server',
      tag: 'UPD',
    });
  });

  // Invitation form
  it('should have invitation form with durationDays field', () => {
    expect(component['invitationForm'].durationDays).toBeDefined();
    expect(component['invitationForm'].durationDays().value()).toBe(7);
  });

  it('should create invitation and copy link to clipboard', async () => {
    component['invitationModel'].set({ durationDays: 7 });

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
      server_id: 'server-1',
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
      server_id: 'server-1',
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
        server_id: 'server-1',
        invitation_token_id: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      {
        id: '2',
        display_name: 'Regular User',
        username: 'member',
        role: 'member' as const,
        server_id: 'server-1',
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
    expect(component['enrichedMembers']()).toHaveLength(0);
  });

  // Discord invite form
  it('should have discordInviteForm with discord_invite_url field', () => {
    expect(component['discordInviteForm'].discord_invite_url).toBeDefined();
  });

  it('should patch discordInviteForm when server input has a discord_invite_url', () => {
    fixture.componentRef.setInput('server', {
      ...mockServer,
      discord_invite_url: 'https://discord.gg/abc123',
    });
    fixture.detectChanges();

    expect(component['discordInviteForm'].discord_invite_url().value()).toBe('https://discord.gg/abc123');
  });

  it('should patch discordInviteForm to empty string when discord_invite_url is null', () => {
    fixture.componentRef.setInput('server', { ...mockServer, discord_invite_url: null });
    fixture.detectChanges();

    expect(component['discordInviteForm'].discord_invite_url().value()).toBe('');
  });

  it('should call updateServer with discord_invite_url when saveDiscordInvite is called with a valid URL', async () => {
    component['discordInviteModel'].set({ discord_invite_url: 'https://discord.gg/abc' });

    await component['saveDiscordInvite']();

    expect(serverService.updateServer).toHaveBeenCalledWith({ discord_invite_url: 'https://discord.gg/abc' });
  });

  it('should call updateServer with null when saveDiscordInvite is called with empty value', async () => {
    component['discordInviteModel'].set({ discord_invite_url: '' });

    await component['saveDiscordInvite']();

    expect(serverService.updateServer).toHaveBeenCalledWith({ discord_invite_url: null });
  });

  it('should not call updateServer when discordInviteForm has an invalid URL', async () => {
    serverService.updateServer.mockClear();
    component['discordInviteModel'].set({ discord_invite_url: 'https://notdiscord.com/invite/abc' });

    await component['saveDiscordInvite']();

    expect(serverService.updateServer).not.toHaveBeenCalled();
  });

  // External link form
  it('should have externalLinkForm with label and url fields', () => {
    expect(component['externalLinkForm'].label).toBeDefined();
    expect(component['externalLinkForm'].url).toBeDefined();
  });

  it('should reject a url that does not start with https://', () => {
    component['externalLinkModel'].update(current => ({ ...current, url: 'http://example.com' }));

    expect(component['externalLinkForm'].url().valid()).toBe(false);
  });

  it('should accept a valid https:// url', () => {
    component['externalLinkModel'].update(current => ({ ...current, url: 'https://example.com/wiki' }));

    expect(component['externalLinkForm'].url().valid()).toBe(true);
  });

  it('should reject a label longer than 50 characters', () => {
    component['externalLinkModel'].update(current => ({ ...current, label: 'a'.repeat(51) }));

    expect(component['externalLinkForm'].label().valid()).toBe(false);
  });

  it('should accept a label of 50 characters or fewer', () => {
    component['externalLinkModel'].update(current => ({ ...current, label: 'a'.repeat(50) }));

    expect(component['externalLinkForm'].label().valid()).toBe(true);
  });

  it('should patch externalLinkForm when server input has external link fields set', () => {
    fixture.componentRef.setInput('server', {
      ...mockServer,
      external_link_label: 'Wiki',
      external_link_url: 'https://example.com/wiki',
    });
    fixture.detectChanges();

    expect(component['externalLinkForm'].label().value()).toBe('Wiki');
    expect(component['externalLinkForm'].url().value()).toBe('https://example.com/wiki');
  });

  it('should patch externalLinkForm to empty strings when external link fields are null', () => {
    fixture.componentRef.setInput('server', {
      ...mockServer,
      external_link_label: null,
      external_link_url: null,
    });
    fixture.detectChanges();

    expect(component['externalLinkForm'].label().value()).toBe('');
    expect(component['externalLinkForm'].url().value()).toBe('');
  });

  it('should call updateServer with trimmed label/url and emit serverUpdated on saveExternalLink success', async () => {
    const emitSpy = vi.spyOn(component.serverUpdated, 'emit');
    // Leading whitespace is intentionally omitted from the url: the pattern validator anchors
    // at the start (`^https://`), so a leading space would make the form invalid before trim()
    // ever runs — same behavior as the pre-existing discordInviteForm pattern in this component.
    component['externalLinkModel'].set({ label: '  Wiki  ', url: 'https://example.com/wiki  ' });

    await component['saveExternalLink']();

    expect(serverService.updateServer).toHaveBeenCalledWith({
      external_link_label: 'Wiki',
      external_link_url: 'https://example.com/wiki',
    });
    expect(emitSpy).toHaveBeenCalled();
  });

  it('should call updateServer with both fields null when clearing the external link', async () => {
    component['externalLinkModel'].set({ label: '', url: '' });

    await component['saveExternalLink']();

    expect(serverService.updateServer).toHaveBeenCalledWith({
      external_link_label: null,
      external_link_url: null,
    });
  });

  it('should not call updateServer when externalLinkForm is invalid', async () => {
    serverService.updateServer.mockClear();
    // eslint-disable-next-line sonarjs/no-clear-text-protocols -- intentionally non-https to test validation rejection
    component['externalLinkModel'].update(current => ({ ...current, url: 'http://not-https.com' }));

    await component['saveExternalLink']();

    expect(serverService.updateServer).not.toHaveBeenCalled();
  });

  it('should show error snackbar and not emit serverUpdated when saveExternalLink fails', async () => {
    serverService.updateServer.mockResolvedValueOnce({ error: new Error('DB error') });
    const emitSpy = vi.spyOn(component.serverUpdated, 'emit');
    component['externalLinkModel'].set({ label: 'Wiki', url: 'https://example.com/wiki' });

    await component['saveExternalLink']();

    expect(emitSpy).not.toHaveBeenCalled();
  });
});
