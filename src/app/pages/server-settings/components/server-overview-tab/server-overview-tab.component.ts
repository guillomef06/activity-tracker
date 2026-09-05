import { Component, inject, input, output, signal, effect, computed, ChangeDetectionStrategy } from '@angular/core';
import { form, required, minLength, maxLength, pattern, min, max, FormField } from '@angular/forms/signals';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatListModule } from '@angular/material/list';
import { MatChipsModule } from '@angular/material/chips';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatTableModule } from '@angular/material/table';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { Clipboard } from '@angular/cdk/clipboard';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { SnackbarService } from '@app/core/services';
import { ServerService } from '@app/core/services/server.service';
import { ConfirmDialogComponent } from '@app/shared/components/confirm-dialog/confirm-dialog.component';
import { getFieldErrorKey } from '@app/shared/utils/form-validation.utils';
import { InvitationStatusPipe } from '@app/shared/pipes/invitation-status.pipe';
import { LocalDatePipe } from '@app/shared/pipes/local-date.pipe';
import { LoadingButtonComponent } from '@app/shared/components/loading-button/loading-button.component';
import type { Server, InvitationWithStats, UserProfile } from '@app/shared/models';
import { firstValueFrom } from 'rxjs';

const SERVER_NAME_MIN_LENGTH = 3;
const SERVER_NAME_MAX_LENGTH = 100;
const SERVER_TAG_LENGTH = 3;
const SERVER_TAG_PATTERN = /^[A-Za-z0-9]{3}$/;
const DISCORD_INVITE_URL_MAX_LENGTH = 200;
const DISCORD_INVITE_URL_PATTERN = /^https:\/\/(discord\.gg|discord\.com\/invite)\/[A-Za-z0-9_-]+$/;
const EXTERNAL_LINK_LABEL_MAX_LENGTH = 50;
const EXTERNAL_LINK_URL_MAX_LENGTH = 200;
const EXTERNAL_LINK_URL_PATTERN = /^https:\/\/.+/;
const MIN_INVITATION_DURATION_DAYS = 1;
const MAX_INVITATION_DURATION_DAYS = 365;
const DEFAULT_INVITATION_DURATION_DAYS = 7;

interface ServerNameModel {
  name: string;
  tag: string;
}

interface InvitationDurationModel {
  durationDays: number;
}

interface DiscordInviteModel {
  discord_invite_url: string;
}

interface ExternalLinkModel {
  label: string;
  url: string;
}

function roleClassFor(role: UserProfile['role']): string {
  if (role === 'admin') return 'role-admin';
  if (role === 'member') return 'role-member';
  return '';
}

