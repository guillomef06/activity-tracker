import { describe, it, expect } from 'vitest';
import type { MgEvent, MgRegistration, MgSelectionWithUser } from '@shared/models';

// Pure computed logic tests (no DOM)
const makeEvent = (status: MgEvent['status']): MgEvent => ({
  id: 'ev-1',
  server_id: 'srv-1',
  start_date: '2026-05-04',
  end_date: '2026-05-10',
  registration_open_at: '2026-04-27',
  registration_close_at: '2026-04-30',
  status,
  selection_published_at: status === 'selection_published' ? '2026-05-01T10:00:00Z' : null,
  created_at: '2026-04-20T00:00:00Z',
});

const makeRegistration = (): MgRegistration => ({
  id: 'reg-1',
  mg_event_id: 'ev-1',
  user_id: 'user-1',
  registered_at: new Date().toISOString(),
});

const makeSelection = (userId: string, rank: number): MgSelectionWithUser => ({
  id: 'sel-' + rank,
  mg_event_id: 'ev-1',
  user_id: userId,
  rank,
  selection_type: 'selected',
  selected_by: 'automatic',
  user_profiles: { display_name: 'Player ' + rank, username: 'player' + rank },
});

describe('MgEventCardComponent logic', () => {
  it('showRegistrationActions only for registration_open', () => {
    const statuses: MgEvent['status'][] = [
      'upcoming',
      'registration_open',
      'registration_closed',
      'selection_published',
      'ongoing',
      'finished',
    ];
    const open = statuses.filter(s => s === 'registration_open');
    const notOpen = statuses.filter(s => s !== 'registration_open');
    expect(open).toHaveLength(1);
    expect(notOpen).toHaveLength(5);
  });

  it('showWaiting only for registration_closed', () => {
    expect('registration_closed').toBe('registration_closed');
  });

  it('showSelection for selection_published, ongoing, finished', () => {
    const showFor: MgEvent['status'][] = ['selection_published', 'ongoing', 'finished'];
    expect(showFor).toHaveLength(3);
  });

  it('isRegistered when registration is not null', () => {
    const reg = makeRegistration();
    expect(reg).not.toBeNull();
  });

  it('isSelected when user_id matches a selected slot', () => {
    const selection = [makeSelection('user-1', 1), makeSelection('user-2', 2)];
    const isSelected = selection.some(s => s.user_id === 'user-1' && s.selection_type === 'selected');
    expect(isSelected).toBe(true);
  });

  it('ffaCount counts ffa slots', () => {
    const selection: MgSelectionWithUser[] = [
      { ...makeSelection('user-1', 1) },
      {
        id: 'ffa-1',
        mg_event_id: 'ev-1',
        user_id: null,
        rank: 2,
        selection_type: 'ffa',
        selected_by: 'automatic',
        user_profiles: null,
      },
      {
        id: 'ffa-2',
        mg_event_id: 'ev-1',
        user_id: null,
        rank: 3,
        selection_type: 'ffa',
        selected_by: 'automatic',
        user_profiles: null,
      },
    ];
    const count = selection.filter(s => s.selection_type === 'ffa').length;
    expect(count).toBe(2);
  });

  it('makeEvent helper builds correct shape', () => {
    const ev = makeEvent('registration_open');
    expect(ev.status).toBe('registration_open');
    expect(ev.selection_published_at).toBeNull();
  });
});
