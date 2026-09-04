import { ComponentFixture, TestBed } from '@angular/core/testing';
import { signal, WritableSignal, provideZonelessChangeDetection } from '@angular/core';
import { vi } from 'vitest';
import { MatDialog } from '@angular/material/dialog';
import { TranslateModule } from '@ngx-translate/core';
import { AppHeaderComponent } from './app-header.component';
import { AuthService } from '@app/core/services/auth.service';
import { ServerService } from '@app/core/services/server.service';
import { ProgressBarService } from '@app/core/services/progress-bar.service';
import { PwaService } from '@app/core/services';
import { ReleaseNotesService } from '@app/core/services/release-notes.service';
import type { Server } from '@app/shared/models';

const baseServer = {
  id: 's1',
  name: 'Test Server',
  tag: 'TST',
  discord_invite_url: null,
  created_at: new Date().toISOString(),
};

describe('AppHeaderComponent', () => {
  let component: AppHeaderComponent;
  let fixture: ComponentFixture<AppHeaderComponent>;
  let serverSignal: WritableSignal<Server | null>;

  beforeEach(async () => {
    serverSignal = signal<Server | null>(null);

    const authServiceSpy = {
      isAuthenticated: signal(true),
      isAdmin: signal(false),
      isSuperAdmin: signal(false),
      userProfile: signal(null),
      signOut: vi.fn().mockResolvedValue(undefined),
    };

    const serverServiceSpy = {
      server: serverSignal,
      loadServer: vi.fn().mockResolvedValue(undefined),
    };

    const progressBarServiceSpy = { isLoading: signal(false) };
    const pwaServiceSpy = { isOnline: signal(true) };
    const releaseNotesServiceSpy = { hasUnseenNotes: signal(false) };
    const dialogSpy = { open: vi.fn() };

    await TestBed.configureTestingModule({
      imports: [AppHeaderComponent, TranslateModule.forRoot()],
      providers: [
        { provide: AuthService, useValue: authServiceSpy },
        { provide: ServerService, useValue: serverServiceSpy },
        { provide: ProgressBarService, useValue: progressBarServiceSpy },
        { provide: PwaService, useValue: pwaServiceSpy },
        { provide: ReleaseNotesService, useValue: releaseNotesServiceSpy },
        { provide: MatDialog, useValue: dialogSpy },
        provideZonelessChangeDetection(),
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(AppHeaderComponent);
    component = fixture.componentInstance;
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  describe('externalLink', () => {
    it('should return null when the server has no external link fields set', () => {
      serverSignal.set({ ...baseServer, external_link_label: null, external_link_url: null } as Server);

      expect(component['externalLink']()).toBeNull();
    });

    it('should return null when the server is not loaded', () => {
      serverSignal.set(null);

      expect(component['externalLink']()).toBeNull();
    });

    it('should return null when only external_link_label is set', () => {
      serverSignal.set({
        ...baseServer,
        external_link_label: 'Wiki',
        external_link_url: null,
      } as Server);

      expect(component['externalLink']()).toBeNull();
    });

    it('should return null when only external_link_url is set', () => {
      serverSignal.set({
        ...baseServer,
        external_link_label: null,
        external_link_url: 'https://example.com',
      } as Server);

      expect(component['externalLink']()).toBeNull();
    });

    it('should return the label and url when both external link fields are set', () => {
      serverSignal.set({
        ...baseServer,
        external_link_label: 'Wiki',
        external_link_url: 'https://example.com',
      } as Server);

      expect(component['externalLink']()).toEqual({ label: 'Wiki', url: 'https://example.com' });
    });
  });
});
