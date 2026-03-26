import { Directive, HostListener, inject } from '@angular/core';
import { MatTabGroup } from '@angular/material/tabs';

const SWIPE_THRESHOLD_PX = 50;
const MAX_VERTICAL_RATIO = 0.75; // ignore swipes that are mostly vertical

@Directive({
  selector: 'mat-tab-group[appSwipeTabs]',
  standalone: true,
})
export class SwipeTabsDirective {
  private readonly tabGroup = inject(MatTabGroup);

  private startX = 0;
  private startY = 0;

  @HostListener('touchstart', ['$event'])
  onTouchStart(event: TouchEvent): void {
    this.startX = event.touches[0].clientX;
    this.startY = event.touches[0].clientY;
  }

  @HostListener('touchend', ['$event'])
  onTouchEnd(event: TouchEvent): void {
    const deltaX = event.changedTouches[0].clientX - this.startX;
    const deltaY = event.changedTouches[0].clientY - this.startY;

    // Ignore swipes that are predominantly vertical (scrolling)
    if (Math.abs(deltaY) > Math.abs(deltaX) * MAX_VERTICAL_RATIO) return;

    const current = this.tabGroup.selectedIndex ?? 0;
    const max = this.tabGroup._tabs.length - 1;

    if (deltaX < -SWIPE_THRESHOLD_PX && current < max) {
      this.tabGroup.selectedIndex = current + 1;
    } else if (deltaX > SWIPE_THRESHOLD_PX && current > 0) {
      this.tabGroup.selectedIndex = current - 1;
    }
  }
}
