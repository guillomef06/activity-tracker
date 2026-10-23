import { Component, ChangeDetectionStrategy, inject, signal, computed, OnInit } from '@angular/core';
import { DatePipe } from '@angular/common';
import { firstValueFrom } from 'rxjs';
import { form, required, maxLength, validate, FormField } from '@angular/forms/signals';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatAutocompleteModule } from '@angular/material/autocomplete';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { PointAdjustmentService } from '@app/core/services/point-adjustment.service';
import { AuthService } from '@app/core/services/auth.service';
import { ServerService } from '@app/core/services/server.service';
import { SnackbarService } from '@app/core/services';
import { getFieldErrorKey } from '@shared/utils/form-validation.utils';
import { ConfirmDialogComponent } from '@shared/components/confirm-dialog/confirm-dialog.component';
import type { PointAdjustmentWithUser, UserProfile } from '@shared/models';

/** Max length of the admin-entered reason (mirrors the DB CHECK in migration 46). */
const REASON_MAX_LENGTH = 200;

interface AdjustmentFormModel {
  userId: string | null;
  delta: number | null;
  reason: string;
}

const EMPTY_FORM: AdjustmentFormModel = { userId: null, delta: null, reason: '' };

@Component({
  selector: 'app-point-adjustments-tab',
  imports: [
    DatePipe,
    FormField,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatFormFieldModule,
    MatInputModule,
    MatAutocompleteModule,
    MatProgressSpinnerModule,
    MatTooltipModule,
    MatDialogModule,
    TranslateModule,
  ],
  templateUrl: './point-adjustments-tab.component.html',
  styleUrl: './point-adjustments-tab.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PointAdjustmentsTabComponent implements OnInit {
  private readonly pointAdjustmentService = inject(PointAdjustmentService);
  private readonly authService = inject(AuthService);
  private readonly serverService = inject(ServerService);
  private readonly snackbarService = inject(SnackbarService);
  private readonly translate = inject(TranslateService);
  private readonly dialog = inject(MatDialog);

  protected readonly reasonMaxLength = REASON_MAX_LENGTH;

  protected readonly isLoading = signal(false);
  protected readonly isSaving = signal(false);
  protected readonly deletingId = signal<string | null>(null);

  protected readonly adjustments = signal<PointAdjustmentWithUser[]>([]);

  /** Server members, the pool the player dropdown searches. */
  protected readonly members = computed(() => this.serverService.members());

  /** Free-text search backing the player autocomplete. */
  protected readonly playerSearch = signal('');

  protected readonly filteredMembers = computed<UserProfile[]>(() => {
    const search = this.playerSearch().toLowerCase().trim();
    const members = this.members();
    if (!search) return members;
    return members.filter(m => m.display_name.toLowerCase().includes(search));
  });

  protected readonly adjustmentModel = signal<AdjustmentFormModel>(EMPTY_FORM);

  protected readonly adjustmentForm = form(this.adjustmentModel, path => {
    required(path.userId);
    required(path.delta);
    validate(path.delta, ({ value }) => (value() === 0 ? { kind: 'nonZero' } : null));
    required(path.reason);
    maxLength(path.reason, REASON_MAX_LENGTH);
  });

  protected readonly deltaError = computed(() =>
    this.adjustmentForm.delta().touched()
      ? getFieldErrorKey(this.adjustmentForm.delta().errors(), { nonZero: 'pointAdjustments.deltaNonZero' })
      : ''
  );

  protected readonly reasonError = computed(() =>
    this.adjustmentForm.reason().touched() ? getFieldErrorKey(this.adjustmentForm.reason().errors()) : ''
  );

  async ngOnInit(): Promise<void> {
    await this.loadAdjustments();
  }

  private async loadAdjustments(): Promise<void> {
    const serverId = this.authService.getServerId();
    if (!serverId) return;

    this.isLoading.set(true);
    try {
      this.adjustments.set(await this.pointAdjustmentService.loadAdjustments(serverId));
    } finally {
      this.isLoading.set(false);
    }
  }

  /** Autocomplete shows the display name; the option's value is the member's id. */
  protected displayMemberName = (userId: string): string =>
    this.members().find(m => m.id === userId)?.display_name ?? '';

  protected onPlayerSearch(value: string): void {
    this.playerSearch.set(value);
  }

  protected onPlayerSelected(userId: string): void {
    this.adjustmentModel.update(model => ({ ...model, userId }));
  }

  protected async submit(): Promise<void> {
    if (this.adjustmentForm().invalid()) {
      this.adjustmentForm().markAsTouched();
      return;
    }
    const serverId = this.authService.getServerId();
    const { userId, delta, reason } = this.adjustmentModel();
    if (!serverId || userId === null || delta === null) return;

    this.isSaving.set(true);
    try {
      const { error } = await this.pointAdjustmentService.createAdjustment(serverId, {
        userId,
        delta,
        reason: reason.trim(),
      });
      if (error) throw error;
      this.snackbarService.success(this.translate.instant('pointAdjustments.createSuccess'));
      this.adjustmentModel.set(EMPTY_FORM);
      this.playerSearch.set('');
      await this.loadAdjustments();
    } catch {
      this.snackbarService.error(this.translate.instant('pointAdjustments.createError'));
    } finally {
      this.isSaving.set(false);
    }
  }

  protected async deleteAdjustment(id: string): Promise<void> {
    const confirmed = await firstValueFrom(
      this.dialog
        .open(ConfirmDialogComponent, {
          data: {
            title: this.translate.instant('pointAdjustments.deleteTitle'),
            message: this.translate.instant('pointAdjustments.deleteConfirm'),
            confirmText: this.translate.instant('common.delete'),
            cancelText: this.translate.instant('common.cancel'),
          },
        })
        .afterClosed()
    );
    if (!confirmed) return;

    this.deletingId.set(id);
    try {
      const { error } = await this.pointAdjustmentService.deleteAdjustment(id);
      if (error) throw error;
      this.snackbarService.success(this.translate.instant('pointAdjustments.deleteSuccess'));
      await this.loadAdjustments();
    } catch {
      this.snackbarService.error(this.translate.instant('pointAdjustments.deleteError'));
    } finally {
      this.deletingId.set(null);
    }
  }
}
