import { Component, ChangeDetectionStrategy, input, output } from '@angular/core';
import { FormGroup, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { TranslateModule } from '@ngx-translate/core';
import { PackItem } from '@shared/models/pack-value.model';

@Component({
  selector: 'app-pack-item-row',
  imports: [
    ReactiveFormsModule,
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
  readonly formGroup = input.required<FormGroup>();
  readonly catalog = input.required<readonly PackItem[]>();
  readonly index = input.required<number>();
  readonly removed = output<void>();

  get selectedItem(): PackItem | undefined {
    const itemId = this.formGroup().get('itemId')?.value as string | undefined;
    return this.catalog().find(item => item.id === itemId);
  }

  get unitLabel(): string {
    return this.selectedItem?.unitKey ?? 'packValue.units.qty';
  }
}
