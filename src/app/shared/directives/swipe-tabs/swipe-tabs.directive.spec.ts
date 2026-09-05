import { Component, ChangeDetectionStrategy, provideZonelessChangeDetection } from '@angular/core';
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
  // eslint-disable-next-line @angular-eslint/prefer-on-push-component-change-detection -- added by the official Angular v22 `ng update` codemod to preserve pre-v22 change detection behavior for this test host; not a new violation introduced by this migration.
  changeDetection: ChangeDetectionStrategy.Eager,
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
      providers: [provideZonelessChangeDetection()],
    });
    fixture = TestBed.createComponent(TestHostComponent);
    fixture.detectChanges();
    tabGroup = fixture.debugElement.query(By.directive(MatTabGroup)).componentInstance;
    el = fixture.debugElement.query(By.directive(SwipeTabsDirective)).nativeElement;
  });

  it.each([
    { desc: 'moves to next tab on left swipe', from: 0, startX: 200, startY: 100, endX: 100, endY: 102, expected: 1 },
    {
      desc: 'moves to previous tab on right swipe',
      from: 1,
      startX: 100,
      startY: 100,
      endX: 200,
      endY: 102,
      expected: 0,
    },
    {
      desc: 'does not go past last tab on left swipe',
      from: 2,
      startX: 200,
      startY: 100,
      endX: 100,
      endY: 102,
      expected: 2,
    },
    {
      desc: 'does not go below first tab on right swipe',
      from: 0,
      startX: 100,
      startY: 100,
      endX: 200,
      endY: 102,
      expected: 0,
    },
    {
      desc: 'ignores swipe below threshold',
      from: 1,
      startX: 100,
      startY: 100,
      endX: 130,
      endY: 102,
      expected: 1,
    },
    {
      desc: 'ignores predominantly vertical swipe',
      from: 1,
      startX: 100,
      startY: 100,
      endX: 160,
      endY: 250,
      expected: 1,
    },
  ])('$desc', async ({ from, startX, startY, endX, endY, expected }) => {
    tabGroup.selectedIndex = from;
    fixture.detectChanges();
    // MatTabGroup applies a signal-driven `selectedIndex` write on a later change-detection
    // pass — under zoneless CD there's no zone-triggered microtask flush to catch it, so wait
    // for the fixture to stabilize before the directive reads the "current" tab.
    await fixture.whenStable();

    el.dispatchEvent(makeTouchEvent('touchstart', startX, startY));
    el.dispatchEvent(makeTouchEvent('touchend', endX, endY));
    fixture.detectChanges();
    await fixture.whenStable();

    expect(tabGroup.selectedIndex).toBe(expected);
  });
});
