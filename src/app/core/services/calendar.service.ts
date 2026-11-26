import { Injectable, inject } from '@angular/core';
import { SupabaseService } from './supabase.service';
import type {
  CalendarEntry,
  CalendarEntryWithImpact,
  CalendarOperationError,
  CreateEntryResult,
  IsoDate,
  MgCalErrorCode,
  OtherEntryInput,
  ShiftedEntry,
} from '@shared/models';

/** Literal i18n keys (kept as literals so `npm run i18n:check` can find them). */
export const MG_CAL_ERROR_KEYS: Record<MgCalErrorCode | 'MG_CAL_UNKNOWN', string> = {
  MG_CAL_FORBIDDEN: 'superAdmin.calendar.errors.forbidden',
  MG_CAL_INVALID_INPUT: 'superAdmin.calendar.errors.invalidInput',
  MG_CAL_NOT_FOUND: 'superAdmin.calendar.errors.notFound',
  MG_CAL_NOT_MONDAY: 'superAdmin.calendar.errors.notMonday',
  MG_CAL_OPENING_PASSED: 'superAdmin.calendar.errors.openingPassed',
  MG_CAL_ALREADY_EXISTS: 'superAdmin.calendar.errors.alreadyExists',
  MG_CAL_TOO_CLOSE: 'superAdmin.calendar.errors.tooClose',
  MG_CAL_NOT_SHIFTABLE: 'superAdmin.calendar.errors.notShiftable',
  MG_CAL_NOT_CANCELLABLE: 'superAdmin.calendar.errors.notCancellable',
  MG_CAL_UNKNOWN: 'superAdmin.calendar.errors.unknown',
};

const MG_CAL_CODE_PREFIX = 'MG_CAL_';
const CALENDAR_ENTRIES_TABLE = 'calendar_entries';
const IMPACT_SELECT = '*, mg_events(id, server_id, status, mg_registrations(count))';

interface RpcError {
  message?: string;
  details?: string | null;
}

function parseDetails(details: string | null | undefined): Record<string, unknown> | null {
  if (!details) return null;
  try {
    const parsed: unknown = JSON.parse(details);
    return parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function isKnownCode(message: string | undefined): message is MgCalErrorCode {
  return !!message && message.startsWith(MG_CAL_CODE_PREFIX) && message in MG_CAL_ERROR_KEYS;
}

/** Maps a Supabase/PostgREST error raised by a calendar function to a typed error. */
export function toCalendarOperationError(error: RpcError): CalendarOperationError {
  if (isKnownCode(error.message)) {
    return { code: error.message, details: parseDetails(error.details) };
  }
  console.error('Unexpected calendar error:', error);
  return { code: 'MG_CAL_UNKNOWN', details: null };
}

/**
 * Promise-based on purpose: consumers wrap the loaders in `resource()`; there is no
 * genuine event stream here, so `rxResource` would add nothing.
 */
@Injectable({
  providedIn: 'root',
})
export class CalendarService {
  private readonly supabase = inject(SupabaseService);

  async loadEntries(): Promise<CalendarEntry[]> {
    const { data, error } = await this.supabase
      .from(CALENDAR_ENTRIES_TABLE)
      .select('*')
      .order('starts_at', { ascending: true });
    if (error) throw error;
    return (data ?? []) as CalendarEntry[];
  }

  async loadEntriesWithImpact(): Promise<CalendarEntryWithImpact[]> {
    const { data, error } = await this.supabase
      .from(CALENDAR_ENTRIES_TABLE)
      .select(IMPACT_SELECT)
      .order('starts_at', { ascending: true });
    if (error) throw error;
    return (data ?? []) as unknown as CalendarEntryWithImpact[];
  }

  async createMgEntries(
    openingMondays: IsoDate[]
  ): Promise<{ results: CreateEntryResult[]; error: CalendarOperationError | null }> {
    const { data, error } = await this.supabase.rpc('create_mg_calendar_entries', {
      p_opening_mondays: openingMondays,
    });
    if (error) return { results: [], error: toCalendarOperationError(error) };
    return { results: (data ?? []) as CreateEntryResult[], error: null };
  }

  async shiftMgEntry(
    entryId: string,
    newOpeningMonday: IsoDate
  ): Promise<{ moved: ShiftedEntry[]; error: CalendarOperationError | null }> {
    const { data, error } = await this.supabase.rpc('shift_mg_calendar_entry', {
      p_entry_id: entryId,
      p_new_opening_monday: newOpeningMonday,
    });
    if (error) return { moved: [], error: toCalendarOperationError(error) };
    return { moved: (data ?? []) as ShiftedEntry[], error: null };
  }

  async cancelMgEntry(
    entryId: string
  ): Promise<{ outcome: 'deleted' | 'cancelled' | null; error: CalendarOperationError | null }> {
    const { data, error } = await this.supabase.rpc('cancel_mg_calendar_entry', { p_entry_id: entryId });
    if (error) return { outcome: null, error: toCalendarOperationError(error) };
    return { outcome: data as 'deleted' | 'cancelled', error: null };
  }

  async createOtherEntry(input: OtherEntryInput): Promise<{ error: unknown }> {
    const { error } = await this.supabase.from(CALENDAR_ENTRIES_TABLE).insert(input);
    return { error };
  }

  async updateOtherEntry(id: string, input: OtherEntryInput): Promise<{ error: unknown }> {
    const { error } = await this.supabase.from(CALENDAR_ENTRIES_TABLE).update(input).eq('id', id).neq('type', 'mg');
    return { error };
  }

  async deleteOtherEntry(id: string): Promise<{ error: unknown }> {
    const { error } = await this.supabase.from(CALENDAR_ENTRIES_TABLE).delete().eq('id', id).neq('type', 'mg');
    return { error };
  }
}
