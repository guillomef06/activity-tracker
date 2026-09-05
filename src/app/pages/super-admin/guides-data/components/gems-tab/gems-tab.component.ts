import { Component, inject, signal, computed, input, effect, ChangeDetectionStrategy } from '@angular/core';
import { form, FormField, required, maxLength } from '@angular/forms/signals';
import { MatTableModule } from '@angular/material/table';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatChipsModule } from '@angular/material/chips';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatDialogModule, MatDialog } from '@angular/material/dialog';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { firstValueFrom } from 'rxjs';
import { GuideAdminService } from '@app/core/services/guide-admin.service';
import { SnackbarService } from '@app/core/services';
import { ConfirmDialogComponent } from '@app/shared/components/confirm-dialog/confirm-dialog.component';
import { getFieldErrorKey } from '@app/shared/utils/form-validation.utils';
import type { Gem, GemType } from '@app/shared/models/guide.model';

const GEM_TYPES: GemType[] = ['strategy', 'hero', 'tactics'];
const DEFAULT_GEM_TYPE: GemType = 'strategy';
const NAME_MAX_LENGTH = 100;

interface GemFormValue {
  name: string;
  type: GemType;
}

@Component({
  selector: 'app-gems-tab',
  imports: [
    FormField,
    MatTableModule,
    MatButtonModule,
    MatIconModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatSlideToggleModule,
    MatChipsModule,
    MatTooltipModule,
    MatDialogModule,
    TranslateModule,
  ],
  templateUrl: './gems-tab.component.html',
  styleUrl: './gems-tab.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GemsTabComponent {
  private readonly guideAdminService = inject(GuideAdminService);
  private readonly snackbarService = inject(SnackbarService);
  private readonly dialog = inject(MatDialog);
  private readonly translate = inject(TranslateService);

  readonly refreshTrigger = input<number>(0);

  protected readonly gemTypes = GEM_TYPES;

  protected readonly gems = signal<Gem[]>([]);
  protected readonly editingId = signal<string | null>(null);
  protected readonly showAddForm = signal(false);
  protected readonly typeFilter = signal<GemType | ''>('');

  protected readonly filteredGems = computed(() => {
    const filter = this.typeFilter();
    const all = this.gems();
    return filter ? all.filter(g => g.type === filter) : all;
  });

  protected readonly columns = ['icon', 'name', 'type', 'active', 'actions'];

  protected readonly addModel = signal<GemFormValue>({ name: '', type: DEFAULT_GEM_TYPE });
  protected readonly addForm = form(this.addModel, path => {
    required(path.name);
    maxLength(path.name, NAME_MAX_LENGTH);
    required(path.type);
  });

  protected readonly editModel = signal<GemFormValue>({ name: '', type: DEFAULT_GEM_TYPE });
  protected readonly editForm = form(this.editModel, path => {
    required(path.name);
    maxLength(path.name, NAME_MAX_LENGTH);
    required(path.type);
  });

  protected readonly getFieldErrorKey = getFieldErrorKey;

  constructor() {
    effect(() => {
      this.refreshTrigger();
      void this.load();
    });
  }

  private async load(): Promise<void> {
    const data = await this.guideAdminService.getGems();
    this.gems.set(data);
  }

  protected startEdit(item: Gem): void {
    this.editingId.set(item.id);
    this.editModel.set({ name: item.name, type: item.type });
  }

  protected cancelEdit(): void {
    this.editingId.set(null);
    this.editModel.set({ name: '', type: DEFAULT_GEM_TYPE });
  }

  protected async save(item: Gem): Promise<void> {
    if (this.editForm().invalid()) return;
    const { name, type } = this.editModel();
    const { error } = await this.guideAdminService.updateGem(item.id, { name, type });
    if (error) {
      this.snackbarService.error(error);
    } else {
      this.snackbarService.success(this.translate.instant('common.saved'));
      this.editingId.set(null);
      this.gems.update(list => list.map(g => (g.id === item.id ? { ...g, name, type } : g)));
    }
  }

  protected async toggleActive(item: Gem): Promise<void> {
    const newValue = !item.is_active;
    const { error } = await this.guideAdminService.updateGem(item.id, { is_active: newValue });
    if (error) {
      this.snackbarService.error(error);
    } else {
      this.gems.update(list => list.map(g => (g.id === item.id ? { ...g, is_active: newValue } : g)));
    }
  }

  protected async delete(item: Gem): Promise<void> {
    const confirmed = await firstValueFrom(
      this.dialog
        .open(ConfirmDialogComponent, {
          data: { message: this.translate.instant('common.deleteConfirm', { name: item.name }) },
        })
        .afterClosed()
    );
    if (!confirmed) return;
    const { error } = await this.guideAdminService.deleteGem(item.id);
    if (error) {
      this.snackbarService.error(error);
    } else {
      this.snackbarService.success(this.translate.instant('common.deleted'));
      this.gems.update(list => list.filter(g => g.id !== item.id));
    }
  }

  protected async add(): Promise<void> {
    if (this.addForm().invalid()) return;
    const { name, type } = this.addModel();
    const { gem, error } = await this.guideAdminService.createGem({
      name,
      type,
      is_active: true,
      icon_url: null,
    });
    if (error || !gem) {
      this.snackbarService.error(error ?? 'Error creating gem');
    } else {
      this.snackbarService.success(this.translate.instant('common.created'));
      this.gems.update(list => [...list, gem]);
      this.addModel.set({ name: '', type: DEFAULT_GEM_TYPE });
      this.showAddForm.set(false);
    }
  }

  protected async uploadIcon(item: Gem, event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    const { url, error } = await this.guideAdminService.uploadGemImage(item.id, file);
    if (error) {
      this.snackbarService.error(error);
    } else {
      this.snackbarService.success(this.translate.instant('common.saved'));
      this.gems.update(list => list.map(g => (g.id === item.id ? { ...g, icon_url: url } : g)));
    }
    input.value = '';
  }
}
