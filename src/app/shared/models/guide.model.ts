/**
 * Guide Models
 * Interfaces for the strategy guides feature
 */

export type GuideCategory = 'formation' | 'evenement' | 'general';

export type GemType = 'strategy' | 'hero' | 'tactics';

export type HorseTraitSlot = 1 | 2 | 3;
export type SkillSlot = 1 | 2;
export type GemSlot = 1 | 2 | 3;
export type ChampionPosition = 0 | 1 | 2;

// ============================================
// Reference / catalog entities
// ============================================

export interface Champion {
  readonly id: string;
  name: string;
  image_url: string | null;
  sort_order: number;
  is_active: boolean;
}

export interface Skill {
  readonly id: string;
  name: string;
  description: string | null;
  icon_url: string | null;
  is_active: boolean;
  sort_order: number;
}

export interface ChampionWithSkills extends Champion {
  skills: Skill[];
}

export interface HorseTemperament {
  readonly id: string;
  name: string;
  description: string | null;
  sort_order: number;
}

export interface Ornament {
  readonly id: string;
  name: string;
  image_url: string | null;
  is_active: boolean;
  sort_order: number;
}

export interface Ring {
  readonly id: string;
  name: string;
  description: string | null;
  icon_url: string | null;
  is_active: boolean;
  sort_order: number;
}

export interface Gem {
  readonly id: string;
  name: string;
  type: GemType;
  icon_url: string | null;
  is_active: boolean;
}

// ============================================
// Guide sub-entities (champion configuration)
// ============================================

export interface GuideChampionHorseTrait {
  readonly id: string;
  guide_champion_id: string;
  temperament_id: string;
  slot: HorseTraitSlot;
  horse_temperaments?: HorseTemperament;
}

export interface GuideChampionSkill {
  readonly id: string;
  guide_champion_id: string;
  skill_id: string;
  slot: SkillSlot;
  skills?: Skill;
}

export interface GuideChampionGem {
  readonly id: string;
  guide_champion_id: string;
  gem_id: string;
  slot: GemSlot;
  gems?: Gem;
}

export interface GuideChampion {
  readonly id: string;
  guide_id: string;
  position: ChampionPosition;
  champion_id: string;
  ornament_id: string | null;
  ring_id: string | null;
  champions?: Champion;
  ornaments?: Ornament;
  rings?: Ring;
  guide_champion_skills?: GuideChampionSkill[];
  guide_champion_gems?: GuideChampionGem[];
  guide_champion_horse_traits?: GuideChampionHorseTrait[];
}

// ============================================
// Guide entity
// ============================================

export interface Guide {
  readonly id: string;
  readonly author_id: string;
  title: string;
  category: GuideCategory;
  description: string | null;
  slug: string;
  is_published: boolean;
  upvotes_count: number;
  readonly created_at: string;
  updated_at: string;
}

export interface GuideWithDetails extends Guide {
  guide_champions?: GuideChampion[];
  user_profiles?: { display_name: string; username: string };
}

// ============================================
// DTOs
// ============================================

export interface CreateGuideDto {
  title: string;
  category: GuideCategory;
  description?: string | null;
  /** Optional — auto-generated from title when omitted */
  slug?: string;
}

export interface UpdateGuideDto {
  title?: string;
  description?: string | null;
  is_published?: boolean;
}

export interface CreateGuideChampionDto {
  guide_id: string;
  position: ChampionPosition;
  champion_id: string;
  ornament_id?: string | null;
  ring_id?: string | null;
}

// ============================================
// Editor state (client-side only)
// ============================================

/**
 * Represents the full configuration of one champion slot in the guide editor.
 * Index in the array determines the slot position (0, 1, 2).
 */
export interface ChampionSlotConfig {
  position: ChampionPosition;
  champion: Champion;
  skills: [Skill | null, Skill | null];
  gems: [Gem | null, Gem | null, Gem | null];
  traits: [HorseTemperament | null, HorseTemperament | null, HorseTemperament | null];
  ornament: Ornament | null;
  ring: Ring | null;
}
