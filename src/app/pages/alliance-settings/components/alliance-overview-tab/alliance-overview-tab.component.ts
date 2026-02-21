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
import { AllianceService } from '@app/core/services/alliance.service';
import { ConfirmDialogComponent } from '@app/shared/components/confirm-dialog/confirm-dialog.component';
import { createFieldErrorSignal } from '@app/shared/utils/form-validation.utils';
import { InvitationStatusPipe } from '@app/shared/pipes/invitation-status.pipe';
import { LocalDatePipe } from '@app/shared/pipes/local-date.pipe';
import { LoadingButtonComponent } from '@app/shared/components/loading-button/loading-button.component';
import type { Alliance, InvitationWithStats, UserProfile } from '@app/shared/models';
import { firstValueFrom } from 'rxjs';

@Component({
  selector: 'app-alliance-overview-tab',
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
  templateUrl: './alliance-overview-tab.component.html',
  styleUrl: './alliance-overview-tab.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AllianceOverviewTabComponent {
  private readonly allianceService = inject(AllianceService);
  private readonly fb = inject(FormBuilder);
  private readonly snackbarService = inject(SnackbarService);
  private readonly dialog = inject(MatDialog);
  private readonly clipboard = inject(Clipboard);
  private readonly translate = inject(TranslateService);
  private readonly destroyRef = inject(DestroyRef);

  // Inputs
  alliance = input.required<Alliance | null>();
  members = input.required<UserProfile[]>();
  invitations = input.required<InvitationWithStats[]>();
  isLoading = input.required<boolean>();

  // Outputs
  allianceUpdated = output<void>();
  invitationCreated = output<void>();
  invitationRevoked = output<void>();

  // State
  protected readonly isAllianceSubmitting = signal(false);
  protected readonly isInvitationSubmitting = signal(false);

  // Forms
  protected readonly allianceForm: FormGroup = this.fb.group({
    name: ['', [Validators.required, Validators.minLength(3), Validators.maxLength(100)]],
    tag: ['', [Validators.minLength(3), Validators.maxLength(3), Validators.pattern('[A-Za-z0-9]{3}')]],
  });

  protected readonly invitationForm: FormGroup = this.fb.group({
    durationDays: [7, [Validators.required, Validators.min(1), Validators.max(365)]],
  });

  // Error signals for validation
  protected readonly nameError = createFieldErrorSignal(this.allianceForm, 'name', this.destroyRef);
  protected readonly tagError = createFieldErrorSignal(this.allianceForm, 'tag', this.destroyRef);
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
    // Sync form with alliance input signal
    effect(() => {
      const currentAlliance = this.alliance();
      if (currentAlliance) {
        this.allianceForm.patchValue(
          { name: currentAlliance.name, tag: currentAlliance.tag ?? '' },
          { emitEvent: false }
        );
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

  protected async updateAlliance(): Promise<void> {
    if (this.allianceForm.invalid) {
      return;
    }

    this.isAllianceSubmitting.set(true);
    try {
      const { name, tag } = this.allianceForm.value;
      const { error } = await this.allianceService.updateAlliance({
        name,
        tag: tag || null,
      });

      if (error) {
        throw error;
      }

      this.snackbarService.success(this.translate.instant('alliance.settings.nameUpdated'));
      this.allianceUpdated.emit();
    } catch (error) {
      console.error('Error updating alliance:', error);
      this.snackbarService.error(this.translate.instant('alliance.settings.nameUpdateFailed'));
    } finally {
      this.isAllianceSubmitting.set(false);
    }
  }

  protected async createInvitation(): Promise<void> {
    if (this.invitationForm.invalid) {
      return;
    }

    this.isInvitationSubmitting.set(true);
    try {
      const { durationDays } = this.invitationForm.value;
      const response = await this.allianceService.createInvitation(durationDays);

      if ('error' in response) {
        throw response.error;
      }

      if ('token' in response) {
        const inviteUrl = `${this.getBaseUrl()}/join?token=${response.token}`;
        this.clipboard.copy(inviteUrl);
        this.snackbarService.success(this.translate.instant('alliance.settings.invitationCreated'), 5000);
        this.invitationForm.reset({ durationDays: 7 });
        this.invitationCreated.emit();
      }
    } catch (error) {
      console.error('Error creating invitation:', error);
      this.snackbarService.error(this.translate.instant('alliance.settings.invitationCreateFailed'));
    } finally {
      this.isInvitationSubmitting.set(false);
    }
  }

  protected async revokeInvitation(id: string): Promise<void> {
    const confirmed = await firstValueFrom(
      this.dialog
        .open(ConfirmDialogComponent, {
          data: {
            message: this.translate.instant('alliance.settings.revokeConfirm'),
          },
        })
        .afterClosed()
    );

    if (!confirmed) {
      return;
    }

    this.isInvitationSubmitting.set(true);
    try {
      const { error } = await this.allianceService.revokeInvitation(id);

      if (error) {
        throw error;
      }

      this.snackbarService.success(this.translate.instant('alliance.settings.invitationRevoked'));
      this.invitationRevoked.emit();
    } catch (error) {
      console.error('Error revoking invitation:', error);
      this.snackbarService.error(this.translate.instant('alliance.settings.invitationRevokeFailed'));
    } finally {
      this.isInvitationSubmitting.set(false);
    }
  }

  protected copyInvitationLink(token: string): void {
    const inviteUrl = `${this.getBaseUrl()}/join?token=${token}`;
    this.clipboard.copy(inviteUrl);
    this.snackbarService.success(this.translate.instant('alliance.settings.invitationLinkCopied'));
  }
}
