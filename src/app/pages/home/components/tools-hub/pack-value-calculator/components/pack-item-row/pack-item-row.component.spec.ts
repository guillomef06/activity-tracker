import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideAnimations } from '@angular/platform-browser/animations';
import { provideZonelessChangeDetection } from '@angular/core';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { TranslateModule } from '@ngx-translate/core';
import { PackItemRowComponent } from './pack-item-row.component';
import { PACK_ITEM_CATALOG } from '@shared/constants/pack-item-catalog.constant';

describe('PackItemRowComponent', () => {
  let component: PackItemRowComponent;
  let fixture: ComponentFixture<PackItemRowComponent>;

  const buildFormGroup = () => {
    const fb = new FormBuilder();
    return fb.group({
      itemId: fb.control(''),
      quantity: fb.control<number | null>(null),
    });
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PackItemRowComponent, ReactiveFormsModule, TranslateModule.forRoot()],
      providers: [provideAnimations(), provideZonelessChangeDetection()],
    }).compileComponents();

    fixture = TestBed.createComponent(PackItemRowComponent);
    component = fixture.componentInstance;

    fixture.componentRef.setInput('formGroup', buildFormGroup());
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
    component.formGroup().patchValue({ itemId: 'speed-up' });

    // Act & Assert
    expect(component.unitLabel).toBe('packValue.units.hours');
  });

  it('should show "qty" unit label when a non-speed-up item is selected', () => {
    // Arrange
    component.formGroup().patchValue({ itemId: 'fine-gold' });

    // Act & Assert
    expect(component.unitLabel).toBe('packValue.units.qty');
  });

  it('should return undefined selectedItem when no item is selected', () => {
    expect(component.selectedItem).toBeUndefined();
  });
});
