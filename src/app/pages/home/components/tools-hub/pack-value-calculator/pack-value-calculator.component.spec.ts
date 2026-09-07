import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideAnimations } from '@angular/platform-browser/animations';
import { provideZonelessChangeDetection } from '@angular/core';
import { TranslateModule } from '@ngx-translate/core';
import { PackValueCalculatorComponent } from './pack-value-calculator.component';

describe('PackValueCalculatorComponent', () => {
  let component: PackValueCalculatorComponent;
  let fixture: ComponentFixture<PackValueCalculatorComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PackValueCalculatorComponent, TranslateModule.forRoot()],
      providers: [provideAnimations(), provideZonelessChangeDetection()],
    }).compileComponents();

    fixture = TestBed.createComponent(PackValueCalculatorComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should start with an empty items array', () => {
    expect(component['formModel']().items).toHaveLength(0);
  });

  it('should add an item row when addItem is called', () => {
    // Act
    component['addItem']();

    // Assert
    expect(component['formModel']().items).toHaveLength(1);
  });

  it('should remove an item row when removeItem is called with valid index', () => {
    // Arrange
    component['addItem']();
    component['addItem']();

    // Act
    component['removeItem'](0);

    // Assert
    expect(component['formModel']().items).toHaveLength(1);
  });

  it('should return false for isFormValid when no items are added', () => {
    // Arrange
    component['formModel'].update(m => ({ ...m, price: 9.99 }));

    // Assert
    expect(component['isFormValid']()).toBe(false);
  });

  it('should return false for isFormValid when items exist but price is missing', () => {
    // Arrange
    component['addItem']();
    component['formModel'].update(m => ({
      ...m,
      items: [{ itemId: 'fine-gold', quantity: 1 }],
    }));

    // Assert
    expect(component['isFormValid']()).toBe(false);
  });

  it('should return true for isFormValid when items and price are valid', () => {
    // Arrange
    component['addItem']();
    component['formModel'].update(m => ({
      ...m,
      items: [{ itemId: 'fine-gold', quantity: 1 }],
      price: 9.99,
    }));

    // Assert
    expect(component['isFormValid']()).toBe(true);
  });

  it('should set result signal after calculate with valid form', () => {
    // Arrange
    component['formModel'].set({ items: [{ itemId: 'legendary-gem', quantity: 1 }], price: 1 });

    // Act
    component['calculate']();

    // Assert
    const result = component.result();
    expect(result).not.toBeNull();
    expect(result?.totalApexCoins).toBe(180);
  });

  it('should not set result and mark form touched when calculate is called on an invalid form', () => {
    // Act
    component['calculate']();

    // Assert
    expect(component.result()).toBeNull();
    expect(component['packValueForm']().touched()).toBe(true);
  });

  it('should reset form and clear result when reset is called', () => {
    // Arrange
    component['formModel'].set({ items: [{ itemId: 'fine-gold', quantity: 2 }], price: 10 });
    component['calculate']();

    // Act
    component['reset']();

    // Assert
    expect(component.result()).toBeNull();
    expect(component['formModel']().items).toHaveLength(0);
    expect(component['formModel']().price).toBeNull();
  });
});
