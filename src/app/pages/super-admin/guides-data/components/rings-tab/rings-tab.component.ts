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
import type { Ring } from '@app/shared/models/guide.model';

const NAME_MAX_LENGTH = 100;
const DESCRIPTION_MAX_LENGTH = 500;
const SORT_ORDER_MIN = 0;

interface RingFormValue {
  name: string;
  description: string;
  sort_order: number;
}

@Component({
  selector: 'app-rings-tab',
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
  templateUrl: './rings-tab.component.html',
  styleUrl: './rings-tab.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RingsTabComponent {
  private readonly guideAdminService = inject(GuideAdminService);
  private readonly snackbarService = inject(SnackbarService);
  private readonly dialog = inject(MatDialog);
  private readonly translate = inject(TranslateService);

  readonly refreshTrigger = input<number>(0);

  protected readonly rings = signal<Ring[]>([]);
  protected readonly editingId = signal<string | null>(null);
  protected readonly showAddForm = signal(false);

  protected readonly columns = ['icon', 'name', 'description', 'active', 'order', 'actions'];

  protected readonly addModel = signal<RingFormValue>({ name: '', description: '', sort_order: 0 });
  protected readonly addForm = form(this.addModel, path => {
    required(path.name);
    maxLength(path.name, NAME_MAX_LENGTH);
    maxLength(path.description, DESCRIPTION_MAX_LENGTH);
    required(path.sort_order);
    min(path.sort_order, SORT_ORDER_MIN);
  });

  protected readonly editModel = signal<RingFormValue>({ name: '', description: '', sort_order: 0 });
  protected readonly editForm = form(this.editModel, path => {
    required(path.name);
    maxLength(path.name, NAME_MAX_LENGTH);
    maxLength(path.description, DESCRIPTION_MAX_LENGTH);
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
    const data = await this.guideAdminService.getRings();
    this.rings.set(data);
  }

  protected startEdit(item: Ring): void {
    this.editingId.set(item.id);
    this.editModel.set({ name: item.name, description: item.description ?? '', sort_order: item.sort_order });
  }

  protected cancelEdit(): void {
    this.editingId.set(null);
    this.editModel.set({ name: '', description: '', sort_order: 0 });
  }

  protected async save(item: Ring): Promise<void> {
    if (this.editForm().invalid()) return;
    const { name, description, sort_order } = this.editModel();
    const { error } = await this.guideAdminService.updateRing(item.id, { name, description, sort_order });
    if (error) {
      this.snackbarService.error(error);
    } else {
      this.snackbarService.success(this.translate.instant('common.saved'));
      this.editingId.set(null);
      this.rings.update(list => list.map(r => (r.id === item.id ? { ...r, name, description, sort_order } : r)));
    }
  }

  protected async toggleActive(item: Ring): Promise<void> {
    const newValue = !item.is_active;
    const { error } = await this.guideAdminService.updateRing(item.id, { is_active: newValue });
    if (error) {
      this.snackbarService.error(error);
    } else {
      this.rings.update(list => list.map(r => (r.id === item.id ? { ...r, is_active: newValue } : r)));
    }
  }

  protected async delete(item: Ring): Promise<void> {
    const confirmed = await firstValueFrom(
      this.dialog
        .open(ConfirmDialogComponent, {
          data: { message: this.translate.instant('common.deleteConfirm', { name: item.name }) },
        })
        .afterClosed()
    );
    if (!confirmed) return;
    const { error } = await this.guideAdminService.deleteRing(item.id);
    if (error) {
      this.snackbarService.error(error);
    } else {
      this.snackbarService.success(this.translate.instant('common.deleted'));
      this.rings.update(list => list.filter(r => r.id !== item.id));
    }
  }

  protected async add(): Promise<void> {
    if (this.addForm().invalid()) return;
    const { name, description, sort_order } = this.addModel();
    const { ring, error } = await this.guideAdminService.createRing({
      name,
      description: description || null,
      sort_order,
      is_active: true,
      icon_url: null,
    });
    if (error || !ring) {
      this.snackbarService.error(error ?? 'Error creating ring');
    } else {
      this.snackbarService.success(this.translate.instant('common.created'));
      this.rings.update(list => [...list, ring]);
      this.addModel.set({ name: '', description: '', sort_order: 0 });
      this.showAddForm.set(false);
    }
  }

  protected async uploadIcon(item: Ring, event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    const { url, error } = await this.guideAdminService.uploadRingImage(item.id, file);
    if (error) {
      this.snackbarService.error(error);
    } else {
      this.snackbarService.success(this.translate.instant('common.saved'));
      this.rings.update(list => list.map(r => (r.id === item.id ? { ...r, icon_url: url } : r)));
    }
    input.value = '';
  }
}
