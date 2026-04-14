import { Component, inject, signal, OnInit, ChangeDetectionStrategy } from '@angular/core';
import { Router } from '@angular/router';
import { Title } from '@angular/platform-browser';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatChipsModule } from '@angular/material/chips';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { TranslateModule, TranslateService } from '@ngx-translate/core';

import { GuideService } from '@app/core/services/guide.service';
import { InfiniteScrollDirective } from '@app/shared/directives/infinite-scroll/infinite-scroll.directive';
import { LocalDatePipe } from '@app/shared/pipes/local-date.pipe';
import type { GuideCategory, GuideWithDetails } from '@shared/models';

const CATEGORIES: { value: GuideCategory; labelKey: string }[] = [
  { value: 'formation', labelKey: 'guides.categories.formation' },
  { value: 'evenement', labelKey: 'guides.categories.evenement' },
  { value: 'general', labelKey: 'guides.categories.general' },
];

const PAGE_SIZE = 10;

@Component({
  selector: 'app-guides-list',
  imports: [
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatChipsModule,
    MatProgressSpinnerModule,
    TranslateModule,
    InfiniteScrollDirective,
    LocalDatePipe,
  ],
  templateUrl: './guides-list.page.html',
  styleUrl: './guides-list.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GuidesListPage implements OnInit {
  private readonly guideService = inject(GuideService);
  private readonly router = inject(Router);
  private readonly titleService = inject(Title);
  private readonly translate = inject(TranslateService);

  protected readonly categories = CATEGORIES;

  protected readonly guides = signal<GuideWithDetails[]>([]);
  protected readonly isLoading = signal(false);
  protected readonly hasMore = signal(true);
  protected readonly currentPage = signal(0);
  protected readonly categoryFilter = signal<GuideCategory | undefined>(undefined);

  ngOnInit(): void {
    this.titleService.setTitle(this.translate.instant('guides.public_list_title'));
    void this.loadGuides(true);
  }

  protected async loadGuides(reset: boolean): Promise<void> {
    if (this.isLoading()) return;

    if (reset) {
      this.currentPage.set(0);
      this.guides.set([]);
      this.hasMore.set(true);
    }

    this.isLoading.set(true);
    try {
      const { data, hasMore } = await this.guideService.getPublishedGuides(
        this.currentPage(),
        PAGE_SIZE,
        this.categoryFilter()
      );
      this.guides.update(existing => [...existing, ...data]);
      this.hasMore.set(hasMore);
      this.currentPage.update(p => p + 1);
    } finally {
      this.isLoading.set(false);
    }
  }

  protected onLoadMore(): void {
    if (this.hasMore() && !this.isLoading()) {
      void this.loadGuides(false);
    }
  }

  protected onCategoryFilter(category: GuideCategory | undefined): void {
    this.categoryFilter.set(category);
    void this.loadGuides(true);
  }

  protected viewGuide(slug: string): void {
    void this.router.navigate(['/guides', slug]);
  }

  protected authorName(guide: GuideWithDetails): string {
    return guide.user_profiles?.display_name ?? guide.user_profiles?.username ?? '';
  }

  protected trackGuide(_index: number, guide: GuideWithDetails): string {
    return guide.id;
  }

  protected trackCategory(_index: number, cat: { value: GuideCategory; labelKey: string }): string {
    return cat.value;
  }
}
