import {
  convertUtcInputKind,
  endInputToIso,
  formatTimestampWithZone,
  formatUtcDay,
  isoToEndInput,
  isoToUtcInput,
  utcInputToIso,
} from './calendar-datetime.util';

const UTC_MINUS_8_OFFSET_MINUTES = 480;
const UTC_PLUS_10_OFFSET_MINUTES = -600;

describe('calendar-datetime.util', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('utcInputToIso', () => {
    it('should return midnight UTC when a date is given for an all-day entry', () => {
      expect(utcInputToIso('2027-05-31', true)).toBe('2027-05-31T00:00:00.000Z');
    });

    it('should append seconds and Z when a datetime-local without seconds is given', () => {
      expect(utcInputToIso('2027-05-31T20:15', false)).toBe('2027-05-31T20:15:00.000Z');
    });

    it('should normalize seconds and milliseconds when they are present', () => {
      expect(utcInputToIso('2027-05-31T20:15:30', false)).toBe('2027-05-31T20:15:30.000Z');
      expect(utcInputToIso('2027-05-31T20:15:30.5', false)).toBe('2027-05-31T20:15:30.500Z');
    });

    it('should return null when the value does not match the expected kind', () => {
      expect(utcInputToIso('2027-05-31T20:15', true)).toBeNull();
      expect(utcInputToIso('2027-05-31', false)).toBeNull();
      expect(utcInputToIso('', true)).toBeNull();
      expect(utcInputToIso('garbage', false)).toBeNull();
    });

    it('should return null when the calendar date does not exist', () => {
      expect(utcInputToIso('2027-02-31', true)).toBeNull();
      expect(utcInputToIso('2027-05-31T25:00', false)).toBeNull();
    });

    it.each([UTC_MINUS_8_OFFSET_MINUTES, UTC_PLUS_10_OFFSET_MINUTES])(
      'should ignore the local offset when the zone offset is %i minutes',
      offset => {
        vi.spyOn(Date.prototype, 'getTimezoneOffset').mockReturnValue(offset);

        expect(utcInputToIso('2027-05-31', true)).toBe('2027-05-31T00:00:00.000Z');
        expect(utcInputToIso('2027-05-31T20:15', false)).toBe('2027-05-31T20:15:00.000Z');
        expect(isoToUtcInput('2027-05-31T00:00:00.000Z', true)).toBe('2027-05-31');
        expect(isoToUtcInput('2027-05-31T20:15:00.000Z', false)).toBe('2027-05-31T20:15');
      }
    );
  });

  describe('isoToUtcInput', () => {
    it('should return the UTC day when all-day', () => {
      expect(isoToUtcInput('2027-05-31T00:00:00.000Z', true)).toBe('2027-05-31');
    });

    it('should return the UTC date-time without seconds when timestamped', () => {
      expect(isoToUtcInput('2027-05-31T20:15:42.000Z', false)).toBe('2027-05-31T20:15');
    });

    it('should return an empty string when the timestamp is invalid', () => {
      expect(isoToUtcInput('nope', false)).toBe('');
    });

    it('should accept an offset timestamp and express it in UTC', () => {
      expect(isoToUtcInput('2027-05-31T22:15:00+02:00', false)).toBe('2027-05-31T20:15');
    });
  });

  describe('convertUtcInputKind', () => {
    it('should keep only the day when switching to all-day', () => {
      expect(convertUtcInputKind('2027-05-31T20:15', true)).toBe('2027-05-31');
    });

    it('should set midnight when switching a date to timestamped', () => {
      expect(convertUtcInputKind('2027-05-31', false)).toBe('2027-05-31T00:00');
    });

    it('should keep an empty value empty', () => {
      expect(convertUtcInputKind('', true)).toBe('');
      expect(convertUtcInputKind('', false)).toBe('');
    });
  });

  describe('endInputToIso / isoToEndInput', () => {
    it('should store an all-day end as midnight UTC of the next day', () => {
      expect(endInputToIso('2027-01-05', true)).toBe('2027-01-06T00:00:00.000Z');
      expect(endInputToIso('2027-12-31', true)).toBe('2028-01-01T00:00:00.000Z');
    });

    it('should keep a timestamped end as entered', () => {
      expect(endInputToIso('2027-01-05T21:30', false)).toBe('2027-01-05T21:30:00.000Z');
    });

    it('should return null when the end is invalid', () => {
      expect(endInputToIso('', true)).toBeNull();
    });

    it('should show the day before an all-day ends_at', () => {
      expect(isoToEndInput('2027-01-06T00:00:00.000Z', true)).toBe('2027-01-05');
      expect(isoToEndInput('2027-01-05T21:30:00.000Z', false)).toBe('2027-01-05T21:30');
      expect(isoToEndInput('nope', true)).toBe('');
    });

    it('should ignore the local offset', () => {
      vi.spyOn(Date.prototype, 'getTimezoneOffset').mockReturnValue(UTC_MINUS_8_OFFSET_MINUTES);

      expect(endInputToIso('2027-01-05', true)).toBe('2027-01-06T00:00:00.000Z');
    });
  });

  describe('formatUtcDay', () => {
    it('should keep the same calendar day whatever the local offset', () => {
      vi.spyOn(Date.prototype, 'getTimezoneOffset').mockReturnValue(UTC_MINUS_8_OFFSET_MINUTES);

      expect(formatUtcDay('2027-05-31', 'en-US')).toBe('May 31, 2027');
    });

    it('should return an empty string when the day is malformed', () => {
      expect(formatUtcDay('31/05/2027', 'en-US')).toBe('');
    });
  });

  describe('formatTimestampWithZone', () => {
    it('should show the time in the given zone with its abbreviation', () => {
      const text = formatTimestampWithZone('2027-01-05T19:00:00.000Z', 'en-US', 'America/Los_Angeles');

      expect(text).toContain('11:00');
      expect(text).toContain('PST');
    });

    it('should show UTC when the zone is UTC', () => {
      const text = formatTimestampWithZone('2027-01-05T19:00:00.000Z', 'en-GB', 'UTC');

      expect(text).toContain('19:00');
      expect(text).toContain('UTC');
    });

    it('should return an empty string when the timestamp is invalid', () => {
      expect(formatTimestampWithZone('nope', 'en-US', 'UTC')).toBe('');
    });
  });
});
