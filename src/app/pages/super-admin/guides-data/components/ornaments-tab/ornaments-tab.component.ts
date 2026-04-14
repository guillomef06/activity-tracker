import { Component, inject, signal, input, effect, ChangeDetectionStrategy } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
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
import type { Ornament } from '@app/shared/models/guide.model';

@Component({
  selector: 'app-ornaments-tab',
  imports: [
    ReactiveFormsModule,
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
  templateUrl: './ornaments-tab.component.html',
  styleUrl: './ornaments-tab.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OrnamentsTabComponent {
  private readonly guideAdminService = inject(GuideAdminService);
  private readonly snackbarService = inject(SnackbarService);
  private readonly dialog = inject(MatDialog);
  private readonly translate = inject(TranslateService);
  private readonly fb = inject(FormBuilder);

  readonly refreshTrigger = input<number>(0);

  protected readonly ornaments = signal<Ornament[]>([]);
  protected readonly editingId = signal<string | null>(null);
  protected readonly showAddForm = signal(false);

  protected readonly columns = ['image', 'name', 'active', 'order', 'actions'];

  protected readonly addForm: FormGroup = this.fb.group({
    name: ['', [Validators.required, Validators.maxLength(100)]],
    sort_order: [0, [Validators.required, Validators.min(0)]],
  });

  protected readonly editForm: FormGroup = this.fb.group({
    name: ['', [Validators.required, Validators.maxLength(100)]],
    sort_order: [0, [Validators.required, Validators.min(0)]],
  });

  constructor() {
    effect(() => {
      this.refreshTrigger();
      void this.load();
    });
  }

  private async load(): Promise<void> {
    const data = await this.guideAdminService.getOrnaments();
    this.ornaments.set(data);
  }

  protected startEdit(item: Ornament): void {
    this.editingId.set(item.id);
    this.editForm.patchValue({ name: item.name, sort_order: item.sort_order });
  }

  protected cancelEdit(): void {
    this.editingId.set(null);
    this.editForm.reset();
  }

  protected async save(item: Ornament): Promise<void> {
    if (this.editForm.invalid) return;
    const { name, sort_order } = this.editForm.value as { name: string; sort_order: number };
    const { error } = await this.guideAdminService.updateOrnament(item.id, { name, sort_order });
    if (error) {
      this.snackbarService.error(error);
    } else {
      this.snackbarService.success(this.translate.instant('common.saved'));
      this.editingId.set(null);
      this.ornaments.update(list => list.map(o => (o.id === item.id ? { ...o, name, sort_order } : o)));
    }
  }

  protected async toggleActive(item: Ornament): Promise<void> {
    const newValue = !item.is_active;
    const { error } = await this.guideAdminService.updateOrnament(item.id, { is_active: newValue });
    if (error) {
      this.snackbarService.error(error);
    } else {
      this.ornaments.update(list => list.map(o => (o.id === item.id ? { ...o, is_active: newValue } : o)));
    }
  }

  protected async delete(item: Ornament): Promise<void> {
    const confirmed = await firstValueFrom(
      this.dialog
        .open(ConfirmDialogComponent, {
          data: { message: this.translate.instant('common.deleteConfirm', { name: item.name }) },
        })
        .afterClosed()
    );
    if (!confirmed) return;
    const { error } = await this.guideAdminService.deleteOrnament(item.id);
    if (error) {
      this.snackbarService.error(error);
    } else {
      this.snackbarService.success(this.translate.instant('common.deleted'));
      this.ornaments.update(list => list.filter(o => o.id !== item.id));
    }
  }

  protected async add(): Promise<void> {
    if (this.addForm.invalid) return;
    const { name, sort_order } = this.addForm.value as { name: string; sort_order: number };
    const { ornament, error } = await this.guideAdminService.createOrnament({
      name,
      sort_order,
      is_active: true,
      image_url: null,
    });
    if (error || !ornament) {
      this.snackbarService.error(error ?? 'Error creating ornament');
    } else {
      this.snackbarService.success(this.translate.instant('common.created'));
      this.ornaments.update(list => [...list, ornament]);
      this.addForm.reset({ sort_order: 0 });
      this.showAddForm.set(false);
    }
  }
}
