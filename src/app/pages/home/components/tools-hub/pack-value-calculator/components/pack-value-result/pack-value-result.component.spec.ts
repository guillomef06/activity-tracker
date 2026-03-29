import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideAnimations } from '@angular/platform-browser/animations';
import { provideZonelessChangeDetection } from '@angular/core';
import { TranslateModule } from '@ngx-translate/core';
import { PackValueResultComponent } from './pack-value-result.component';
import { PACK_VALUE_TIERS } from '@shared/constants/pack-item-catalog.constant';
import { PackValueResult } from '@shared/models/pack-value.model';

describe('PackValueResultComponent', () => {
  let component: PackValueResultComponent;
  let fixture: ComponentFixture<PackValueResultComponent>;

  const mockResult: PackValueResult = {
    totalApexCoins: 1800,
    priceAC: 9999,
    valueRatio: 0.18,
    tier: 'terrible',
    breakdown: [
      { nameKey: 'packValue.items.fineGold', apexCoinsPerUnit: 50, quantity: 2 },
      { nameKey: 'packValue.items.silverSand', apexCoinsPerUnit: 25, quantity: 4 },
    ],
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PackValueResultComponent, TranslateModule.forRoot()],
      providers: [provideAnimations(), provideZonelessChangeDetection()],
    }).compileComponents();

    fixture = TestBed.createComponent(PackValueResultComponent);
    component = fixture.componentInstance;

    fixture.componentRef.setInput('result', mockResult);
    fixture.componentRef.setInput('tiers', PACK_VALUE_TIERS);

    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should compute tierDef matching the result tier', () => {
    expect(component.tierDef().tier).toBe('terrible');
    expect(component.tierDef().colorClass).toBe('tier-terrible');
  });

  it('should apply the tier color class to the badge element', () => {
    const badge = fixture.nativeElement.querySelector('.tier-badge');
    expect(badge).not.toBeNull();
    expect(badge.classList.contains('tier-terrible')).toBe(true);
  });

  it('should render breakdown items', () => {
    const items = fixture.nativeElement.querySelectorAll('.breakdown-item');
    expect(items.length).toBe(2);
  });

  it('should display the tier icon from tierDef', () => {
    expect(component.tierDef().icon).toBe('sentiment_very_dissatisfied');
  });

  it('should update tierDef when result changes to excellent', () => {
    // Arrange
    const excellentResult: PackValueResult = {
      ...mockResult,
      tier: 'excellent',
      valueRatio: 3.5,
    };

    // Act
    fixture.componentRef.setInput('result', excellentResult);
    fixture.detectChanges();

    // Assert
    expect(component.tierDef().tier).toBe('excellent');
    expect(component.tierDef().colorClass).toBe('tier-excellent');
  });
});
