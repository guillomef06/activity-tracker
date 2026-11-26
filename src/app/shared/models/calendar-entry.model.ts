/**
 * Global calendar models (spec 003-mg-global-calendar, contracts/frontend-contract.md).
 *
 * Shared by CalendarService, mg-calendar.util.ts, the calendar page and the banner component.
 * Dates named `IsoDate` are UTC calendar days formatted YYYY-MM-DD.
 */
import type { MgEventStatus } from './mg-event.model';

/** UTC calendar day, formatted YYYY-MM-DD. */
// eslint-disable-next-line sonarjs/redundant-type-aliases -- documents the YYYY-MM-DD format at every use site
export type IsoDate = string;

export type CalendarEntryType = 'mg' | 'pvp';

/** Row of the calendar_entries table. */
export interface CalendarEntry {
  id: string;
  type: CalendarEntryType;
  /** Required for non-MG types, optional for `mg`. */
  title: string | null;
  starts_at: string;
  ends_at: string;
  all_day: boolean;
  cancelled_at: string | null;
  cancelled_by: string | null;
  created_at: string;
  created_by: string | null;
  updated_at: string;
  updated_by: string | null;
}

/** Event of a server linked to an entry, as embedded by PostgREST for the super-admin list. */
export interface CalendarEntryEventImpact {
  id: string;
  server_id: string;
  status: MgEventStatus;
  /** PostgREST aggregate: `[{ count: n }]`. */
  mg_registrations: { count: number }[];
}

/** Entry with the events generated for it (super-admin list only). */
export interface CalendarEntryWithImpact extends CalendarEntry {
  mg_events: CalendarEntryEventImpact[];
}

/** Minimal shape the pure utilities need; only `type === 'mg'` entries are considered. */
export type MgEntryLike = Pick<CalendarEntry, 'id' | 'type' | 'starts_at' | 'cancelled_at'>;

/** Payload to create / update a non-MG entry (direct write, `type <> 'mg'`). */
export interface OtherEntryInput {
  type: Exclude<CalendarEntryType, 'mg'>;
  title: string;
  starts_at: string;
  ends_at: string;
  all_day: boolean;
}

/** Dates derived from an opening Monday (D-7): opening, closing (D-4), start (D), end (D+6). */
export interface MgDerivedDates {
  opening: IsoDate;
  closing: IsoDate;
  start: IsoDate;
  end: IsoDate;
}

// ─── database function contract (client RPC) ──────────────────────────────

export type MgCalErrorCode =
  | 'MG_CAL_FORBIDDEN'
  | 'MG_CAL_INVALID_INPUT'
  | 'MG_CAL_NOT_FOUND'
  | 'MG_CAL_NOT_MONDAY'
  | 'MG_CAL_OPENING_PASSED'
  | 'MG_CAL_ALREADY_EXISTS'
  | 'MG_CAL_TOO_CLOSE'
  | 'MG_CAL_NOT_SHIFTABLE'
  | 'MG_CAL_NOT_CANCELLABLE';

export interface CalendarOperationError {
  code: MgCalErrorCode | 'MG_CAL_UNKNOWN';
  details: Record<string, unknown> | null;
}

export type CreateOutcome =
  'created' | 'already_exists' | 'rejected_not_monday' | 'rejected_opening_passed' | 'rejected_too_close';

export interface CreateEntryResult {
  opening_monday: IsoDate;
  mg_start: IsoDate;
  outcome: CreateOutcome;
  entry_id: string | null;
}

export interface ShiftedEntry {
  entry_id: string;
  old_start: IsoDate;
  new_start: IsoDate;
  events_updated: number;
}

// ─── banner contract ──────────────────────────────────────────────────────

export type MgBannerState =
  | { kind: 'none' }
  | { kind: 'superAdminLow'; futureCount: number }
  | { kind: 'serverAdminNone' }
  | { kind: 'playerNext'; mgStart: IsoDate; openingDate: IsoDate }
  | { kind: 'playerNotAnnounced' }
  | { kind: 'cancelled'; mgStart: IsoDate };

/** Derived lifecycle state of an entry, shown in the super-admin list. */
export type CalendarEntryState =
  'cancelled' | 'planned' | 'registration_open' | 'awaiting_start' | 'ongoing' | 'finished';
