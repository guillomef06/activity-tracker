import { Component, inject, signal, OnInit, ChangeDetectionStrategy } from '@angular/core';
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
import { MatDialogModule, MatDialog } from '@angular/material/dialog';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { ConfirmDialogComponent } from '@app/shared/components/confirm-dialog/confirm-dialog.component';
import { SupabaseService } from '@app/core/services/supabase.service';
import type { Alliance } from '@app/shared/models';

interface AllianceWithStats extends Alliance {
  member_count: number;
  admin_name: string;
}

@Component({
  selector: 'app-super-admin-alliances',
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
    MatDialogModule,
    TranslateModule,
  ],
  templateUrl: './super-admin-alliances.page.html',
  styleUrl: './super-admin-alliances.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class SuperAdminAlliancesPage implements OnInit {
  private readonly supabase = inject(SupabaseService);
  private readonly fb = inject(FormBuilder);
  private readonly snackBar = inject(MatSnackBar);
  private readonly dialog = inject(MatDialog);
  private readonly translate = inject(TranslateService);

  protected readonly isLoading = signal(false);
  protected readonly alliances = signal<AllianceWithStats[]>([]);
  protected readonly displayedColumns: string[] = ['name', 'admin', 'members', 'createdAt', 'actions'];

  protected readonly editForm: FormGroup = this.fb.group({
    id: [''],
    name: ['', [Validators.required, Validators.minLength(3), Validators.maxLength(100)]],
  });

  protected readonly editingId = signal<string | null>(null);

  async ngOnInit(): Promise<void> {
    await this.loadAlliances();
  }

  protected async loadAlliances(): Promise<void> {
    this.isLoading.set(true);
    try {
      // Load alliances with member count and admin info
      const { data: alliancesData, error: alliancesError } = await this.supabase.client
        .from('alliances')
        .select('*')
        .order('created_at', { ascending: false });

      if (alliancesError) throw alliancesError;

      if (alliancesData) {
        // For each alliance, get member count and admin name
        const alliancesWithStats = await Promise.all(
          alliancesData.map(async (alliance) => {
            // Get member count
            const { count } = await this.supabase.client
              .from('user_profiles')
              .select('count', { count: 'exact', head: true })
              .eq('alliance_id', alliance.id);

            // Get admin name
            const { data: adminData } = await this.supabase.client
              .from('user_profiles')
              .select('display_name')
              .eq('alliance_id', alliance.id)
              .eq('role', 'admin')
              .limit(1)
              .single();

            return {
              ...alliance,
              member_count: count || 0,
              admin_name: adminData?.display_name || 'N/A',
            };
          })
        );

        this.alliances.set(alliancesWithStats);
      }
    } catch (error) {
      console.error('Error loading alliances:', error);
      this.snackBar.open('Failed to load alliances', 'Close', { duration: 3000 });
    } finally {
      this.isLoading.set(false);
    }
  }

  protected startEdit(alliance: Alliance): void {
    this.editingId.set(alliance.id);
    this.editForm.patchValue({
      id: alliance.id,
      name: alliance.name,
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
      const { id, name } = this.editForm.value;

      const { error } = await this.supabase.client
        .from('alliances')
        .update({ name })
        .eq('id', id);

      if (error) throw error;

      this.snackBar.open('Alliance updated successfully', 'Close', { duration: 3000 });
      this.editingId.set(null);
      this.editForm.reset();
      await this.loadAlliances();
    } catch (error) {
      console.error('Error updating alliance:', error);
      this.snackBar.open('Failed to update alliance', 'Close', { duration: 3000 });
    } finally {
      this.isLoading.set(false);
    }
  }

  protected async deleteAlliance(alliance: Alliance): Promise<void> {
    const confirmed = await this.dialog.open(ConfirmDialogComponent, {
      data: {
        message: this.translate.instant('superAdmin.alliances.deleteConfirm', { name: alliance.name }),
        confirmColor: 'warn'
      }
    }).afterClosed().toPromise();

    if (!confirmed) {
      return;
    }

    this.isLoading.set(true);
    try {
      // Delete alliance (cascade will handle related records)
      const { error } = await this.supabase.client
        .from('alliances')
        .delete()
        .eq('id', alliance.id);

      if (error) throw error;

      this.snackBar.open('Alliance deleted successfully', 'Close', { duration: 3000 });
      await this.loadAlliances();
    } catch (error) {
      console.error('Error deleting alliance:', error);
      this.snackBar.open('Failed to delete alliance', 'Close', { duration: 3000 });
    } finally {
      this.isLoading.set(false);
    }
  }

  protected formatDate(date: string): string {
    return new Date(date).toLocaleDateString();
  }

  protected isEditing(allianceId: string): boolean {
    return this.editingId() === allianceId;
  }
}
