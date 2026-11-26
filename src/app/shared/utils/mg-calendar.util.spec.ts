import type { MgEntryLike } from '@shared/models/calendar-entry.model';
import type { MgEvent } from '@shared/models/mg-event.model';
import {
  addDays,
  buildMgSeries,
  classifyMgDates,
  computeShiftPreview,
  deriveEntryState,
  deriveMgDates,
  isCreationWindowOpen,
  isLocalMonday,
  isMonday,
  reanchorToUtcMidnight,
  resolveCancellationNotice,
  resolvePlayerBanner,
  resolveServerAdminBanner,
  resolveSuperAdminBanner,
  toIsoDate,
  validateSeriesWeeks,
} from './mg-calendar.util';

const TODAY = '2026-11-25';
const NOW = new Date('2026-11-25T12:00:00Z');

function entry(start: string, cancelled = false, id = `id-${start}`): MgEntryLike {
  return {
    id,
    type: 'mg',
    starts_at: `${start}T00:00:00+00:00`,
    cancelled_at: cancelled ? '2026-11-01T10:00:00+00:00' : null,
  };
}

function cancelledEvent(startDate: string, endDate: string): MgEvent {
  return {
    id: 'ev-1',
    server_id: 'srv-1',
    start_date: startDate,
    end_date: endDate,
    registration_open_at: addDays(startDate, -7),
    registration_close_at: addDays(startDate, -4),
    status: 'cancelled',
    selection_published_at: null,
    created_at: '2026-11-01T00:00:00Z',
    calendar_entry_id: null,
  };
}

/** Builds a picker value from local calendar fields, whatever the runner's time zone. */
function pickerAt(offsetHours: number, year: number, month: number, day: number): Date {
  // Local midnight of that day under the simulated zone: its UTC instant is shifted by -offset.
  const localMidnightUtcInstant = new Date(Date.UTC(year, month, day) - offsetHours * 3_600_000);
  return Object.assign(localMidnightUtcInstant, {
    getFullYear: () => year,
    getMonth: () => month,
    getDate: () => day,
  });
}

