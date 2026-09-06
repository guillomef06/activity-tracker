import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideAnimations } from '@angular/platform-browser/animations';
import { provideZonelessChangeDetection, signal } from '@angular/core';
import { form } from '@angular/forms/signals';
import { TranslateModule } from '@ngx-translate/core';
import { PackItemRowComponent, PackItemFormValue } from './pack-item-row.component';
import { PACK_ITEM_CATALOG } from '@shared/constants/pack-item-catalog.constant';

describe('PackItemRowComponent', () => {
  let component: PackItemRowComponent;
  let fixture: ComponentFixture<PackItemRowComponent>;

  const buildItemField = (initial: PackItemFormValue = { itemId: '', quantity: null }) =>
    TestBed.runInInjectionContext(() => form(signal(initial)));

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PackItemRowComponent, TranslateModule.forRoot()],
      providers: [provideAnimations(), provideZonelessChangeDetection()],
    }).compileComponents();

    fixture = TestBed.createComponent(PackItemRowComponent);
    component = fixture.componentInstance;

    fixture.componentRef.setInput('itemField', buildItemField());
    fixture.componentRef.setInput('catalog', PACK_ITEM_CATALOG);
    fixture.componentRef.setInput('index', 0);

    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should render a mat-select for item selection', () => {
    const select = fixture.nativeElement.querySelector('mat-select');
    expect(select).not.toBeNull();
  });

  it('should render a quantity input', () => {
    const input = fixture.nativeElement.querySelector('input[type="number"]');
    expect(input).not.toBeNull();
  });

  it('should render a remove button', () => {
    const button = fixture.nativeElement.querySelector('button');
    expect(button).not.toBeNull();
  });

  it('should emit removed event when remove button is clicked', () => {
    // Arrange
    let emitted = false;
    component.removed.subscribe(() => {
      emitted = true;
    });

    // Act
    const button = fixture.nativeElement.querySelector('button');
    button.click();

    // Assert
    expect(emitted).toBe(true);
  });

  it('should show "hours" unit label when speed-up item is selected', () => {
    // Arrange
    fixture.componentRef.setInput('itemField', buildItemField({ itemId: 'speed-up', quantity: null }));
    fixture.detectChanges();

    // Act & Assert
    expect(component['unitLabel']()).toBe('packValue.units.hours');
  });

  it('should show "qty" unit label when a non-speed-up item is selected', () => {
    // Arrange
    fixture.componentRef.setInput('itemField', buildItemField({ itemId: 'fine-gold', quantity: null }));
    fixture.detectChanges();

    // Act & Assert
    expect(component['unitLabel']()).toBe('packValue.units.qty');
  });

  it('should return undefined selectedItem when no item is selected', () => {
    expect(component['selectedItem']()).toBeUndefined();
  });
});
