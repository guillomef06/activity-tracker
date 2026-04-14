import { ComponentFixture, TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { signal, provideZonelessChangeDetection } from '@angular/core';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { MatDialog } from '@angular/material/dialog';
import { TranslateModule } from '@ngx-translate/core';

import { GuidesDataPage } from './guides-data.page';
import { GuideAdminService } from '@app/core/services/guide-admin.service';
import { SnackbarService } from '@app/core/services';
import { ProgressBarService } from '@app/core/services/progress-bar.service';
import type { Champion, Skill, HorseTemperament, Ornament, Gem } from '@app/shared/models/guide.model';

// ─── Fixtures ────────────────────────────────────────────────────────────────

const makeChampion = (overrides: Partial<Champion> = {}): Champion => ({
  id: 'champ-1',
  name: 'Warrior',
  image_url: null,
  sort_order: 0,
  is_active: true,
  ...overrides,
});

const makeSkill = (overrides: Partial<Skill> = {}): Skill => ({
  id: 'skill-1',
  name: 'Slash',
  description: 'A powerful slash',
  icon_url: null,
  is_active: true,
  sort_order: 0,
  ...overrides,
});

const makeTemperament = (overrides: Partial<HorseTemperament> = {}): HorseTemperament => ({
  id: 'temp-1',
  name: 'Fierce',
  description: null,
  sort_order: 0,
  ...overrides,
});

const makeOrnament = (overrides: Partial<Ornament> = {}): Ornament => ({
  id: 'orn-1',
  name: 'Golden Crown',
  image_url: null,
  is_active: true,
  sort_order: 0,
  ...overrides,
});

const makeGem = (overrides: Partial<Gem> = {}): Gem => ({
  id: 'gem-1',
  name: 'Ruby T5',
  type: 'strategy',
  icon_url: null,
  is_active: true,
  ...overrides,
});

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('GuidesDataPage', () => {
  let fixture: ComponentFixture<GuidesDataPage>;
  let component: GuidesDataPage;
  let guideAdminMock: {
    getChampions: ReturnType<typeof vi.fn>;
    getSkills: ReturnType<typeof vi.fn>;
    getHorseTemperaments: ReturnType<typeof vi.fn>;
    getOrnaments: ReturnType<typeof vi.fn>;
    getGems: ReturnType<typeof vi.fn>;
    getRings: ReturnType<typeof vi.fn>;
    getChampionSkills: ReturnType<typeof vi.fn>;
    createChampion: ReturnType<typeof vi.fn>;
    updateChampion: ReturnType<typeof vi.fn>;
    deleteChampion: ReturnType<typeof vi.fn>;
    uploadChampionImage: ReturnType<typeof vi.fn>;
    createSkill: ReturnType<typeof vi.fn>;
    updateSkill: ReturnType<typeof vi.fn>;
    deleteSkill: ReturnType<typeof vi.fn>;
    uploadSkillImage: ReturnType<typeof vi.fn>;
    assignSkillToChampion: ReturnType<typeof vi.fn>;
    removeSkillFromChampion: ReturnType<typeof vi.fn>;
    createHorseTemperament: ReturnType<typeof vi.fn>;
    updateHorseTemperament: ReturnType<typeof vi.fn>;
    deleteHorseTemperament: ReturnType<typeof vi.fn>;
    createOrnament: ReturnType<typeof vi.fn>;
    updateOrnament: ReturnType<typeof vi.fn>;
    deleteOrnament: ReturnType<typeof vi.fn>;
    createGem: ReturnType<typeof vi.fn>;
    updateGem: ReturnType<typeof vi.fn>;
    deleteGem: ReturnType<typeof vi.fn>;
    uploadGemImage: ReturnType<typeof vi.fn>;
    uploadRingImage: ReturnType<typeof vi.fn>;
  };

  let snackbarMock: { success: ReturnType<typeof vi.fn>; error: ReturnType<typeof vi.fn> };
  let progressBarMock: { withProgress: ReturnType<typeof vi.fn>; isLoading: () => boolean };
  let dialogMock: { open: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    guideAdminMock = {
      getChampions: vi.fn().mockResolvedValue([makeChampion()]),
      getSkills: vi.fn().mockResolvedValue([makeSkill()]),
      getHorseTemperaments: vi.fn().mockResolvedValue([makeTemperament()]),
      getOrnaments: vi.fn().mockResolvedValue([makeOrnament()]),
      getGems: vi.fn().mockResolvedValue([makeGem()]),
      getRings: vi.fn().mockResolvedValue([]),
      getChampionSkills: vi.fn().mockResolvedValue([]),
      createChampion: vi.fn().mockResolvedValue({ champion: makeChampion({ id: 'new' }), error: null }),
      updateChampion: vi.fn().mockResolvedValue({ error: null }),
      deleteChampion: vi.fn().mockResolvedValue({ error: null }),
      uploadChampionImage: vi.fn().mockResolvedValue({ url: 'https://cdn.example.com/img.png', error: null }),
      createSkill: vi.fn().mockResolvedValue({ skill: makeSkill({ id: 'new' }), error: null }),
      updateSkill: vi.fn().mockResolvedValue({ error: null }),
      deleteSkill: vi.fn().mockResolvedValue({ error: null }),
      uploadSkillImage: vi.fn().mockResolvedValue({ url: 'https://cdn.example.com/skill.png', error: null }),
      assignSkillToChampion: vi.fn().mockResolvedValue({ error: null }),
      removeSkillFromChampion: vi.fn().mockResolvedValue({ error: null }),
      createHorseTemperament: vi.fn().mockResolvedValue({ temperament: makeTemperament({ id: 'new' }), error: null }),
      updateHorseTemperament: vi.fn().mockResolvedValue({ error: null }),
      deleteHorseTemperament: vi.fn().mockResolvedValue({ error: null }),
      createOrnament: vi.fn().mockResolvedValue({ ornament: makeOrnament({ id: 'new' }), error: null }),
      updateOrnament: vi.fn().mockResolvedValue({ error: null }),
      deleteOrnament: vi.fn().mockResolvedValue({ error: null }),
      createGem: vi.fn().mockResolvedValue({ gem: makeGem({ id: 'new' }), error: null }),
      updateGem: vi.fn().mockResolvedValue({ error: null }),
      deleteGem: vi.fn().mockResolvedValue({ error: null }),
      uploadGemImage: vi.fn().mockResolvedValue({ url: 'https://cdn.example.com/gem.png', error: null }),
      uploadRingImage: vi.fn().mockResolvedValue({ url: 'https://cdn.example.com/ring.png', error: null }),
    };

    snackbarMock = {
      success: vi.fn(),
      error: vi.fn(),
    };

    progressBarMock = {
      withProgress: vi.fn().mockImplementation(async (fn: () => Promise<void>) => fn()),
      isLoading: () => false,
    };

    dialogMock = {
      open: vi.fn().mockReturnValue({ afterClosed: () => ({ pipe: vi.fn(), subscribe: vi.fn() }) }),
    };

    await TestBed.configureTestingModule({
      imports: [GuidesDataPage, NoopAnimationsModule, TranslateModule.forRoot()],
      providers: [
        provideZonelessChangeDetection(),
        { provide: GuideAdminService, useValue: guideAdminMock },
        { provide: SnackbarService, useValue: snackbarMock },
        { provide: ProgressBarService, useValue: progressBarMock },
        { provide: MatDialog, useValue: dialogMock },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(GuidesDataPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
    await fixture.whenStable();
  });

  it('should be created', () => {
    expect(component).toBeTruthy();
  });

  it('should load all reference data on init', () => {
    expect(guideAdminMock.getChampions).toHaveBeenCalledOnce();
    expect(guideAdminMock.getSkills).toHaveBeenCalledOnce();
    expect(guideAdminMock.getHorseTemperaments).toHaveBeenCalledOnce();
    expect(guideAdminMock.getOrnaments).toHaveBeenCalledOnce();
    expect(guideAdminMock.getGems).toHaveBeenCalledOnce();
    expect(guideAdminMock.getRings).toHaveBeenCalledOnce();
  });

  describe('Champion inline edit', () => {
    it('should enter edit mode when startEditChampion is called', () => {
      const champion = makeChampion();
      (component as unknown as { startEditChampion: (c: Champion) => void }).startEditChampion(champion);

      const editingId = (component as unknown as { editingChampionId: ReturnType<typeof signal<string | null>> })
        .editingChampionId;
      expect(editingId()).toBe(champion.id);
    });

    it('should clear edit state when cancelEditChampion is called', () => {
      const champion = makeChampion();
      (component as unknown as { startEditChampion: (c: Champion) => void }).startEditChampion(champion);
      (component as unknown as { cancelEditChampion: () => void }).cancelEditChampion();

      const editingId = (component as unknown as { editingChampionId: ReturnType<typeof signal<string | null>> })
        .editingChampionId;
      expect(editingId()).toBeNull();
    });

    it('should call updateChampion and show success snackbar when saveChampion succeeds', async () => {
      const champion = makeChampion();
      const page = component as unknown as {
        startEditChampion: (c: Champion) => void;
        saveChampion: (c: Champion) => Promise<void>;
        editChampionForm: { patchValue: (v: unknown) => void; valid: boolean; invalid: boolean; value: unknown };
      };
      page.startEditChampion(champion);

      await page.saveChampion(champion);

      expect(guideAdminMock.updateChampion).toHaveBeenCalled();
      expect(snackbarMock.success).toHaveBeenCalled();
    });
  });

  describe('Gem filtering', () => {
    it('should return all gems when no filter is applied', () => {
      const gems = [makeGem({ type: 'strategy' }), makeGem({ id: 'gem-2', type: 'hero' })];
      (component as unknown as { gems: ReturnType<typeof signal<Gem[]>> }).gems.set(gems);
      (component as unknown as { gemTypeFilter: ReturnType<typeof signal<string>> }).gemTypeFilter.set('');

      const filtered = (component as unknown as { filteredGems: () => Gem[] }).filteredGems();
      expect(filtered).toHaveLength(2);
    });

    it('should filter gems by type when filter is set', () => {
      const gems = [makeGem({ type: 'strategy' }), makeGem({ id: 'gem-2', type: 'hero' })];
      (component as unknown as { gems: ReturnType<typeof signal<Gem[]>> }).gems.set(gems);
      (component as unknown as { gemTypeFilter: ReturnType<typeof signal<string>> }).gemTypeFilter.set('strategy');

      const filtered = (component as unknown as { filteredGems: () => Gem[] }).filteredGems();
      expect(filtered).toHaveLength(1);
      expect(filtered[0].type).toBe('strategy');
    });
  });

  describe('Champion skills panel', () => {
    it('should load and show champion skills when toggleChampionPanel is called', async () => {
      const champion = makeChampion();
      const skill = makeSkill();
      guideAdminMock.getChampionSkills.mockResolvedValue([skill]);

      await (component as unknown as { toggleChampionPanel: (c: Champion) => Promise<void> }).toggleChampionPanel(
        champion
      );

      const expandedId = (component as unknown as { expandedChampionId: ReturnType<typeof signal<string | null>> })
        .expandedChampionId;
      const championSkills = (component as unknown as { championSkills: ReturnType<typeof signal<Skill[]>> })
        .championSkills;
      expect(expandedId()).toBe(champion.id);
      expect(championSkills()).toHaveLength(1);
    });

    it('should collapse panel when toggleChampionPanel is called again for same champion', async () => {
      const champion = makeChampion();
      const togglePanel = (
        component as unknown as { toggleChampionPanel: (c: Champion) => Promise<void> }
      ).toggleChampionPanel.bind(component);
      const expandedId = (component as unknown as { expandedChampionId: ReturnType<typeof signal<string | null>> })
        .expandedChampionId;

      await togglePanel(champion);
      expect(expandedId()).toBe(champion.id);

      await togglePanel(champion);
      expect(expandedId()).toBeNull();
    });
  });

  describe('Active toggle', () => {
    it('should call updateChampion with toggled is_active value', async () => {
      const champion = makeChampion({ is_active: true });
      await (component as unknown as { toggleChampionActive: (c: Champion) => Promise<void> }).toggleChampionActive(
        champion
      );

      expect(guideAdminMock.updateChampion).toHaveBeenCalledWith(champion.id, { is_active: false });
    });
  });
});
