import {
  Component,
  inject,
  signal,
  OnInit,
  ChangeDetectionStrategy,
  DestroyRef,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTableModule } from '@angular/material/table';
import { MatChipsModule } from '@angular/material/chips';
import { SnackbarService } from '@app/core/services';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { ConfirmDialogComponent } from '@app/shared/components/confirm-dialog/confirm-dialog.component';
import { SupabaseService } from '@app/core/services/supabase.service';
import { ProgressBarService } from '@app/core/services/progress-bar.service';
import { createFieldErrorSignal } from '@app/shared/utils/form-validation.utils';
import { LocalDatePipe } from '@app/shared/pipes/local-date.pipe';
import type { UserProfile } from '@app/shared/models';

interface UserWithAlliance extends UserProfile {
  alliance_name: string | null;
}

@Component({
  selector: 'app-super-admin-users',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatCardModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatButtonModule,
    MatIconModule,
    MatTableModule,
    MatChipsModule,
    MatDialogModule,
    TranslateModule,
    LocalDatePipe,
  ],
  templateUrl: './super-admin-users.page.html',
  styleUrl: './super-admin-users.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SuperAdminUsersPage implements OnInit {
  private readonly supabase = inject(SupabaseService);
  private readonly fb = inject(FormBuilder);
  private readonly snackbarService = inject(SnackbarService);
  private readonly dialog = inject(MatDialog);
  private readonly translate = inject(TranslateService);
  protected readonly progressBarService = inject(ProgressBarService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly users = signal<UserWithAlliance[]>([]);
  protected readonly displayedColumns: string[] = [
    'displayName',
    'username',
    'role',
    'alliance',
    'createdAt',
    'actions',
  ];

  protected readonly editForm: FormGroup = this.fb.group({
    id: [''],
    display_name: ['', [Validators.required, Validators.minLength(2)]],
    role: ['', [Validators.required]],
  });

  // Error signals for validation
  protected readonly displayNameError = createFieldErrorSignal(
    this.editForm,
    'display_name',
    this.destroyRef
  );
  protected readonly roleError = createFieldErrorSignal(this.editForm, 'role', this.destroyRef);

  protected readonly editingId = signal<string | null>(null);
  protected readonly roles = ['super_admin', 'admin', 'member'];

  async ngOnInit(): Promise<void> {
    await this.loadUsers();
  }

  protected async loadUsers(): Promise<void> {
    await this.progressBarService.withProgress(async () => {
      try {
        // Load users with alliance names
        const { data: usersData, error: usersError } = await this.supabase.client
          .from('user_profiles')
          .select('*, alliances(name)')
          .order('created_at', { ascending: false });

        if (usersError) throw usersError;

        if (usersData) {
          const usersWithAlliance: UserWithAlliance[] = usersData.map(
            (user: { alliances?: { name: string } | null } & UserProfile) => ({
              ...user,
              alliance_name: user.alliances?.name || null,
            })
          );

          this.users.set(usersWithAlliance);
        }
      } catch (error) {
        console.error('Error loading users:', error);
        this.snackbarService.error(this.translate.instant('superAdmin.users.loadFailed'));
      }
    });
  }

  protected startEdit(user: UserProfile): void {
    this.editingId.set(user.id);
    this.editForm.patchValue({
      id: user.id,
      display_name: user.display_name,
      role: user.role,
    });
  }

  protected cancelEdit(): void {
    this.editingId.set(null);
    this.editForm.reset();
  }

  protected async saveEdit(): Promise<void> {
    if (this.editForm.invalid) {
      return;
    }

    await this.progressBarService.withProgress(async () => {
      try {
        const { id, display_name, role } = this.editForm.value;

        const { error } = await this.supabase.client
          .from('user_profiles')
          .update({ display_name, role })
          .eq('id', id);

        if (error) throw error;

        this.snackbarService.success(this.translate.instant('superAdmin.users.updated'));
        this.editingId.set(null);
        this.editForm.reset();
        await this.loadUsers();
      } catch (error) {
        console.error('Error updating user:', error);
        this.snackbarService.error(this.translate.instant('superAdmin.users.updateFailed'));
      }
    });
  }

  protected async deleteUser(user: UserProfile): Promise<void> {
    const confirmed = await this.dialog
      .open(ConfirmDialogComponent, {
        data: {
          message: this.translate.instant('superAdmin.users.deleteConfirm', {
            name: user.display_name,
          }),
        },
      })
      .afterClosed()
      .toPromise();

    if (!confirmed) {
      return;
    }

    await this.progressBarService.withProgress(async () => {
      try {
        // Use RPC function to delete user completely (user_profiles + auth.users)
        // This function has SECURITY DEFINER to bypass RLS for auth.users deletion
        const { data, error } = await this.supabase.client.rpc('delete_user_complete', {
          user_id: user.id,
        });

        if (error) throw error;

        if (!data) {
          throw new Error('Delete function returned false');
        }

        this.snackbarService.success(this.translate.instant('superAdmin.users.deleted'));
        await this.loadUsers();
      } catch (error) {
        console.error('Error deleting user:', error);
        const errorMessage = (error as { message?: string })?.message || 'Failed to delete user';
        this.snackbarService.error(errorMessage, 5000);
      }
    });
  }

  protected getRoleBadgeClass(role: string): string {
    switch (role) {
      case 'super_admin':
        return 'role-super-admin';
      case 'admin':
        return 'role-admin';
      case 'member':
        return 'role-member';
      default:
        return '';
    }
  }

  protected isEditing(userId: string): boolean {
    return this.editingId() === userId;
  }

  protected getRoleLabel(role: string): string {
    return role;
  }
}
