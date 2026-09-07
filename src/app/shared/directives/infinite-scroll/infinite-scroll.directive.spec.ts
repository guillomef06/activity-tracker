import { Component, ChangeDetectionStrategy, provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { InfiniteScrollDirective } from './infinite-scroll.directive';

@Component({
  template: `<div appInfiniteScroll (scrolled)="onScrolled()"></div>`,
  // eslint-disable-next-line @angular-eslint/prefer-on-push-component-change-detection -- added by the official Angular v22 `ng update` codemod to preserve pre-v22 change detection behavior for this test host; not a new violation introduced by this migration.
  changeDetection: ChangeDetectionStrategy.Eager,
  imports: [InfiniteScrollDirective],
})
class TestHostComponent {
  onScrolled = vi.fn();
}

describe('InfiniteScrollDirective', () => {
  let fixture: ComponentFixture<TestHostComponent>;
  let component: TestHostComponent;
  let observerCallback: IntersectionObserverCallback;
  let disconnectSpy: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    disconnectSpy = vi.fn();
    // Must use `function` keyword (not arrow) to be usable as a constructor with `new`
    const captureCallback = (cb: IntersectionObserverCallback, spy: ReturnType<typeof vi.fn>) => {
      observerCallback = cb;
      return { observe: vi.fn(), disconnect: spy };
    };
    const disconnect = disconnectSpy;
    vi.stubGlobal(
      'IntersectionObserver',
      vi.fn(function (this: unknown, callback: IntersectionObserverCallback) {
        return captureCallback(callback, disconnect);
      })
    );

    await TestBed.configureTestingModule({
      imports: [TestHostComponent],
      providers: [provideZonelessChangeDetection()],
    }).compileComponents();

    fixture = TestBed.createComponent(TestHostComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should emit scrolled when sentinel enters viewport', () => {
    observerCallback([{ isIntersecting: true }] as IntersectionObserverEntry[], {} as IntersectionObserver);

    expect(component.onScrolled).toHaveBeenCalledTimes(1);
  });

  it('should not emit scrolled when sentinel leaves viewport', () => {
    observerCallback([{ isIntersecting: false }] as IntersectionObserverEntry[], {} as IntersectionObserver);

    expect(component.onScrolled).not.toHaveBeenCalled();
  });

  it('should disconnect observer on destroy', () => {
    fixture.destroy();

    expect(disconnectSpy).toHaveBeenCalledTimes(1);
  });
});
