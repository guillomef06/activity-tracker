import { ComponentFixture, TestBed } from '@angular/core/testing';
import { GemCalculatorComponent } from './gem-calculator.component';
import { TranslateModule } from '@ngx-translate/core';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { provideZonelessChangeDetection } from '@angular/core';

describe('GemCalculatorComponent', () => {
  let component: GemCalculatorComponent;
  let fixture: ComponentFixture<GemCalculatorComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [GemCalculatorComponent, TranslateModule.forRoot(), NoopAnimationsModule],
      providers: [provideZonelessChangeDetection()],
    }).compileComponents();

    fixture = TestBed.createComponent(GemCalculatorComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should initialize form with defaults', () => {
    expect(component['form'].get('troopType')?.value).toBe('swordsmen');
    expect(component['form'].get('troopTier')?.value).toBe(7);
    expect(component['form'].get('verbose')?.value).toBe(false);
  });

  it('should not compute result when form is invalid', () => {
    component['analyze']();
    expect(component['result']()).toBeNull();
  });

  it('should compute health gem score', () => {
    component['form'].patchValue({
      troopType: 'swordsmen',
      troopTier: 7,
      legionSize: 100000,
      healthBonus: 0,
      mightAttack: 0,
      mightDefense: 0,
      gemType: 'health',
      gemTier: 6, // Mythic: 1.53%
    });
    component['analyze']();
    const res = component['result']();
    expect(res).not.toBeNull();
    expect(res!.gemType).toBe('health');
    expect(res!.rawValue).toBe(1.53);
    // delta = 100_000 × 146 × (1.53 / 100) = 223_380
    expect(res!.delta).toBeCloseTo(223_380, 0);
  });

  it('should compute capacity gem score', () => {
    component['form'].patchValue({
      troopType: 'swordsmen',
      troopTier: 7,
      legionSize: 100000,
      healthBonus: 0,
      mightAttack: 0,
      mightDefense: 0,
      gemType: 'capacity',
      gemTier: 5, // Legendary: 500 units
    });
    component['analyze']();
    const res = component['result']();
    expect(res).not.toBeNull();
    expect(res!.gemType).toBe('capacity');
    expect(res!.rawValue).toBe(500);
    // perUnitScore = 146 + 194 + 146 = 486  (swordsmen T7, no bonuses)
    // delta = 500 × 486 = 243_000
    expect(res!.delta).toBeCloseTo(243_000, 0);
  });

  it('should emit back event when showBack is true', async () => {
    fixture.componentRef.setInput('showBack', true);
    fixture.detectChanges();
    const spy = vi.fn();
    component.back.subscribe(spy);
    fixture.nativeElement.querySelector('.back-button')?.click();
    expect(spy).toHaveBeenCalled();
  });
});
