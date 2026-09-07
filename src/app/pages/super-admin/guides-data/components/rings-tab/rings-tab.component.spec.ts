import { ComponentFixture, TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { provideZonelessChangeDetection } from '@angular/core';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { TranslateModule } from '@ngx-translate/core';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { of } from 'rxjs';
import { RingsTabComponent } from './rings-tab.component';
import { GuideAdminService } from '@app/core/services/guide-admin.service';
import { SnackbarService } from '@app/core/services';
import type { Ring } from '@app/shared/models/guide.model';

const mockRing: Ring = {
  id: 'r1',
  name: 'Ring of Vigor',
  description: 'Boosts stamina',
  icon_url: null,
  is_active: true,
  sort_order: 1,
};

describe('RingsTabComponent', () => {
  let fixture: ComponentFixture<RingsTabComponent>;
  let component: RingsTabComponent;
  let guideAdminSpy: {
    getRings: ReturnType<typeof vi.fn>;
    createRing: ReturnType<typeof vi.fn>;
    updateRing: ReturnType<typeof vi.fn>;
    deleteRing: ReturnType<typeof vi.fn>;
    uploadRingImage: ReturnType<typeof vi.fn>;
  };
  let snackbarSpy: { success: ReturnType<typeof vi.fn>; error: ReturnType<typeof vi.fn> };
  let dialogSpy: { open: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    guideAdminSpy = {
      getRings: vi.fn().mockResolvedValue([mockRing]),
      createRing: vi.fn().mockResolvedValue({ ring: mockRing, error: null }),
      updateRing: vi.fn().mockResolvedValue({ error: null }),
      deleteRing: vi.fn().mockResolvedValue({ error: null }),
      uploadRingImage: vi.fn().mockResolvedValue({ url: 'https://img.url/icon.png', error: null }),
    };
    snackbarSpy = { success: vi.fn(), error: vi.fn() };
    dialogSpy = { open: vi.fn().mockReturnValue({ afterClosed: () => of(true) }) };

    await TestBed.configureTestingModule({
      imports: [RingsTabComponent, TranslateModule.forRoot()],
      providers: [
        provideZonelessChangeDetection(),
        provideNoopAnimations(),
        { provide: GuideAdminService, useValue: guideAdminSpy },
        { provide: SnackbarService, useValue: snackbarSpy },
        { provide: MatDialog, useValue: dialogSpy },
      ],
    })
      .overrideComponent(RingsTabComponent, { remove: { imports: [MatDialogModule] } })
      .compileComponents();

    fixture = TestBed.createComponent(RingsTabComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should load rings on init', () => {
    expect(guideAdminSpy.getRings).toHaveBeenCalled();
    expect(component['rings']()).toEqual([mockRing]);
  });

  it('should be invalid when the add form name is empty', () => {
    expect(component['addForm']().valid()).toBe(false);
  });

  it('should add a ring', async () => {
    component['addModel'].set({ name: 'Ring of Vigor', description: 'desc', sort_order: 1 });

    await component['add']();

    expect(guideAdminSpy.createRing).toHaveBeenCalled();
    expect(snackbarSpy.success).toHaveBeenCalled();
  });

  it('should save edited ring', async () => {
    component['startEdit'](mockRing);
    component['editModel'].set({ name: 'Updated', description: 'desc', sort_order: 2 });

    await component['save'](mockRing);

    expect(guideAdminSpy.updateRing).toHaveBeenCalledWith('r1', expect.objectContaining({ name: 'Updated' }));
    expect(snackbarSpy.success).toHaveBeenCalled();
  });

  it('should toggle active state', async () => {
    await component['toggleActive'](mockRing);

    expect(guideAdminSpy.updateRing).toHaveBeenCalledWith('r1', { is_active: false });
  });

  it('should delete ring after confirmation', async () => {
    await component['delete'](mockRing);

    expect(guideAdminSpy.deleteRing).toHaveBeenCalledWith('r1');
    expect(snackbarSpy.success).toHaveBeenCalled();
  });

  it('should show error when the update service call fails', async () => {
    guideAdminSpy.updateRing.mockResolvedValue({ error: 'Server error' });
    component['startEdit'](mockRing);
    component['editModel'].set({ name: 'X', description: '', sort_order: 0 });

    await component['save'](mockRing);

    expect(snackbarSpy.error).toHaveBeenCalledWith('Server error');
  });
});
