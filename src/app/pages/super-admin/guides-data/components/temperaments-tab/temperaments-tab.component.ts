import { Component, inject, signal, input, effect, ChangeDetectionStrategy } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
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
import type { HorseTemperament } from '@app/shared/models/guide.model';

@Component({
  selector: 'app-temperaments-tab',
  imports: [
    ReactiveFormsModule,
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
  private readonly fb = inject(FormBuilder);

  readonly refreshTrigger = input<number>(0);

  protected readonly temperaments = signal<HorseTemperament[]>([]);
  protected readonly editingId = signal<string | null>(null);
  protected readonly showAddForm = signal(false);

  protected readonly columns = ['name', 'description', 'order', 'actions'];

  protected readonly addForm: FormGroup = this.fb.group({
    name: ['', [Validators.required, Validators.maxLength(100)]],
    description: ['', Validators.maxLength(500)],
    sort_order: [0, [Validators.required, Validators.min(0)]],
  });

  protected readonly editForm: FormGroup = this.fb.group({
    name: ['', [Validators.required, Validators.maxLength(100)]],
    description: ['', Validators.maxLength(500)],
    sort_order: [0, [Validators.required, Validators.min(0)]],
  });

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
    this.editForm.patchValue({ name: item.name, description: item.description, sort_order: item.sort_order });
  }

  protected cancelEdit(): void {
    this.editingId.set(null);
    this.editForm.reset();
  }

  protected async save(item: HorseTemperament): Promise<void> {
    if (this.editForm.invalid) return;
    const { name, description, sort_order } = this.editForm.value as {
      name: string;
      description: string;
      sort_order: number;
    };
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
    if (this.addForm.invalid) return;
    const { name, description, sort_order } = this.addForm.value as {
      name: string;
      description: string;
      sort_order: number;
    };
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
      this.addForm.reset({ sort_order: 0 });
      this.showAddForm.set(false);
    }
  }
}
