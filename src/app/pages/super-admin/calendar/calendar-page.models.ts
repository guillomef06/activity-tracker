/**
 * Interface contract between the super-admin calendar page (smart) and its dumb components /
 * dialogs (spec 003-mg-global-calendar, contracts/frontend-contract.md section 5).
 * Types only: every component codes against this file, nobody redefines these shapes.
 */
import type { CalendarEntryState, CalendarEntryType, IsoDate, MgEntryLike } from '@shared/models';

/**
 * One row of the list. Built in a `computed()` by the page (never in a template): all display
 * days are UTC calendar days (`YYYY-MM-DD`) so the `date` pipe shows them without time-zone shift.
 */
export interface CalendarRowVm {
  readonly id: string;
  readonly type: CalendarEntryType;
  /** Title of a non-MG entry; null for `mg` (the list shows the translated type label). */
  readonly title: string | null;
  /** Raw timestamptz as stored; used by the list only to show a time for timestamped entries. */
  readonly startsAt: string;
  readonly endsAt: string;
  /** First display day (UTC calendar day). */
  readonly startDay: IsoDate;
  /** Last display day, inclusive (for an MG: start + 6). */
  readonly endDay: IsoDate;
  readonly isAllDay: boolean;
  readonly state: CalendarEntryState;
  /** MG only: registration opening (D-7) and closing (D-4) days; null otherwise. */
  readonly openingDay: IsoDate | null;
  readonly closingDay: IsoDate | null;
  /** Opened MG entries only: number of servers with an event and total registrations (else 0). */
  readonly servers: number;
  readonly registrations: number;
  readonly canShift: boolean;
  readonly canCancel: boolean;
  readonly canEdit: boolean;
  readonly canDelete: boolean;
}

/** `CalendarConfirmDialogComponent` (MAT_DIALOG_DATA). Closes with `true` when confirmed, else `undefined`. */
export interface CalendarConfirmDialogData {
  readonly variant: 'cancel' | 'delete';
  /** Display day of the MG start (for `cancel`) or the title / start day (for `delete`). */
  readonly label: string;
  /** `cancel` only: events already generated for the entry (0 = nothing to lose). */
  readonly servers: number;
  readonly registrations: number;
}

/** `MgShiftDialogComponent` (MAT_DIALOG_DATA). Closes with the new opening Monday (IsoDate) or `undefined`. */
export interface MgShiftDialogData {
  readonly entries: readonly MgEntryLike[];
  readonly selectedId: string;
  /** UTC calendar day of "today" (injected by the page so the dialog stays testable). */
  readonly today: IsoDate;
  /** Servers / registrations of the selected entry when it is already open (0 otherwise). */
  readonly servers: number;
  readonly registrations: number;
}
