import { Component, inject, signal, input, effect, ChangeDetectionStrategy } from '@angular/core';
import { form, FormField, required, maxLength, min } from '@angular/forms/signals';
import { MatTableModule } from '@angular/material/table';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatDialogModule, MatDialog } from '@angular/material/dialog';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { firstValueFrom } from 'rxjs';
import { GuideAdminService } from '@app/core/services/guide-admin.service';
import { SnackbarService } from '@app/core/services';
import { ConfirmDialogComponent } from '@app/shared/components/confirm-dialog/confirm-dialog.component';
import { getFieldErrorKey } from '@app/shared/utils/form-validation.utils';
import type { HorseTemperament } from '@app/shared/models/guide.model';

const NAME_MAX_LENGTH = 100;
const DESCRIPTION_MAX_LENGTH = 500;
const SORT_ORDER_MIN = 0;

interface TemperamentFormValue {
  name: string;
  description: string;
  sort_order: number;
}

@Component({
  selector: 'app-temperaments-tab',
  imports: [
    FormField,
    MatTableModule,
    MatButtonModule,
    MatIconModule,
    MatFormFieldModule,
    MatInputModule,
    MatTooltipModule,
    MatDialogModule,
    TranslateModule,
  ],
  templateUrl: './temperaments-tab.component.html',
  styleUrl: './temperaments-tab.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TemperamentsTabComponent {
  private readonly guideAdminService = inject(GuideAdminService);
  private readonly snackbarService = inject(SnackbarService);
  private readonly dialog = inject(MatDialog);
  private readonly translate = inject(TranslateService);

  readonly refreshTrigger = input<number>(0);

  protected readonly temperaments = signal<HorseTemperament[]>([]);
  protected readonly editingId = signal<string | null>(null);
  protected readonly showAddForm = signal(false);

  protected readonly columns = ['name', 'description', 'order', 'actions'];

  protected readonly addModel = signal<TemperamentFormValue>({ name: '', description: '', sort_order: 0 });
  protected readonly addForm = form(this.addModel, path => {
    required(path.name);
    maxLength(path.name, NAME_MAX_LENGTH);
    maxLength(path.description, DESCRIPTION_MAX_LENGTH);
    required(path.sort_order);
    min(path.sort_order, SORT_ORDER_MIN);
  });

  protected readonly editModel = signal<TemperamentFormValue>({ name: '', description: '', sort_order: 0 });
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
    const data = await this.guideAdminService.getHorseTemperaments();
    this.temperaments.set(data);
  }

  protected startEdit(item: HorseTemperament): void {
    this.editingId.set(item.id);
    this.editModel.set({ name: item.name, description: item.description ?? '', sort_order: item.sort_order });
  }

  protected cancelEdit(): void {
    this.editingId.set(null);
    this.editModel.set({ name: '', description: '', sort_order: 0 });
  }

  protected async save(item: HorseTemperament): Promise<void> {
    if (this.editForm().invalid()) return;
    const { name, description, sort_order } = this.editModel();
    const { error } = await this.guideAdminService.updateHorseTemperament(item.id, { name, description, sort_order });
    if (error) {
      this.snackbarService.error(error);
    } else {
      this.snackbarService.success(this.translate.instant('common.saved'));
      this.editingId.set(null);
      this.temperaments.update(list => list.map(t => (t.id === item.id ? { ...t, name, description, sort_order } : t)));
    }
  }

  protected async delete(item: HorseTemperament): Promise<void> {
    const confirmed = await firstValueFrom(
      this.dialog
        .open(ConfirmDialogComponent, {
          data: { message: this.translate.instant('common.deleteConfirm', { name: item.name }) },
        })
        .afterClosed()
    );
    if (!confirmed) return;
    const { error } = await this.guideAdminService.deleteHorseTemperament(item.id);
    if (error) {
      this.snackbarService.error(error);
    } else {
      this.snackbarService.success(this.translate.instant('common.deleted'));
      this.temperaments.update(list => list.filter(t => t.id !== item.id));
    }
  }

  protected async add(): Promise<void> {
    if (this.addForm().invalid()) return;
    const { name, description, sort_order } = this.addModel();
    const { temperament, error } = await this.guideAdminService.createHorseTemperament({
      name,
      description: description || null,
      sort_order,
    });
    if (error || !temperament) {
      this.snackbarService.error(error ?? 'Error creating temperament');
    } else {
      this.snackbarService.success(this.translate.instant('common.created'));
      this.temperaments.update(list => [...list, temperament]);
      this.addModel.set({ name: '', description: '', sort_order: 0 });
      this.showAddForm.set(false);
    }
  }
}
