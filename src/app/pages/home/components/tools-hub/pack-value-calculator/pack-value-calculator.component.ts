import { Component, ChangeDetectionStrategy, signal, computed, Signal } from '@angular/core';
import { form, applyEach, required, min, FormField } from '@angular/forms/signals';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { TranslateModule } from '@ngx-translate/core';
import { PACK_ITEM_CATALOG, PACK_VALUE_TIERS } from '@shared/constants/pack-item-catalog.constant';
import { PackItem, PackItemEntry, PackValueResult } from '@shared/models/pack-value.model';
import { calculatePackValue } from '@shared/utils/pack-value.util';
import { getFieldErrorKey } from '@shared/utils/form-validation.utils';
import { PackItemRowComponent, PackItemFormValue } from './components/pack-item-row/pack-item-row.component';
import { PackValueResultComponent } from './components/pack-value-result/pack-value-result.component';

const MIN_QUANTITY = 1;
const MIN_PRICE = 1;

interface PackValueFormValue {
  items: PackItemFormValue[];
  price: number | null;
}

const INITIAL_FORM_VALUE: PackValueFormValue = { items: [], price: null };

@Component({
  selector: 'app-pack-value-calculator',
  imports: [
    FormField,
    MatCardModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatIconModule,
    TranslateModule,
    PackItemRowComponent,
    PackValueResultComponent,
  ],
  templateUrl: './pack-value-calculator.component.html',
  styleUrl: './pack-value-calculator.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PackValueCalculatorComponent {
  readonly catalog = signal<readonly PackItem[]>(PACK_ITEM_CATALOG);
  readonly tiers = PACK_VALUE_TIERS;
  readonly result = signal<PackValueResult | null>(null);

  protected readonly formModel = signal<PackValueFormValue>({ ...INITIAL_FORM_VALUE, items: [] });

  protected readonly packValueForm = form(this.formModel, schemaPath => {
    applyEach(schemaPath.items, item => {
      required(item.itemId);
      required(item.quantity);
      min(item.quantity, MIN_QUANTITY);
    });
    required(schemaPath.price);
    min(schemaPath.price, MIN_PRICE);
  });

  protected readonly hasNoItems: Signal<boolean> = computed(() => this.formModel().items.length === 0);

  protected readonly isFormValid: Signal<boolean> = computed(() => this.packValueForm().valid() && !this.hasNoItems());

  protected readonly priceErrorKey: Signal<string> = computed(() =>
    getFieldErrorKey(this.packValueForm.price().errors())
  );

  protected addItem(): void {
    this.formModel.update(current => ({
      ...current,
      items: [...current.items, { itemId: '', quantity: null }],
    }));
  }

  protected removeItem(index: number): void {
    this.formModel.update(current => ({
      ...current,
      items: current.items.filter((_, i) => i !== index),
    }));
  }

  protected onSubmit(event: Event): void {
    event.preventDefault();
    this.calculate();
  }

  protected calculate(): void {
    if (!this.isFormValid()) {
      this.packValueForm().markAsTouched();
      return;
    }

    const { items, price } = this.formModel();
    const entries: PackItemEntry[] = items.map(({ itemId, quantity }) => ({
      itemId,
      quantity: quantity ?? MIN_QUANTITY,
    }));

    this.result.set(calculatePackValue(entries, price ?? MIN_PRICE, this.catalog()));
  }

  protected reset(): void {
    this.packValueForm().reset({ ...INITIAL_FORM_VALUE, items: [] });
    this.result.set(null);
  }
}
