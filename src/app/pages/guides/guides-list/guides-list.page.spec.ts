import { ComponentFixture, TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { provideZonelessChangeDetection } from '@angular/core';
import { GuidesListPage } from './guides-list.page';
import { provideRouter } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { GuideService } from '@app/core/services/guide.service';
import type { GuideWithDetails } from '@shared/models';

const MOCK_GUIDE: GuideWithDetails = {
  id: 'g1',
  author_id: 'u1',
  title: 'Test Guide',
  category: 'formation',
  description: 'A test guide description',
  slug: 'test-guide-ab12',
  is_published: true,
  upvotes_count: 5,
  created_at: '2025-01-01T00:00:00Z',
  updated_at: '2025-01-01T00:00:00Z',
  user_profiles: { display_name: 'Alice', username: 'alice' },
};

describe('GuidesListPage', () => {
  let component: GuidesListPage;
  let fixture: ComponentFixture<GuidesListPage>;
  let guideServiceMock: { getPublishedGuides: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    guideServiceMock = {
      getPublishedGuides: vi.fn().mockResolvedValue({ data: [MOCK_GUIDE], hasMore: false }),
    };

    await TestBed.configureTestingModule({
      imports: [GuidesListPage, TranslateModule.forRoot(), NoopAnimationsModule],
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([]),
        { provide: GuideService, useValue: guideServiceMock },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(GuidesListPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should call getPublishedGuides on init', () => {
    expect(guideServiceMock.getPublishedGuides).toHaveBeenCalledWith(0, 10, undefined);
  });

  it('should display loaded guides', () => {
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.textContent).toContain('Test Guide');
  });

  it('should filter by category when chip clicked', () => {
    component['onCategoryFilter']('formation');
    expect(component['categoryFilter']()).toBe('formation');
  });

  it('should reset to no filter when All clicked', () => {
    component['onCategoryFilter']('formation');
    component['onCategoryFilter'](undefined);
    expect(component['categoryFilter']()).toBeUndefined();
  });

  it('should not call loadGuides again if already loading', async () => {
    guideServiceMock.getPublishedGuides.mockClear();
    component['isLoading'].set(true);
    await component['loadGuides'](false);
    expect(guideServiceMock.getPublishedGuides).not.toHaveBeenCalled();
  });
});
