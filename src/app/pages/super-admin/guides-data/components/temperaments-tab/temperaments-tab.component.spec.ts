import { ComponentFixture, TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { provideZonelessChangeDetection } from '@angular/core';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { TranslateModule } from '@ngx-translate/core';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { of } from 'rxjs';
import { TemperamentsTabComponent } from './temperaments-tab.component';
import { GuideAdminService } from '@app/core/services/guide-admin.service';
import { SnackbarService } from '@app/core/services';
import type { HorseTemperament } from '@app/shared/models/guide.model';

const mockTemperament: HorseTemperament = {
  id: 't1',
  name: 'Brave',
  description: 'A brave horse',
  sort_order: 1,
};

describe('TemperamentsTabComponent', () => {
  let fixture: ComponentFixture<TemperamentsTabComponent>;
  let component: TemperamentsTabComponent;
  let guideAdminSpy: {
    getHorseTemperaments: ReturnType<typeof vi.fn>;
    createHorseTemperament: ReturnType<typeof vi.fn>;
    updateHorseTemperament: ReturnType<typeof vi.fn>;
    deleteHorseTemperament: ReturnType<typeof vi.fn>;
  };
  let snackbarSpy: { success: ReturnType<typeof vi.fn>; error: ReturnType<typeof vi.fn> };
  let dialogSpy: { open: ReturnType<typeof vi.fn> };
  let dialogConfirmed = true;

  beforeEach(async () => {
    dialogConfirmed = true;
    guideAdminSpy = {
      getHorseTemperaments: vi.fn().mockResolvedValue([mockTemperament]),
      createHorseTemperament: vi.fn().mockResolvedValue({ temperament: mockTemperament, error: null }),
      updateHorseTemperament: vi.fn().mockResolvedValue({ error: null }),
      deleteHorseTemperament: vi.fn().mockResolvedValue({ error: null }),
    };
    snackbarSpy = { success: vi.fn(), error: vi.fn() };
    dialogSpy = { open: vi.fn().mockImplementation(() => ({ afterClosed: () => of(dialogConfirmed) })) };

    await TestBed.configureTestingModule({
      imports: [TemperamentsTabComponent, TranslateModule.forRoot()],
      providers: [
        provideZonelessChangeDetection(),
        provideNoopAnimations(),
        { provide: GuideAdminService, useValue: guideAdminSpy },
        { provide: SnackbarService, useValue: snackbarSpy },
        { provide: MatDialog, useValue: dialogSpy },
      ],
    })
      .overrideComponent(TemperamentsTabComponent, { remove: { imports: [MatDialogModule] } })
      .compileComponents();

    fixture = TestBed.createComponent(TemperamentsTabComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should load temperaments on init', () => {
    expect(guideAdminSpy.getHorseTemperaments).toHaveBeenCalled();
    expect(component['temperaments']()).toEqual([mockTemperament]);
  });

  it('should add a temperament', async () => {
    component['showAddForm'].set(true);
    component['addModel'].set({ name: 'Brave', description: 'desc', sort_order: 1 });

    await component['add']();

    expect(guideAdminSpy.createHorseTemperament).toHaveBeenCalled();
    expect(snackbarSpy.success).toHaveBeenCalled();
  });

  it('should show error when add fails', async () => {
    guideAdminSpy.createHorseTemperament.mockResolvedValue({ temperament: null, error: 'Error' });
    component['addModel'].set({ name: 'Brave', description: '', sort_order: 1 });

    await component['add']();

    expect(snackbarSpy.error).toHaveBeenCalled();
  });

  it('should reject an empty name in the add form', () => {
    component['addModel'].set({ name: '', description: '', sort_order: 1 });

    expect(component['addForm']().valid()).toBe(false);
  });

  it('should save edited temperament', async () => {
    component['startEdit'](mockTemperament);
    component['editModel'].set({ name: 'Updated', description: 'desc', sort_order: 2 });

    await component['save'](mockTemperament);

    expect(guideAdminSpy.updateHorseTemperament).toHaveBeenCalledWith(
      't1',
      expect.objectContaining({ name: 'Updated' })
    );
    expect(snackbarSpy.success).toHaveBeenCalled();
    expect(component['editingId']()).toBeNull();
  });

  it('should delete temperament after confirmation', async () => {
    await component['delete'](mockTemperament);

    expect(dialogSpy.open).toHaveBeenCalled();
    expect(guideAdminSpy.deleteHorseTemperament).toHaveBeenCalledWith('t1');
    expect(snackbarSpy.success).toHaveBeenCalled();
  });

  it('should not delete if confirmation is declined', async () => {
    dialogConfirmed = false;

    await component['delete'](mockTemperament);

    expect(guideAdminSpy.deleteHorseTemperament).not.toHaveBeenCalled();
  });
});
