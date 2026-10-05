import { vi } from 'vitest';
import { getDateForWeeksAgo, getWeekStart, getWeekEnd, getWeekIndexInRange, getNextWeekStart } from './date.util';

describe('Date Utility Functions', () => {
  describe('getWeekStart', () => {
    it('should return Monday for a date in the middle of the week', () => {
      const wednesday = new Date('2026-05-13T12:00:00Z'); // Wednesday UTC (Week 3)
      const monday = getWeekStart(wednesday);

      expect(monday.getUTCDay()).toBe(1); // Monday = 1
      expect(monday.getUTCDate()).toBe(11); // May 11, 2026 is Monday
    });

    it('should return the same date if already Monday', () => {
      const monday = new Date('2026-05-11T12:00:00Z');
      const result = getWeekStart(monday);

      expect(result.getUTCDay()).toBe(1);
      expect(result.getUTCDate()).toBe(11);
    });

    it('should return the previous Monday for a Sunday', () => {
      const sunday = new Date('2026-05-10T12:00:00Z');
      const result = getWeekStart(sunday);

      expect(result.getUTCDay()).toBe(1); // Monday
      expect(result.getUTCDate()).toBe(4); // May 4, 2026
    });

    it('should return UTC midnight regardless of caller timezone', () => {
      const date = new Date('2026-05-13T12:00:00Z');
      const result = getWeekStart(date);

      expect(result.getUTCHours()).toBe(0);
      expect(result.getUTCMinutes()).toBe(0);
      expect(result.getUTCSeconds()).toBe(0);
    });
  });

  describe('getWeekEnd', () => {
    it('should return Sunday for a date in the middle of the week', () => {
      const wednesday = new Date('2026-05-13T12:00:00Z');
      const sunday = getWeekEnd(wednesday);

      expect(sunday.getUTCDay()).toBe(0); // Sunday = 0
      expect(sunday.getUTCDate()).toBe(17); // May 17, 2026 is Sunday
    });

    it('should return the same date if already Sunday', () => {
      const sunday = new Date('2026-05-10T12:00:00Z');
      const result = getWeekEnd(sunday);

      expect(result.getUTCDay()).toBe(0); // Sunday
      expect(result.getUTCDate()).toBe(10); // May 10, 2026
    });
  });

  describe('week boundaries (Monday 00:00 UTC reset)', () => {
    it('should keep Sunday 23:59:59.999 UTC in the ending week', () => {
      const result = getWeekStart(new Date('2026-10-04T23:59:59.999Z'));

      expect(result.toISOString()).toBe('2026-09-28T00:00:00.000Z');
    });

    it('should start a new week at exactly Monday 00:00:00.000 UTC', () => {
      const result = getWeekStart(new Date('2026-10-05T00:00:00.000Z'));

      expect(result.toISOString()).toBe('2026-10-05T00:00:00.000Z');
    });

    it('should end the week at Sunday 23:59:59.999 UTC, one millisecond before the next week', () => {
      const result = getWeekEnd(new Date('2026-10-01T10:00:00Z'));

      expect(result.toISOString()).toBe('2026-10-04T23:59:59.999Z');
    });

    it('should not be shifted by a late-evening instant that is already Monday in UTC+ timezones', () => {
      // Sunday 22:30 UTC is already Monday 00:30 in UTC+2 — the reset is UTC only
      const result = getWeekStart(new Date('2026-10-04T22:30:00Z'));

      expect(result.toISOString()).toBe('2026-09-28T00:00:00.000Z');
    });

    it('should cross month and year boundaries correctly', () => {
      const result = getWeekStart(new Date('2027-01-01T12:00:00Z')); // Friday

      expect(result.toISOString()).toBe('2026-12-28T00:00:00.000Z');
    });

    it('should stay on UTC midnight across a DST change', () => {
      const result = getWeekStart(new Date('2026-10-26T12:00:00Z')); // week after EU DST end

      expect(result.toISOString()).toBe('2026-10-26T00:00:00.000Z');
    });
  });

  describe('getNextWeekStart', () => {
    it('should return the next Monday 00:00 UTC for a mid-week date', () => {
      const result = getNextWeekStart(new Date('2026-10-01T10:00:00Z'));

      expect(result.toISOString()).toBe('2026-10-05T00:00:00.000Z');
    });

    it('should return the following Monday when the date is exactly a Monday midnight', () => {
      const result = getNextWeekStart(new Date('2026-10-05T00:00:00.000Z'));

      expect(result.toISOString()).toBe('2026-10-12T00:00:00.000Z');
    });

    it('should return the reset one millisecond away on Sunday 23:59:59.999 UTC', () => {
      const date = new Date('2026-10-04T23:59:59.999Z');

      const result = getNextWeekStart(date);

      expect(result.getTime() - date.getTime()).toBe(1);
    });
  });

  describe('getDateForWeeksAgo', () => {
    it('should return current Monday (UTC) for weeksAgo = 0', () => {
      const result = getDateForWeeksAgo(0);
      const currentMonday = getWeekStart(new Date());

      expect(result.getUTCDay()).toBe(1); // Monday
      expect(result.getUTCDate()).toBe(currentMonday.getUTCDate());
      expect(result.getUTCHours()).toBe(0); // UTC midnight
    });

    it('should return Monday 1 week ago for weeksAgo = 1', () => {
      const result = getDateForWeeksAgo(1);
      const currentMonday = getWeekStart(new Date());
      const expectedDate = new Date(currentMonday);
      expectedDate.setUTCDate(expectedDate.getUTCDate() - 7);

      expect(result.getUTCDay()).toBe(1); // Monday
      expect(result.getUTCDate()).toBe(expectedDate.getUTCDate());
    });

    it('should return Monday 5 weeks ago for weeksAgo = 5', () => {
      const result = getDateForWeeksAgo(5);
      const currentMonday = getWeekStart(new Date());
      const expectedDate = new Date(currentMonday);
      expectedDate.setUTCDate(expectedDate.getUTCDate() - 35);

      expect(result.getUTCDay()).toBe(1); // Monday
      expect(result.getUTCDate()).toBe(expectedDate.getUTCDate());
    });
  });

  describe('getWeekIndexInRange', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should return 1 when date is exactly on rangeStart', () => {
      const rangeStart = new Date('2026-05-11T00:00:00Z'); // Monday

      const weekIndex = getWeekIndexInRange(rangeStart, rangeStart);

      expect(weekIndex).toBe(1);
    });

    it('should return N for a date some weeks after rangeStart', () => {
      const rangeStart = new Date('2026-05-11T00:00:00Z'); // Monday, week 1
      const date = new Date('2026-06-08T12:00:00Z'); // 4 weeks later, week 5

      const weekIndex = getWeekIndexInRange(date, rangeStart);

      expect(weekIndex).toBe(5);
    });

    it('should Monday-align both dates so non-Monday inputs still resolve correctly', () => {
      const rangeStart = new Date('2026-05-13T09:00:00Z'); // Wednesday, aligns to May 11 Monday
      const date = new Date('2026-05-24T18:30:00Z'); // Sunday, aligns to May 18 Monday (week 2)

      const weekIndex = getWeekIndexInRange(date, rangeStart);

      expect(weekIndex).toBe(2);
    });
  });
});
