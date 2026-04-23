import { Component, inject, signal, OnInit, ChangeDetectionStrategy, DestroyRef } from '@angular/core';

import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTableModule } from '@angular/material/table';
import { MatChipsModule } from '@angular/material/chips';
import { SnackbarService } from '@app/core/services';
import { MatDialogModule, MatDialog } from '@angular/material/dialog';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { ConfirmDialogComponent } from '@app/shared/components/confirm-dialog/confirm-dialog.component';
import { SupabaseService } from '@app/core/services/supabase.service';
import { ProgressBarService } from '@app/core/services/progress-bar.service';
import { createFieldErrorSignal } from '@app/shared/utils/form-validation.utils';
import { LocalDatePipe } from '@app/shared/pipes/local-date.pipe';
import type { Server } from '@app/shared/models';
import { firstValueFrom } from 'rxjs';

interface ServerWithStats extends Server {
  member_count: number;
  admin_name: string;
}

interface ServerRow extends Server {
  user_profiles: { display_name: string | null; role: string }[];
}

@Component({
  selector: 'app-super-admin-servers',
  imports: [
    ReactiveFormsModule,
    MatCardModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatIconModule,
    MatTableModule,
    MatChipsModule,
    MatDialogModule,
    TranslateModule,
    LocalDatePipe,
  ],
  templateUrl: './super-admin-servers.page.html',
  styleUrl: './super-admin-servers.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SuperAdminServersPage implements OnInit {
  private readonly supabase = inject(SupabaseService);
  private readonly fb = inject(FormBuilder);
  private readonly snackbarService = inject(SnackbarService);
  private readonly dialog = inject(MatDialog);
  private readonly translate = inject(TranslateService);
  protected readonly progressBarService = inject(ProgressBarService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly servers = signal<ServerWithStats[]>([]);
  protected readonly displayedColumns: string[] = ['name', 'tag', 'admin', 'members', 'createdAt', 'actions'];

  protected readonly editForm: FormGroup = this.fb.group({
    id: [''],
    name: ['', [Validators.required, Validators.minLength(3), Validators.maxLength(100)]],
    tag: ['', [Validators.minLength(3), Validators.maxLength(3)]],
  });

  // Error signals for validation
  protected readonly nameError = createFieldErrorSignal(this.editForm, 'name', this.destroyRef);
  protected readonly tagError = createFieldErrorSignal(this.editForm, 'tag', this.destroyRef);

  protected readonly editingId = signal<string | null>(null);

  async ngOnInit(): Promise<void> {
    await this.loadServers();
  }

  protected async loadServers(): Promise<void> {
    await this.progressBarService.withProgress(async () => {
      try {
        const { data, error } = await this.supabase.client
          .from('servers')
          .select('*, user_profiles(display_name, role)')
          .order('created_at', { ascending: false });

        if (error) throw error;

        if (data) {
          const serversWithStats: ServerWithStats[] = (data as ServerRow[]).map(({ user_profiles, ...server }) => ({
            ...server,
            member_count: user_profiles.length,
            admin_name: user_profiles.find(u => u.role === 'admin')?.display_name ?? 'N/A',
          }));

          this.servers.set(serversWithStats);
        }
      } catch (error) {
        console.error('Error loading servers:', error);
        this.snackbarService.error(this.translate.instant('superAdmin.servers.loadFailed'));
      }
    });
  }

  protected startEdit(server: Server): void {
    this.editingId.set(server.id);
    this.editForm.patchValue({
      id: server.id,
      name: server.name,
      tag: server.tag ?? '',
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
        const { id, name, tag } = this.editForm.value;

        const { error } = await this.supabase.client
          .from('servers')
          .update({ name, tag: tag || null })
          .eq('id', id);

        if (error) throw error;

        this.snackbarService.success(this.translate.instant('superAdmin.servers.updated'));
        this.editingId.set(null);
        this.editForm.reset();
        await this.loadServers();
      } catch (error) {
        console.error('Error updating server:', error);
        this.snackbarService.error(this.translate.instant('superAdmin.servers.updateFailed'));
      }
    });
  }

  protected async deleteServer(server: Server): Promise<void> {
    const confirmed = await firstValueFrom(
      this.dialog
        .open(ConfirmDialogComponent, {
          data: {
            message: this.translate.instant('superAdmin.servers.deleteConfirm', {
              name: server.name,
            }),
          },
        })
        .afterClosed()
    );

    if (!confirmed) {
      return;
    }

    await this.progressBarService.withProgress(async () => {
      try {
        // Delete server (cascade will handle related records)
        const { error } = await this.supabase.client.from('servers').delete().eq('id', server.id);

        if (error) throw error;

        this.snackbarService.success(this.translate.instant('superAdmin.servers.deleted'));
        await this.loadServers();
      } catch (error) {
        console.error('Error deleting server:', error);
        this.snackbarService.error(this.translate.instant('superAdmin.servers.deleteFailed'));
      }
    });
  }

  protected isEditing(serverId: string): boolean {
    return this.editingId() === serverId;
  }
}
