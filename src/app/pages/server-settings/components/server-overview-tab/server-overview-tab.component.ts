import {
  Component,
  inject,
  input,
  output,
  signal,
  effect,
  computed,
  ChangeDetectionStrategy,
  DestroyRef,
} from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
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
import { createFieldErrorSignal } from '@app/shared/utils/form-validation.utils';
import { InvitationStatusPipe } from '@app/shared/pipes/invitation-status.pipe';
import { LocalDatePipe } from '@app/shared/pipes/local-date.pipe';
import { LoadingButtonComponent } from '@app/shared/components/loading-button/loading-button.component';
import type { Server, InvitationWithStats, UserProfile } from '@app/shared/models';
import { firstValueFrom } from 'rxjs';

@Component({
  selector: 'app-server-overview-tab',
  imports: [
    ReactiveFormsModule,
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
  private readonly fb = inject(FormBuilder);
  private readonly snackbarService = inject(SnackbarService);
  private readonly dialog = inject(MatDialog);
  private readonly clipboard = inject(Clipboard);
  private readonly translate = inject(TranslateService);
  private readonly destroyRef = inject(DestroyRef);

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

  // Forms
  protected readonly serverForm: FormGroup = this.fb.group({
    name: ['', [Validators.required, Validators.minLength(3), Validators.maxLength(100)]],
    tag: ['', [Validators.minLength(3), Validators.maxLength(3), Validators.pattern('[A-Za-z0-9]{3}')]],
  });

  protected readonly invitationForm: FormGroup = this.fb.group({
    durationDays: [7, [Validators.required, Validators.min(1), Validators.max(365)]],
  });

  // Error signals for validation
  protected readonly nameError = createFieldErrorSignal(this.serverForm, 'name', this.destroyRef);
  protected readonly tagError = createFieldErrorSignal(this.serverForm, 'tag', this.destroyRef);
  protected readonly durationDaysError = createFieldErrorSignal(this.invitationForm, 'durationDays', this.destroyRef);

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
      roleClass: member.role === 'admin' ? 'role-admin' : member.role === 'member' ? 'role-member' : '',
    }))
  );

  constructor() {
    // Sync form with server input signal
    effect(() => {
      const currentServer = this.server();
      if (currentServer) {
        this.serverForm.patchValue({ name: currentServer.name, tag: currentServer.tag ?? '' }, { emitEvent: false });
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
    if (this.serverForm.invalid) {
      return;
    }

    this.isServerSubmitting.set(true);
    try {
      const { name, tag } = this.serverForm.value;
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
    if (this.invitationForm.invalid) {
      return;
    }

    this.isInvitationSubmitting.set(true);
    try {
      const { durationDays } = this.invitationForm.value;
      const response = await this.serverService.createInvitation(durationDays);

      if ('error' in response) {
        throw response.error;
      }

      if ('token' in response) {
        const inviteUrl = `${this.getBaseUrl()}/join?token=${response.token}`;
        this.clipboard.copy(inviteUrl);
        this.snackbarService.success(this.translate.instant('server.settings.invitationCreated'), 5000);
        this.invitationForm.reset({ durationDays: 7 });
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
}
