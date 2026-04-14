import { Component, inject, signal, computed, ChangeDetectionStrategy, DestroyRef, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { Title, Meta } from '@angular/platform-browser';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { switchMap, catchError } from 'rxjs/operators';
import { of } from 'rxjs';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatChipsModule } from '@angular/material/chips';
import { TranslateModule, TranslateService } from '@ngx-translate/core';

import { GuideService } from '@app/core/services/guide.service';
import { VoterTokenService } from '@app/core/services/voter-token.service';
import { SnackbarService } from '@app/core/services';
import { LocalDatePipe } from '@app/shared/pipes/local-date.pipe';
import { GuideChampionCardComponent } from './components/guide-champion-card/guide-champion-card.component';
import type { GuideChampion, GuideWithDetails } from '@shared/models';

@Component({
  selector: 'app-guide-view',
  imports: [
    MatButtonModule,
    MatCardModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatChipsModule,
    TranslateModule,
    LocalDatePipe,
    GuideChampionCardComponent,
  ],
  templateUrl: './guide-view.page.html',
  styleUrl: './guide-view.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GuideViewPage implements OnInit {
  private readonly guideService = inject(GuideService);
  private readonly voterTokenService = inject(VoterTokenService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly titleService = inject(Title);
  private readonly metaService = inject(Meta);
  private readonly snackbarService = inject(SnackbarService);
  private readonly translate = inject(TranslateService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly guide = signal<GuideWithDetails | null>(null);
  protected readonly isLoading = signal(true);
  protected readonly notFound = signal(false);
  protected readonly hasUpvoted = signal(false);

  private readonly voterToken = this.voterTokenService.getVoterToken();

  protected readonly sortedChampions = computed<GuideChampion[]>(() => {
    const g = this.guide();
    if (!g?.guide_champions) return [];
    return [...g.guide_champions].sort((a, b) => a.position - b.position);
  });

  protected readonly upvoteCount = signal(0);

  ngOnInit(): void {
    this.route.paramMap
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        switchMap(params => {
          const slug = params.get('slug') ?? '';
          this.isLoading.set(true);
          this.notFound.set(false);
          return this.guideService.getGuideBySlug(slug);
        }),
        catchError(() => {
          this.notFound.set(true);
          this.isLoading.set(false);
          return of(null);
        })
      )
      .subscribe(result => {
        if (!result) {
          this.notFound.set(true);
          this.isLoading.set(false);
          return;
        }
        this.guide.set(result);
        this.upvoteCount.set(result.upvotes_count);
        this.isLoading.set(false);
        this.updateMeta(result);
        void this.checkUpvoted(result.id);
      });
  }

  private updateMeta(guide: GuideWithDetails): void {
    this.titleService.setTitle(`${guide.title} — ${this.translate.instant('guides.title')}`);
    if (guide.description) {
      const sanitized = guide.description.replace(/"/g, '&quot;').slice(0, 160);
      this.metaService.updateTag({ name: 'description', content: sanitized });
    }
  }

  private async checkUpvoted(guideId: string): Promise<void> {
    const upvoted = await this.guideService.hasUserUpvoted(guideId, this.voterToken);
    this.hasUpvoted.set(upvoted);
  }

  protected async toggleUpvote(): Promise<void> {
    const currentGuide = this.guide();
    if (!currentGuide) return;

    if (this.hasUpvoted()) {
      const { error } = await this.guideService.removeUpvote(currentGuide.id, this.voterToken);
      if (!error) {
        this.hasUpvoted.set(false);
        this.upvoteCount.update(n => Math.max(0, n - 1));
      }
    } else {
      const { error } = await this.guideService.upvoteGuide(currentGuide.id, this.voterToken);
      if (!error) {
        this.hasUpvoted.set(true);
        this.upvoteCount.update(n => n + 1);
      }
    }
  }

  protected async copyLink(): Promise<void> {
    try {
      await navigator.clipboard.writeText(window.location.href);
      this.snackbarService.success(this.translate.instant('guides.link_copied'));
    } catch {
      // Clipboard API not available — silently fail
    }
  }

  protected goBack(): void {
    void this.router.navigate(['/guides']);
  }

  protected authorName(guide: GuideWithDetails): string {
    return guide.user_profiles?.display_name ?? guide.user_profiles?.username ?? '';
  }

  protected trackChampion(_index: number, champion: GuideChampion): string {
    return champion.id;
  }
}
