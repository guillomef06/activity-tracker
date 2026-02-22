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
      const wednesday = new Date('2026-02-11T12:00:00'); // Wednesday
      const monday = getWeekStart(wednesday);

      expect(monday.getDay()).toBe(1); // Monday = 1
      expect(monday.getDate()).toBe(9); // Feb 9, 2026 is Monday
    });

    it('should return the same date if already Monday', () => {
      const monday = new Date('2026-02-09T12:00:00');
      const result = getWeekStart(monday);

      expect(result.getDay()).toBe(1);
      expect(result.getDate()).toBe(9);
    });

    it('should return the previous Monday for a Sunday', () => {
      const sunday = new Date('2026-02-08T12:00:00');
      const result = getWeekStart(sunday);

      expect(result.getDay()).toBe(1); // Monday
      expect(result.getDate()).toBe(2); // Feb 2, 2026
    });
  });

  describe('getWeekEnd', () => {
    it('should return Sunday for a date in the middle of the week', () => {
      const wednesday = new Date('2026-02-11T12:00:00');
      const sunday = getWeekEnd(wednesday);

      expect(sunday.getDay()).toBe(0); // Sunday = 0
      expect(sunday.getDate()).toBe(15); // Feb 15, 2026 is Sunday
    });

    it('should return the same date if already Sunday', () => {
      const sunday = new Date('2026-02-08T12:00:00');
      const result = getWeekEnd(sunday);

      expect(result.getDay()).toBe(0); // Sunday
      expect(result.getDate()).toBe(8); // Feb 8, 2026
    });
  });

  describe('getCurrentWeekNumber (Cycle Calculation)', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should return 1 for the reference week (Jan 26, 2026)', () => {
      vi.setSystemTime(new Date('2026-01-26T12:00:00'));

      const weekNumber = getCurrentWeekNumber();
      expect(weekNumber).toBe(1);
    });

    it('should return 3 for Feb 9, 2026 (2 weeks after reference Jan 26)', () => {
      vi.setSystemTime(new Date('2026-02-09T12:00:00'));

      const weekNumber = getCurrentWeekNumber();
      expect(weekNumber).toBe(3);
    });

    it('should return 4 for Feb 16, 2026 (current week — KvK Prep)', () => {
      vi.setSystemTime(new Date('2026-02-16T12:00:00'));

      const weekNumber = getCurrentWeekNumber();
      expect(weekNumber).toBe(4);
    });

    it('should cycle back to 1 after week 6', () => {
      // 6 weeks after Jan 26 = Week 1 again (Mar 9, 2026 = Monday)
      vi.setSystemTime(new Date('2026-03-09T12:00:00'));

      const weekNumber = getCurrentWeekNumber();
      expect(weekNumber).toBe(1);
    });

    it('should return week 6 for the 6th week of cycle', () => {
      // 5 weeks after Jan 26 = Week 6 (Mar 2, 2026 — Monday)
      vi.setSystemTime(new Date('2026-03-02T12:00:00'));

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
      vi.setSystemTime(new Date('2026-02-09T12:00:00'));

      const weekNumber = getWeekNumberForWeeksAgo(0);
      expect(weekNumber).toBe(3);
    });

    it('should return week 2 for 1 week ago when current is week 3', () => {
      vi.setSystemTime(new Date('2026-02-09T12:00:00'));

      const weekNumber = getWeekNumberForWeeksAgo(1);
      expect(weekNumber).toBe(2);
    });

    it('should wrap around cycle correctly across boundaries', () => {
      // Current = Week 1 of next cycle (Mar 9), 1 week ago should be Week 6
      vi.setSystemTime(new Date('2026-03-09T12:00:00'));

      const weekNumber = getWeekNumberForWeeksAgo(1);
      expect(weekNumber).toBe(6);
    });
  });

  describe('getDateForWeeksAgo', () => {
    it('should return current Monday for weeksAgo = 0', () => {
      const result = getDateForWeeksAgo(0);
      const today = new Date();
      const currentMonday = getWeekStart(today);

      expect(result.getDay()).toBe(1); // Monday
      expect(result.getDate()).toBe(currentMonday.getDate());
    });

    it('should return Monday 1 week ago for weeksAgo = 1', () => {
      const result = getDateForWeeksAgo(1);
      const today = new Date();
      const currentMonday = getWeekStart(today);
      const expectedDate = new Date(currentMonday);
      expectedDate.setDate(expectedDate.getDate() - 7);

      expect(result.getDay()).toBe(1); // Monday
      expect(result.getDate()).toBe(expectedDate.getDate());
    });

    it('should return Monday 5 weeks ago for weeksAgo = 5', () => {
      const result = getDateForWeeksAgo(5);
      const today = new Date();
      const currentMonday = getWeekStart(today);
      const expectedDate = new Date(currentMonday);
      expectedDate.setDate(expectedDate.getDate() - 35);

      expect(result.getDay()).toBe(1); // Monday
      expect(result.getDate()).toBe(expectedDate.getDate());
    });
  });

  describe('Activity Availability Integration Test', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should correctly identify available activities for week 3', () => {
      // Week 3 = Feb 9–15, 2026. Use Feb 11 (Wednesday).
      vi.setSystemTime(new Date('2026-02-11T12:00:00'));

      const weekNumber = getCurrentWeekNumber();

      // Week 3 activities: Golden Expedition (weeks 1,3), Legion (all weeks)
      const goldenExpeditionWeeks = [1, 3];
      const kvkPrepWeeks = [2, 4];
      const legionWeeks = [1, 2, 3, 4, 5, 6];

      expect(goldenExpeditionWeeks.includes(weekNumber)).toBe(true);
      expect(kvkPrepWeeks.includes(weekNumber)).toBe(false);
      expect(legionWeeks.includes(weekNumber)).toBe(true);
    });

    it('should correctly identify available activities for week 4', () => {
      // Week 4 = Feb 16–22, 2026. Use Feb 18 (Wednesday).
      vi.setSystemTime(new Date('2026-02-18T12:00:00'));

      const weekNumber = getCurrentWeekNumber();

      // Week 4 activities: KvK Prep (weeks 2,4), KvK Cross Border (weeks 2,4), Legion (all weeks)
      const goldenExpeditionWeeks = [1, 3];
      const kvkPrepWeeks = [2, 4];
      const legionWeeks = [1, 2, 3, 4, 5, 6];

      expect(goldenExpeditionWeeks.includes(weekNumber)).toBe(false);
      expect(kvkPrepWeeks.includes(weekNumber)).toBe(true);
      expect(legionWeeks.includes(weekNumber)).toBe(true);
    });
  });
});
