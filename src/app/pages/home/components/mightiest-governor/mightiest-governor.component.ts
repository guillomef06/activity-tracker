import { Component, ChangeDetectionStrategy } from '@angular/core';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatDividerModule } from '@angular/material/divider';
import { TranslateModule } from '@ngx-translate/core';

interface GovernorSlot {
  rank: number;
  cost: number;
  weeklyTarget: number; // in millions
}

const SLOTS_DATA: [number, number][] = [
  [150, 20],
  [145, 19],
  [140, 18],
  [135, 17],
  [125, 16],
  [120, 14],
  [115, 14],
  [110, 10],
  [105, 10],
  [100, 10],
];

@Component({
  selector: 'app-mightiest-governor',
  imports: [MatCardModule, MatIconModule, MatDividerModule, TranslateModule],
  templateUrl: './mightiest-governor.component.html',
  styleUrl: './mightiest-governor.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MightiestGovernorComponent {
  readonly slots: GovernorSlot[] = SLOTS_DATA.map(([cost, weeklyTarget], i) => ({
    rank: i + 1,
    cost,
    weeklyTarget,
  }));

  trackByRank(_: number, slot: GovernorSlot): number {
    return slot.rank;
  }
}
