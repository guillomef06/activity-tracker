import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDatepickerInputEvent, MatDatepickerModule } from '@angular/material/datepicker';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { TranslateModule } from '@ngx-translate/core';

import type { IsoDate } from '@shared/models';
import {
  computeShiftPreview,
  isLocalMonday,
  reanchorToUtcMidnight,
  toIsoDate,
  type MovedEntry,
} from '@shared/utils/mg-calendar.util';
import { resolveCalendarErrorKey } from '../../calendar-error-key.util';
import type { MgShiftDialogData } from '../../calendar-page.models';

interface ShiftPreviewVm {
  readonly ok: boolean;
  readonly moved: readonly MovedEntry[];
  readonly errorKey: string | null;
}

const NO_PREVIEW: ShiftPreviewVm = { ok: false, moved: [], errorKey: null };

/** Picks the new opening Monday of an MG and previews every entry that moves with it. */
@Component({
  selector: 'app-mg-shift-dialog',
  imports: [
    DatePipe,
    MatButtonModule,
    MatDatepickerModule,
    MatDialogModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    TranslateModule,
  ],
  templateUrl: './mg-shift-dialog.component.html',
  styleUrl: './mg-shift-dialog.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MgShiftDialogComponent {
  private readonly data = inject<MgShiftDialogData>(MAT_DIALOG_DATA);
  private readonly dialogRef = inject(MatDialogRef<MgShiftDialogComponent, IsoDate>);

  protected readonly mondayFilter = isLocalMonday;
  protected readonly hasEvents = this.data.servers > 0;
  protected readonly counts = { servers: this.data.servers, registrations: this.data.registrations };

  protected readonly picked = signal<Date | null>(null);
  private readonly newOpeningMonday = computed<IsoDate | null>(() => {
    const date = this.picked();
    return date ? toIsoDate(reanchorToUtcMidnight(date)) : null;
  });

  protected readonly preview = computed<ShiftPreviewVm>(() => {
    const opening = this.newOpeningMonday();
    if (opening === null) return NO_PREVIEW;
    const result = computeShiftPreview(this.data.entries, this.data.selectedId, opening, this.data.today);
    if (result.ok) return { ok: true, moved: result.moved, errorKey: null };
    return { ok: false, moved: [], errorKey: resolveCalendarErrorKey(result.reason, result.details) };
  });

  protected onDateChange(event: MatDatepickerInputEvent<Date>): void {
    this.picked.set(event.value);
  }

  protected onConfirm(): void {
    const opening = this.newOpeningMonday();
    if (opening !== null && this.preview().ok) this.dialogRef.close(opening);
  }
}