@Component({
  selector: 'app-server-overview-tab',
  imports: [
    FormField,
    MatCardModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatIconModule,
    MatExpansionModule,
    MatListModule,
    MatChipsModule,
    MatTooltipModule,
    MatTableModule,
    MatDialogModule,
    TranslateModule,
    InvitationStatusPipe,
    LocalDatePipe,
    LoadingButtonComponent,
  ],
  templateUrl: './server-overview-tab.component.html',
  styleUrl: './server-overview-tab.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ServerOverviewTabComponent {
  private readonly serverService = inject(ServerService);
  private readonly snackbarService = inject(SnackbarService);
  private readonly dialog = inject(MatDialog);
  private readonly clipboard = inject(Clipboard);
  private readonly translate = inject(TranslateService);

  // Inputs
  server = input.required<Server | null>();
  members = input.required<UserProfile[]>();
  invitations = input.required<InvitationWithStats[]>();
  isLoading = input.required<boolean>();

  // Outputs
  serverUpdated = output<void>();
  invitationCreated = output<void>();
  invitationRevoked = output<void>();

  // State
  protected readonly isServerSubmitting = signal(false);
  protected readonly isInvitationSubmitting = signal(false);
  protected readonly isDiscordInviteSubmitting = signal(false);
  protected readonly isExternalLinkSubmitting = signal(false);

  // Form models
  protected readonly serverModel = signal<ServerNameModel>({ name: '', tag: '' });
  protected readonly invitationModel = signal<InvitationDurationModel>({
    durationDays: DEFAULT_INVITATION_DURATION_DAYS,
  });
  protected readonly discordInviteModel = signal<DiscordInviteModel>({ discord_invite_url: '' });
  protected readonly externalLinkModel = signal<ExternalLinkModel>({ label: '', url: '' });

  // Forms
  protected readonly serverForm = form(this.serverModel, path => {
    required(path.name);
    minLength(path.name, SERVER_NAME_MIN_LENGTH);
    maxLength(path.name, SERVER_NAME_MAX_LENGTH);
    minLength(path.tag, SERVER_TAG_LENGTH);
    maxLength(path.tag, SERVER_TAG_LENGTH);
    pattern(path.tag, SERVER_TAG_PATTERN);
  });

  protected readonly invitationForm = form(this.invitationModel, path => {
    required(path.durationDays);
    min(path.durationDays, MIN_INVITATION_DURATION_DAYS);
    max(path.durationDays, MAX_INVITATION_DURATION_DAYS);
  });

  protected readonly discordInviteForm = form(this.discordInviteModel, path => {
    maxLength(path.discord_invite_url, DISCORD_INVITE_URL_MAX_LENGTH);
    pattern(path.discord_invite_url, DISCORD_INVITE_URL_PATTERN);
  });

  protected readonly externalLinkForm = form(this.externalLinkModel, path => {
    maxLength(path.label, EXTERNAL_LINK_LABEL_MAX_LENGTH);
    maxLength(path.url, EXTERNAL_LINK_URL_MAX_LENGTH);
    pattern(path.url, EXTERNAL_LINK_URL_PATTERN);
  });

  // Error signals for validation — empty string while untouched, matching the pre-migration UX
  protected readonly nameError = computed(() =>
    this.serverForm.name().touched() ? getFieldErrorKey(this.serverForm.name().errors()) : ''
  );
  protected readonly tagError = computed(() =>
    this.serverForm.tag().touched() ? getFieldErrorKey(this.serverForm.tag().errors()) : ''
  );
  protected readonly durationDaysError = computed(() =>
    this.invitationForm.durationDays().touched() ? getFieldErrorKey(this.invitationForm.durationDays().errors()) : ''
  );
  protected readonly discordInviteUrlError = computed(() =>
    this.discordInviteForm.discord_invite_url().touched()
      ? getFieldErrorKey(this.discordInviteForm.discord_invite_url().errors(), {
          pattern: 'server.settings.discordInvite.invalidUrl',
        })
      : ''
  );
  protected readonly externalLinkLabelError = computed(() =>
    this.externalLinkForm.label().touched() ? getFieldErrorKey(this.externalLinkForm.label().errors()) : ''
  );
  protected readonly externalLinkUrlError = computed(() =>
    this.externalLinkForm.url().touched()
      ? getFieldErrorKey(this.externalLinkForm.url().errors(), {
          pattern: 'server.settings.externalLink.invalidUrl',
        })
      : ''
  );

  // Table columns for members table
  protected readonly memberColumns: string[] = ['displayName', 'role', 'createdAt'];

  // Computed enriched invitations — avoids function calls in template
  protected readonly enrichedInvitations = computed(() =>
    this.invitations().map(inv => {
      const isExpired = new Date(inv.expires_at) < new Date();
      return {
        ...inv,
        isExpired,
        statusClass: isExpired ? 'status-expired' : 'status-active',
      };
    })
  );

  // Computed enriched members — avoids function calls in template
  protected readonly enrichedMembers = computed(() =>
    this.members().map(member => ({
      ...member,
      roleClass: roleClassFor(member.role),
    }))
  );

  constructor() {
    // Sync form models with server input signal
    effect(() => {
      const currentServer = this.server();
      if (currentServer) {
        this.serverModel.set({ name: currentServer.name, tag: currentServer.tag ?? '' });
        this.discordInviteModel.set({ discord_invite_url: currentServer.discord_invite_url ?? '' });
        this.externalLinkModel.set({
          label: currentServer.external_link_label ?? '',
          url: currentServer.external_link_url ?? '',
        });
      }
    });
  }

  /**
   * Get the base URL for invitation links.
   * Handles GitHub Pages deployment with base-href.
   */
  private getBaseUrl(): string {
    const base = document.querySelector('base')?.getAttribute('href') || '/';
    const basePath = base.endsWith('/') ? base.slice(0, -1) : base;
    return `${window.location.origin}${basePath}`;
  }

  protected async updateServer(): Promise<void> {
    if (this.serverForm().invalid()) {
      this.serverForm().markAsTouched();
      return;
    }

    this.isServerSubmitting.set(true);
    try {
      const { name, tag } = this.serverModel();
      const { error } = await this.serverService.updateServer({
        name,
        tag: tag || null,
      });

      if (error) {
        throw error;
      }

      this.snackbarService.success(this.translate.instant('server.settings.nameUpdated'));
      this.serverUpdated.emit();
    } catch (error) {
      console.error('Error updating server:', error);
      this.snackbarService.error(this.translate.instant('server.settings.nameUpdateFailed'));
    } finally {
      this.isServerSubmitting.set(false);
    }
  }

  protected async createInvitation(): Promise<void> {
    if (this.invitationForm().invalid()) {
      this.invitationForm().markAsTouched();
      return;
    }

    this.isInvitationSubmitting.set(true);
    try {
      const { durationDays } = this.invitationModel();
      const response = await this.serverService.createInvitation(durationDays);

      if ('error' in response) {
        throw response.error;
      }

      if ('token' in response) {
        const inviteUrl = `${this.getBaseUrl()}/join?token=${response.token}`;
        this.clipboard.copy(inviteUrl);
        this.snackbarService.success(this.translate.instant('server.settings.invitationCreated'), 5000);
        this.invitationModel.set({ durationDays: DEFAULT_INVITATION_DURATION_DAYS });
        this.invitationCreated.emit();
      }
    } catch (error) {
      console.error('Error creating invitation:', error);
      this.snackbarService.error(this.translate.instant('server.settings.invitationCreateFailed'));
    } finally {
      this.isInvitationSubmitting.set(false);
    }
  }

  protected async revokeInvitation(id: string): Promise<void> {
    const confirmed = await firstValueFrom(
      this.dialog
        .open(ConfirmDialogComponent, {
          data: {
            message: this.translate.instant('server.settings.revokeConfirm'),
          },
        })
        .afterClosed()
    );

    if (!confirmed) {
      return;
    }

    this.isInvitationSubmitting.set(true);
    try {
      const { error } = await this.serverService.revokeInvitation(id);

      if (error) {
        throw error;
      }

      this.snackbarService.success(this.translate.instant('server.settings.invitationRevoked'));
      this.invitationRevoked.emit();
    } catch (error) {
      console.error('Error revoking invitation:', error);
      this.snackbarService.error(this.translate.instant('server.settings.invitationRevokeFailed'));
    } finally {
      this.isInvitationSubmitting.set(false);
    }
  }

  protected copyInvitationLink(token: string): void {
    const inviteUrl = `${this.getBaseUrl()}/join?token=${token}`;
    this.clipboard.copy(inviteUrl);
    this.snackbarService.success(this.translate.instant('server.settings.invitationLinkCopied'));
  }

  protected async saveDiscordInvite(): Promise<void> {
    if (this.discordInviteForm().invalid()) {
      this.discordInviteForm().markAsTouched();
      return;
    }

    this.isDiscordInviteSubmitting.set(true);
    try {
      const raw = this.discordInviteModel().discord_invite_url;
      const { error } = await this.serverService.updateServer({
        discord_invite_url: raw || null,
      });

      if (error) {
        throw error;
      }

      this.snackbarService.success(this.translate.instant('server.settings.discordInvite.saved'));
      this.serverUpdated.emit();
    } catch (error) {
      console.error('Error saving Discord invite URL:', error);
      this.snackbarService.error(this.translate.instant('server.settings.discordInvite.saveFailed'));
    } finally {
      this.isDiscordInviteSubmitting.set(false);
    }
  }

  protected async saveExternalLink(): Promise<void> {
    if (this.externalLinkForm().invalid()) {
      this.externalLinkForm().markAsTouched();
      return;
    }

    this.isExternalLinkSubmitting.set(true);
    try {
      const label = this.externalLinkModel().label?.trim() ?? '';
      const url = this.externalLinkModel().url?.trim() ?? '';
      const { error } = await this.serverService.updateServer({
        external_link_label: label || null,
        external_link_url: url || null,
      });

      if (error) {
        throw error;
      }

      this.snackbarService.success(this.translate.instant('server.settings.externalLink.saved'));
      this.serverUpdated.emit();
    } catch (error) {
      console.error('Error saving external link:', error);
      this.snackbarService.error(this.translate.instant('server.settings.externalLink.saveFailed'));
    } finally {
      this.isExternalLinkSubmitting.set(false);
    }
  }
}
