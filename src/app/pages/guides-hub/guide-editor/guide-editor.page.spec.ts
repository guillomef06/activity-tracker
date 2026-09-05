import { ComponentFixture, TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { provideZonelessChangeDetection } from '@angular/core';
import { GuideEditorPage } from './guide-editor.page';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { provideRouter, Router } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { GuideService } from '@app/core/services/guide.service';
import { GuideAdminService } from '@app/core/services/guide-admin.service';
import { AuthService } from '@app/core/services/auth.service';
import { SnackbarService } from '@app/core/services';

const MOCK_GUIDE = {
  id: 'g1',
  title: 'Test guide',
  category: 'general' as const,
  slug: 'test-1234',
  is_published: false,
  upvotes_count: 0,
  description: null,
  created_at: '',
  updated_at: '',
  author_id: 'u1',
  guide_champions: [],
};

describe('GuideEditorPage', () => {
  let component: GuideEditorPage;
  let fixture: ComponentFixture<GuideEditorPage>;
  interface GuideServiceSpy {
    getGuideById: ReturnType<typeof vi.fn>;
    createGuide: ReturnType<typeof vi.fn>;
    updateGuide: ReturnType<typeof vi.fn>;
    saveGuideChampions: ReturnType<typeof vi.fn>;
  }

  let guideServiceSpy: GuideServiceSpy;
  let authServiceSpy: { getUserId: ReturnType<typeof vi.fn> };
  let routerSpy: { navigate: ReturnType<typeof vi.fn> };
  let snackbarSpy: { error: ReturnType<typeof vi.fn>; success: ReturnType<typeof vi.fn> };

  function buildGuideServiceSpy(overrides: Partial<GuideServiceSpy> = {}): GuideServiceSpy {
    return {
      getGuideById: vi.fn().mockResolvedValue(null),
      createGuide: vi.fn().mockResolvedValue({ guide: MOCK_GUIDE, error: null }),
      updateGuide: vi.fn().mockResolvedValue({ error: null }),
      saveGuideChampions: vi.fn().mockResolvedValue({ error: null }),
      ...overrides,
    };
  }

  const guideAdminServiceSpy = {
    getChampions: vi.fn().mockResolvedValue([]),
    getSkills: vi.fn().mockResolvedValue([]),
    getGems: vi.fn().mockResolvedValue([]),
    getHorseTemperaments: vi.fn().mockResolvedValue([]),
    getAdornments: vi.fn().mockResolvedValue([]),
    getRings: vi.fn().mockResolvedValue([]),
    getChampionSkills: vi.fn().mockResolvedValue([]),
  };

  async function createComponent(
    guideSvcOverrides: Parameters<typeof buildGuideServiceSpy>[0] = {},
    currentUserId = 'u1'
  ) {
    guideServiceSpy = buildGuideServiceSpy(guideSvcOverrides);
    authServiceSpy = { getUserId: vi.fn().mockReturnValue(currentUserId) };
    snackbarSpy = { error: vi.fn(), success: vi.fn() };

    await TestBed.configureTestingModule({
      imports: [GuideEditorPage, TranslateModule.forRoot()],
      providers: [
        provideZonelessChangeDetection(),
        provideAnimationsAsync(),
        provideRouter([]),
        { provide: GuideService, useValue: guideServiceSpy },
        { provide: GuideAdminService, useValue: guideAdminServiceSpy },
        { provide: AuthService, useValue: authServiceSpy },
        { provide: SnackbarService, useValue: snackbarSpy },
      ],
    }).compileComponents();

    routerSpy = TestBed.inject(Router) as unknown as { navigate: ReturnType<typeof vi.fn> };
    vi.spyOn(routerSpy, 'navigate').mockResolvedValue(true);

    fixture = TestBed.createComponent(GuideEditorPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  /** Sets the edit-mode guide id and waits for the guide resource to resolve. */
  async function loadGuideForEdit(id: string): Promise<void> {
    component['guideId'].set(id);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  afterEach(() => TestBed.resetTestingModule());

  it('should create', async () => {
    await createComponent();
    expect(component).toBeTruthy();
  });

  it('should be in create mode by default', async () => {
    await createComponent();
    expect(component['isEditMode']()).toBe(false);
  });

  it('should have invalid basic form initially when title is empty', async () => {
    await createComponent();
    expect(component['guideForm'].basic().invalid()).toBe(true);
  });

  it('should show formation slots when category is formation', async () => {
    await createComponent();
    component['formModel'].update(m => ({ ...m, basic: { ...m.basic, category: 'formation' } }));
    fixture.detectChanges();
    expect(component['isFormationCategory']()).toBe(true);
  });

  describe('guide resource — loading for edit', () => {
    it('should redirect and show error when current user is not the guide author', async () => {
      // Arrange — guide belongs to 'u1', logged-in user is 'u2'
      await createComponent({ getGuideById: vi.fn().mockResolvedValue({ ...MOCK_GUIDE, author_id: 'u1' }) }, 'u2');

      // Act
      await loadGuideForEdit('g1');

      // Assert
      expect(snackbarSpy.error).toHaveBeenCalled();
      expect(routerSpy.navigate).toHaveBeenCalledWith(['/app/guides']);
    });

    it('should load the guide normally when current user is the author', async () => {
      // Arrange — guide belongs to 'u1', logged-in user is 'u1'
      await createComponent({ getGuideById: vi.fn().mockResolvedValue({ ...MOCK_GUIDE, author_id: 'u1' }) }, 'u1');

      // Act
      await loadGuideForEdit('g1');

      // Assert
      expect(snackbarSpy.error).not.toHaveBeenCalled();
      expect(component['formModel']().basic.title).toBe('Test guide');
    });

    it('should redirect with not-found error when guide does not exist', async () => {
      // Arrange
      await createComponent({ getGuideById: vi.fn().mockResolvedValue(null) });

      // Act
      await loadGuideForEdit('unknown-id');

      // Assert
      expect(snackbarSpy.error).toHaveBeenCalled();
      expect(routerSpy.navigate).toHaveBeenCalledWith(['/app/guides']);
    });
  });

  describe('save', () => {
    it('should not save when the basic form is invalid', async () => {
      await createComponent();

      await component['save']();

      expect(guideServiceSpy.createGuide).not.toHaveBeenCalled();
    });

    it('should create a new guide when the form is valid', async () => {
      await createComponent();
      component['formModel'].update(m => ({ ...m, basic: { title: 'My guide', category: 'general' } }));

      await component['save']();

      expect(guideServiceSpy.createGuide).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'My guide', category: 'general' })
      );
      expect(snackbarSpy.success).toHaveBeenCalled();
    });
  });
});
