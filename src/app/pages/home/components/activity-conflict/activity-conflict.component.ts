import { Component, ChangeDetectionStrategy, input, output } from '@angular/core';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { TranslateModule } from '@ngx-translate/core';
import { PositionConflict } from '@shared/models';

@Component({
  selector: 'app-activity-conflict',
  imports: [MatCardModule, MatButtonModule, MatIconModule, TranslateModule],
  templateUrl: './activity-conflict.component.html',
  styleUrl: './activity-conflict.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ActivityConflictComponent {
  readonly conflicts = input.required<PositionConflict[]>();
  readonly acknowledged = output<void>();

  protected onAcknowledge(): void {
    this.acknowledged.emit();
  }
}
