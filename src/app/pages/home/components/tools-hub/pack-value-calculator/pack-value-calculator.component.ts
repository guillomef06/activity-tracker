import { Component, ChangeDetectionStrategy, signal, inject } from '@angular/core';
import { FormArray, FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { TranslateModule } from '@ngx-translate/core';
import { PACK_ITEM_CATALOG, PACK_VALUE_TIERS } from '@shared/constants/pack-item-catalog.constant';
import { PackItem, PackValueResult } from '@shared/models/pack-value.model';
import { calculatePackValue } from '@shared/utils/pack-value.util';
import { PackItemRowComponent } from './components/pack-item-row/pack-item-row.component';
import { PackValueResultComponent } from './components/pack-value-result/pack-value-result.component';

@Component({
  selector: 'app-pack-value-calculator',
  imports: [
    ReactiveFormsModule,
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
  private readonly fb = inject(FormBuilder);

  readonly catalog = signal(PACK_ITEM_CATALOG);
  readonly tiers = PACK_VALUE_TIERS;
  readonly result = signal<PackValueResult | null>(null);

  readonly form = this.fb.group({
    items: this.fb.array<FormGroup>([]),
    price: this.fb.control<number | null>(null, [Validators.required, Validators.min(1)]),
  });

  get itemsArray(): FormArray {
    return this.form.get('items') as FormArray;
  }

  get isFormValid(): boolean {
    return this.form.valid && this.itemsArray.length > 0;
  }

  addItem(): void {
    const row = this.fb.group({
      itemId: this.fb.control<string>('', Validators.required),
      quantity: this.fb.control<number | null>(null, [Validators.required, Validators.min(1)]),
    });
    this.itemsArray.push(row);
  }

  removeItem(index: number): void {
    this.itemsArray.removeAt(index);
  }

  calculate(): void {
    if (!this.isFormValid) {
      this.form.markAllAsTouched();
      return;
    }

    const rawValue = this.form.getRawValue();
    const entries = (rawValue.items as { itemId: string; quantity: number }[]).map(row => ({
      itemId: row.itemId,
      quantity: row.quantity,
    }));

    this.result.set(calculatePackValue(entries, rawValue.price!, this.catalog()));
  }

  reset(): void {
    this.form.reset();
    this.itemsArray.clear();
    this.result.set(null);
  }

  getItemForRow(index: number): PackItem | undefined {
    const itemId = this.itemsArray.at(index)?.get('itemId')?.value as string | undefined;
    return this.catalog().find(item => item.id === itemId);
  }
}
