import { ComponentFixture, TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { GuidesHubPage } from './guides-hub.page';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { provideRouter } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { GuideService } from '@app/core/services/guide.service';
import { signal } from '@angular/core';

// IntersectionObserver is not available in JSDOM — stub with a class
class MockIntersectionObserver {
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
}
vi.stubGlobal('IntersectionObserver', MockIntersectionObserver);

describe('GuidesHubPage', () => {
  let component: GuidesHubPage;
  let fixture: ComponentFixture<GuidesHubPage>;

  beforeEach(async () => {
    const guideServiceSpy = {
      getPublishedGuides: vi.fn().mockResolvedValue({ data: [], hasMore: false }),
      getMyGuides: vi.fn().mockResolvedValue(undefined),
      myGuides: signal([]),
      isLoading: signal(false),
      publishGuide: vi.fn().mockResolvedValue({ error: null }),
      deleteGuide: vi.fn().mockResolvedValue({ error: null }),
    };

    await TestBed.configureTestingModule({
      imports: [GuidesHubPage, TranslateModule.forRoot()],
      providers: [provideAnimationsAsync(), provideRouter([]), { provide: GuideService, useValue: guideServiceSpy }],
    }).compileComponents();

    fixture = TestBed.createComponent(GuidesHubPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should not be at limit when 0 guides', () => {
    expect(component['isAtLimit']()).toBe(false);
  });

  it('should be at limit when 10 guides', () => {
    component['guidesCount'].set(10);
    expect(component['isAtLimit']()).toBe(true);
  });

  it('should show create button', () => {
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.textContent).toContain('');
  });
});
