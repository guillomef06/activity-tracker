import { ComponentFixture, TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { TranslateModule } from '@ngx-translate/core';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { of } from 'rxjs';
import { GemsTabComponent } from './gems-tab.component';
import { GuideAdminService } from '@app/core/services/guide-admin.service';
import { SnackbarService } from '@app/core/services';
import type { Gem } from '@app/shared/models/guide.model';

const mockGem: Gem = {
  id: 'g1',
  name: 'Fire Gem',
  type: 'strategy',
  icon_url: null,
  is_active: true,
};

describe('GemsTabComponent', () => {
  let fixture: ComponentFixture<GemsTabComponent>;
  let component: GemsTabComponent;
  let guideAdminSpy: {
    getGems: ReturnType<typeof vi.fn>;
    createGem: ReturnType<typeof vi.fn>;
    updateGem: ReturnType<typeof vi.fn>;
    deleteGem: ReturnType<typeof vi.fn>;
    uploadGemImage: ReturnType<typeof vi.fn>;
  };
  let snackbarSpy: { success: ReturnType<typeof vi.fn>; error: ReturnType<typeof vi.fn> };
  let dialogSpy: { open: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    guideAdminSpy = {
      getGems: vi.fn().mockResolvedValue([mockGem]),
      createGem: vi.fn().mockResolvedValue({ gem: mockGem, error: null }),
      updateGem: vi.fn().mockResolvedValue({ error: null }),
      deleteGem: vi.fn().mockResolvedValue({ error: null }),
      uploadGemImage: vi.fn().mockResolvedValue({ url: null, error: null }),
    };
    snackbarSpy = { success: vi.fn(), error: vi.fn() };
    dialogSpy = { open: vi.fn().mockReturnValue({ afterClosed: () => of(true) }) };

    await TestBed.configureTestingModule({
      imports: [GemsTabComponent, TranslateModule.forRoot()],
      providers: [
        provideNoopAnimations(),
        { provide: GuideAdminService, useValue: guideAdminSpy },
        { provide: SnackbarService, useValue: snackbarSpy },
        { provide: MatDialog, useValue: dialogSpy },
      ],
    })
      .overrideComponent(GemsTabComponent, { remove: { imports: [MatDialogModule] } })
      .compileComponents();

    fixture = TestBed.createComponent(GemsTabComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should load gems on init', () => {
    expect(guideAdminSpy.getGems).toHaveBeenCalled();
    expect(component['gems']()).toEqual([mockGem]);
  });

  it('should filter gems by type', () => {
    const tacticGem: Gem = { ...mockGem, id: 'g2', type: 'tactics' };
    component['gems'].set([mockGem, tacticGem]);
    component['typeFilter'].set('tactics');

    expect(component['filteredGems']()).toEqual([tacticGem]);
  });

  it('should add a gem', async () => {
    component['addForm'].setValue({ name: 'Fire Gem', type: 'hero' });

    await component['add']();

    expect(guideAdminSpy.createGem).toHaveBeenCalled();
    expect(snackbarSpy.success).toHaveBeenCalled();
  });

  it('should save edited gem', async () => {
    component['startEdit'](mockGem);
    component['editForm'].patchValue({ name: 'Updated', type: 'tactics' });

    await component['save'](mockGem);

    expect(guideAdminSpy.updateGem).toHaveBeenCalledWith(
      'g1',
      expect.objectContaining({ name: 'Updated', type: 'tactics' })
    );
    expect(snackbarSpy.success).toHaveBeenCalled();
  });

  it('should delete gem after confirmation', async () => {
    await component['delete'](mockGem);

    expect(guideAdminSpy.deleteGem).toHaveBeenCalledWith('g1');
    expect(snackbarSpy.success).toHaveBeenCalled();
  });
});
