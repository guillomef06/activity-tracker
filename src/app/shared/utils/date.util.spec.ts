import { vi } from 'vitest';
import {
  getCurrentWeekNumber,
  getWeekNumberForWeeksAgo,
  getDateForWeeksAgo,
  getWeekStart,
  getWeekEnd,
} from './date.util';

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

  describe('getCurrentWeekNumber (Cycle Calculation)', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should return 1 for the reference week (Apr 27, 2026)', () => {
      vi.setSystemTime(new Date('2026-04-27T12:00:00Z'));

      const weekNumber = getCurrentWeekNumber();
      expect(weekNumber).toBe(1);
    });

    it('should return 3 for May 11, 2026 (2 weeks after reference Apr 27)', () => {
      vi.setSystemTime(new Date('2026-05-11T12:00:00Z'));

      const weekNumber = getCurrentWeekNumber();
      expect(weekNumber).toBe(3);
    });

    it('should return 4 for May 18, 2026 (KvK Cross Border week)', () => {
      vi.setSystemTime(new Date('2026-05-18T12:00:00Z'));

      const weekNumber = getCurrentWeekNumber();
      expect(weekNumber).toBe(4);
    });

    it('should cycle back to 1 after week 6', () => {
      // 6 weeks after Apr 27 = Week 1 again (Jun 8, 2026 = Monday)
      vi.setSystemTime(new Date('2026-06-08T12:00:00Z'));

      const weekNumber = getCurrentWeekNumber();
      expect(weekNumber).toBe(1);
    });

    it('should return week 6 for the 6th week of cycle', () => {
      // 5 weeks after Apr 27 = Week 6 (Jun 1, 2026 — Monday)
      vi.setSystemTime(new Date('2026-06-01T12:00:00Z'));

      const weekNumber = getCurrentWeekNumber();
      expect(weekNumber).toBe(6);
    });
  });

  describe('getWeekNumberForWeeksAgo', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should return current week number for weeksAgo = 0', () => {
      vi.setSystemTime(new Date('2026-05-11T12:00:00Z')); // Week 3

      const weekNumber = getWeekNumberForWeeksAgo(0);
      expect(weekNumber).toBe(3);
    });

    it('should return week 2 for 1 week ago when current is week 3', () => {
      vi.setSystemTime(new Date('2026-05-11T12:00:00Z')); // Week 3

      const weekNumber = getWeekNumberForWeeksAgo(1);
      expect(weekNumber).toBe(2);
    });

    it('should wrap around cycle correctly across boundaries', () => {
      // Current = Week 1 of next cycle (Jun 8), 1 week ago should be Week 6
      vi.setSystemTime(new Date('2026-06-08T12:00:00Z'));

      const weekNumber = getWeekNumberForWeeksAgo(1);
      expect(weekNumber).toBe(6);
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

  describe('Activity Availability Integration Test', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should correctly identify available activities for week 3 (Primordial Conflict)', () => {
      // Week 3 = May 11–17, 2026. Use May 13 (Wednesday) UTC.
      vi.setSystemTime(new Date('2026-05-13T12:00:00Z'));

      const weekNumber = getCurrentWeekNumber();

      const primordialConflictWeeks = [3];
      const goldenExpeditionWeeks = [1];
      const kvkPrepWeeks = [2, 4];
      const legionWeeks = [1, 2, 3, 4, 5, 6];

      expect(primordialConflictWeeks.includes(weekNumber)).toBe(true);
      expect(goldenExpeditionWeeks.includes(weekNumber)).toBe(false);
      expect(kvkPrepWeeks.includes(weekNumber)).toBe(false);
      expect(legionWeeks.includes(weekNumber)).toBe(true);
    });

    it('should correctly identify available activities for week 4 (KvK)', () => {
      // Week 4 = May 18–24, 2026. Use May 20 (Wednesday) UTC.
      vi.setSystemTime(new Date('2026-05-20T12:00:00Z'));

      const weekNumber = getCurrentWeekNumber();

      const goldenExpeditionWeeks = [1];
      const kvkPrepWeeks = [2, 4];
      const legionWeeks = [1, 2, 3, 4, 5, 6];

      expect(goldenExpeditionWeeks.includes(weekNumber)).toBe(false);
      expect(kvkPrepWeeks.includes(weekNumber)).toBe(true);
      expect(legionWeeks.includes(weekNumber)).toBe(true);
    });
  });
});
