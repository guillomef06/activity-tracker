import { ComponentFixture, TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { provideZonelessChangeDetection } from '@angular/core';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { TranslateModule } from '@ngx-translate/core';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { of } from 'rxjs';
import { SkillsTabComponent } from './skills-tab.component';
import { GuideAdminService } from '@app/core/services/guide-admin.service';
import { SnackbarService } from '@app/core/services';
import type { Skill } from '@app/shared/models/guide.model';

const mockSkill: Skill = {
  id: 's1',
  name: 'Slash',
  description: 'A powerful slash',
  icon_url: null,
  is_active: true,
  sort_order: 1,
};

describe('SkillsTabComponent', () => {
  let fixture: ComponentFixture<SkillsTabComponent>;
  let component: SkillsTabComponent;
  let guideAdminSpy: {
    getSkills: ReturnType<typeof vi.fn>;
    createSkill: ReturnType<typeof vi.fn>;
    updateSkill: ReturnType<typeof vi.fn>;
    deleteSkill: ReturnType<typeof vi.fn>;
    uploadSkillImage: ReturnType<typeof vi.fn>;
  };
  let snackbarSpy: { success: ReturnType<typeof vi.fn>; error: ReturnType<typeof vi.fn> };
  let dialogSpy: { open: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    guideAdminSpy = {
      getSkills: vi.fn().mockResolvedValue([mockSkill]),
      createSkill: vi.fn().mockResolvedValue({ skill: mockSkill, error: null }),
      updateSkill: vi.fn().mockResolvedValue({ error: null }),
      deleteSkill: vi.fn().mockResolvedValue({ error: null }),
      uploadSkillImage: vi.fn().mockResolvedValue({ url: 'https://img.url/icon.png', error: null }),
    };
    snackbarSpy = { success: vi.fn(), error: vi.fn() };
    dialogSpy = { open: vi.fn().mockReturnValue({ afterClosed: () => of(true) }) };

    await TestBed.configureTestingModule({
      imports: [SkillsTabComponent, TranslateModule.forRoot()],
      providers: [
        provideZonelessChangeDetection(),
        provideNoopAnimations(),
        { provide: GuideAdminService, useValue: guideAdminSpy },
        { provide: SnackbarService, useValue: snackbarSpy },
        { provide: MatDialog, useValue: dialogSpy },
      ],
    })
      .overrideComponent(SkillsTabComponent, { remove: { imports: [MatDialogModule] } })
      .compileComponents();

    fixture = TestBed.createComponent(SkillsTabComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should load skills on init', () => {
    expect(guideAdminSpy.getSkills).toHaveBeenCalled();
    expect(component['skills']()).toEqual([mockSkill]);
  });

  it('should add a skill', async () => {
    component['addModel'].set({ name: 'Slash', description: 'desc', sort_order: 1 });

    await component['add']();

    expect(guideAdminSpy.createSkill).toHaveBeenCalled();
    expect(snackbarSpy.success).toHaveBeenCalled();
  });

  it('should save edited skill', async () => {
    component['startEdit'](mockSkill);
    component['editModel'].set({ name: 'Updated', description: 'desc', sort_order: 2 });

    await component['save'](mockSkill);

    expect(guideAdminSpy.updateSkill).toHaveBeenCalledWith('s1', expect.objectContaining({ name: 'Updated' }));
    expect(snackbarSpy.success).toHaveBeenCalled();
  });

  it('should toggle active state', async () => {
    await component['toggleActive'](mockSkill);

    expect(guideAdminSpy.updateSkill).toHaveBeenCalledWith('s1', { is_active: false });
  });

  it('should delete skill after confirmation', async () => {
    await component['delete'](mockSkill);

    expect(guideAdminSpy.deleteSkill).toHaveBeenCalledWith('s1');
    expect(snackbarSpy.success).toHaveBeenCalled();
  });

  it('should show error when service fails', async () => {
    guideAdminSpy.updateSkill.mockResolvedValue({ error: 'Server error' });
    component['startEdit'](mockSkill);
    component['editModel'].set({ name: 'X', description: '', sort_order: 0 });

    await component['save'](mockSkill);

    expect(snackbarSpy.error).toHaveBeenCalledWith('Server error');
  });
});
