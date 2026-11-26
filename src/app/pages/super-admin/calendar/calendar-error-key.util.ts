import { MG_CAL_ERROR_KEYS } from '@app/core/services/calendar.service';
import type { MgCalErrorCode } from '@shared/models';

/**
 * i18n key to show for a calendar error: the precise `errors.reason.<reason>` key when the SQL
 * function supplied a `details.reason`, otherwise the generic key of the error code.
 * The prefix is a literal so `npm run i18n:check` finds the dynamic keys.
 */
export function resolveCalendarErrorKey(
  code: MgCalErrorCode | 'MG_CAL_UNKNOWN',
  details: Record<string, unknown> | null | undefined
): string {
  const reason = details?.['reason'];
  if (typeof reason === 'string' && reason.length > 0) {
    return 'superAdmin.calendar.errors.reason.' + reason;
  }
  return MG_CAL_ERROR_KEYS[code];
}
