import { Component, ChangeDetectionStrategy, input, output, computed, Signal } from '@angular/core';
import { FormField, type FieldTree } from '@angular/forms/signals';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { TranslateModule } from '@ngx-translate/core';
import { PackItem } from '@shared/models/pack-value.model';

/** Default i18n unit label shown before an item is selected or for items without a specific unit. */
const DEFAULT_UNIT_KEY = 'packValue.units.qty';

export interface PackItemFormValue {
  itemId: string;
  quantity: number | null;
}

@Component({
  selector: 'app-pack-item-row',
  imports: [
    FormField,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatButtonModule,
    MatIconModule,
    TranslateModule,
  ],
  templateUrl: './pack-item-row.component.html',
  styleUrl: './pack-item-row.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PackItemRowComponent {
  readonly itemField = input.required<FieldTree<PackItemFormValue>>();
  readonly catalog = input.required<readonly PackItem[]>();
  readonly index = input.required<number>();
  readonly removed = output<void>();

  protected readonly selectedItem: Signal<PackItem | undefined> = computed(() => {
    const itemId = this.itemField().itemId().value();
    return this.catalog().find(item => item.id === itemId);
  });

  protected readonly unitLabel: Signal<string> = computed(() => this.selectedItem()?.unitKey ?? DEFAULT_UNIT_KEY);
}
