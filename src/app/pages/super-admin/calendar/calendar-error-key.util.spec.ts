import { resolveCalendarErrorKey } from './calendar-error-key.util';

describe('resolveCalendarErrorKey', () => {
  it('should return the generic key when there are no details', () => {
    expect(resolveCalendarErrorKey('MG_CAL_NOT_SHIFTABLE', null)).toBe('superAdmin.calendar.errors.notShiftable');
  });

  it('should return the generic key when details carry no string reason', () => {
    expect(resolveCalendarErrorKey('MG_CAL_TOO_CLOSE', { reason: 3, date: '2027-01-01' })).toBe(
      'superAdmin.calendar.errors.tooClose'
    );
  });

  it('should return the precise reason key when details.reason is a string', () => {
    expect(resolveCalendarErrorKey('MG_CAL_NOT_SHIFTABLE', { reason: 'must_move_later' })).toBe(
      'superAdmin.calendar.errors.reason.must_move_later'
    );
  });

  it('should map the unknown code', () => {
    expect(resolveCalendarErrorKey('MG_CAL_UNKNOWN', null)).toBe('superAdmin.calendar.errors.unknown');
  });
});
