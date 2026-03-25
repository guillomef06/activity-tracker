import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideAnimations } from '@angular/platform-browser/animations';
import { provideZonelessChangeDetection } from '@angular/core';
import { TranslateModule } from '@ngx-translate/core';
import { MightiestGovernorComponent } from './mightiest-governor.component';

describe('MightiestGovernorComponent', () => {
  let component: MightiestGovernorComponent;
  let fixture: ComponentFixture<MightiestGovernorComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [MightiestGovernorComponent, TranslateModule.forRoot()],
      providers: [provideAnimations(), provideZonelessChangeDetection()],
    }).compileComponents();

    fixture = TestBed.createComponent(MightiestGovernorComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should have 10 slots', () => {
    expect(component.slots.length).toBe(10);
  });

  it('should have rank 1 cost 150', () => {
    expect(component.slots[0].cost).toBe(150);
  });

  it('should have rank 10 cost 100', () => {
    expect(component.slots[9].cost).toBe(100);
  });

  it('costs should be decreasing', () => {
    for (let i = 0; i < component.slots.length - 1; i++) {
      expect(component.slots[i].cost).toBeGreaterThan(component.slots[i + 1].cost);
    }
  });
});
