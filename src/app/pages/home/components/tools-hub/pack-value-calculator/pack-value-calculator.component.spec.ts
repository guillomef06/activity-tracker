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
    expect(component.itemsArray.length).toBe(0);
  });

  it('should add an item row when addItem is called', () => {
    // Act
    component.addItem();

    // Assert
    expect(component.itemsArray.length).toBe(1);
  });

  it('should remove an item row when removeItem is called with valid index', () => {
    // Arrange
    component.addItem();
    component.addItem();

    // Act
    component.removeItem(0);

    // Assert
    expect(component.itemsArray.length).toBe(1);
  });

  it('should return false for isFormValid when no items are added', () => {
    // Arrange
    component.form.patchValue({ price: 9.99 });

    // Assert
    expect(component.isFormValid).toBe(false);
  });

  it('should return false for isFormValid when items exist but price is missing', () => {
    // Arrange
    component.addItem();
    component.itemsArray.at(0).patchValue({ itemId: 'fine-gold', quantity: 1 });

    // Assert
    expect(component.isFormValid).toBe(false);
  });

  it('should return true for isFormValid when items and price are valid', () => {
    // Arrange
    component.addItem();
    component.itemsArray.at(0).patchValue({ itemId: 'fine-gold', quantity: 1 });
    component.form.patchValue({ price: 9.99 });

    // Assert
    expect(component.isFormValid).toBe(true);
  });

  it('should set result signal after calculate with valid form', () => {
    // Arrange
    component.addItem();
    component.itemsArray.at(0).patchValue({ itemId: 'legendary-gem', quantity: 1 });
    component.form.patchValue({ price: 1 });

    // Act
    component.calculate();

    // Assert
    const result = component.result();
    expect(result).not.toBeNull();
    expect(result!.totalApexCoins).toBe(180);
  });

  it('should reset form and clear result when reset is called', () => {
    // Arrange
    component.addItem();
    component.itemsArray.at(0).patchValue({ itemId: 'fine-gold', quantity: 2 });
    component.form.patchValue({ price: 10 });
    component.calculate();

    // Act
    component.reset();

    // Assert
    expect(component.result()).toBeNull();
    expect(component.itemsArray.length).toBe(0);
    expect(component.form.get('price')?.value).toBeNull();
  });

  it('should return the PackItem for a given row index', () => {
    // Arrange
    component.addItem();
    component.itemsArray.at(0).patchValue({ itemId: 'speed-up', quantity: 10 });

    // Act
    const item = component.getItemForRow(0);

    // Assert
    expect(item).toBeDefined();
    expect(item!.id).toBe('speed-up');
    expect(item!.unitKey).toBe('packValue.units.hours');
  });

  it('should return undefined for getItemForRow when no item is selected', () => {
    // Arrange
    component.addItem();

    // Act
    const item = component.getItemForRow(0);

    // Assert
    expect(item).toBeUndefined();
  });
});
