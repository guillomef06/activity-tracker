import { ComponentFixture, TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { TranslateModule } from '@ngx-translate/core';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { of } from 'rxjs';
import { OrnamentsTabComponent } from './ornaments-tab.component';
import { GuideAdminService } from '@app/core/services/guide-admin.service';
import { SnackbarService } from '@app/core/services';
import type { Ornament } from '@app/shared/models/guide.model';

const mockOrnament: Ornament = {
  id: 'o1',
  name: 'Golden Shield',
  image_url: null,
  is_active: true,
  sort_order: 1,
};

describe('OrnamentsTabComponent', () => {
  let fixture: ComponentFixture<OrnamentsTabComponent>;
  let component: OrnamentsTabComponent;
  let guideAdminSpy: {
    getOrnaments: ReturnType<typeof vi.fn>;
    createOrnament: ReturnType<typeof vi.fn>;
    updateOrnament: ReturnType<typeof vi.fn>;
    deleteOrnament: ReturnType<typeof vi.fn>;
  };
  let snackbarSpy: { success: ReturnType<typeof vi.fn>; error: ReturnType<typeof vi.fn> };
  let dialogSpy: { open: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    guideAdminSpy = {
      getOrnaments: vi.fn().mockResolvedValue([mockOrnament]),
      createOrnament: vi.fn().mockResolvedValue({ ornament: mockOrnament, error: null }),
      updateOrnament: vi.fn().mockResolvedValue({ error: null }),
      deleteOrnament: vi.fn().mockResolvedValue({ error: null }),
    };
    snackbarSpy = { success: vi.fn(), error: vi.fn() };
    dialogSpy = { open: vi.fn().mockReturnValue({ afterClosed: () => of(true) }) };

    await TestBed.configureTestingModule({
      imports: [OrnamentsTabComponent, TranslateModule.forRoot()],
      providers: [
        provideNoopAnimations(),
        { provide: GuideAdminService, useValue: guideAdminSpy },
        { provide: SnackbarService, useValue: snackbarSpy },
        { provide: MatDialog, useValue: dialogSpy },
      ],
    })
      .overrideComponent(OrnamentsTabComponent, { remove: { imports: [MatDialogModule] } })
      .compileComponents();

    fixture = TestBed.createComponent(OrnamentsTabComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should load ornaments on init', () => {
    expect(guideAdminSpy.getOrnaments).toHaveBeenCalled();
    expect(component['ornaments']()).toEqual([mockOrnament]);
  });

  it('should toggle active state', async () => {
    await component['toggleActive'](mockOrnament);

    expect(guideAdminSpy.updateOrnament).toHaveBeenCalledWith('o1', { is_active: false });
  });

  it('should save edited ornament', async () => {
    component['startEdit'](mockOrnament);
    component['editForm'].patchValue({ name: 'Updated', sort_order: 2 });

    await component['save'](mockOrnament);

    expect(guideAdminSpy.updateOrnament).toHaveBeenCalledWith('o1', expect.objectContaining({ name: 'Updated' }));
    expect(snackbarSpy.success).toHaveBeenCalled();
  });

  it('should delete ornament after confirmation', async () => {
    await component['delete'](mockOrnament);

    expect(guideAdminSpy.deleteOrnament).toHaveBeenCalledWith('o1');
    expect(snackbarSpy.success).toHaveBeenCalled();
  });
});