describe('mg-calendar.util', () => {
  describe('date primitives', () => {
    it('should add days across month and year boundaries', () => {
      expect(addDays('2026-12-30', 3)).toBe('2027-01-02');
      expect(addDays('2027-03-01', -1)).toBe('2027-02-28');
    });

    it('should recognise Mondays in UTC', () => {
      expect(isMonday('2026-11-30')).toBe(true);
      expect(isMonday('2026-12-01')).toBe(false);
    });

    it('should format a UTC date as YYYY-MM-DD', () => {
      expect(toIsoDate(new Date('2026-12-07T23:59:59Z'))).toBe('2026-12-07');
    });
  });

  describe('reanchorToUtcMidnight', () => {
    it.each([
      ['UTC-8', -8],
      ['UTC+10', 10],
      ['UTC', 0],
    ])('should keep the picked calendar day under %s', (_label, offset) => {
      const picked = pickerAt(offset, 2027, 4, 31);

      const result = reanchorToUtcMidnight(picked);

      expect(toIsoDate(result)).toBe('2027-05-31');
      expect(result.getUTCHours()).toBe(0);
    });

    it('should work with a real local Date', () => {
      const result = reanchorToUtcMidnight(new Date(2027, 4, 31));

      expect(toIsoDate(result)).toBe('2027-05-31');
    });
  });

  describe('isLocalMonday', () => {
    it('should accept a local Monday and refuse other days and null', () => {
      expect(isLocalMonday(new Date(2027, 4, 31))).toBe(true);
      expect(isLocalMonday(new Date(2027, 5, 1))).toBe(false);
      expect(isLocalMonday(null)).toBe(false);
    });
  });

  describe('deriveMgDates', () => {
    it('should derive closing, start and end from the spec example', () => {
      expect(deriveMgDates('2027-05-31')).toEqual({
        opening: '2027-05-31',
        closing: '2027-06-03',
        start: '2027-06-07',
        end: '2027-06-13',
      });
    });

    it('should derive the first seeded MG', () => {
      expect(deriveMgDates('2026-11-30')).toEqual({
        opening: '2026-11-30',
        closing: '2026-12-03',
        start: '2026-12-07',
        end: '2026-12-13',
      });
    });
  });

  describe('validateSeriesWeeks', () => {
    it.each([
      [2, 'ok'],
      [26, 'ok'],
      [3, 'not_even'],
      [27, 'not_even'],
      [2.5, 'not_even'],
      [0, 'out_of_range'],
      [28, 'out_of_range'],
      [-2, 'out_of_range'],
    ])('should return the verdict for %s weeks', (weeks, expected) => {
      expect(validateSeriesWeeks(weeks)).toBe(expected);
    });
  });

  describe('buildMgSeries', () => {
    it('should build a single MG when weeks is null', () => {
      expect(buildMgSeries('2026-11-30', null)).toEqual([deriveMgDates('2026-11-30')]);
    });

    it.each([
      [2, 1],
      [4, 2],
      [12, 6],
      [26, 13],
    ])('should build %s weeks as %s MG', (weeks, count) => {
      expect(buildMgSeries('2026-11-30', weeks)).toHaveLength(count);
    });

    it('should step by 14 days', () => {
      const series = buildMgSeries('2026-11-30', 6);

      expect(series.map(dates => dates.opening)).toEqual(['2026-11-30', '2026-12-14', '2026-12-28']);
      expect(series.map(dates => dates.start)).toEqual(['2026-12-07', '2026-12-21', '2027-01-04']);
    });

    it.each([3, 0, 28, -4])('should return no candidate for invalid weeks %s', weeks => {
      expect(buildMgSeries('2026-11-30', weeks)).toEqual([]);
    });
  });

  describe('classifyMgDates', () => {
    const outcomes = (opening: string[], existing: MgEntryLike[]): string[] =>
      classifyMgDates(opening.map(deriveMgDates), existing, TODAY).map(row => row.outcome);

    it('should create every date of a free series', () => {
      expect(outcomes(['2026-11-30', '2026-12-14'], [])).toEqual(['created', 'created']);
    });

    it('should reject a date that is not a Monday', () => {
      expect(outcomes(['2026-12-01'], [])).toEqual(['rejected_not_monday']);
    });

    it('should report already_exists before opening_passed', () => {
      expect(outcomes(['2026-11-23'], [entry('2026-11-30')])).toEqual(['already_exists']);
    });

    it('should report already_exists for a kept cancelled entry', () => {
      expect(outcomes(['2026-11-30'], [entry('2026-12-07', true)])).toEqual(['already_exists']);
    });

    it('should report opening_passed before too_close', () => {
      expect(outcomes(['2026-11-23'], [entry('2026-12-07')])).toEqual(['rejected_opening_passed']);
    });

    it('should refuse an opening that is today', () => {
      expect(outcomes([TODAY], [])).toEqual(['rejected_not_monday']);
      expect(outcomes(['2026-11-23'], [])).toEqual(['rejected_opening_passed']);
    });

    it('should reject a start closer than 14 days to an active entry', () => {
      expect(outcomes(['2026-12-07'], [entry('2026-12-07')])).toEqual(['rejected_too_close']);
    });

    it('should not count a cancelled entry for too_close', () => {
      expect(outcomes(['2026-12-07'], [entry('2026-12-07', true)])).toEqual(['created']);
    });

    it('should let a created candidate make the next one too_close, in ascending order', () => {
      const result = outcomes(['2026-12-14', '2026-12-07', '2026-11-30'], []);

      expect(result).toEqual(['created', 'rejected_too_close', 'created']);
    });

    it('should return candidates sorted by date', () => {
      const rows = classifyMgDates(['2026-12-14', '2026-11-30'].map(deriveMgDates), [], TODAY);

      expect(rows.map(row => row.dates.opening)).toEqual(['2026-11-30', '2026-12-14']);
    });

    it('should ignore non-MG entries', () => {
      const pvp: MgEntryLike = { ...entry('2026-12-07'), type: 'pvp' };

      expect(outcomes(['2026-11-30'], [pvp])).toEqual(['created']);
    });
  });

  describe('deriveEntryState', () => {
    const mg = entry('2026-12-07');

    it.each([
      ['2026-11-29', 'planned'],
      ['2026-11-30', 'registration_open'],
      ['2026-12-03', 'registration_open'],
      ['2026-12-04', 'awaiting_start'],
      ['2026-12-06', 'awaiting_start'],
      ['2026-12-07', 'ongoing'],
      ['2026-12-13', 'ongoing'],
      ['2026-12-14', 'finished'],
    ])('should be %s -> %s', (today, expected) => {
      expect(deriveEntryState(mg, today)).toBe(expected);
    });

    it('should be cancelled whatever the date', () => {
      expect(deriveEntryState(entry('2026-12-07', true), '2026-12-05')).toBe('cancelled');
    });
  });

  describe('computeShiftPreview', () => {
    const calendar = [entry('2026-12-07'), entry('2026-12-21'), entry('2027-01-04')];

    it('should move the selected entry and every following one by the same offset', () => {
      const result = computeShiftPreview(calendar, 'id-2026-12-07', '2026-12-07', TODAY);

      expect(result).toEqual({
        ok: true,
        moved: [
          { id: 'id-2026-12-07', oldStart: '2026-12-07', newStart: '2026-12-14' },
          { id: 'id-2026-12-21', oldStart: '2026-12-21', newStart: '2026-12-28' },
          { id: 'id-2027-01-04', oldStart: '2027-01-04', newStart: '2027-01-11' },
        ],
      });
    });

    it('should leave earlier entries and cancelled followers out of the cascade', () => {
      const entries = [entry('2026-12-07'), entry('2026-12-21'), entry('2027-01-04', true)];

      const result = computeShiftPreview(entries, 'id-2026-12-21', '2026-12-21', TODAY);

      expect(result).toEqual({
        ok: true,
        moved: [{ id: 'id-2026-12-21', oldStart: '2026-12-21', newStart: '2026-12-28' }],
      });
    });

    it('should refuse a date already held by a kept cancelled entry', () => {
      const entries = [entry('2026-12-07'), entry('2026-12-14', true)];

      const result = computeShiftPreview(entries, 'id-2026-12-07', '2026-12-07', TODAY);

      expect(result).toEqual({
        ok: false,
        reason: 'MG_CAL_ALREADY_EXISTS',
        details: { entry_id: 'id-2026-12-07', date: '2026-12-14' },
      });
    });

    it('should refuse a move closer than 14 days to an entry that does not move', () => {
      const result = computeShiftPreview(calendar, 'id-2026-12-21', '2026-12-07', TODAY);

      expect(result).toEqual({
        ok: false,
        reason: 'MG_CAL_TOO_CLOSE',
        details: {
          entry_id: 'id-2026-12-21',
          date: '2026-12-14',
          other_entry_id: 'id-2026-12-07',
          other_date: '2026-12-07',
        },
      });
    });

    it('should ignore a cancelled stationary entry for the spacing rule', () => {
      const entries = [entry('2026-12-07', true), entry('2026-12-21')];

      const result = computeShiftPreview(entries, 'id-2026-12-21', '2026-12-07', TODAY);

      expect(result.ok).toBe(true);
    });

    it('should refuse an opening that would be in the past for an unopened entry', () => {
      const result = computeShiftPreview(calendar, 'id-2026-12-07', '2026-11-23', TODAY);

      expect(result).toEqual({
        ok: false,
        reason: 'MG_CAL_OPENING_PASSED',
        details: { entry_id: 'id-2026-12-07', opening: '2026-11-23' },
      });
    });

    it('should only allow postponing an opened entry', () => {
      const opened = '2026-12-02';

      expect(computeShiftPreview(calendar, 'id-2026-12-07', '2026-11-23', opened)).toEqual({
        ok: false,
        reason: 'MG_CAL_NOT_SHIFTABLE',
        details: { reason: 'must_move_later' },
      });
      expect(computeShiftPreview(calendar, 'id-2026-12-07', '2026-12-07', opened).ok).toBe(true);
    });

    it('should refuse a read-only entry', () => {
      const result = computeShiftPreview(calendar, 'id-2026-12-07', '2026-12-14', '2026-12-07');

      expect(result).toEqual({ ok: false, reason: 'MG_CAL_NOT_SHIFTABLE', details: { reason: 'read_only' } });
    });

    it('should refuse a cancelled entry', () => {
      const result = computeShiftPreview([entry('2026-12-07', true)], 'id-2026-12-07', '2026-12-14', TODAY);

      expect(result).toEqual({ ok: false, reason: 'MG_CAL_NOT_SHIFTABLE', details: { reason: 'cancelled' } });
    });

    it('should refuse a target that is not a Monday', () => {
      const result = computeShiftPreview(calendar, 'id-2026-12-07', '2026-12-08', TODAY);

      expect(result).toMatchObject({ ok: false, reason: 'MG_CAL_NOT_MONDAY' });
    });

    it('should refuse a zero offset', () => {
      const result = computeShiftPreview(calendar, 'id-2026-12-07', '2026-11-30', TODAY);

      expect(result).toEqual({ ok: false, reason: 'MG_CAL_INVALID_INPUT', details: { reason: 'zero_offset' } });
    });

    it('should report an unknown entry', () => {
      const result = computeShiftPreview(calendar, 'missing', '2026-12-07', TODAY);

      expect(result).toMatchObject({ ok: false, reason: 'MG_CAL_NOT_FOUND' });
    });
  });

  describe('isCreationWindowOpen', () => {
    const mg = entry('2026-12-07');

    it.each([
      ['2026-11-29T23:59:59Z', false],
      ['2026-11-30T00:00:00Z', true],
      ['2026-12-03T23:57:59Z', true],
      ['2026-12-03T23:58:59Z', true],
      ['2026-12-03T23:59:00Z', false],
      ['2026-12-05T10:00:00Z', false],
    ])('should be %s -> %s', (now, expected) => {
      expect(isCreationWindowOpen(mg, new Date(now))).toBe(expected);
    });
  });

  describe('resolveSuperAdminBanner', () => {
    it('should alert with 0 future entries', () => {
      expect(resolveSuperAdminBanner([], NOW)).toEqual({ kind: 'superAdminLow', futureCount: 0 });
    });

    it('should alert with 1 future entry', () => {
      expect(resolveSuperAdminBanner([entry('2026-12-07')], NOW)).toEqual({ kind: 'superAdminLow', futureCount: 1 });
    });

    it('should stay hidden with 2 future entries', () => {
      expect(resolveSuperAdminBanner([entry('2026-12-07'), entry('2026-12-21')], NOW)).toEqual({ kind: 'none' });
    });

    it('should not count cancelled, ongoing or non-MG entries', () => {
      const entries = [
        entry('2026-12-07'),
        entry('2026-12-21', true),
        entry('2026-11-23'),
        { ...entry('2027-01-04'), type: 'pvp' as const },
      ];

      expect(resolveSuperAdminBanner(entries, NOW)).toEqual({ kind: 'superAdminLow', futureCount: 1 });
    });

    it('should not count an entry starting today at midnight when now is later', () => {
      expect(resolveSuperAdminBanner([entry(TODAY)], NOW)).toEqual({ kind: 'superAdminLow', futureCount: 0 });
    });
  });

  describe('resolveServerAdminBanner', () => {
    const future = [entry('2026-12-07')];

    it.each([
      [true, false, [] as MgEntryLike[], 'serverAdminNone'],
      [true, false, future, 'none'],
      [true, true, [] as MgEntryLike[], 'none'],
      [false, false, [] as MgEntryLike[], 'none'],
      [false, true, future, 'none'],
      [true, false, [entry('2026-12-07', true), entry('2026-11-23')], 'serverAdminNone'],
    ])('should map config=%s event=%s to %s', (hasConfig, hasCurrentEvent, entries, kind) => {
      const state = resolveServerAdminBanner({ hasConfig, hasCurrentEvent, entries, now: NOW });

      expect(state.kind).toBe(kind);
    });
  });

  describe('resolvePlayerBanner', () => {
    it('should be hidden without config', () => {
      expect(resolvePlayerBanner({ hasConfig: false, entries: [entry('2026-12-07')], now: NOW })).toEqual({
        kind: 'none',
      });
    });

    it('should announce the nearest entry whose opening is after today', () => {
      const entries = [entry('2026-12-21'), entry('2026-12-07'), entry('2026-11-30')];

      const state = resolvePlayerBanner({ hasConfig: true, entries, now: NOW });

      expect(state).toEqual({ kind: 'playerNext', mgStart: '2026-12-07', openingDate: '2026-11-30' });
    });

    it('should skip cancelled entries', () => {
      const entries = [entry('2026-12-07', true), entry('2026-12-21')];

      const state = resolvePlayerBanner({ hasConfig: true, entries, now: NOW });

      expect(state).toMatchObject({ kind: 'playerNext', mgStart: '2026-12-21' });
    });

    it('should say not announced when nothing is upcoming', () => {
      expect(resolvePlayerBanner({ hasConfig: true, entries: [], now: NOW })).toEqual({ kind: 'playerNotAnnounced' });
    });

    it('should say not announced when the only entry has its opening today', () => {
      const entries = [entry('2026-12-02')];

      expect(resolvePlayerBanner({ hasConfig: true, entries, now: new Date('2026-11-25T00:00:00Z') })).toEqual({
        kind: 'playerNotAnnounced',
      });
    });
  });

  describe('resolveCancellationNotice', () => {
    it('should show the notice until the end date included', () => {
      const event = cancelledEvent('2026-11-16', '2026-11-22');

      expect(resolveCancellationNotice({ hasConfig: true, cancelledEvent: event, today: '2026-11-22' })).toEqual({
        kind: 'cancelled',
        mgStart: '2026-11-16',
      });
    });

    it('should hide the notice the day after the end date', () => {
      const event = cancelledEvent('2026-11-16', '2026-11-22');

      expect(resolveCancellationNotice({ hasConfig: true, cancelledEvent: event, today: '2026-11-23' })).toEqual({
        kind: 'none',
      });
    });

    it('should hide the notice without config or without event', () => {
      const event = cancelledEvent('2026-11-23', '2026-11-29');

      expect(resolveCancellationNotice({ hasConfig: false, cancelledEvent: event, today: TODAY })).toEqual({
        kind: 'none',
      });
      expect(resolveCancellationNotice({ hasConfig: true, cancelledEvent: null, today: TODAY })).toEqual({
        kind: 'none',
      });
    });
  });
});
