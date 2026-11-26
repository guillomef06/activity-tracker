/**
 * Global MG calendar constants (spec 003-mg-global-calendar).
 * Single source of the thresholds, caps and status inclusion lists: never inline them.
 */
import type { MgEventStatus } from '../models/mg-event.model';

/** Banner (a): the super admin is alerted when fewer future MG entries than this remain. */
export const MG_CALENDAR_MIN_FUTURE_ENTRIES = 2;

/** "Duplicate over n weeks" assistant: n must be even, within [MIN, MAX]. */
export const MG_CALENDAR_MIN_SERIES_WEEKS = 2;
export const MG_CALENDAR_MAX_SERIES_WEEKS = 26;

/** Maximum number of opening Mondays accepted by create_mg_calendar_entries in one call. */
export const MG_CALENDAR_MAX_BATCH = 13;

/** Two non-cancelled MG starts must be at least this many days apart (FR-004a). */
export const MG_CALENDAR_MIN_GAP_DAYS = 14;

/** Route of the super-admin calendar page (target of the "low calendar" banner). */
export const MG_CALENDAR_ROUTE = '/app/super-admin/calendar';

/**
 * Statuses an event can have before it is over, listed explicitly (inclusion list).
 * A `.neq('status', 'cancelled')` filter would make PostgREST fail while the enum label does not
 * exist yet (frontend released before the migration), so queries use these lists instead.
 */
export const MG_ACTIVE_STATUSES: readonly MgEventStatus[] = [
  'upcoming',
  'registration_open',
  'registration_closed',
  'selection_published',
  'ongoing',
];

/** Every status except `cancelled` (finished included): used by the DKP spends query. */
export const MG_NON_CANCELLED_STATUSES: readonly MgEventStatus[] = [...MG_ACTIVE_STATUSES, 'finished'];
