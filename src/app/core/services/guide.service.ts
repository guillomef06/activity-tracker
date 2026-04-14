import { Injectable, signal, inject } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { AuthService } from './auth.service';
import type {
  Guide,
  GuideCategory,
  GuideWithDetails,
  CreateGuideDto,
  UpdateGuideDto,
  ChampionSlotConfig,
} from '@shared/models';

/** Supabase unique_violation error code */
const PG_UNIQUE_VIOLATION = '23505';

/**
 * Service for creating, reading, updating and publishing strategy guides.
 * Upvote operations are anonymous — only a voter token is required.
 */
@Injectable({
  providedIn: 'root',
})
export class GuideService {
  private readonly supabase = inject(SupabaseService);
  private readonly authService = inject(AuthService);

  private readonly myGuidesSignal = signal<Guide[]>([]);
  private readonly isLoadingSignal = signal<boolean>(false);

  /** The authenticated user's own guides — populated by getMyGuides() */
  readonly myGuides = this.myGuidesSignal.asReadonly();

  /** True while any async operation is in flight */
  readonly isLoading = this.isLoadingSignal.asReadonly();

  // ============================================
  // Public reads — no auth required
  // ============================================

  /**
   * Returns a paginated list of published guides, optionally filtered by category.
   * Sorted by upvotes_count descending, then created_at descending.
   */
  async getPublishedGuides(
    page: number,
    pageSize: number,
    category?: GuideCategory
  ): Promise<{ data: GuideWithDetails[]; hasMore: boolean }> {
    try {
      const from = page * pageSize;
      const to = from + pageSize; // fetch one extra to detect if there is a next page

      let query = this.supabase
        .from('guides')
        .select('*, user_profiles(display_name, username)')
        .eq('is_published', true)
        .order('upvotes_count', { ascending: false })
        .order('created_at', { ascending: false })
        .range(from, to);

      if (category) {
        query = query.eq('category', category);
      }

      const { data, error } = await query;

      if (error) throw error;

      const rows = (data ?? []) as GuideWithDetails[];
      const hasMore = rows.length > pageSize;
      return { data: hasMore ? rows.slice(0, pageSize) : rows, hasMore };
    } catch (error) {
      console.error('GuideService.getPublishedGuides error:', error);
      return { data: [], hasMore: false };
    }
  }

  /**
   * Returns a single guide with full nested details by slug.
   * Returns null when the guide is not found or not accessible.
   */
  async getGuideBySlug(slug: string): Promise<GuideWithDetails | null> {
    try {
      const { data, error } = await this.supabase
        .from('guides')
        .select(
          `
          *,
          user_profiles(display_name, username),
          guide_champions(
            *,
            champions(*),
            ornaments(*),
            rings(*),
            guide_champion_skills(*, skills(*)),
            guide_champion_gems(*, gems(*)),
            guide_champion_horse_traits(*, horse_temperaments(*))
          )
        `
        )
        .eq('slug', slug)
        .single();

      if (error) {
        if (error.code === 'PGRST116') return null; // no rows
        throw error;
      }

      return (data as GuideWithDetails) ?? null;
    } catch (error) {
      console.error('GuideService.getGuideBySlug error:', error);
      return null;
    }
  }

  // ============================================
  // Authenticated reads & writes
  // ============================================

