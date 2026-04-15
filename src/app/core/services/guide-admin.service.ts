import { Injectable, inject } from '@angular/core';
import { SupabaseService } from './supabase.service';
import type { Champion, Skill, HorseTemperament, Adornment, Gem, Ring } from '@shared/models';

/**
 * Admin service for CRUD operations on guide reference data.
 * All write operations are protected by RLS (super_admin only).
 */
@Injectable({
  providedIn: 'root',
})
export class GuideAdminService {
  private readonly supabase = inject(SupabaseService);

  // ============================================
  // Storage helper
  // ============================================

  /**
   * Uploads a file to Supabase Storage and returns the public URL.
   * @param bucket - Storage bucket name
   * @param path   - Path within the bucket (e.g. 'champions/uuid/filename.png')
   * @param file   - The file to upload
   */
  private async uploadImage(
    bucket: string,
    path: string,
    file: File
  ): Promise<{ url: string | null; error: string | null }> {
    const ALLOWED_MIME_TYPES = ['image/png', 'image/jpeg', 'image/webp'];
    if (!ALLOWED_MIME_TYPES.includes(file.type)) {
      return { url: null, error: 'guides.errors.invalidFileType' };
    }

    try {
      const { error: uploadError } = await this.supabase.client.storage
        .from(bucket)
        .upload(path, file, { upsert: true });

      if (uploadError) throw uploadError;

      const { data } = this.supabase.client.storage.from(bucket).getPublicUrl(path);

      return { url: data.publicUrl, error: null };
    } catch (error) {
      console.error('GuideAdminService.uploadImage error:', error);
      return { url: null, error: (error as Error).message };
    }
  }

  // ============================================
  // Champions
  // ============================================

  async getChampions(): Promise<Champion[]> {
    try {
      const { data, error } = await this.supabase
        .from('champions')
        .select('*')
        .order('sort_order', { ascending: true });

      if (error) throw error;
      return (data ?? []) as Champion[];
    } catch (error) {
      console.error('GuideAdminService.getChampions error:', error);
      return [];
    }
  }

  async createChampion(data: Omit<Champion, 'id'>): Promise<{ champion: Champion | null; error: string | null }> {
    try {
      const { data: created, error } = await this.supabase.from('champions').insert(data).select().single();

      if (error) throw error;
      return { champion: created as Champion, error: null };
    } catch (error) {
      console.error('GuideAdminService.createChampion error:', error);
      return { champion: null, error: (error as Error).message };
    }
  }

  async updateChampion(id: string, data: Partial<Omit<Champion, 'id'>>): Promise<{ error: string | null }> {
    try {
      const { error } = await this.supabase.from('champions').update(data).eq('id', id);

      if (error) throw error;
      return { error: null };
    } catch (error) {
      console.error('GuideAdminService.updateChampion error:', error);
      return { error: (error as Error).message };
    }
  }

  async deleteChampion(id: string): Promise<{ error: string | null }> {
    try {
      const { error } = await this.supabase.from('champions').delete().eq('id', id);
      if (error) throw error;
      return { error: null };
    } catch (error) {
      console.error('GuideAdminService.deleteChampion error:', error);
      return { error: (error as Error).message };
    }
  }

  async uploadChampionImage(id: string, file: File): Promise<{ url: string | null; error: string | null }> {
    const ext = file.name.split('.').pop() ?? 'png';
    const path = `champions/${id}/avatar.${ext}`;
    const result = await this.uploadImage('guides-assets', path, file);

    if (result.url) {
      await this.updateChampion(id, { image_url: result.url });
    }

    return result;
  }

  // ============================================
  // Skills
  // ============================================

  async getSkills(): Promise<Skill[]> {
    try {
      const { data, error } = await this.supabase.from('skills').select('*').order('sort_order', { ascending: true });

      if (error) throw error;
      return (data ?? []) as Skill[];
    } catch (error) {
      console.error('GuideAdminService.getSkills error:', error);
      return [];
    }
  }

  async createSkill(data: Omit<Skill, 'id'>): Promise<{ skill: Skill | null; error: string | null }> {
    try {
      const { data: created, error } = await this.supabase.from('skills').insert(data).select().single();

      if (error) throw error;
      return { skill: created as Skill, error: null };
    } catch (error) {
      console.error('GuideAdminService.createSkill error:', error);
      return { skill: null, error: (error as Error).message };
    }
  }

  async updateSkill(id: string, data: Partial<Omit<Skill, 'id'>>): Promise<{ error: string | null }> {
    try {
      const { error } = await this.supabase.from('skills').update(data).eq('id', id);

      if (error) throw error;
      return { error: null };
    } catch (error) {
      console.error('GuideAdminService.updateSkill error:', error);
      return { error: (error as Error).message };
    }
  }

