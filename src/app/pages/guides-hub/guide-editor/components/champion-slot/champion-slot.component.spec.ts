import { ComponentFixture, TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { By } from '@angular/platform-browser';
import { ChampionSlotComponent } from './champion-slot.component';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { TranslateModule } from '@ngx-translate/core';

const FILLED_CONFIG = {
  position: 0,
  champion: { id: '1', name: 'Achilles', image_url: null, sort_order: 0, is_active: true },
  skills: [null, null] as [null, null],
  gems: [null, null, null] as [null, null, null],
  traits: [null, null, null] as [null, null, null],
  ornament: null,
  ring: null,
};

describe('ChampionSlotComponent', () => {
  let component: ChampionSlotComponent;
  let fixture: ComponentFixture<ChampionSlotComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ChampionSlotComponent, TranslateModule.forRoot()],
      providers: [provideAnimationsAsync()],
    }).compileComponents();

    fixture = TestBed.createComponent(ChampionSlotComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('position', 0);
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should show empty slot button when no config', () => {
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('.empty-slot-btn')).toBeTruthy();
  });

  it('should show champion info when config is provided', () => {
    fixture.componentRef.setInput('config', FILLED_CONFIG);
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('.champion-name')?.textContent).toContain('Achilles');
  });

  it('should emit editSlot when edit button clicked', () => {
    const spy = vi.fn();
    component.editSlot.subscribe(spy);

    fixture.componentRef.setInput('config', FILLED_CONFIG);
    fixture.detectChanges();

    const editBtn = fixture.debugElement.query(By.css('.slot-actions button:first-of-type'));
    editBtn.triggerEventHandler('click', null);

    expect(spy).toHaveBeenCalled();
  });
});
