import { Component, ChangeDetectionStrategy } from '@angular/core';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatDividerModule } from '@angular/material/divider';
import { TranslateModule } from '@ngx-translate/core';

interface GovernorSlot {
  rank: number;
  cost: number;
}

@Component({
  selector: 'app-mightiest-governor',
  imports: [MatCardModule, MatIconModule, MatDividerModule, TranslateModule],
  templateUrl: './mightiest-governor.component.html',
  styleUrl: './mightiest-governor.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MightiestGovernorComponent {
  readonly slots: GovernorSlot[] = [150, 145, 140, 135, 125, 120, 115, 110, 105, 100].map((cost, i) => ({
    rank: i + 1,
    cost,
  }));

  trackByRank(_: number, slot: GovernorSlot): number {
    return slot.rank;
  }
}