  async deleteSkill(id: string): Promise<{ error: string | null }> {
    try {
      const { error } = await this.supabase.from('skills').delete().eq('id', id);
      if (error) throw error;
      return { error: null };
    } catch (error) {
      console.error('GuideAdminService.deleteSkill error:', error);
      return { error: (error as Error).message };
    }
  }

  async uploadSkillImage(id: string, file: File): Promise<{ url: string | null; error: string | null }> {
    const ext = file.name.split('.').pop() ?? 'png';
    const path = `skills/${id}/icon.${ext}`;
    const result = await this.uploadImage('guides-assets', path, file);

    if (result.url) {
      await this.updateSkill(id, { icon_url: result.url });
    }

    return result;
  }

  // ============================================
  // Champion-Skill assignments
  // ============================================

  async getChampionSkills(championId: string): Promise<Skill[]> {
    try {
      const { data, error } = await this.supabase
        .from('champion_skill_assignments')
        .select('skills(*)')
        .eq('champion_id', championId);

      if (error) throw error;

      return ((data ?? []) as unknown as { skills: Skill }[]).map(row => row.skills).filter(Boolean);
    } catch (error) {
      console.error('GuideAdminService.getChampionSkills error:', error);
      return [];
    }
  }

  async assignSkillToChampion(championId: string, skillId: string): Promise<{ error: string | null }> {
    try {
      const { error } = await this.supabase
        .from('champion_skill_assignments')
        .insert({ champion_id: championId, skill_id: skillId });

      if (error) throw error;
      return { error: null };
    } catch (error) {
      console.error('GuideAdminService.assignSkillToChampion error:', error);
      return { error: (error as Error).message };
    }
  }

  async removeSkillFromChampion(championId: string, skillId: string): Promise<{ error: string | null }> {
    try {
      const { error } = await this.supabase
        .from('champion_skill_assignments')
        .delete()
        .eq('champion_id', championId)
        .eq('skill_id', skillId);

      if (error) throw error;
      return { error: null };
    } catch (error) {
      console.error('GuideAdminService.removeSkillFromChampion error:', error);
      return { error: (error as Error).message };
    }
  }

  // ============================================
  // Horse Temperaments
  // ============================================

  async getHorseTemperaments(): Promise<HorseTemperament[]> {
    try {
      const { data, error } = await this.supabase
        .from('horse_temperaments')
        .select('*')
        .order('sort_order', { ascending: true });

      if (error) throw error;
      return (data ?? []) as HorseTemperament[];
    } catch (error) {
      console.error('GuideAdminService.getHorseTemperaments error:', error);
      return [];
    }
  }

  async createHorseTemperament(
    data: Omit<HorseTemperament, 'id'>
  ): Promise<{ temperament: HorseTemperament | null; error: string | null }> {
    try {
      const { data: created, error } = await this.supabase.from('horse_temperaments').insert(data).select().single();

      if (error) throw error;
      return { temperament: created as HorseTemperament, error: null };
    } catch (error) {
      console.error('GuideAdminService.createHorseTemperament error:', error);
      return { temperament: null, error: (error as Error).message };
    }
  }

  async updateHorseTemperament(
    id: string,
    data: Partial<Omit<HorseTemperament, 'id'>>
  ): Promise<{ error: string | null }> {
    try {
      const { error } = await this.supabase.from('horse_temperaments').update(data).eq('id', id);

      if (error) throw error;
      return { error: null };
    } catch (error) {
      console.error('GuideAdminService.updateHorseTemperament error:', error);
      return { error: (error as Error).message };
    }
  }

  async deleteHorseTemperament(id: string): Promise<{ error: string | null }> {
    try {
      const { error } = await this.supabase.from('horse_temperaments').delete().eq('id', id);

      if (error) throw error;
      return { error: null };
    } catch (error) {
      console.error('GuideAdminService.deleteHorseTemperament error:', error);
      return { error: (error as Error).message };
    }
  }

  // ============================================
  // Adornments
  // ============================================

  async getAdornments(): Promise<Adornment[]> {
    try {
      const { data, error } = await this.supabase
        .from('ornaments')
        .select('*')
        .order('sort_order', { ascending: true });

      if (error) throw error;
      return (data ?? []) as Adornment[];
    } catch (error) {
      console.error('GuideAdminService.getAdornments error:', error);
      return [];
    }
  }

  async createAdornment(data: Omit<Adornment, 'id'>): Promise<{ adornment: Adornment | null; error: string | null }> {
    try {
      const { data: created, error } = await this.supabase.from('ornaments').insert(data).select().single();

      if (error) throw error;
      return { adornment: created as Adornment, error: null };
    } catch (error) {
      console.error('GuideAdminService.createAdornment error:', error);
      return { adornment: null, error: (error as Error).message };
    }
  }

