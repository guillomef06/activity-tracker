import { ComponentFixture, TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { GuideViewPage } from './guide-view.page';
import { provideRouter, ActivatedRoute } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { GuideService } from '@app/core/services/guide.service';
import { VoterTokenService } from '@app/core/services/voter-token.service';
import { SnackbarService } from '@app/core/services';
import { of } from 'rxjs';
import { ParamMap, convertToParamMap } from '@angular/router';
import type { GuideWithDetails } from '@shared/models';

const MOCK_GUIDE: GuideWithDetails = {
  id: 'g1',
  author_id: 'u1',
  title: 'Formation Test',
  category: 'formation',
  description: 'A detailed guide',
  slug: 'formation-test-ab12',
  is_published: true,
  upvotes_count: 3,
  created_at: '2025-01-01T00:00:00Z',
  updated_at: '2025-01-01T00:00:00Z',
  user_profiles: { display_name: 'Bob', username: 'bob' },
  guide_champions: [],
};

function mockParamMap(slug: string): ParamMap {
  return convertToParamMap({ slug });
}

describe('GuideViewPage', () => {
  let component: GuideViewPage;
  let fixture: ComponentFixture<GuideViewPage>;
  let guideServiceMock: {
    getGuideBySlug: ReturnType<typeof vi.fn>;
    hasUserUpvoted: ReturnType<typeof vi.fn>;
    upvoteGuide: ReturnType<typeof vi.fn>;
    removeUpvote: ReturnType<typeof vi.fn>;
  };
  let voterTokenMock: { getVoterToken: ReturnType<typeof vi.fn> };
  let snackbarMock: { success: ReturnType<typeof vi.fn>; error: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    guideServiceMock = {
      getGuideBySlug: vi.fn().mockResolvedValue(MOCK_GUIDE),
      hasUserUpvoted: vi.fn().mockResolvedValue(false),
      upvoteGuide: vi.fn().mockResolvedValue({ error: null }),
      removeUpvote: vi.fn().mockResolvedValue({ error: null }),
    };

    voterTokenMock = {
      getVoterToken: vi.fn().mockReturnValue('test-token-uuid'),
    };

    snackbarMock = {
      success: vi.fn(),
      error: vi.fn(),
    };

    await TestBed.configureTestingModule({
      imports: [GuideViewPage, TranslateModule.forRoot(), NoopAnimationsModule],
      providers: [
        provideRouter([]),
        { provide: GuideService, useValue: guideServiceMock },
        { provide: VoterTokenService, useValue: voterTokenMock },
        { provide: SnackbarService, useValue: snackbarMock },
        {
          provide: ActivatedRoute,
          useValue: {
            paramMap: of(mockParamMap('formation-test-ab12')),
          },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(GuideViewPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should call getGuideBySlug with slug from route', () => {
    expect(guideServiceMock.getGuideBySlug).toHaveBeenCalledWith('formation-test-ab12');
  });

  it('should display guide title after load', () => {
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('.guide-title')?.textContent).toContain('Formation Test');
  });

  it('should display not-found state when guide is null', async () => {
    guideServiceMock.getGuideBySlug.mockResolvedValue(null);
    fixture = TestBed.createComponent(GuideViewPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('.not-found-state')).toBeTruthy();
  });

  it('should initialise upvoteCount from guide.upvotes_count', () => {
    expect(component['upvoteCount']()).toBe(3);
  });

  it('should set hasUpvoted to false when hasUserUpvoted returns false', () => {
    expect(component['hasUpvoted']()).toBe(false);
  });

  it('should increment upvoteCount when upvoting', async () => {
    await component['toggleUpvote']();
    expect(component['upvoteCount']()).toBe(4);
    expect(component['hasUpvoted']()).toBe(true);
  });

  it('should decrement upvoteCount when removing upvote', async () => {
    component['hasUpvoted'].set(true);
    component['upvoteCount'].set(3);
    await component['toggleUpvote']();
    expect(component['upvoteCount']()).toBe(2);
    expect(component['hasUpvoted']()).toBe(false);
  });
});
