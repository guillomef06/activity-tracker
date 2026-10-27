import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TestBed, ComponentFixture } from '@angular/core/testing';
import type { CdkDragDrop } from '@angular/cdk/drag-drop';
import { provideAnimations } from '@angular/platform-browser/animations';
import { provideZonelessChangeDetection } from '@angular/core';
import { TranslateModule } from '@ngx-translate/core';
import {
  MgSelectionPanelComponent,
  type MgMemberOption,
  type MgSelectionPanelKind,
} from './mg-selection-panel.component';
import { MgEventService } from '@app/core/services/mg-event.service';
import { SnackbarService } from '@app/core/services';
import { buildMgSlotRows } from '@shared/utils/mg-slot.util';
import type {
  MgAssignmentMode,
  MgEvent,
  MgEventStatus,
  MgRegistrationWithUser,
  MgSelectionPayload,
  MgSelectionWithUser,
} from '@shared/models';

const mockMgEventService = {
  saveSelection: vi.fn().mockResolvedValue({ error: null }),
  publishSelection: vi.fn().mockResolvedValue({ error: null }),
  generateAutoSelectionPayload: vi.fn().mockReturnValue([]),
};

const mockSnackbarService = { success: vi.fn(), error: vi.fn() };

const makeEvent = (status: MgEventStatus): MgEvent => ({
  id: 'event-1',
  server_id: 'server-1',
  start_date: '2026-01-05',
  end_date: '2026-01-11',
  registration_open_at: '2025-12-29',
  registration_close_at: '2026-01-01',
  status,
  selection_published_at: null,
  created_at: '2026-01-01T00:00:00Z',
});

const makeRegistration = (userId: string, name: string, desired: number | null = null): MgRegistrationWithUser => ({
  id: `${userId}-reg`,
  mg_event_id: 'event-1',
  user_id: userId,
  registered_at: '2026-01-01T00:00:00Z',
  desired_slot_order: desired,
  comment: null,
  user_profiles: { display_name: name, username: name.toLowerCase() },
});

const makeSelected = (
  userId: string,
  rank: number,
  cost: number,
  selectedBy: 'automatic' | 'manual' = 'automatic',
  approved?: { rank: number; cost: number }
): MgSelectionWithUser => ({
  id: `sel-${rank}`,
  mg_event_id: 'event-1',
  user_id: userId,
  rank,
  selection_type: 'selected',
  selected_by: selectedBy,
  cost,
  label: null,
  approved_rank: approved?.rank ?? null,
  approved_cost: approved?.cost ?? null,
  user_profiles: { display_name: userId.toUpperCase(), username: userId },
});

const makeFfa = (rank: number): MgSelectionWithUser => ({
  id: `sel-${rank}`,
  mg_event_id: 'event-1',
  user_id: null,
  rank,
  selection_type: 'ffa',
  selected_by: 'automatic',
  cost: 0,
  label: null,
  approved_rank: null,
  approved_cost: null,
  user_profiles: null,
});

// cost defaults to the rank's slot cost, matching what buildSelectionPayload persists
// for an empty slot (it shows the slot cost even though it bills nobody).
const makeEmpty = (rank: number, label = 'Empty', cost = 0): MgSelectionWithUser => ({
  id: `sel-${rank}`,
  mg_event_id: 'event-1',
  user_id: null,
  rank,
  selection_type: 'empty',
  selected_by: 'manual',
  cost,
  label,
  approved_rank: null,
  approved_cost: null,
  user_profiles: null,
});

interface PanelInputs {
  kind: MgSelectionPanelKind;
  status: MgEventStatus;
  registrations: MgRegistrationWithUser[];
  members: MgMemberOption[];
  selection: MgSelectionWithUser[];
  capacity: number;
  assignmentMode: MgAssignmentMode;
  dkpEnabled: boolean;
}

const defaultInputs = (): PanelInputs => ({
  kind: 'draft',
  status: 'registration_closed',
  registrations: [makeRegistration('a', 'Alice'), makeRegistration('b', 'Bob'), makeRegistration('c', 'Carol')],
  members: [],
  selection: [makeSelected('a', 1, 150), makeSelected('b', 2, 140), makeFfa(3), makeFfa(4)],
  capacity: 4,
  assignmentMode: 'automatic',
  dkpEnabled: false,
});

