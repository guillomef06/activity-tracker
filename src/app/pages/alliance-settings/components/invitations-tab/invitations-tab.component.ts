import { Component, inject, input, output, signal, ChangeDetectionStrategy } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatListModule } from '@angular/material/list';
import { MatChipsModule } from '@angular/material/chips';
import { MatBadgeModule } from '@angular/material/badge';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { Clipboard } from '@angular/cdk/clipboard';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { ConfirmDialogComponent } from '@app/shared/components/confirm-dialog/confirm-dialog.component';
import { AllianceService } from '@app/core/services/alliance.service';
import type { InvitationWithStats } from '@app/shared/models';

@Component({
  selector: 'app-invitations-tab',
  standalone: true,
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
    MatBadgeModule,
    MatTooltipModule,
    MatSnackBarModule,
    MatDialogModule,
    TranslateModule,
  ],
  templateUrl: './invitations-tab.component.html',
  styleUrl: './invitations-tab.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class InvitationsTabComponent {
  private readonly allianceService = inject(AllianceService);
  private readonly fb = inject(FormBuilder);
  private readonly snackBar = inject(MatSnackBar);
  private readonly dialog = inject(MatDialog);
  private readonly clipboard = inject(Clipboard);
  private readonly translate = inject(TranslateService);

  // Inputs
  invitations = input.required<InvitationWithStats[]>();
  isLoading = input.required<boolean>();

  // Outputs
  invitationCreated = output<void>();
  invitationRevoked = output<void>();

  // State
  protected readonly isSubmitting = signal(false);

  protected readonly invitationForm: FormGroup = this.fb.group({
    durationDays: [7, [Validators.required, Validators.min(1), Validators.max(365)]],
  });

  /**
   * Get the base URL for invitation links
   * Handles GitHub Pages deployment with base-href
   */
  private getBaseUrl(): string {
    const base = document.querySelector('base')?.getAttribute('href') || '/';
    // Remove trailing slash if present
    const basePath = base.endsWith('/') ? base.slice(0, -1) : base;
    return `${window.location.origin}${basePath}`;
  }

  protected async createInvitation(): Promise<void> {
    if (this.invitationForm.invalid) {
      return;
    }

    this.isSubmitting.set(true);
    try {
      const { durationDays } = this.invitationForm.value;
      const response = await this.allianceService.createInvitation(durationDays);
      
      if ('error' in response) {
        throw response.error;
      }

      if ('token' in response) {
        // Copy to clipboard
        const inviteUrl = `${this.getBaseUrl()}/join?token=${response.token}`;
        this.clipboard.copy(inviteUrl);
        
        this.snackBar.open('Invitation created and link copied to clipboard!', 'Close', {
          duration: 5000,
        });

        // Reset form
        this.invitationForm.reset({ durationDays: 7 });
        
        // Notify parent to reload
        this.invitationCreated.emit();
      }
    } catch (error) {
      console.error('Error creating invitation:', error);
      this.snackBar.open('Failed to create invitation', 'Close', { duration: 3000 });
    } finally {
      this.isSubmitting.set(false);
    }
  }

  protected async revokeInvitation(id: string): Promise<void> {
    const confirmed = await this.dialog.open(ConfirmDialogComponent, {
      data: {
        message: this.translate.instant('alliance.settings.revokeConfirm'),
        confirmColor: 'warn'
      }
    }).afterClosed().toPromise();

    if (!confirmed) {
      return;
    }

    this.isSubmitting.set(true);
    try {
      const { error } = await this.allianceService.revokeInvitation(id);
      
      if (error) {
        throw error;
      }

      this.snackBar.open('Invitation revoked successfully', 'Close', { duration: 3000 });
      
      // Notify parent to reload
      this.invitationRevoked.emit();
    } catch (error) {
      console.error('Error revoking invitation:', error);
      this.snackBar.open('Failed to revoke invitation', 'Close', { duration: 3000 });
    } finally {
      this.isSubmitting.set(false);
    }
  }

  protected copyInvitationLink(token: string): void {
    const inviteUrl = `${this.getBaseUrl()}/join?token=${token}`;
    this.clipboard.copy(inviteUrl);
    this.snackBar.open('Invitation link copied to clipboard!', 'Close', { duration: 3000 });
  }

  protected formatDate(date: string): string {
    return new Date(date).toLocaleDateString();
  }

  protected isInvitationExpired(expiresAt: string): boolean {
    return new Date(expiresAt) < new Date();
  }

  protected getInvitationStatus(invitation: InvitationWithStats): string {
    if (this.isInvitationExpired(invitation.expires_at)) {
      return 'Expired';
    }
    return 'Active';
  }

  protected getInvitationStatusClass(invitation: InvitationWithStats): string {
    if (this.isInvitationExpired(invitation.expires_at)) {
      return 'status-expired';
    }
    return 'status-active';
  }
}
