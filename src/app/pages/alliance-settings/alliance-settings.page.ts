import { Component, inject, signal, OnInit, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTableModule } from '@angular/material/table';
import { MatChipsModule } from '@angular/material/chips';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTabsModule } from '@angular/material/tabs';
import { MatTooltipModule } from '@angular/material/tooltip';
import { Clipboard } from '@angular/cdk/clipboard';
import { TranslateModule } from '@ngx-translate/core';
import { AllianceService } from '@app/core/services/alliance.service';
import { AuthService } from '@app/core/services/auth.service';
import type { InvitationToken, UserProfile } from '@app/shared/models';

@Component({
  selector: 'app-alliance-settings',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatCardModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatIconModule,
    MatTableModule,
    MatChipsModule,
    MatProgressSpinnerModule,
    MatSnackBarModule,
    MatTabsModule,
    MatTooltipModule,
    TranslateModule,
  ],
  templateUrl: './alliance-settings.page.html',
  styleUrl: './alliance-settings.page.scss',
})
export class AllianceSettingsPage implements OnInit {
  private readonly allianceService = inject(AllianceService);
  private readonly authService = inject(AuthService);
  private readonly fb = inject(FormBuilder);
  private readonly snackBar = inject(MatSnackBar);
  private readonly clipboard = inject(Clipboard);

  protected readonly isLoading = signal(false);
  protected readonly members = signal<UserProfile[]>([]);
  protected readonly invitations = signal<InvitationToken[]>([]);
  protected readonly alliance = computed(() => this.allianceService.alliance());

  protected readonly invitationForm: FormGroup = this.fb.group({
    durationDays: [7, [Validators.required, Validators.min(1), Validators.max(365)]],
  });

  protected readonly allianceNameForm: FormGroup = this.fb.group({
    name: ['', [Validators.required, Validators.minLength(3), Validators.maxLength(100)]],
  });

  protected readonly memberColumns: string[] = ['displayName', 'username', 'role', 'createdAt'];
  protected readonly invitationColumns: string[] = ['token', 'expiresAt', 'usedAt', 'actions'];

  async ngOnInit(): Promise<void> {
    await this.loadData();
    
    // Initialize alliance name form with current name
    const allianceName = this.alliance()?.name;
    if (allianceName) {
      this.allianceNameForm.patchValue({ name: allianceName });
    }
  }

  private async loadData(): Promise<void> {
    this.isLoading.set(true);
    try {
      await Promise.all([
        this.allianceService.loadAlliance(),
        this.allianceService.loadMembers(),
        this.allianceService.loadInvitations(),
      ]);
      
      this.members.set(this.allianceService.members());
      this.invitations.set(this.allianceService.invitations());
    } catch (error) {
      console.error('Error loading alliance data:', error);
      this.snackBar.open('Failed to load alliance data', 'Close', { duration: 3000 });
    } finally {
      this.isLoading.set(false);
    }
  }

  protected async createInvitation(): Promise<void> {
    if (this.invitationForm.invalid) {
      return;
    }

    this.isLoading.set(true);
    try {
      const { durationDays } = this.invitationForm.value;
      const response = await this.allianceService.createInvitation(durationDays);
      
      if ('error' in response) {
        throw response.error;
      }

      if ('token' in response) {
        // Copy to clipboard
        const inviteUrl = `${window.location.origin}/join?token=${response.token}`;
        this.clipboard.copy(inviteUrl);
        
        this.snackBar.open('Invitation created and link copied to clipboard!', 'Close', {
          duration: 5000,
        });

        // Refresh invitations
        await this.allianceService.loadInvitations();
        this.invitations.set(this.allianceService.invitations());
      }
    } catch (error) {
      console.error('Error creating invitation:', error);
      this.snackBar.open('Failed to create invitation', 'Close', { duration: 3000 });
    } finally {
      this.isLoading.set(false);
    }
  }

  protected async revokeInvitation(id: string): Promise<void> {
    if (!confirm('Are you sure you want to revoke this invitation?')) {
      return;
    }

    this.isLoading.set(true);
    try {
      const { error } = await this.allianceService.revokeInvitation(id);
      
      if (error) {
        throw error;
      }

      this.snackBar.open('Invitation revoked successfully', 'Close', { duration: 3000 });

      // Refresh invitations
      await this.allianceService.loadInvitations();
      this.invitations.set(this.allianceService.invitations());
    } catch (error) {
      console.error('Error revoking invitation:', error);
      this.snackBar.open('Failed to revoke invitation', 'Close', { duration: 3000 });
    } finally {
      this.isLoading.set(false);
    }
  }

  protected copyInvitationLink(token: string): void {
    const inviteUrl = `${window.location.origin}/join?token=${token}`;
    this.clipboard.copy(inviteUrl);
    this.snackBar.open('Invitation link copied to clipboard!', 'Close', { duration: 3000 });
  }

  protected async updateAllianceName(): Promise<void> {
    if (this.allianceNameForm.invalid) {
      return;
    }

    this.isLoading.set(true);
    try {
      const { name } = this.allianceNameForm.value;
      const { error } = await this.allianceService.updateAllianceName(name);
      
      if (error) {
        throw error;
      }

      this.snackBar.open('Alliance name updated successfully', 'Close', { duration: 3000 });

      // Refresh alliance data
      await this.allianceService.loadAlliance();
    } catch (error) {
      console.error('Error updating alliance name:', error);
      this.snackBar.open('Failed to update alliance name', 'Close', { duration: 3000 });
    } finally {
      this.isLoading.set(false);
    }
  }

  protected isInvitationExpired(expiresAt: string): boolean {
    return new Date(expiresAt) < new Date();
  }

  protected isInvitationUsed(usedAt: string | null): boolean {
    return usedAt !== null;
  }

  protected formatDate(date: string): string {
    return new Date(date).toLocaleDateString();
  }

  protected getRoleBadgeClass(role: string): string {
    switch (role) {
      case 'admin':
        return 'role-admin';
      case 'member':
        return 'role-member';
      default:
        return '';
    }
  }

  protected getInvitationStatus(invitation: InvitationToken): string {
    if (invitation.used_at) {
      return 'Used';
    }
    if (this.isInvitationExpired(invitation.expires_at)) {
      return 'Expired';
    }
    return 'Active';
  }

  protected getInvitationStatusClass(invitation: InvitationToken): string {
    if (invitation.used_at) {
      return 'status-used';
    }
    if (this.isInvitationExpired(invitation.expires_at)) {
      return 'status-expired';
    }
    return 'status-active';
  }
}
