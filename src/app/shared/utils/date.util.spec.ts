import { 
  getCurrentWeekNumber, 
  getWeekNumberForWeeksAgo, 
  getDateForWeeksAgo,
  getWeekStart,
  getWeekEnd 
} from './date.util';

describe('Date Utility Functions', () => {
  
  describe('getWeekStart', () => {
    it('should return Sunday for a date in the middle of the week', () => {
      const wednesday = new Date('2026-02-11T12:00:00'); // Wednesday
      const sunday = getWeekStart(wednesday);
      
      expect(sunday.getDay()).toBe(0); // Sunday = 0
      expect(sunday.getDate()).toBe(8); // Feb 8, 2026 is Sunday
    });

    it('should return the same date if already Sunday', () => {
      const sunday = new Date('2026-02-08T12:00:00');
      const result = getWeekStart(sunday);
      
      expect(result.getDay()).toBe(0);
      expect(result.getDate()).toBe(8);
    });
  });

  describe('getWeekEnd', () => {
    it('should return Saturday for a date in the middle of the week', () => {
      const wednesday = new Date('2026-02-11T12:00:00');
      const saturday = getWeekEnd(wednesday);
      
      expect(saturday.getDay()).toBe(6); // Saturday = 6
      expect(saturday.getDate()).toBe(14); // Feb 14, 2026 is Saturday
    });
  });

  describe('getCurrentWeekNumber (Cycle Calculation)', () => {
    beforeEach(() => {
      jasmine.clock().install();
    });

    afterEach(() => {
      jasmine.clock().uninstall();
    });

    it('should return 1 for the reference date (Jan 25, 2026)', () => {
      const baseTime = new Date('2026-01-25T12:00:00').getTime();
      jasmine.clock().mockDate(new Date(baseTime));

      const weekNumber = getCurrentWeekNumber();
      expect(weekNumber).toBe(1);
    });

    it('should return 3 for Feb 9, 2026 (2 weeks after reference)', () => {
      const baseTime = new Date('2026-02-09T12:00:00').getTime();
      jasmine.clock().mockDate(new Date(baseTime));

      const weekNumber = getCurrentWeekNumber();
      expect(weekNumber).toBe(3);
    });

    it('should cycle back to 1 after week 6', () => {
      // 6 weeks after Jan 25 = Week 1 again (Mar 8, 2026 = Week 1 of next cycle)
      const baseTime = new Date('2026-03-08T12:00:00').getTime();
      jasmine.clock().mockDate(new Date(baseTime));

      const weekNumber = getCurrentWeekNumber();
      expect(weekNumber).toBe(1);
    });

    it('should return week 6 for the 6th week of cycle', () => {
      // 5 weeks after Jan 25 = Week 6 (Mar 1, 2026)
      const baseTime = new Date('2026-03-01T12:00:00').getTime();
      jasmine.clock().mockDate(new Date(baseTime));

      const weekNumber = getCurrentWeekNumber();
      expect(weekNumber).toBe(6);
    });
  });

  describe('getWeekNumberForWeeksAgo', () => {
    beforeEach(() => {
      jasmine.clock().install();
    });

    afterEach(() => {
      jasmine.clock().uninstall();
    });

    it('should return current week number for weeksAgo = 0', () => {
      const baseTime = new Date('2026-02-09T12:00:00').getTime();
      jasmine.clock().mockDate(new Date(baseTime));

      const weekNumber = getWeekNumberForWeeksAgo(0);
      expect(weekNumber).toBe(3);
    });

    it('should return week 2 for 1 week ago when current is week 3', () => {
      const baseTime = new Date('2026-02-09T12:00:00').getTime();
      jasmine.clock().mockDate(new Date(baseTime));

      const weekNumber = getWeekNumberForWeeksAgo(1);
      expect(weekNumber).toBe(2);
    });

    it('should wrap around cycle correctly across boundaries', () => {
      // Current = Week 2 (Feb 1, 2026), 1 week ago should be Week 1
      const baseTime = new Date('2026-02-01T12:00:00').getTime();
      jasmine.clock().mockDate(new Date(baseTime));

      const weekNumber = getWeekNumberForWeeksAgo(1);
      expect(weekNumber).toBe(1); // Previous week in cycle
    });
  });

  describe('getDateForWeeksAgo', () => {
    it('should return current Sunday for weeksAgo = 0', () => {
      const result = getDateForWeeksAgo(0);
      const today = new Date();
      const currentSunday = getWeekStart(today);
      
      expect(result.getDay()).toBe(0); // Sunday
      expect(result.getDate()).toBe(currentSunday.getDate());
    });

    it('should return Sunday 1 week ago for weeksAgo = 1', () => {
      const result = getDateForWeeksAgo(1);
      const today = new Date();
      const currentSunday = getWeekStart(today);
      const expectedDate = new Date(currentSunday);
      expectedDate.setDate(expectedDate.getDate() - 7);
      
      expect(result.getDay()).toBe(0); // Sunday
      expect(result.getDate()).toBe(expectedDate.getDate());
    });

    it('should return Sunday 5 weeks ago for weeksAgo = 5', () => {
      const result = getDateForWeeksAgo(5);
      const today = new Date();
      const currentSunday = getWeekStart(today);
      const expectedDate = new Date(currentSunday);
      expectedDate.setDate(expectedDate.getDate() - 35);
      
      expect(result.getDay()).toBe(0); // Sunday
      expect(result.getDate()).toBe(expectedDate.getDate());
    });
  });

  describe('Activity Availability Integration Test', () => {
    beforeEach(() => {
      jasmine.clock().install();
    });

    afterEach(() => {
      jasmine.clock().uninstall();
    });

    it('should correctly identify available activities for week 3', () => {
      const baseTime = new Date('2026-02-09T12:00:00').getTime();
      jasmine.clock().mockDate(new Date(baseTime));

      const weekNumber = getCurrentWeekNumber();
      
      // Week 3 activities: Golden Expedition (weeks 1,3), Legion (all weeks)
      const goldenExpeditionWeeks = [1, 3];
      const kvkPrepWeeks = [2, 4];
      const legionWeeks = [1, 2, 3, 4, 5, 6];
      
      expect(goldenExpeditionWeeks.includes(weekNumber)).toBe(true);
      expect(kvkPrepWeeks.includes(weekNumber)).toBe(false);
      expect(legionWeeks.includes(weekNumber)).toBe(true);
    });
  });
});