  async updateAdornment(id: string, data: Partial<Omit<Adornment, 'id'>>): Promise<{ error: string | null }> {
    try {
      const { error } = await this.supabase.from('ornaments').update(data).eq('id', id);

      if (error) throw error;
      return { error: null };
    } catch (error) {
      console.error('GuideAdminService.updateAdornment error:', error);
      return { error: (error as Error).message };
    }
  }

  async deleteAdornment(id: string): Promise<{ error: string | null }> {
    try {
      const { error } = await this.supabase.from('ornaments').delete().eq('id', id);
      if (error) throw error;
      return { error: null };
    } catch (error) {
      console.error('GuideAdminService.deleteAdornment error:', error);
      return { error: (error as Error).message };
    }
  }

  // ============================================
  // Gems
  // ============================================

  async getGems(): Promise<Gem[]> {
    try {
      const { data, error } = await this.supabase.from('gems').select('*').order('name', { ascending: true });

      if (error) throw error;
      return (data ?? []) as Gem[];
    } catch (error) {
      console.error('GuideAdminService.getGems error:', error);
      return [];
    }
  }

  async createGem(data: Omit<Gem, 'id'>): Promise<{ gem: Gem | null; error: string | null }> {
    try {
      const { data: created, error } = await this.supabase.from('gems').insert(data).select().single();

      if (error) throw error;
      return { gem: created as Gem, error: null };
    } catch (error) {
      console.error('GuideAdminService.createGem error:', error);
      return { gem: null, error: (error as Error).message };
    }
  }

  async updateGem(id: string, data: Partial<Omit<Gem, 'id'>>): Promise<{ error: string | null }> {
    try {
      const { error } = await this.supabase.from('gems').update(data).eq('id', id);

      if (error) throw error;
      return { error: null };
    } catch (error) {
      console.error('GuideAdminService.updateGem error:', error);
      return { error: (error as Error).message };
    }
  }

  async deleteGem(id: string): Promise<{ error: string | null }> {
    try {
      const { error } = await this.supabase.from('gems').delete().eq('id', id);
      if (error) throw error;
      return { error: null };
    } catch (error) {
      console.error('GuideAdminService.deleteGem error:', error);
      return { error: (error as Error).message };
    }
  }

  async uploadGemImage(id: string, file: File): Promise<{ url: string | null; error: string | null }> {
    const ext = file.name.split('.').pop() ?? 'png';
    const path = `gems/${id}/icon.${ext}`;
    const result = await this.uploadImage('guides-assets', path, file);

    if (result.url) {
      await this.updateGem(id, { icon_url: result.url });
    }

    return result;
  }

  // ============================================
  // Rings
  // ============================================

  async getRings(): Promise<Ring[]> {
    try {
      const { data, error } = await this.supabase.from('rings').select('*').order('sort_order', { ascending: true });

      if (error) throw error;
      return (data ?? []) as Ring[];
    } catch (error) {
      console.error('GuideAdminService.getRings error:', error);
      return [];
    }
  }

  async createRing(data: Omit<Ring, 'id'>): Promise<{ ring: Ring | null; error: string | null }> {
    try {
      const { data: created, error } = await this.supabase.from('rings').insert(data).select().single();

      if (error) throw error;
      return { ring: created as Ring, error: null };
    } catch (error) {
      console.error('GuideAdminService.createRing error:', error);
      return { ring: null, error: (error as Error).message };
    }
  }

  async updateRing(id: string, data: Partial<Omit<Ring, 'id'>>): Promise<{ error: string | null }> {
    try {
      const { error } = await this.supabase.from('rings').update(data).eq('id', id);

      if (error) throw error;
      return { error: null };
    } catch (error) {
      console.error('GuideAdminService.updateRing error:', error);
      return { error: (error as Error).message };
    }
  }

  async deleteRing(id: string): Promise<{ error: string | null }> {
    try {
      const { error } = await this.supabase.from('rings').delete().eq('id', id);
      if (error) throw error;
      return { error: null };
    } catch (error) {
      console.error('GuideAdminService.deleteRing error:', error);
      return { error: (error as Error).message };
    }
  }

  async uploadRingImage(id: string, file: File): Promise<{ url: string | null; error: string | null }> {
    const ext = file.name.split('.').pop() ?? 'png';
    const path = `rings/${id}/icon.${ext}`;
    const result = await this.uploadImage('guides-assets', path, file);

    if (result.url) {
      await this.updateRing(id, { icon_url: result.url });
    }

    return result;
  }
}
