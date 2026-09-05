import { ComponentFixture, TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { provideZonelessChangeDetection } from '@angular/core';
import { ChampionConfiguratorDialogComponent } from './champion-configurator-dialog.component';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { TranslateModule } from '@ngx-translate/core';
import type { ChampionConfiguratorDialogData } from './champion-configurator-dialog.component';

const MOCK_DATA: ChampionConfiguratorDialogData = {
  position: 0,
  existing: null,
  champions: [{ id: 'c1', name: 'Achilles', image_url: null, sort_order: 0, is_active: true }],
  skills: [{ id: 's1', name: 'Fury', description: null, icon_url: null, is_active: true, sort_order: 0 }],
  gems: [{ id: 'g1', name: 'Ruby', type: 'strategy', icon_url: null, is_active: true }],
  temperaments: [{ id: 't1', name: 'Ardent', description: null, sort_order: 0 }],
  adornments: [{ id: 'o1', name: 'Crown', image_url: null, is_active: true, sort_order: 0 }],
  rings: [{ id: 'r1', name: 'Iron Ring', description: null, icon_url: null, is_active: true, sort_order: 0 }],
  usedRingIds: [],
  championSkillsMap: new Map([
    ['c1', [{ id: 's1', name: 'Fury', description: null, icon_url: null, is_active: true, sort_order: 0 }]],
  ]),
};

describe('ChampionConfiguratorDialogComponent', () => {
  let component: ChampionConfiguratorDialogComponent;
  let fixture: ComponentFixture<ChampionConfiguratorDialogComponent>;
  let dialogRefSpy: { close: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    dialogRefSpy = { close: vi.fn() };

    await TestBed.configureTestingModule({
      imports: [ChampionConfiguratorDialogComponent, TranslateModule.forRoot()],
      providers: [
        provideZonelessChangeDetection(),
        provideAnimationsAsync(),
        { provide: MAT_DIALOG_DATA, useValue: MOCK_DATA },
        { provide: MatDialogRef, useValue: dialogRefSpy },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(ChampionConfiguratorDialogComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should disable confirm when no champion selected', () => {
    const btn = fixture.nativeElement.querySelector('[color="primary"]') as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
  });

  it('should enable confirm once a champion is selected', () => {
    // Act
    component['onChampionChange']('c1');
    fixture.detectChanges();

    // Assert
    expect(component['championForm']().invalid()).toBe(false);
  });

  it('should clear skill selections when the champion changes', () => {
    // Arrange
    component['formModel'].update(m => ({ ...m, champion_id: 'c1', skill1_id: 's1' }));

    // Act
    component['onChampionChange']('c1');

    // Assert
    expect(component['formModel']().skill1_id).toBeNull();
    expect(component['formModel']().skill2_id).toBeNull();
  });

  it('should not confirm when the form is invalid', () => {
    // Act
    component['confirm']();

    // Assert
    expect(dialogRefSpy.close).not.toHaveBeenCalled();
  });

  it('should close the dialog with the built slot config when confirmed', () => {
    // Arrange
    component['onChampionChange']('c1');

    // Act
    component['confirm']();

    // Assert
    expect(dialogRefSpy.close).toHaveBeenCalledWith(
      expect.objectContaining({ position: 0, champion: expect.objectContaining({ id: 'c1' }) })
    );
  });

  it('should close the dialog with null when cancelled', () => {
    // Act
    component['cancel']();

    // Assert
    expect(dialogRefSpy.close).toHaveBeenCalledWith(null);
  });

  it('should add and remove trait slots', () => {
    // Arrange
    expect(component['traitCount']()).toBe(1);

    // Act
    component['addTrait']();

    // Assert
    expect(component['traitCount']()).toBe(2);

    // Act
    component['removeTrait'](2);

    // Assert
    expect(component['traitCount']()).toBe(1);
    expect(component['formModel']().trait2_id).toBeNull();
  });
});
