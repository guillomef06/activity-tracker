import { Component, inject, signal, OnInit, ChangeDetectionStrategy } from '@angular/core';
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
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { ConfirmDialogComponent } from '@app/shared/components/confirm-dialog/confirm-dialog.component';
import { SupabaseService } from '@app/core/services/supabase.service';
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
    MatProgressSpinnerModule,
    MatSnackBarModule,
    MatDialogModule,
    TranslateModule,
  ],
  templateUrl: './super-admin-users.page.html',
  styleUrl: './super-admin-users.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class SuperAdminUsersPage implements OnInit {
  private readonly supabase = inject(SupabaseService);
  private readonly fb = inject(FormBuilder);
  private readonly snackBar = inject(MatSnackBar);
  private readonly dialog = inject(MatDialog);
  private readonly translate = inject(TranslateService);

  protected readonly isLoading = signal(false);
  protected readonly users = signal<UserWithAlliance[]>([]);
  protected readonly displayedColumns: string[] = ['displayName', 'username', 'role', 'alliance', 'createdAt', 'actions'];

  protected readonly editForm: FormGroup = this.fb.group({
    id: [''],
    display_name: ['', [Validators.required, Validators.minLength(2)]],
    role: ['', [Validators.required]],
  });

  protected readonly editingId = signal<string | null>(null);
  protected readonly roles = ['super_admin', 'admin', 'member'];

  async ngOnInit(): Promise<void> {
    await this.loadUsers();
  }

  protected async loadUsers(): Promise<void> {
    this.isLoading.set(true);
    try {
      // Load users with alliance names
      const { data: usersData, error: usersError } = await this.supabase.client
        .from('user_profiles')
        .select('*, alliances(name)')
        .order('created_at', { ascending: false });

      if (usersError) throw usersError;

      if (usersData) {
        const usersWithAlliance: UserWithAlliance[] = usersData.map((user: { alliances?: { name: string } | null } & UserProfile) => ({
          ...user,
          alliance_name: user.alliances?.name || null,
        }));

        this.users.set(usersWithAlliance);
      }
    } catch (error) {
      console.error('Error loading users:', error);
      this.snackBar.open('Failed to load users', 'Close', { duration: 3000 });
    } finally {
      this.isLoading.set(false);
    }
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

    this.isLoading.set(true);
    try {
      const { id, display_name, role } = this.editForm.value;

      const { error } = await this.supabase.client
        .from('user_profiles')
        .update({ display_name, role })
        .eq('id', id);

      if (error) throw error;

      this.snackBar.open('User updated successfully', 'Close', { duration: 3000 });
      this.editingId.set(null);
      this.editForm.reset();
      await this.loadUsers();
    } catch (error) {
      console.error('Error updating user:', error);
      this.snackBar.open('Failed to update user', 'Close', { duration: 3000 });
    } finally {
      this.isLoading.set(false);
    }
  }

  protected async deleteUser(user: UserProfile): Promise<void> {
    const confirmed = await this.dialog.open(ConfirmDialogComponent, {
      data: {
        message: this.translate.instant('superAdmin.users.deleteConfirm', { name: user.display_name }),
        confirmColor: 'warn'
      }
    }).afterClosed().toPromise();

    if (!confirmed) {
      return;
    }

    this.isLoading.set(true);
    try {
      // Use RPC function to delete user completely (user_profiles + auth.users)
      // This function has SECURITY DEFINER to bypass RLS for auth.users deletion
      const { data, error } = await this.supabase.client
        .rpc('delete_user_complete', { user_id: user.id });

      if (error) throw error;
      
      if (!data) {
        throw new Error('Delete function returned false');
      }

      this.snackBar.open('User deleted successfully', 'Close', { duration: 3000 });
      await this.loadUsers();
    } catch (error) {
      console.error('Error deleting user:', error);
      const errorMessage = (error as { message?: string })?.message || 'Failed to delete user';
      this.snackBar.open(errorMessage, 'Close', { 
        duration: 5000 
      });
    } finally {
      this.isLoading.set(false);
    }
  }

  protected formatDate(date: string): string {
    return new Date(date).toLocaleDateString();
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
