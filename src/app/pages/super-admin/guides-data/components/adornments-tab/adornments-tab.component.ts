import { Component, inject, signal, input, effect, ChangeDetectionStrategy } from '@angular/core';
import { form, FormField, required, maxLength, min } from '@angular/forms/signals';
import { MatTableModule } from '@angular/material/table';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatDialogModule, MatDialog } from '@angular/material/dialog';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { firstValueFrom } from 'rxjs';
import { GuideAdminService } from '@app/core/services/guide-admin.service';
import { SnackbarService } from '@app/core/services';
import { ConfirmDialogComponent } from '@app/shared/components/confirm-dialog/confirm-dialog.component';
import { getFieldErrorKey } from '@app/shared/utils/form-validation.utils';
import type { Adornment } from '@app/shared/models/guide.model';

const NAME_MAX_LENGTH = 100;
const SORT_ORDER_MIN = 0;

interface AdornmentFormValue {
  name: string;
  sort_order: number;
}

@Component({
  selector: 'app-adornments-tab',
  imports: [
    FormField,
    MatTableModule,
    MatButtonModule,
    MatIconModule,
    MatFormFieldModule,
    MatInputModule,
    MatSlideToggleModule,
    MatTooltipModule,
    MatDialogModule,
    TranslateModule,
  ],
  templateUrl: './adornments-tab.component.html',
  styleUrl: './adornments-tab.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdornmentsTabComponent {
  private readonly guideAdminService = inject(GuideAdminService);
  private readonly snackbarService = inject(SnackbarService);
  private readonly dialog = inject(MatDialog);
  private readonly translate = inject(TranslateService);

  readonly refreshTrigger = input<number>(0);

  protected readonly adornments = signal<Adornment[]>([]);
  protected readonly editingId = signal<string | null>(null);
  protected readonly showAddForm = signal(false);

  protected readonly columns = ['image', 'name', 'active', 'order', 'actions'];

  protected readonly addModel = signal<AdornmentFormValue>({ name: '', sort_order: 0 });
  protected readonly addForm = form(this.addModel, path => {
    required(path.name);
    maxLength(path.name, NAME_MAX_LENGTH);
    required(path.sort_order);
    min(path.sort_order, SORT_ORDER_MIN);
  });

  protected readonly editModel = signal<AdornmentFormValue>({ name: '', sort_order: 0 });
  protected readonly editForm = form(this.editModel, path => {
    required(path.name);
    maxLength(path.name, NAME_MAX_LENGTH);
    required(path.sort_order);
    min(path.sort_order, SORT_ORDER_MIN);
  });

  protected readonly getFieldErrorKey = getFieldErrorKey;

  constructor() {
    effect(() => {
      this.refreshTrigger();
      void this.load();
    });
  }

  private async load(): Promise<void> {
    const data = await this.guideAdminService.getAdornments();
    this.adornments.set(data);
  }

  protected startEdit(item: Adornment): void {
    this.editingId.set(item.id);
    this.editModel.set({ name: item.name, sort_order: item.sort_order });
  }

  protected cancelEdit(): void {
    this.editingId.set(null);
    this.editModel.set({ name: '', sort_order: 0 });
  }

  protected async save(item: Adornment): Promise<void> {
    if (this.editForm().invalid()) return;
    const { name, sort_order } = this.editModel();
    const { error } = await this.guideAdminService.updateAdornment(item.id, { name, sort_order });
    if (error) {
      this.snackbarService.error(error);
    } else {
      this.snackbarService.success(this.translate.instant('common.saved'));
      this.editingId.set(null);
      this.adornments.update(list => list.map(o => (o.id === item.id ? { ...o, name, sort_order } : o)));
    }
  }

  protected async toggleActive(item: Adornment): Promise<void> {
    const newValue = !item.is_active;
    const { error } = await this.guideAdminService.updateAdornment(item.id, { is_active: newValue });
    if (error) {
      this.snackbarService.error(error);
    } else {
      this.adornments.update(list => list.map(o => (o.id === item.id ? { ...o, is_active: newValue } : o)));
    }
  }

  protected async delete(item: Adornment): Promise<void> {
    const confirmed = await firstValueFrom(
      this.dialog
        .open(ConfirmDialogComponent, {
          data: { message: this.translate.instant('common.deleteConfirm', { name: item.name }) },
        })
        .afterClosed()
    );
    if (!confirmed) return;
    const { error } = await this.guideAdminService.deleteAdornment(item.id);
    if (error) {
      this.snackbarService.error(error);
    } else {
      this.snackbarService.success(this.translate.instant('common.deleted'));
      this.adornments.update(list => list.filter(o => o.id !== item.id));
    }
  }

  protected async add(): Promise<void> {
    if (this.addForm().invalid()) return;
    const { name, sort_order } = this.addModel();
    const { adornment, error } = await this.guideAdminService.createAdornment({
      name,
      sort_order,
      is_active: true,
      image_url: null,
    });
    if (error || !adornment) {
      this.snackbarService.error(error ?? 'Error creating adornment');
    } else {
      this.snackbarService.success(this.translate.instant('common.created'));
      this.adornments.update(list => [...list, adornment]);
      this.addModel.set({ name: '', sort_order: 0 });
      this.showAddForm.set(false);
    }
  }
}
