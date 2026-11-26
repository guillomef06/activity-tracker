import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { TranslateModule } from '@ngx-translate/core';

import type { CalendarConfirmDialogData } from '../../calendar-page.models';

/** Confirmation before cancelling an MG or deleting a non-MG entry. Closes with `true` or `undefined`. */
@Component({
  selector: 'app-calendar-confirm-dialog',
  imports: [MatDialogModule, MatButtonModule, MatIconModule, TranslateModule],
  templateUrl: './calendar-confirm-dialog.component.html',
  styleUrl: './calendar-confirm-dialog.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CalendarConfirmDialogComponent {
  protected readonly data = inject<CalendarConfirmDialogData>(MAT_DIALOG_DATA);
  private readonly dialogRef = inject(MatDialogRef<CalendarConfirmDialogComponent, true>);

  protected readonly isCancel = this.data.variant === 'cancel';
  protected readonly hasEvents = this.isCancel && this.data.servers > 0;
  protected readonly counts = { servers: this.data.servers, registrations: this.data.registrations };

  protected readonly titleKey = this.isCancel
    ? 'superAdmin.calendar.dialog.cancelTitle'
    : 'superAdmin.calendar.dialog.deleteTitle';

  protected onConfirm(): void {
    this.dialogRef.close(true);
  }
}
