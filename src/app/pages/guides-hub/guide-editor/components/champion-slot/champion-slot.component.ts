import { Component, input, output, ChangeDetectionStrategy } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { TranslateModule } from '@ngx-translate/core';
import { CdkDragHandle } from '@angular/cdk/drag-drop';
import type { ChampionSlotConfig } from '@shared/models';

@Component({
  selector: 'app-champion-slot',
  imports: [MatButtonModule, MatIconModule, MatTooltipModule, TranslateModule, CdkDragHandle],
  templateUrl: './champion-slot.component.html',
  styleUrl: './champion-slot.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ChampionSlotComponent {
  readonly config = input<ChampionSlotConfig | null>(null);
  readonly position = input.required<number>();

  readonly editSlot = output<void>();
  readonly clearSlot = output<void>();
}
