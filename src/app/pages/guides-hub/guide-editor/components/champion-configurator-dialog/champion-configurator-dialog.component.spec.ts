import { ComponentFixture, TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
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

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ChampionConfiguratorDialogComponent, TranslateModule.forRoot()],
      providers: [
        provideAnimationsAsync(),
        { provide: MAT_DIALOG_DATA, useValue: MOCK_DATA },
        { provide: MatDialogRef, useValue: { close: vi.fn() } },
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
});