interface DraftRowShape {
  id: string;
  isEmpty: boolean;
  userId: string | null;
  cost: number;
  displayName: string;
  approvedSlotLabel: string | null;
  canForgive: boolean;
  forgiven: boolean;
}

interface PanelInternals {
  draftOrder: () => string[];
  isDirty: () => boolean;
  canSave: () => boolean;
  canPublish: () => boolean;
  isFull: () => boolean;
  isOverCapacity: () => boolean;
  effectiveCapacity: () => number;
  showGenerate: () => boolean;
  draftRows: () => DraftRowShape[];
  availableRows: () => { userId: string; isRegistered: boolean; displayName: string }[];
  filteredAvailableRows: () => { userId: string; displayName: string }[];
  poolSearch: { (): string; set: (v: string) => void };
  generate: () => void;
  add: (userId: string) => void;
  remove: (entry: string) => void;
  move: (entry: string, delta: -1 | 1) => void;
  drop: (event: CdkDragDrop<string[]>) => void;
  addEmpty: () => void;
  setEmptyLabel: (id: string, label: string) => void;
  toggleForgive: (userId: string) => void;
  onPoolSearch: (value: string) => void;
  reset: () => void;
  save: () => Promise<void>;
  publish: () => Promise<void>;
}

describe('MgSelectionPanelComponent', () => {
  let fixture: ComponentFixture<MgSelectionPanelComponent>;
  let panel: PanelInternals;

  const create = (overrides: Partial<PanelInputs> = {}): void => {
    const inputs = { ...defaultInputs(), ...overrides };
    fixture = TestBed.createComponent(MgSelectionPanelComponent);
    fixture.componentRef.setInput('event', makeEvent(inputs.status));
    fixture.componentRef.setInput('kind', inputs.kind);
    fixture.componentRef.setInput('registrations', inputs.registrations);
    fixture.componentRef.setInput('members', inputs.members);
    fixture.componentRef.setInput('selection', inputs.selection);
    fixture.componentRef.setInput('capacity', inputs.capacity);
    fixture.componentRef.setInput('assignmentMode', inputs.assignmentMode);
    fixture.componentRef.setInput('slotRows', buildMgSlotRows([]));
    fixture.componentRef.setInput('dkpEnabled', inputs.dkpEnabled);
    fixture.detectChanges();
    panel = fixture.componentInstance as unknown as PanelInternals;
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    mockMgEventService.saveSelection.mockResolvedValue({ error: null });
    mockMgEventService.publishSelection.mockResolvedValue({ error: null });

    await TestBed.configureTestingModule({
      imports: [MgSelectionPanelComponent, TranslateModule.forRoot()],
      providers: [
        provideAnimations(),
        provideZonelessChangeDetection(),
        { provide: MgEventService, useValue: mockMgEventService },
        { provide: SnackbarService, useValue: mockSnackbarService },
      ],
    }).compileComponents();
  });

  describe('initial draft', () => {
    it('should start from the saved selection ordered by rank', () => {
      // Arrange / Act
      create({ selection: [makeSelected('b', 2, 140), makeSelected('a', 1, 150), makeFfa(3), makeFfa(4)] });

      // Assert
      expect(panel.draftOrder()).toEqual(['a', 'b']);
      expect(panel.isDirty()).toBe(false);
    });

    it('should list only the registered players that are not placed yet', () => {
      // Arrange / Act
      create();

      // Assert
      expect(panel.availableRows().map(r => r.userId)).toEqual(['c']);
    });

    it('should start with an empty draft when nothing was saved', () => {
      // Arrange / Act
      create({ selection: [] });

      // Assert
      expect(panel.draftOrder()).toEqual([]);
      expect(panel.availableRows()).toHaveLength(3);
    });
  });

  describe('editing', () => {
    it('should append a player when adding and mark the draft dirty', () => {
      // Arrange
      create();

      // Act
      panel.add('c');

      // Assert
      expect(panel.draftOrder()).toEqual(['a', 'b', 'c']);
      expect(panel.isDirty()).toBe(true);
      expect(panel.availableRows()).toHaveLength(0);
    });

    it('should ignore an add when the selection is already at capacity', () => {
      // Arrange
      create({ capacity: 2 });

      // Act
      panel.add('c');

      // Assert
      expect(panel.isFull()).toBe(true);
      expect(panel.draftOrder()).toEqual(['a', 'b']);
    });

    it('should not add the same player twice', () => {
      // Arrange
      create();

      // Act
      panel.add('a');

      // Assert
      expect(panel.draftOrder()).toEqual(['a', 'b']);
    });

    it('should remove a player and give the seat back to the pool', () => {
      // Arrange
      create();

      // Act
      panel.remove('a');

      // Assert
      expect(panel.draftOrder()).toEqual(['b']);
      expect(panel.availableRows().map(r => r.userId)).toContain('a');
    });

    it('should swap a player with the one above when moving up', () => {
      // Arrange
      create();

      // Act
      panel.move('b', -1);

      // Assert
      expect(panel.draftOrder()).toEqual(['b', 'a']);
    });

    it('should swap a player with the one below when moving down', () => {
      // Arrange
      create();

      // Act
      panel.move('a', 1);

      // Assert
      expect(panel.draftOrder()).toEqual(['b', 'a']);
    });

    it('should not move the first player up nor the last player down', () => {
      // Arrange
      create();

      // Act
      panel.move('a', -1);
      panel.move('b', 1);

      // Assert
      expect(panel.draftOrder()).toEqual(['a', 'b']);
      expect(panel.isDirty()).toBe(false);
    });

    describe('drag & drop', () => {
      const dropped = (previousIndex: number, currentIndex: number): CdkDragDrop<string[]> =>
        ({ previousIndex, currentIndex }) as CdkDragDrop<string[]>;

      it('should move the dragged player to the dropped position and mark the draft dirty', () => {
        // Arrange
        create({ selection: [makeSelected('a', 1, 150), makeSelected('b', 2, 140), makeSelected('c', 3, 130)] });

        // Act
        panel.drop(dropped(2, 0));

        // Assert
        expect(panel.draftOrder()).toEqual(['c', 'a', 'b']);
        expect(panel.isDirty()).toBe(true);
      });

      it('should re-price the players whose rank changed after a drop', () => {
        // Arrange
        create();

        // Act
        panel.drop(dropped(1, 0));

        // Assert
        expect(panel.draftRows().map(r => [r.userId, r.cost])).toEqual([
          ['b', 150],
          ['a', 140],
        ]);
      });

      it('should keep the draft untouched when dropped where it started', () => {
        // Arrange
        create();

        // Act
        panel.drop(dropped(1, 1));

        // Assert
        expect(panel.draftOrder()).toEqual(['a', 'b']);
        expect(panel.isDirty()).toBe(false);
      });

      it('should save a dragged order as manual', async () => {
        // Arrange
        create();
        panel.drop(dropped(0, 1));

        // Act
        await panel.save();

        // Assert
        const saved = mockMgEventService.saveSelection.mock.calls[0][1] as MgSelectionPayload[];
        expect(saved.slice(0, 2).map(p => [p.user_id, p.selected_by])).toEqual([
          ['b', 'manual'],
          ['a', 'manual'],
        ]);
      });

      it('should render one drag handle per selected player', () => {
        // Arrange / Act
        create();

        // Assert
        expect((fixture.nativeElement as HTMLElement).querySelectorAll('.drag-handle')).toHaveLength(2);
      });

      it('should not render any drag handle for a locked selection', () => {
        // Arrange / Act
        create({ kind: 'locked', status: 'ongoing' });

        // Assert
        expect((fixture.nativeElement as HTMLElement).querySelectorAll('.drag-handle')).toHaveLength(0);
      });
    });

    it('should restore the saved order when resetting', () => {
      // Arrange
      create();
      panel.move('a', 1);
      panel.add('c');

      // Act
      panel.reset();

      // Assert
      expect(panel.draftOrder()).toEqual(['a', 'b']);
      expect(panel.isDirty()).toBe(false);
    });

    it('should price each row from its rank in the slot config', () => {
      // Arrange
      create();

      // Act
      panel.move('b', -1);

      // Assert
      expect(panel.draftRows().map(r => [r.userId, r.cost])).toEqual([
        ['b', 150],
        ['a', 140],
      ]);
    });
  });

  describe('generate', () => {
    const autoPayloads: MgSelectionPayload[] = [
      {
        mg_event_id: 'event-1',
        user_id: 'c',
        rank: 1,
        selection_type: 'selected',
        selected_by: 'automatic',
        cost: 150,
      },
      {
        mg_event_id: 'event-1',
        user_id: 'a',
        rank: 2,
        selection_type: 'selected',
        selected_by: 'automatic',
        cost: 140,
      },
      { mg_event_id: 'event-1', user_id: null, rank: 3, selection_type: 'ffa', selected_by: 'automatic', cost: 0 },
    ];

    it('should only be offered for a draft in automatic mode', () => {
      // Arrange / Act
      create({ assignmentMode: 'manual' });

      // Assert
      expect(panel.showGenerate()).toBe(false);
    });

    it('should replace the draft with the automatic ranking', () => {
      // Arrange
      mockMgEventService.generateAutoSelectionPayload.mockReturnValueOnce(autoPayloads);
      create();

      // Act
      panel.generate();

      // Assert
      expect(panel.draftOrder()).toEqual(['c', 'a']);
      expect(panel.isDirty()).toBe(true);
    });

    it('should pass the slot rows and capacity to the generator', () => {
      // Arrange
      create();

      // Act
      panel.generate();

      // Assert
      expect(mockMgEventService.generateAutoSelectionPayload).toHaveBeenCalledWith(
        'event-1',
        expect.any(Array),
        expect.any(Array),
        4,
        expect.arrayContaining([expect.objectContaining({ slotOrder: 1, cost: 150 })])
      );
    });

    it('should save the generated list as automatic', async () => {
      // Arrange
      mockMgEventService.generateAutoSelectionPayload.mockReturnValueOnce(autoPayloads);
      create();
      panel.generate();

      // Act
      await panel.save();

      // Assert
      const saved = mockMgEventService.saveSelection.mock.calls[0][1] as MgSelectionPayload[];
      expect(saved.every(p => p.selected_by === 'automatic')).toBe(true);
    });
  });

  describe('save', () => {
    it('should not save when nothing changed', async () => {
      // Arrange
      create();

      // Act
      await panel.save();

      // Assert
      expect(mockMgEventService.saveSelection).not.toHaveBeenCalled();
    });

    it('should save the edited list as manual, padded with free-for-all rows', async () => {
      // Arrange
      create();
      panel.move('b', -1);

      // Act
      await panel.save();

      // Assert
      const saved = mockMgEventService.saveSelection.mock.calls[0][1] as MgSelectionPayload[];
      expect(mockMgEventService.saveSelection).toHaveBeenCalledWith('event-1', expect.any(Array));
      expect(saved.map(p => [p.user_id, p.rank, p.selected_by])).toEqual([
        ['b', 1, 'manual'],
        ['a', 2, 'manual'],
        [null, 3, 'manual'],
        [null, 4, 'manual'],
      ]);
    });

    it('should emit selectionSaved and show a success message when saving works', async () => {
      // Arrange
      create();
      const emitted = vi.fn();
      fixture.componentInstance.selectionSaved.subscribe(emitted);
      panel.remove('b');

      // Act
      await panel.save();

      // Assert
      expect(emitted).toHaveBeenCalledOnce();
      expect(mockSnackbarService.success).toHaveBeenCalled();
    });

    it('should show an error and keep the draft when saving fails', async () => {
      // Arrange
      mockMgEventService.saveSelection.mockResolvedValueOnce({ error: { message: 'boom' } });
      vi.spyOn(console, 'error').mockImplementation(() => undefined);
      create();
      const emitted = vi.fn();
      fixture.componentInstance.selectionSaved.subscribe(emitted);
      panel.remove('b');

      // Act
      await panel.save();

      // Assert
      expect(mockSnackbarService.error).toHaveBeenCalled();
      expect(emitted).not.toHaveBeenCalled();
      expect(panel.draftOrder()).toEqual(['a']);
    });

    it('should refuse to save more players than the capacity allows', () => {
      // Arrange — the saved selection (2 players) no longer fits a capacity that shrank to 1
      create({ selection: [makeSelected('a', 1, 150), makeSelected('b', 2, 140)], capacity: 1 });
      panel.move('a', 1);

      // Act / Assert
      expect(panel.isOverCapacity()).toBe(true);
      expect(panel.canSave()).toBe(false);
    });
  });

  describe('publish', () => {
    it('should be allowed for a saved, unmodified draft once registrations are closed', () => {
      // Arrange / Act
      create();

      // Assert
      expect(panel.canPublish()).toBe(true);
    });

    it('should be blocked while there are unsaved changes', () => {
      // Arrange
      create();

      // Act
      panel.remove('b');

      // Assert
      expect(panel.canPublish()).toBe(false);
    });

    it('should be blocked when nothing was saved yet', () => {
      // Arrange / Act
      create({ selection: [] });

      // Assert
      expect(panel.canPublish()).toBe(false);
    });

    it('should be blocked while registrations are still open', () => {
      // Arrange / Act
      create({ status: 'registration_open' });

      // Assert
      expect(panel.canPublish()).toBe(false);
    });

    it('should publish and emit published', async () => {
      // Arrange
      create();
      const emitted = vi.fn();
      fixture.componentInstance.published.subscribe(emitted);

      // Act
      await panel.publish();

      // Assert
      expect(mockMgEventService.publishSelection).toHaveBeenCalledWith('event-1');
      expect(emitted).toHaveBeenCalledOnce();
    });

    it('should show an error and not emit when publishing fails', async () => {
      // Arrange
      mockMgEventService.publishSelection.mockResolvedValueOnce({ error: { message: 'boom' } });
      vi.spyOn(console, 'error').mockImplementation(() => undefined);
      create();
      const emitted = vi.fn();
      fixture.componentInstance.published.subscribe(emitted);

      // Act
      await panel.publish();

      // Assert
      expect(mockSnackbarService.error).toHaveBeenCalled();
      expect(emitted).not.toHaveBeenCalled();
    });
  });

  describe('locked', () => {
    it.each<MgEventStatus>(['selection_published', 'ongoing'])(
      'should be read-only without any editing control when the event is %s',
      status => {
        // Arrange / Act
        create({ kind: 'locked', status });

        // Assert
        const compiled = fixture.nativeElement as HTMLElement;
        expect(compiled.querySelector('.locked-state')).not.toBeNull();
        expect(compiled.querySelectorAll('button')).toHaveLength(0);
      }
    );

    it('should explain that the event is in progress when ongoing', () => {
      // Arrange / Act
      create({ kind: 'locked', status: 'ongoing' });

      // Assert
      expect((fixture.nativeElement as HTMLElement).textContent).toContain('mg.admin.selectionLocked');
    });

    it('should explain that the selection can be corrected later when merely published', () => {
      // Arrange / Act
      create({ kind: 'locked', status: 'selection_published' });

      // Assert
      expect((fixture.nativeElement as HTMLElement).textContent).toContain('mg.admin.selectionPublishedLocked');
    });
  });

  describe('correction of a finished event', () => {
    const finishedSelection = [makeSelected('a', 1, 999), makeSelected('b', 2, 888), makeFfa(3)];

    it('should keep the original selection size even if the server capacity changed since', () => {
      // Arrange / Act
      create({ kind: 'correction', status: 'finished', selection: finishedSelection, capacity: 10 });

      // Assert
      expect(panel.effectiveCapacity()).toBe(3);
    });

    it('should never offer to generate or publish', () => {
      // Arrange / Act
      create({ kind: 'correction', status: 'finished', selection: finishedSelection });

      // Assert
      expect(panel.showGenerate()).toBe(false);
      expect(panel.canPublish()).toBe(false);
      expect((fixture.nativeElement as HTMLElement).textContent).not.toContain('mg.admin.selection.publish');
    });

    it('should re-price only the players whose rank changed', async () => {
      // Arrange — a and b swap; the snapshotted costs (999/888) differ from the current slot config
      create({ kind: 'correction', status: 'finished', selection: finishedSelection, capacity: 3 });
      panel.move('b', -1);

      // Act
      await panel.save();

      // Assert
      const saved = mockMgEventService.saveSelection.mock.calls[0][1] as MgSelectionPayload[];
      expect(saved.slice(0, 2).map(p => [p.user_id, p.cost])).toEqual([
        ['b', 150],
        ['a', 140],
      ]);
    });

    it('should keep the already-charged cost of a player who keeps their rank', async () => {
      // Arrange — c joins at rank 3 while a and b stay where they were
      create({
        kind: 'correction',
        status: 'finished',
        selection: finishedSelection,
        capacity: 3,
        registrations: [makeRegistration('a', 'Alice'), makeRegistration('b', 'Bob'), makeRegistration('c', 'Carol')],
      });
      panel.add('c');

      // Act
      await panel.save();

      // Assert
      const saved = mockMgEventService.saveSelection.mock.calls[0][1] as MgSelectionPayload[];
      expect(saved.slice(0, 2).map(p => [p.user_id, p.cost])).toEqual([
        ['a', 999],
        ['b', 888],
      ]);
      expect(saved[2]).toMatchObject({ user_id: 'c', cost: 130 });
    });

    describe('players who did not register', () => {
      const members: MgMemberOption[] = [
        { userId: 'a', displayName: 'Alice' },
        { userId: 'b', displayName: 'Bob' },
        { userId: 'c', displayName: 'Carol' },
        { userId: 'x', displayName: 'Intruder' },
      ];
      const correction = (overrides: Partial<PanelInputs> = {}): void =>
        create({
          kind: 'correction',
          status: 'finished',
          selection: finishedSelection,
          capacity: 3,
          members,
          registrations: [makeRegistration('a', 'Alice'), makeRegistration('b', 'Bob'), makeRegistration('c', 'Carol')],
          ...overrides,
        });

      it('should offer members who never registered, after the registered ones', () => {
        // Arrange / Act
        correction();

        // Assert
        expect(panel.availableRows().map(r => [r.userId, r.isRegistered])).toEqual([
          ['c', true],
          ['x', false],
        ]);
      });

      it('should place an unregistered player and charge them the cost of their rank', async () => {
        // Arrange — x broke the rules and took rank 3 during the event
        correction();
        panel.add('x');

        // Act
        await panel.save();

        // Assert
        const saved = mockMgEventService.saveSelection.mock.calls[0][1] as MgSelectionPayload[];
        expect(saved[2]).toMatchObject({ user_id: 'x', rank: 3, selection_type: 'selected', cost: 130 });
      });

      it('should display the name of an unregistered player once placed', () => {
        // Arrange
        correction();

        // Act
        panel.add('x');

        // Assert
        expect(panel.draftRows().find(r => r.userId === 'x')?.displayName).toBe('Intruder');
      });

      it('should let an unregistered player take the seat of a placed one', async () => {
        // Arrange — x took b's seat
        correction();
        panel.remove('b');
        panel.add('x');

        // Act
        await panel.save();

        // Assert
        const saved = mockMgEventService.saveSelection.mock.calls[0][1] as MgSelectionPayload[];
        expect(saved.slice(0, 2).map(p => [p.user_id, p.rank])).toEqual([
          ['a', 1],
          ['x', 2],
        ]);
      });

      it('should not offer a member who is already placed', () => {
        // Arrange / Act
        correction();
        panel.add('x');

        // Assert
        expect(panel.availableRows().map(r => r.userId)).toEqual(['c']);
      });

      it('should not offer unregistered members while the selection is still a draft', () => {
        // Arrange / Act
        create({ kind: 'draft', members });

        // Assert
        expect(panel.availableRows().map(r => r.userId)).toEqual(['c']);
      });
    });

    describe('empty placeholder slots', () => {
      it('should append an empty slot with the default label and mark the draft dirty', () => {
        // Arrange
        create({ kind: 'correction', status: 'finished', selection: finishedSelection, capacity: 5 });

        // Act
        panel.addEmpty();

        // Assert
        const empties = panel.draftRows().filter(r => r.isEmpty);
        expect(empties).toHaveLength(1);
        expect(empties[0].displayName).toBe('Empty');
        expect(panel.isDirty()).toBe(true);
      });

      it('should persist an empty slot as a null-user empty row that occupies its rank', async () => {
        // Arrange
        create({ kind: 'correction', status: 'finished', selection: finishedSelection, capacity: 5 });
        panel.addEmpty();
        const emptyId = panel.draftOrder().find(e => e.startsWith('empty:'))!;
        panel.setEmptyLabel(emptyId, 'Ghost');

        // Act
        await panel.save();

        // Assert
        const saved = mockMgEventService.saveSelection.mock.calls[0][1] as MgSelectionPayload[];
        const emptyRow = saved.find(p => p.selection_type === 'empty');
        expect(emptyRow).toMatchObject({ user_id: null, label: 'Ghost' });
      });

      it('should round-trip a saved empty slot with its name', () => {
        // Arrange — a saved selection already containing an empty slot at rank 2
        create({
          kind: 'correction',
          status: 'finished',
          selection: [makeSelected('a', 1, 150), makeEmpty(2, 'Vacant', 140), makeSelected('b', 3, 130)],
          capacity: 3,
        });

        // Assert — the empty row shows between the players, by rank, with its label.
        // (Names resolve via registrations: a→Alice, b→Bob.)
        const rows = panel.draftRows();
        expect(rows.map(r => [r.isEmpty, r.displayName])).toEqual([
          [false, 'Alice'],
          [true, 'Vacant'],
          [false, 'Bob'],
        ]);
        expect(panel.isDirty()).toBe(false);
      });
    });

    describe('cost forgiveness (no penalty for an approved move)', () => {
      // 'a' approved for rank 3 (cost 130); after movement ends at rank 1 (would cost 150).
      const approvedSelection = [
        makeSelected('a', 3, 130, 'manual', { rank: 3, cost: 130 }),
        makeSelected('b', 1, 150, 'manual', { rank: 1, cost: 150 }),
        makeSelected('c', 2, 140, 'manual', { rank: 2, cost: 140 }),
      ];

      it('should expose which players can be forgiven (rank differs from approved)', () => {
        // Arrange — reorder so 'a' sits at rank 1, away from its approved rank 3
        create({ kind: 'correction', status: 'finished', selection: approvedSelection, capacity: 3, dkpEnabled: true });
        // savedOrder already reflects ranks: b(1), c(2), a(3) → move a up to rank 1
        panel.move('a', -1);
        panel.move('a', -1);

        // Assert — a is now at a rank different from approved 3 → can forgive
        const rowA = panel.draftRows().find(r => r.userId === 'a')!;
        expect(rowA.canForgive).toBe(true);
        expect(rowA.approvedSlotLabel).toBe('3');
      });

      it('should bill a forgiven player their approved cost instead of the final rank', async () => {
        // Arrange
        create({ kind: 'correction', status: 'finished', selection: approvedSelection, capacity: 3, dkpEnabled: true });
        panel.move('a', -1);
        panel.move('a', -1); // a → rank 1 (final cost would be 150)

        // Act
        panel.toggleForgive('a');
        await panel.save();

        // Assert — a billed approved 130, not rank-1's 150
        const saved = mockMgEventService.saveSelection.mock.calls[0][1] as MgSelectionPayload[];
        expect(saved.find(p => p.user_id === 'a')?.cost).toBe(130);
      });

      it('should restore the forgiven state from a reloaded selection', () => {
        // Arrange — 'a' saved at rank 1 but billed its approved cost 130 (i.e. was forgiven)
        create({
          kind: 'correction',
          status: 'finished',
          capacity: 3,
          dkpEnabled: true,
          selection: [
            makeSelected('a', 1, 130, 'manual', { rank: 3, cost: 130 }),
            makeSelected('b', 2, 140, 'manual', { rank: 2, cost: 140 }),
            makeSelected('c', 3, 130, 'manual', { rank: 1, cost: 150 }),
          ],
        });

        // Assert — a is reloaded as forgiven, and nothing is dirty
        const rowA = panel.draftRows().find(r => r.userId === 'a')!;
        expect(rowA.forgiven).toBe(true);
        expect(panel.isDirty()).toBe(false);
      });
    });

    describe('searchable pool', () => {
      const members: MgMemberOption[] = [
        { userId: 'a', displayName: 'Alice' },
        { userId: 'b', displayName: 'Bob' },
        { userId: 'c', displayName: 'Carol' },
        { userId: 'x', displayName: 'Xavier' },
      ];

      it('should filter the unplaced pool by display name', () => {
        // Arrange
        create({
          kind: 'correction',
          status: 'finished',
          selection: [makeSelected('a', 1, 150), makeFfa(2), makeFfa(3)],
          capacity: 3,
          members,
          registrations: [makeRegistration('b', 'Bob'), makeRegistration('c', 'Carol')],
        });

        // Act
        panel.onPoolSearch('car');

        // Assert
        expect(panel.filteredAvailableRows().map(r => r.displayName)).toEqual(['Carol']);
      });

      it('should return the whole pool when the search is empty', () => {
        // Arrange
        create({
          kind: 'correction',
          status: 'finished',
          selection: [makeSelected('a', 1, 150), makeFfa(2), makeFfa(3)],
          capacity: 3,
          members,
          registrations: [makeRegistration('b', 'Bob'), makeRegistration('c', 'Carol')],
        });

        // Act / Assert
        expect(panel.filteredAvailableRows()).toHaveLength(panel.availableRows().length);
      });
    });
  });
});
