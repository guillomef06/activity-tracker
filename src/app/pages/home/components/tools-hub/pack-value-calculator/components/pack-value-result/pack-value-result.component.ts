import { Component, ChangeDetectionStrategy, input, computed } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatDividerModule } from '@angular/material/divider';
import { MatIconModule } from '@angular/material/icon';
import { TranslateModule } from '@ngx-translate/core';
import { PackValueResult, TierDefinition } from '@shared/models/pack-value.model';

@Component({
  selector: 'app-pack-value-result',
  imports: [DecimalPipe, MatCardModule, MatDividerModule, MatIconModule, TranslateModule],
  templateUrl: './pack-value-result.component.html',
  styleUrl: './pack-value-result.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PackValueResultComponent {
  readonly result = input.required<PackValueResult>();
  readonly tiers = input.required<readonly TierDefinition[]>();

  readonly tierDef = computed(() => this.tiers().find(t => t.tier === this.result().tier)!);
}