  /**
   * Loads the authenticated user's own guides into the myGuides signal.
   */
  async getMyGuides(): Promise<void> {
    const userId = this.authService.getUserId();
    if (!userId) return;

    this.isLoadingSignal.set(true);
    try {
      const { data, error } = await this.supabase
        .from('guides')
        .select('*')
        .eq('author_id', userId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      this.myGuidesSignal.set((data ?? []) as Guide[]);
    } catch (error) {
      console.error('GuideService.getMyGuides error:', error);
    } finally {
      this.isLoadingSignal.set(false);
    }
  }

  /**
   * Returns the total number of guides owned by the authenticated user.
   */
  async getUserGuidesCount(): Promise<number> {
    const userId = this.authService.getUserId();
    if (!userId) return 0;

    try {
      const { count, error } = await this.supabase
        .from('guides')
        .select('id', { count: 'exact', head: true })
        .eq('author_id', userId);

      if (error) throw error;
      return count ?? 0;
    } catch (error) {
      console.error('GuideService.getUserGuidesCount error:', error);
      return 0;
    }
  }

  /**
   * Creates a new guide for the authenticated user.
   * Enforces the 10-guide limit and handles slug uniqueness errors.
   */
  async createGuide(dto: CreateGuideDto): Promise<{ guide: Guide | null; error: string | null }> {
    if (!this.authService.isAuthenticated()) {
      return { guide: null, error: 'guides.errors.unauthorized' };
    }

    const count = await this.getUserGuidesCount();
    if (count >= 10) {
      return { guide: null, error: 'guides.errors.limitReached' };
    }

    try {
      const userId = this.authService.getUserId()!;
      const slug = dto.slug || this.slugify(dto.title);

      const { data, error } = await this.supabase
        .from('guides')
        .insert({
          author_id: userId,
          title: dto.title,
          category: dto.category,
          description: dto.description ?? null,
          slug,
        })
        .select()
        .single();

      if (error) {
        if (error.code === PG_UNIQUE_VIOLATION) {
          return { guide: null, error: 'guides.errors.slugDuplicate' };
        }
        throw error;
      }

      // Refresh my guides signal optimistically
      const guide = data as Guide;
      this.myGuidesSignal.update(guides => [guide, ...guides]);

      return { guide, error: null };
    } catch (error) {
      const pgError = error as { message?: string };
      if (pgError?.message?.includes('guide_limit_exceeded')) {
        return { guide: null, error: 'guides.errors.limitReached' };
      }
      console.error('GuideService.createGuide error:', error);
      return { guide: null, error: 'guides.errors.unknown' };
    }
  }

  /**
   * Updates an existing guide. Only the author can update.
   */
  async updateGuide(id: string, dto: UpdateGuideDto): Promise<{ error: string | null }> {
    if (!this.authService.isAuthenticated()) {
      return { error: 'guides.errors.unauthorized' };
    }

    try {
      const { error } = await this.supabase.from('guides').update(dto).eq('id', id);

      if (error) throw error;

      // Update the local signal
      this.myGuidesSignal.update(guides => guides.map(g => (g.id === id ? { ...g, ...dto } : g)));

      return { error: null };
    } catch (error) {
      console.error('GuideService.updateGuide error:', error);
      return { error: 'guides.errors.unknown' };
    }
  }

  /**
   * Deletes a guide. Only the author (or super_admin via RLS) can delete.
   */
  async deleteGuide(id: string): Promise<{ error: string | null }> {
    if (!this.authService.isAuthenticated()) {
      return { error: 'guides.errors.unauthorized' };
    }

    try {
      const { error } = await this.supabase.from('guides').delete().eq('id', id);

      if (error) throw error;

      this.myGuidesSignal.update(guides => guides.filter(g => g.id !== id));

      return { error: null };
    } catch (error) {
      console.error('GuideService.deleteGuide error:', error);
      return { error: 'guides.errors.unknown' };
    }
  }

  /**
   * Toggles the published state of a guide.
   */
  async publishGuide(id: string, isPublished: boolean): Promise<{ error: string | null }> {
    return this.updateGuide(id, { is_published: isPublished });
  }

  // ============================================
  // Upvotes — no auth required
  // ============================================

  /**
   * Adds an upvote for the current voter token.
   * The DB trigger increments guides.upvotes_count automatically.
   */
  async upvoteGuide(guideId: string, voterToken: string): Promise<{ error: string | null }> {
    try {
      const { error } = await this.supabase.from('guide_upvotes').insert({
        guide_id: guideId,
        voter_token: voterToken,
      });

      if (error) {
        if (error.code === PG_UNIQUE_VIOLATION) {
          // Already upvoted — treat as success (idempotent)
          return { error: null };
        }
        throw error;
      }

      return { error: null };
    } catch (error) {
      console.error('GuideService.upvoteGuide error:', error);
      return { error: 'guides.errors.unknown' };
    }
  }

  /**
   * Removes an upvote for the current voter token.
   * The DB trigger decrements guides.upvotes_count automatically.
   */
  async removeUpvote(guideId: string, voterToken: string): Promise<{ error: string | null }> {
    try {
      const { error } = await this.supabase
        .from('guide_upvotes')
        .delete()
        .eq('guide_id', guideId)
        .eq('voter_token', voterToken);

      if (error) throw error;
      return { error: null };
    } catch (error) {
      console.error('GuideService.removeUpvote error:', error);
      return { error: 'guides.errors.unknown' };
    }
  }

  /**
   * Returns true if the given voter token has upvoted the specified guide.
   */
  async hasUserUpvoted(guideId: string, voterToken: string): Promise<boolean> {
    try {
      const { count, error } = await this.supabase
        .from('guide_upvotes')
        .select('id', { count: 'exact', head: true })
        .eq('guide_id', guideId)
        .eq('voter_token', voterToken);

      if (error) throw error;
      return (count ?? 0) > 0;
    } catch (error) {
      console.error('GuideService.hasUserUpvoted error:', error);
      return false;
    }
  }

  // ============================================
  // Champion management (formation guides)
  // ============================================

  /**
   * Returns a single guide with full nested details by ID.
   */
  async getGuideById(id: string): Promise<GuideWithDetails | null> {
    try {
      const { data, error } = await this.supabase
        .from('guides')
        .select(
          `
          *,
          user_profiles(display_name, username),
          guide_champions(
            *,
            champions(*),
            ornaments(*),
            rings(*),
            guide_champion_skills(*, skills(*)),
            guide_champion_gems(*, gems(*)),
            guide_champion_horse_traits(*, horse_temperaments(*))
          )
        `
        )
        .eq('id', id)
        .single();

      if (error) {
        if (error.code === 'PGRST116') return null;
        throw error;
      }

      return (data as GuideWithDetails) ?? null;
    } catch (error) {
      console.error('GuideService.getGuideById error:', error);
      return null;
    }
  }

  /**
   * Saves (or replaces) all champion slots for a formation guide.
   * Delegates to the save_guide_champions RPC for an atomic delete + insert.
   */
  async saveGuideChampions(guideId: string, slots: ChampionSlotConfig[]): Promise<{ error: string | null }> {
    try {
      const serializedSlots = slots.map(slot => ({
        position: slot.position,
        champion_id: slot.champion.id,
        ornament_id: slot.ornament?.id ?? null,
        ring_id: slot.ring?.id ?? null,
        skills: slot.skills
          .map((skill, i) => (skill ? { skill_id: skill.id, slot: i + 1 } : null))
          .filter((s): s is NonNullable<typeof s> => s !== null),
        gems: slot.gems
          .map((gem, i) => (gem ? { gem_id: gem.id, slot: i + 1 } : null))
          .filter((g): g is NonNullable<typeof g> => g !== null),
        traits: slot.traits
          .map((trait, i) => (trait ? { temperament_id: trait.id, slot: i + 1 } : null))
          .filter((t): t is NonNullable<typeof t> => t !== null),
      }));

      const { error } = await this.supabase.client.rpc('save_guide_champions', {
        p_guide_id: guideId,
        p_slots: serializedSlots,
      });

      if (error) throw error;
      return { error: null };
    } catch (error) {
      console.error('GuideService.saveGuideChampions error:', error);
      return { error: 'guides.errors.unknown' };
    }
  }

  // ============================================
  // Private helpers
  // ============================================

  /**
   * Converts a guide title to a URL-friendly slug.
   * Strips accents, lowercases, replaces non-alphanumeric with hyphens,
   * trims to 80 chars, and appends a 4-character hex suffix for uniqueness.
   */
  private slugify(title: string): string {
    const normalized = title
      .normalize('NFD') // decompose accented characters
      .replace(/[\u0300-\u036f]/g, '') // strip combining diacritics
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '') // strip anything not alphanumeric/space/hyphen
      .trim()
      .replace(/[\s-]+/g, '-') // collapse spaces/hyphens to single hyphen
      .slice(0, 80)
      .replace(/-+$/, ''); // trim trailing hyphens

    const suffix = Math.floor(Math.random() * 0xffff)
      .toString(16)
      .padStart(4, '0');

    return `${normalized}-${suffix}`;
  }
}
