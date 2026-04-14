import { Component, input, ChangeDetectionStrategy } from '@angular/core';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { TranslateModule } from '@ngx-translate/core';
import type { GuideChampion } from '@shared/models';

@Component({
  selector: 'app-guide-champion-card',
  imports: [MatCardModule, MatIconModule, TranslateModule],
  templateUrl: './guide-champion-card.component.html',
  styleUrl: './guide-champion-card.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GuideChampionCardComponent {
  readonly champion = input.required<GuideChampion>();
}
