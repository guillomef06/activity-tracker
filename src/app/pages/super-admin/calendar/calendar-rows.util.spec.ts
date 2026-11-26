import type { CalendarEntryWithImpact } from '@shared/models';
import { buildCalendarSections } from './calendar-rows.util';

const TODAY = '2027-06-02';

const mgEntry = (
  id: string,
  start: string,
  overrides: Partial<CalendarEntryWithImpact> = {}
): CalendarEntryWithImpact => ({
  id,
  type: 'mg',
  title: null,
  starts_at: `${start}T00:00:00Z`,
  ends_at: `${start}T23:59:59Z`,
  all_day: true,
  cancelled_at: null,
  cancelled_by: null,
  created_at: '2027-01-01T00:00:00Z',
  created_by: null,
  updated_at: '2027-01-01T00:00:00Z',
  updated_by: null,
  mg_events: [],
  ...overrides,
});

const pvpEntry = (id: string, start: string, end: string): CalendarEntryWithImpact =>
  mgEntry(id, start, { type: 'pvp', title: 'PvP night', ends_at: `${end}T12:00:00Z`, all_day: false });

describe('buildCalendarSections', () => {
  it('should put upcoming rows first by ascending start and history by descending start', () => {
    const entries = [
      mgEntry('old-1', '2027-03-01'),
      mgEntry('old-2', '2027-04-12'),
      mgEntry('next-2', '2027-07-05'),
      mgEntry('next-1', '2027-06-14'),
    ];

    const { upcoming, history } = buildCalendarSections(entries, TODAY);

    expect(upcoming.map(r => r.id)).toEqual(['next-1', 'next-2']);
    expect(history.map(r => r.id)).toEqual(['old-2', 'old-1']);
  });

  it('should derive state, opening and closing days for an MG', () => {
    const { upcoming } = buildCalendarSections([mgEntry('a', '2027-06-07')], TODAY);

    expect(upcoming[0]).toMatchObject({
      state: 'registration_open',
      startDay: '2027-06-07',
      endDay: '2027-06-13',
      openingDay: '2027-05-31',
      closingDay: '2027-06-03',
      title: null,
    });
  });

  it('should allow shifting and cancelling an upcoming MG but not editing it', () => {
    const { upcoming } = buildCalendarSections([mgEntry('a', '2027-06-07')], TODAY);

    expect(upcoming[0]).toMatchObject({ canShift: true, canCancel: true, canEdit: false, canDelete: false });
  });

  it('should forbid shift and cancel on an ongoing MG', () => {
    const { upcoming } = buildCalendarSections([mgEntry('a', '2027-05-31')], TODAY);

    expect(upcoming[0]).toMatchObject({ state: 'ongoing', canShift: false, canCancel: false });
  });

  it('should forbid shift and cancel on a finished or cancelled MG and file them in history', () => {
    const entries = [
      mgEntry('done', '2027-04-05'),
      mgEntry('gone', '2027-08-02', { cancelled_at: '2027-05-01T00:00:00Z' }),
    ];

    const { upcoming, history } = buildCalendarSections(entries, TODAY);

    expect(upcoming).toHaveLength(0);
    expect(history.map(r => [r.id, r.state, r.canShift, r.canCancel])).toEqual([
      ['gone', 'cancelled', false, false],
      ['done', 'finished', false, false],
    ]);
  });

  it('should count servers and registrations of the non-cancelled events only', () => {
    const entry = mgEntry('a', '2027-06-07', {
      mg_events: [
        { id: 'e1', server_id: 's1', status: 'registration_open', mg_registrations: [{ count: 4 }] },
        { id: 'e2', server_id: 's2', status: 'registration_open', mg_registrations: [{ count: 6 }] },
        { id: 'e3', server_id: 's3', status: 'cancelled', mg_registrations: [{ count: 9 }] },
        { id: 'e4', server_id: 's4', status: 'registration_open', mg_registrations: [] },
      ],
    });

    const { upcoming } = buildCalendarSections([entry], TODAY);

    expect(upcoming[0]).toMatchObject({ servers: 3, registrations: 10 });
  });

  it('should allow editing and deleting a non-MG entry, with its title and display days', () => {
    const { upcoming } = buildCalendarSections([pvpEntry('p', '2027-06-10', '2027-06-11')], TODAY);

    expect(upcoming[0]).toMatchObject({
      title: 'PvP night',
      startDay: '2027-06-10',
      endDay: '2027-06-11',
      state: 'planned',
      openingDay: null,
      closingDay: null,
      canEdit: true,
      canDelete: true,
      canShift: false,
      canCancel: false,
    });
  });

  it('should mark a running non-MG entry ongoing and a past one finished', () => {
    const entries = [pvpEntry('now', '2027-06-01', '2027-06-03'), pvpEntry('past', '2027-05-01', '2027-05-02')];

    const { upcoming, history } = buildCalendarSections(entries, TODAY);

    expect(upcoming[0].state).toBe('ongoing');
    expect(history[0]).toMatchObject({ state: 'finished', canEdit: true, canDelete: true });
  });

  describe('all-day non-MG entries (exclusive ends_at)', () => {
    const allDay = (id: string, start: string, exclusiveEnd: string): CalendarEntryWithImpact =>
      mgEntry(id, start, { type: 'pvp', title: 'Event', all_day: true, ends_at: `${exclusiveEnd}T00:00:00Z` });

    it('should end a single whole day on its own day', () => {
      const { upcoming } = buildCalendarSections([allDay('one', '2027-06-10', '2027-06-11')], TODAY);

      expect(upcoming[0]).toMatchObject({ startDay: '2027-06-10', endDay: '2027-06-10' });
    });

    it('should end a multi-day entry on the day before ends_at', () => {
      const { upcoming } = buildCalendarSections([allDay('multi', '2027-06-10', '2027-06-13')], TODAY);

      expect(upcoming[0]).toMatchObject({ startDay: '2027-06-10', endDay: '2027-06-12' });
    });

    it('should keep the entry ongoing on its last included day', () => {
      const { upcoming } = buildCalendarSections([allDay('last', '2027-05-31', '2027-06-03')], TODAY);

      expect(upcoming[0]).toMatchObject({ endDay: '2027-06-02', state: 'ongoing' });
    });

    it('should be finished the day after its last included day', () => {
      const { history } = buildCalendarSections([allDay('done', '2027-05-31', '2027-06-02')], TODAY);

      expect(history[0]).toMatchObject({ endDay: '2027-06-01', state: 'finished' });
    });

    it('should be planned the day before its first day', () => {
      const { upcoming } = buildCalendarSections([allDay('soon', '2027-06-03', '2027-06-04')], TODAY);

      expect(upcoming[0].state).toBe('planned');
    });

    it('should keep an MG end at start + 6 whatever its stored ends_at', () => {
      const { upcoming } = buildCalendarSections(
        [mgEntry('mg', '2027-06-07', { ends_at: '2027-06-14T00:00:00Z' })],
        TODAY
      );

      expect(upcoming[0].endDay).toBe('2027-06-13');
    });
  });
});
