import { Component, inject, signal, computed, OnInit, ChangeDetectionStrategy } from '@angular/core';
import { Router } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatTabsModule } from '@angular/material/tabs';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatChipsModule } from '@angular/material/chips';
import { MatMenuModule } from '@angular/material/menu';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { SlicePipe } from '@angular/common';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { firstValueFrom } from 'rxjs';

import { GuideService } from '@app/core/services/guide.service';
import { SnackbarService } from '@app/core/services';
import { ProgressBarService } from '@app/core/services/progress-bar.service';
import { ConfirmDialogComponent } from '@app/shared/components/confirm-dialog/confirm-dialog.component';
import { InfiniteScrollDirective } from '@app/shared/directives/infinite-scroll/infinite-scroll.directive';
import { LocalDatePipe } from '@app/shared/pipes/local-date.pipe';
import { SwipeTabsDirective } from '@app/shared/directives/swipe-tabs/swipe-tabs.directive';
import type { Guide, GuideCategory, GuideWithDetails } from '@shared/models';

const CATEGORIES: { value: GuideCategory; labelKey: string }[] = [
  { value: 'formation', labelKey: 'guides.categories.formation' },
  { value: 'evenement', labelKey: 'guides.categories.evenement' },
  { value: 'general', labelKey: 'guides.categories.general' },
];

const PAGE_SIZE = 10;

@Component({
  selector: 'app-guides-hub',
  imports: [
    MatCardModule,
    MatTabsModule,
    MatButtonModule,
    MatIconModule,
    MatChipsModule,
    MatMenuModule,
    MatProgressSpinnerModule,
    MatTooltipModule,
    MatDialogModule,
    TranslateModule,
    SlicePipe,
    InfiniteScrollDirective,
    LocalDatePipe,
    SwipeTabsDirective,
  ],
  templateUrl: './guides-hub.page.html',
  styleUrl: './guides-hub.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GuidesHubPage implements OnInit {
  private readonly router = inject(Router);
  private readonly guideService = inject(GuideService);
  private readonly snackbarService = inject(SnackbarService);
  private readonly progressBarService = inject(ProgressBarService);
  private readonly dialog = inject(MatDialog);
  private readonly translate = inject(TranslateService);

  protected readonly categories = CATEGORIES;

  // ─── Community tab ────────────────────────────────────────────────────────

  protected readonly communityGuides = signal<GuideWithDetails[]>([]);
  protected readonly isLoadingCommunity = signal(false);
  protected readonly hasMoreCommunity = signal(true);
  protected readonly communityPage = signal(0);
  protected readonly categoryFilter = signal<GuideCategory | undefined>(undefined);

  // ─── My guides tab ────────────────────────────────────────────────────────

  protected readonly myGuides = this.guideService.myGuides;
  protected readonly isLoadingMyGuides = this.guideService.isLoading;
  protected readonly guidesCount = signal(0);

  readonly MAX_GUIDES = 10;

  // ─── Lifecycle ─────────────────────────────────────────────────────────────

  async ngOnInit(): Promise<void> {
    await Promise.all([this.loadCommunityGuides(true), this.loadMyGuides()]);
  }

  // ─── Community tab ────────────────────────────────────────────────────────

  async loadCommunityGuides(reset: boolean): Promise<void> {
    if (this.isLoadingCommunity()) return;

    if (reset) {
      this.communityPage.set(0);
      this.communityGuides.set([]);
      this.hasMoreCommunity.set(true);
    }

    this.isLoadingCommunity.set(true);
    try {
      const { data, hasMore } = await this.guideService.getPublishedGuides(
        this.communityPage(),
        PAGE_SIZE,
        this.categoryFilter()
      );
      this.communityGuides.update(existing => [...existing, ...data]);
      this.hasMoreCommunity.set(hasMore);
      this.communityPage.update(p => p + 1);
    } finally {
      this.isLoadingCommunity.set(false);
    }
  }

  protected onLoadMore(): void {
    if (this.hasMoreCommunity() && !this.isLoadingCommunity()) {
      void this.loadCommunityGuides(false);
    }
  }

  protected onCategoryFilter(category: GuideCategory | undefined): void {
    this.categoryFilter.set(category);
    void this.loadCommunityGuides(true);
  }

  protected viewGuide(slug: string): void {
    void this.router.navigate(['/guides', slug]);
  }

  // ─── My guides tab ────────────────────────────────────────────────────────

  async loadMyGuides(): Promise<void> {
    await this.guideService.getMyGuides();
    this.guidesCount.set(this.myGuides().length);
  }

  protected goHome(): void {
    void this.router.navigate(['/app']);
  }

  protected createGuide(): void {
    void this.router.navigate(['/app/guides/new']);
  }

  protected editGuide(id: string): void {
    void this.router.navigate(['/app/guides', id, 'edit']);
  }

  protected async togglePublish(guide: Guide): Promise<void> {
    const newState = !guide.is_published;
    const { error } = await this.guideService.publishGuide(guide.id, newState);
    if (error) {
      this.snackbarService.error(this.translate.instant(error));
    } else {
      const key = newState ? 'guides.published_success' : 'guides.unpublished_success';
      this.snackbarService.success(this.translate.instant(key));
    }
  }

  protected async deleteGuide(guide: Guide): Promise<void> {
    const confirmed = await firstValueFrom(
      this.dialog
        .open(ConfirmDialogComponent, {
          data: {
            message: this.translate.instant('guides.confirm_delete_msg'),
            title: this.translate.instant('guides.confirm_delete'),
          },
        })
        .afterClosed()
    );
    if (!confirmed) return;

    const { error } = await this.guideService.deleteGuide(guide.id);
    if (error) {
      this.snackbarService.error(this.translate.instant(error));
    } else {
      this.snackbarService.success(this.translate.instant('common.deleted'));
      this.guidesCount.set(this.myGuides().length);
    }
  }

  // ─── Template helpers ──────────────────────────────────────────────────────

  protected readonly isAtLimit = computed(() => this.guidesCount() >= this.MAX_GUIDES);

  protected authorName(guide: GuideWithDetails): string {
    return guide.user_profiles?.display_name ?? guide.user_profiles?.username ?? '';
  }
}
