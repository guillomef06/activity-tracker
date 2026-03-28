import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { MatTabGroup, MatTabsModule } from '@angular/material/tabs';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { SwipeTabsDirective } from './swipe-tabs.directive';

@Component({
  template: `
    <mat-tab-group appSwipeTabs>
      <mat-tab label="Tab 1"></mat-tab>
      <mat-tab label="Tab 2"></mat-tab>
      <mat-tab label="Tab 3"></mat-tab>
    </mat-tab-group>
  `,
  imports: [SwipeTabsDirective, MatTabsModule],
  standalone: true,
})
class TestHostComponent {}

function makeTouchEvent(type: string, clientX: number, clientY: number): TouchEvent {
  const touch = { clientX, clientY } as Touch;
  return new TouchEvent(type, {
    touches: type === 'touchstart' ? [touch] : [],
    changedTouches: [touch],
    bubbles: true,
  });
}

describe('SwipeTabsDirective', () => {
  let fixture: ReturnType<typeof TestBed.createComponent<TestHostComponent>>;
  let tabGroup: MatTabGroup;
  let el: HTMLElement;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [TestHostComponent, NoopAnimationsModule],
    });
    fixture = TestBed.createComponent(TestHostComponent);
    fixture.detectChanges();
    tabGroup = fixture.debugElement.query(By.directive(MatTabGroup)).componentInstance;
    el = fixture.debugElement.query(By.directive(SwipeTabsDirective)).nativeElement;
  });

  it('moves to next tab on left swipe', () => {
    tabGroup.selectedIndex = 0;
    fixture.detectChanges();

    el.dispatchEvent(makeTouchEvent('touchstart', 200, 100));
    el.dispatchEvent(makeTouchEvent('touchend', 100, 102));
    fixture.detectChanges();

    expect(tabGroup.selectedIndex).toBe(1);
  });

  it('moves to previous tab on right swipe', () => {
    tabGroup.selectedIndex = 1;
    fixture.detectChanges();

    el.dispatchEvent(makeTouchEvent('touchstart', 100, 100));
    el.dispatchEvent(makeTouchEvent('touchend', 200, 102));
    fixture.detectChanges();

    expect(tabGroup.selectedIndex).toBe(0);
  });

  it('does not go past last tab on left swipe', () => {
    tabGroup.selectedIndex = 2;
    fixture.detectChanges();

    el.dispatchEvent(makeTouchEvent('touchstart', 200, 100));
    el.dispatchEvent(makeTouchEvent('touchend', 100, 102));
    fixture.detectChanges();

    expect(tabGroup.selectedIndex).toBe(2);
  });

  it('does not go below first tab on right swipe', () => {
    tabGroup.selectedIndex = 0;
    fixture.detectChanges();

    el.dispatchEvent(makeTouchEvent('touchstart', 100, 100));
    el.dispatchEvent(makeTouchEvent('touchend', 200, 102));
    fixture.detectChanges();

    expect(tabGroup.selectedIndex).toBe(0);
  });

  it('ignores swipe below threshold', () => {
    tabGroup.selectedIndex = 1;
    fixture.detectChanges();

    el.dispatchEvent(makeTouchEvent('touchstart', 100, 100));
    el.dispatchEvent(makeTouchEvent('touchend', 130, 102));
    fixture.detectChanges();

    expect(tabGroup.selectedIndex).toBe(1);
  });

  it('ignores predominantly vertical swipe', () => {
    tabGroup.selectedIndex = 1;
    fixture.detectChanges();

    el.dispatchEvent(makeTouchEvent('touchstart', 100, 100));
    el.dispatchEvent(makeTouchEvent('touchend', 160, 250));
    fixture.detectChanges();

    expect(tabGroup.selectedIndex).toBe(1);
  });
});
