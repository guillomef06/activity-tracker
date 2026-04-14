-- ============================================================
-- Guides Feature — Full schema, security, data & seed
-- Covers: tables, RLS, triggers, RPC, storage bucket, seed data
-- ============================================================

-- Guides Feature — Strategy guides with champions, skills, gems, temperaments and anonymous upvotes
-- Sprint 1: 13 new tables, RLS, indexes, trigger

-- ============================================
-- 0. HELPER FUNCTION
-- ============================================

CREATE OR REPLACE FUNCTION is_super_admin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM user_profiles
    WHERE id = auth.uid() AND role = 'super_admin'
  );
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public;

-- ============================================
-- 1. REFERENCE / CATALOG TABLES
-- ============================================

-- Champions
CREATE TABLE IF NOT EXISTS champions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  image_url TEXT,
  sort_order INT NOT NULL DEFAULT 0,
  is_active BOOL NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Skills (shared pool, assigned to champions via many-to-many)
CREATE TABLE IF NOT EXISTS skills (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  icon_url TEXT,
  is_active BOOL NOT NULL DEFAULT true,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Champion <-> Skill many-to-many
CREATE TABLE IF NOT EXISTS champion_skill_assignments (
  champion_id UUID NOT NULL REFERENCES champions(id) ON DELETE CASCADE,
  skill_id UUID NOT NULL REFERENCES skills(id) ON DELETE CASCADE,
  PRIMARY KEY (champion_id, skill_id)
);

-- Horse Temperaments (traits)
CREATE TABLE IF NOT EXISTS horse_temperaments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Ornaments
CREATE TABLE IF NOT EXISTS ornaments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  image_url TEXT,
  is_active BOOL NOT NULL DEFAULT true,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Gems
CREATE TABLE IF NOT EXISTS gems (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('strategy', 'hero', 'tactics')),
  icon_url TEXT,
  is_active BOOL NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Rings (admin-managed catalog, one per champion slot)
CREATE TABLE IF NOT EXISTS rings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  icon_url TEXT,
  is_active BOOL NOT NULL DEFAULT true,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================
-- 2. GUIDE TABLES
-- ============================================

-- Guides (main entity)
CREATE TABLE IF NOT EXISTS guides (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id UUID NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('formation', 'evenement', 'general')),
  description TEXT,
  slug TEXT NOT NULL UNIQUE,
  is_published BOOL NOT NULL DEFAULT false,
  upvotes_count INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Guide champion slots (up to 3 per formation guide)
CREATE TABLE IF NOT EXISTS guide_champions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  guide_id UUID NOT NULL REFERENCES guides(id) ON DELETE CASCADE,
  position SMALLINT NOT NULL CHECK (position IN (0, 1, 2)),
  champion_id UUID NOT NULL REFERENCES champions(id) ON DELETE RESTRICT,
  ornament_id UUID REFERENCES ornaments(id) ON DELETE SET NULL,
  ring_id UUID REFERENCES rings(id) ON DELETE SET NULL,
  UNIQUE (guide_id, position)
);

-- Horse traits assigned per champion slot (max 3)
CREATE TABLE IF NOT EXISTS guide_champion_horse_traits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  guide_champion_id UUID NOT NULL REFERENCES guide_champions(id) ON DELETE CASCADE,
  temperament_id UUID NOT NULL REFERENCES horse_temperaments(id) ON DELETE RESTRICT,
  slot SMALLINT NOT NULL CHECK (slot IN (1, 2, 3)),
  UNIQUE (guide_champion_id, slot)
);

-- Skills assigned per champion slot (max 2)
CREATE TABLE IF NOT EXISTS guide_champion_skills (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  guide_champion_id UUID NOT NULL REFERENCES guide_champions(id) ON DELETE CASCADE,
  skill_id UUID NOT NULL REFERENCES skills(id) ON DELETE RESTRICT,
  slot SMALLINT NOT NULL CHECK (slot IN (1, 2)),
  UNIQUE (guide_champion_id, slot)
);

-- Gems assigned per champion slot (max 3 — one per type: strategy/hero/tactics)
CREATE TABLE IF NOT EXISTS guide_champion_gems (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  guide_champion_id UUID NOT NULL REFERENCES guide_champions(id) ON DELETE CASCADE,
  gem_id UUID NOT NULL REFERENCES gems(id) ON DELETE RESTRICT,
  slot SMALLINT NOT NULL CHECK (slot IN (1, 2, 3)),
  UNIQUE (guide_champion_id, slot),
  UNIQUE (guide_champion_id, gem_id)
);

-- Upvotes (anonymous — keyed by voter_token from localStorage)
CREATE TABLE IF NOT EXISTS guide_upvotes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  guide_id UUID NOT NULL REFERENCES guides(id) ON DELETE CASCADE,
  voter_token TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (guide_id, voter_token)
);

-- ============================================
-- 3. INDEXES
-- ============================================

CREATE INDEX IF NOT EXISTS idx_guides_author_id ON guides(author_id);
CREATE INDEX IF NOT EXISTS idx_guides_slug ON guides(slug);
CREATE INDEX IF NOT EXISTS idx_guides_category ON guides(category);
CREATE INDEX IF NOT EXISTS idx_guides_upvotes ON guides(upvotes_count DESC);
CREATE INDEX IF NOT EXISTS idx_guide_champions_guide_id ON guide_champions(guide_id);
CREATE INDEX IF NOT EXISTS idx_guide_champions_ring_id ON guide_champions(ring_id);
CREATE INDEX IF NOT EXISTS idx_guide_upvotes_guide_id ON guide_upvotes(guide_id);
CREATE INDEX IF NOT EXISTS idx_guide_upvotes_voter_token ON guide_upvotes(voter_token);
CREATE INDEX IF NOT EXISTS idx_champion_skill_assignments_champion ON champion_skill_assignments(champion_id);
CREATE INDEX IF NOT EXISTS idx_champion_skill_assignments_skill ON champion_skill_assignments(skill_id);

-- ============================================
-- 4. TRIGGER — maintain guides.upvotes_count
-- ============================================

CREATE OR REPLACE FUNCTION update_guide_upvotes_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE guides SET upvotes_count = upvotes_count + 1 WHERE id = NEW.guide_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE guides SET upvotes_count = GREATEST(upvotes_count - 1, 0) WHERE id = OLD.guide_id;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trigger_guide_upvotes_count ON guide_upvotes;
CREATE TRIGGER trigger_guide_upvotes_count
  AFTER INSERT OR DELETE ON guide_upvotes
  FOR EACH ROW EXECUTE FUNCTION update_guide_upvotes_count();

-- ============================================
-- 5. ROW LEVEL SECURITY
-- ============================================

-- Enable RLS on all 12 tables
ALTER TABLE champions ENABLE ROW LEVEL SECURITY;
ALTER TABLE skills ENABLE ROW LEVEL SECURITY;
ALTER TABLE champion_skill_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE horse_temperaments ENABLE ROW LEVEL SECURITY;
ALTER TABLE ornaments ENABLE ROW LEVEL SECURITY;
ALTER TABLE gems ENABLE ROW LEVEL SECURITY;
ALTER TABLE guides ENABLE ROW LEVEL SECURITY;
ALTER TABLE guide_champions ENABLE ROW LEVEL SECURITY;
ALTER TABLE guide_champion_horse_traits ENABLE ROW LEVEL SECURITY;
ALTER TABLE guide_champion_skills ENABLE ROW LEVEL SECURITY;
ALTER TABLE guide_champion_gems ENABLE ROW LEVEL SECURITY;
ALTER TABLE rings ENABLE ROW LEVEL SECURITY;
ALTER TABLE guide_upvotes ENABLE ROW LEVEL SECURITY;

-- ============================================
-- 5a. Reference tables — SELECT active records for all, full write for super_admin
-- ============================================

-- champions
CREATE POLICY "champions_select_active" ON champions
  FOR SELECT USING (is_active = true OR is_super_admin());

CREATE POLICY "champions_insert_super_admin" ON champions
  FOR INSERT WITH CHECK (is_super_admin());

CREATE POLICY "champions_update_super_admin" ON champions
  FOR UPDATE USING (is_super_admin());

CREATE POLICY "champions_delete_super_admin" ON champions
  FOR DELETE USING (is_super_admin());

-- skills
CREATE POLICY "skills_select_active" ON skills
  FOR SELECT USING (is_active = true OR is_super_admin());

CREATE POLICY "skills_insert_super_admin" ON skills
  FOR INSERT WITH CHECK (is_super_admin());

CREATE POLICY "skills_update_super_admin" ON skills
  FOR UPDATE USING (is_super_admin());

CREATE POLICY "skills_delete_super_admin" ON skills
  FOR DELETE USING (is_super_admin());

-- champion_skill_assignments
CREATE POLICY "csa_select_all" ON champion_skill_assignments
  FOR SELECT USING (true);

CREATE POLICY "csa_insert_super_admin" ON champion_skill_assignments
  FOR INSERT WITH CHECK (is_super_admin());

CREATE POLICY "csa_delete_super_admin" ON champion_skill_assignments
  FOR DELETE USING (is_super_admin());

-- horse_temperaments (no is_active column, all readable)
CREATE POLICY "horse_temperaments_select_all" ON horse_temperaments
  FOR SELECT USING (true);

CREATE POLICY "horse_temperaments_insert_super_admin" ON horse_temperaments
  FOR INSERT WITH CHECK (is_super_admin());

CREATE POLICY "horse_temperaments_update_super_admin" ON horse_temperaments
  FOR UPDATE USING (is_super_admin());

CREATE POLICY "horse_temperaments_delete_super_admin" ON horse_temperaments
  FOR DELETE USING (is_super_admin());

-- ornaments
CREATE POLICY "ornaments_select_active" ON ornaments
  FOR SELECT USING (is_active = true OR is_super_admin());

CREATE POLICY "ornaments_insert_super_admin" ON ornaments
  FOR INSERT WITH CHECK (is_super_admin());

CREATE POLICY "ornaments_update_super_admin" ON ornaments
  FOR UPDATE USING (is_super_admin());

CREATE POLICY "ornaments_delete_super_admin" ON ornaments
  FOR DELETE USING (is_super_admin());

-- gems
CREATE POLICY "gems_select_active" ON gems
  FOR SELECT USING (is_active = true OR is_super_admin());

CREATE POLICY "gems_insert_super_admin" ON gems
  FOR INSERT WITH CHECK (is_super_admin());

CREATE POLICY "gems_update_super_admin" ON gems
  FOR UPDATE USING (is_super_admin());

CREATE POLICY "gems_delete_super_admin" ON gems
  FOR DELETE USING (is_super_admin());

-- rings
CREATE POLICY "rings_select_active" ON rings
  FOR SELECT USING (is_active = true OR is_super_admin());

CREATE POLICY "rings_insert_super_admin" ON rings
  FOR INSERT WITH CHECK (is_super_admin());

CREATE POLICY "rings_update_super_admin" ON rings
  FOR UPDATE USING (is_super_admin());

CREATE POLICY "rings_delete_super_admin" ON rings
  FOR DELETE USING (is_super_admin());

-- ============================================
-- 5b. guides
-- ============================================

CREATE POLICY "guides_select_published_or_author" ON guides
  FOR SELECT USING (is_published = true OR author_id = auth.uid());

CREATE POLICY "guides_insert_authenticated" ON guides
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL AND author_id = auth.uid());

CREATE POLICY "guides_update_author_or_super_admin" ON guides
  FOR UPDATE USING (author_id = auth.uid() OR is_super_admin());

CREATE POLICY "guides_delete_author_or_super_admin" ON guides
  FOR DELETE USING (author_id = auth.uid() OR is_super_admin());

-- ============================================
-- 5c. guide sub-tables — SELECT via guide visibility, write by guide author
-- ============================================

-- guide_champions
CREATE POLICY "guide_champions_select" ON guide_champions
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM guides g
      WHERE g.id = guide_id AND (g.is_published = true OR g.author_id = auth.uid())
    )
  );

CREATE POLICY "guide_champions_write_author" ON guide_champions
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM guides g WHERE g.id = guide_id AND g.author_id = auth.uid())
  );

CREATE POLICY "guide_champions_update_author" ON guide_champions
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM guides g WHERE g.id = guide_id AND g.author_id = auth.uid())
  );

CREATE POLICY "guide_champions_delete_author" ON guide_champions
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM guides g WHERE g.id = guide_id AND g.author_id = auth.uid())
  );

-- guide_champion_horse_traits
CREATE POLICY "guide_champion_horse_traits_select" ON guide_champion_horse_traits
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM guide_champions gc
      JOIN guides g ON g.id = gc.guide_id
      WHERE gc.id = guide_champion_id AND (g.is_published = true OR g.author_id = auth.uid())
    )
  );

CREATE POLICY "guide_champion_horse_traits_write_author" ON guide_champion_horse_traits
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM guide_champions gc
      JOIN guides g ON g.id = gc.guide_id
      WHERE gc.id = guide_champion_id AND g.author_id = auth.uid()
    )
  );

CREATE POLICY "guide_champion_horse_traits_update_author" ON guide_champion_horse_traits
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM guide_champions gc
      JOIN guides g ON g.id = gc.guide_id
      WHERE gc.id = guide_champion_id AND g.author_id = auth.uid()
    )
  );

CREATE POLICY "guide_champion_horse_traits_delete_author" ON guide_champion_horse_traits
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM guide_champions gc
      JOIN guides g ON g.id = gc.guide_id
      WHERE gc.id = guide_champion_id AND g.author_id = auth.uid()
    )
  );

-- guide_champion_skills
CREATE POLICY "guide_champion_skills_select" ON guide_champion_skills
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM guide_champions gc
      JOIN guides g ON g.id = gc.guide_id
      WHERE gc.id = guide_champion_id AND (g.is_published = true OR g.author_id = auth.uid())
    )
  );

CREATE POLICY "guide_champion_skills_write_author" ON guide_champion_skills
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM guide_champions gc
      JOIN guides g ON g.id = gc.guide_id
      WHERE gc.id = guide_champion_id AND g.author_id = auth.uid()
    )
  );

CREATE POLICY "guide_champion_skills_update_author" ON guide_champion_skills
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM guide_champions gc
      JOIN guides g ON g.id = gc.guide_id
      WHERE gc.id = guide_champion_id AND g.author_id = auth.uid()
    )
  );

CREATE POLICY "guide_champion_skills_delete_author" ON guide_champion_skills
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM guide_champions gc
      JOIN guides g ON g.id = gc.guide_id
      WHERE gc.id = guide_champion_id AND g.author_id = auth.uid()
    )
  );

-- guide_champion_gems
CREATE POLICY "guide_champion_gems_select" ON guide_champion_gems
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM guide_champions gc
      JOIN guides g ON g.id = gc.guide_id
      WHERE gc.id = guide_champion_id AND (g.is_published = true OR g.author_id = auth.uid())
    )
  );

CREATE POLICY "guide_champion_gems_write_author" ON guide_champion_gems
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM guide_champions gc
      JOIN guides g ON g.id = gc.guide_id
      WHERE gc.id = guide_champion_id AND g.author_id = auth.uid()
    )
  );

CREATE POLICY "guide_champion_gems_update_author" ON guide_champion_gems
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM guide_champions gc
      JOIN guides g ON g.id = gc.guide_id
      WHERE gc.id = guide_champion_id AND g.author_id = auth.uid()
    )
  );

CREATE POLICY "guide_champion_gems_delete_author" ON guide_champion_gems
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM guide_champions gc
      JOIN guides g ON g.id = gc.guide_id
      WHERE gc.id = guide_champion_id AND g.author_id = auth.uid()
    )
  );

-- ============================================
-- 5d. guide_upvotes — SELECT all, INSERT all (anon), DELETE by guide author or super_admin
-- ============================================

CREATE POLICY "guide_upvotes_select_all" ON guide_upvotes
  FOR SELECT USING (true);

CREATE POLICY "guide_upvotes_insert_all" ON guide_upvotes
  FOR INSERT WITH CHECK (true);

CREATE POLICY "guide_upvotes_delete_author_or_super_admin" ON guide_upvotes
  FOR DELETE USING (
    is_super_admin()
    OR EXISTS (
      SELECT 1 FROM guides g WHERE g.id = guide_id AND g.author_id = auth.uid()
    )
  );

-- ============================================================
-- Security & integrity fixes (upvote policy, guide limit, RPC, updated_at)
-- ============================================================

-- Guides Feature — Security & integrity fixes
-- Fixes: upvote policy, guide limit trigger, transactional save_guide_champions RPC, updated_at triggers

-- ============================================
-- 1. Policy guide_upvotes INSERT — restrict to published guides only
-- ============================================

DROP POLICY IF EXISTS "guide_upvotes_insert_all" ON guide_upvotes;
CREATE POLICY "guide_upvotes_insert_published_only" ON guide_upvotes
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM guides WHERE id = guide_id AND is_published = true)
  );

-- ============================================
-- 2. Policy guide_upvotes DELETE — super_admin only (remove author self-delete)
-- ============================================

DROP POLICY IF EXISTS "guide_upvotes_delete_author_or_super_admin" ON guide_upvotes;
CREATE POLICY "guide_upvotes_delete_super_admin_only" ON guide_upvotes
  FOR DELETE USING (is_super_admin());

-- ============================================
-- 3. BEFORE INSERT trigger — enforce 10-guide limit server-side
-- ============================================

CREATE OR REPLACE FUNCTION check_guide_limit()
RETURNS TRIGGER AS $$
BEGIN
  IF (
    SELECT COUNT(*) FROM guides WHERE author_id = NEW.author_id
  ) >= 10 THEN
    RAISE EXCEPTION 'guide_limit_exceeded' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trigger_guide_limit ON guides;
CREATE TRIGGER trigger_guide_limit
  BEFORE INSERT ON guides
  FOR EACH ROW EXECUTE FUNCTION check_guide_limit();

-- ============================================
-- 4. RPC save_guide_champions — atomic delete + insert in a single transaction
-- ============================================

CREATE OR REPLACE FUNCTION save_guide_champions(
  p_guide_id UUID,
  p_slots JSONB
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_slot     JSONB;
  v_gc_id    UUID;
BEGIN
  -- Verify that the caller is the guide author
  IF NOT EXISTS (
    SELECT 1 FROM guides WHERE id = p_guide_id AND author_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'unauthorized' USING ERRCODE = '42501';
  END IF;

  -- Delete all existing champion slots (cascades to skills, gems, traits)
  DELETE FROM guide_champions WHERE guide_id = p_guide_id;

  -- Insert each slot
  FOR v_slot IN SELECT * FROM jsonb_array_elements(p_slots)
  LOOP
    INSERT INTO guide_champions (guide_id, position, champion_id, ornament_id, ring_id)
    VALUES (
      p_guide_id,
      (v_slot->>'position')::SMALLINT,
      (v_slot->>'champion_id')::UUID,
      NULLIF(v_slot->>'ornament_id', '')::UUID,
      NULLIF(v_slot->>'ring_id', '')::UUID
    )
    RETURNING id INTO v_gc_id;

    -- Skills (up to 2 per slot)
    INSERT INTO guide_champion_skills (guide_champion_id, skill_id, slot)
    SELECT v_gc_id, (s->>'skill_id')::UUID, (s->>'slot')::SMALLINT
    FROM jsonb_array_elements(v_slot->'skills') AS s
    WHERE (s->>'skill_id') IS NOT NULL AND (s->>'skill_id') <> '';

    -- Gems (up to 3 per slot — one per type)
    INSERT INTO guide_champion_gems (guide_champion_id, gem_id, slot)
    SELECT v_gc_id, (g->>'gem_id')::UUID, (g->>'slot')::SMALLINT
    FROM jsonb_array_elements(v_slot->'gems') AS g
    WHERE (g->>'gem_id') IS NOT NULL AND (g->>'gem_id') <> '';

    -- Horse traits (up to 3 per slot)
    INSERT INTO guide_champion_horse_traits (guide_champion_id, temperament_id, slot)
    SELECT v_gc_id, (t->>'temperament_id')::UUID, (t->>'slot')::SMALLINT
    FROM jsonb_array_elements(v_slot->'traits') AS t
    WHERE (t->>'temperament_id') IS NOT NULL AND (t->>'temperament_id') <> '';
  END LOOP;
END;
$$;

-- ============================================
-- 5. BEFORE UPDATE triggers — set updated_at from DB clock (not client)
-- ============================================

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['champions','skills','horse_temperaments','ornaments','gems','rings','guides']
  LOOP
    EXECUTE format(
      'DROP TRIGGER IF EXISTS trigger_updated_at ON %I;
       CREATE TRIGGER trigger_updated_at
         BEFORE UPDATE ON %I
         FOR EACH ROW EXECUTE FUNCTION set_updated_at();',
      t, t
    );
  END LOOP;
END;
$$;

-- ============================================================
-- Seed — Storage bucket, Champions, Skills, Assignments
-- ============================================================

-- ============================================================
-- Storage bucket for guide assets (champions, skills, gems, rings icons)
-- ============================================================
INSERT INTO storage.buckets (id, name, public)
VALUES ('guides-assets', 'guides-assets', true)
ON CONFLICT (id) DO NOTHING;

-- RLS: public read, super_admin write
CREATE POLICY IF NOT EXISTS "guides-assets public read"
  ON storage.objects FOR SELECT USING (bucket_id = 'guides-assets');

CREATE POLICY IF NOT EXISTS "guides-assets super_admin write"
  ON storage.objects FOR INSERT WITH CHECK (
    bucket_id = 'guides-assets' AND is_super_admin()
  );

CREATE POLICY IF NOT EXISTS "guides-assets super_admin update"
  ON storage.objects FOR UPDATE USING (
    bucket_id = 'guides-assets' AND is_super_admin()
  );

CREATE POLICY IF NOT EXISTS "guides-assets super_admin delete"
  ON storage.objects FOR DELETE USING (
    bucket_id = 'guides-assets' AND is_super_admin()
  );

-- ============================================================
-- Seed: Champions & Skills (generated from aoemobileguides.com)
-- Generated: 2026-04-13T19:12:16.766Z
-- Champions: 76 | Skills: 92 | Assignments: 419
-- ============================================================

-- Champions
INSERT INTO champions (id, name, image_url, sort_order, is_active) VALUES
  ('69090804-b19a-47df-9934-e00c8c098a1f', 'Queen Dido', 'https://aoemobileguides.com/wp-content/uploads/2025/06/Queen-Dido-Icon.png', 1, true),
  ('b33c3090-2913-4810-a3bc-8ef14cedf5e1', 'Cyrus The Great', 'https://aoemobileguides.com/wp-content/uploads/2025/06/Cyrus-The-Great-Icon.png', 2, true),
  ('6888c239-c500-499b-afb7-d16d8bba00a6', 'Timur', 'https://aoemobileguides.com/wp-content/uploads/2025/06/Timur-Icon.png', 3, true),
  ('378ccd26-9dfa-4c2c-9d18-ffcf8bb90bca', 'Tomyris', 'https://aoemobileguides.com/wp-content/uploads/2025/06/Tomyris-Icon.png', 4, true),
  ('ce4e1b67-4265-4525-8d7f-c70daaaf351a', 'Lagertha', 'https://aoemobileguides.com/wp-content/uploads/2025/04/Lagertha-Icon.png', 5, true),
  ('69c35ba3-878a-4bb9-9a82-5f6cb4d32b83', 'Belisarius', 'https://aoemobileguides.com/wp-content/uploads/2025/04/Belisarius-Icon.png', 6, true),
  ('cddca2d5-08e6-4437-8a75-b88db4bc4587', 'Elizabeth', 'https://aoemobileguides.com/wp-content/uploads/2025/04/Elizabeth-Icon.png', 7, true),
  ('2ccb85d1-e30c-45c7-a865-8e952db3af70', 'Mansa Musa', 'https://aoemobileguides.com/wp-content/uploads/2025/01/Mansa-Musa-Icon.png', 8, true),
  ('00fefc3e-6543-4fc5-ba6f-76f011e51479', 'Saladin', 'https://aoemobileguides.com/wp-content/uploads/2025/01/Saladin-Icon.png', 9, true),
  ('f1d6df96-7bba-415d-904f-86cbf84ca72d', 'Charlemagne', 'https://aoemobileguides.com/wp-content/uploads/2025/01/Charlemagne-icon.png', 10, true),
  ('7f2db33f-0efb-4782-849e-a0be2b56507f', 'Ramesses', 'https://aoemobileguides.com/wp-content/uploads/2025/01/Ramesses-Icon.png', 11, true),
  ('d13106e6-77ab-4f80-80d4-73daa7d72c8c', 'Mehmed', 'https://aoemobileguides.com/wp-content/uploads/2025/01/Mehmed-II-Icon.png', 12, true),
  ('b2e15fcb-1826-442a-ae81-d272f5f9f4f4', 'Yodit', 'https://aoemobileguides.com/wp-content/uploads/2024/09/Yodit-Icon.png', 13, true),
  ('59f4228d-3001-4a6b-9e09-3edccce71a8c', 'Ram Khamhaeng', 'https://aoemobileguides.com/wp-content/uploads/2024/09/Ram-Khamhaeng-Icon.png', 14, true),
  ('71a026f1-f595-4c73-b456-8eacaa3bb7cd', 'Lu Bu', 'https://aoemobileguides.com/wp-content/uploads/2024/09/Lu-Bu-Icon.png', 15, true),
  ('32b23b69-ec9c-4733-86a0-0886ba9d4e66', 'Boudica', 'https://aoemobileguides.com/wp-content/uploads/2024/09/Boudica.png', 16, true),
  ('78edfcf7-523a-4b9c-bb70-b725ddfbfa9c', 'Bellevue', 'https://aoemobileguides.com/wp-content/uploads/2024/09/Bellevue-Icon.png', 17, true),
  ('7e339f39-6449-4c30-beb0-4c352500d919', 'Tokugawa Ieyasu', 'https://aoemobileguides.com/wp-content/uploads/2024/09/Tokugawa-Ieyasu.png', 18, true),
  ('64601d48-2663-4116-bd67-4daced6dee4c', 'Diao Chan', 'https://aoemobileguides.com/wp-content/uploads/2024/09/Diao-Chan.png', 19, true),
  ('4e27f685-ec5c-4186-97f5-16e917936ae1', 'Toyotomi Hideyoshi', 'https://aoemobileguides.com/wp-content/uploads/2024/09/Toyotomi-Hideyoshi.png', 20, true),
  ('1b292ab2-a0e8-474d-a186-0b4ab6a81cfa', 'Sejong The Great', 'https://aoemobileguides.com/wp-content/uploads/2024/09/Sejong-The-Great.png', 21, true),
  ('003d75ca-9569-414b-af35-5211b0289785', 'Oda Nobunaga', 'https://aoemobileguides.com/wp-content/uploads/2024/09/Oda-Nobunaga.png', 22, true),
  ('abae2f73-f845-4bbf-9f6c-2cc189ea1c9a', 'Julius Caesar', 'https://aoemobileguides.com/wp-content/uploads/2024/05/Julius-Caesar-Icon-2.png', 23, true),
  ('8c49064b-30a9-40fc-a1ff-ec4570c55eee', 'King Arthur', 'https://aoemobileguides.com/wp-content/uploads/2024/05/King-Arthur-Icon.png', 24, true),
  ('806b6ca2-7533-42b3-8a1c-dff396a5331d', 'Cleopatra', 'https://aoemobileguides.com/wp-content/uploads/2024/05/Cleopatra-Icon.png', 25, true),
  ('87722f44-f01b-493e-880d-898ce3dabc28', 'Cid', 'https://aoemobileguides.com/wp-content/uploads/2024/05/Cid-Icon.png', 26, true),
  ('0d9c1dfd-1f5d-49fc-a79d-fb8e4aed4f8f', 'Sun Tzu', 'https://aoemobileguides.com/wp-content/uploads/2024/05/Sun-Tzu-Icon.png', 27, true),
  ('c7b74ebe-0978-4edc-8af4-63bc6898c605', 'Octavian', 'https://aoemobileguides.com/wp-content/uploads/2024/05/Octavian-Icon.png', 28, true),
  ('98c3b32f-d9e9-48b6-be1b-d6de0364e917', 'Hua Mulan', 'https://aoemobileguides.com/wp-content/uploads/2024/05/Hua-Mulan-Icon.png', 29, true),
  ('b990e194-84c9-468a-ac58-460341cc125d', 'Suleiman', 'https://aoemobileguides.com/wp-content/uploads/2024/05/Suleiman-Icon.png', 30, true),
  ('684ae4b1-c802-435b-8ce2-59def6e95382', 'Yi Sun-Shin', 'https://aoemobileguides.com/wp-content/uploads/2024/05/Yi-Sun-Shin-Icon.png', 31, true),
  ('386ac1dd-9bef-4c74-9df3-d965690be3be', 'Bushra', 'https://aoemobileguides.com/wp-content/uploads/2024/10/BushraIcon.webp', 32, true),
  ('177a7163-6e16-4f98-bd1a-565851bf64e9', 'Queen Seondeok', 'https://aoemobileguides.com/wp-content/uploads/2024/05/Queen-Seondeok-Icon.png', 33, true),
  ('5d71950b-583f-4dba-b188-537e6e419056', 'Leonidas', 'https://aoemobileguides.com/wp-content/uploads/2024/05/Leonidas-Icon-1.png', 34, true),
  ('65b2e1db-362f-4df4-a575-2cc213e80f38', 'Richard', 'https://aoemobileguides.com/wp-content/uploads/2024/05/Richard-I-Icon.png', 35, true),
  ('fe7459d6-12b7-421d-8336-1992f69b1abc', 'Constantine the Great', 'https://aoemobileguides.com/wp-content/uploads/2024/05/Constantine-the-Great-Icon.png', 36, true),
  ('4730ba18-7418-4a20-82ba-ed43b4022b33', 'Hannibal', 'https://aoemobileguides.com/wp-content/uploads/2024/05/Hannibal-Icon.png', 37, true),
  ('289e2978-5ea6-49e4-9462-64ea411fd46f', 'Tariq', 'https://aoemobileguides.com/wp-content/uploads/2024/10/Tariq-Icon.webp', 38, true),
  ('44226358-a0e8-4d43-9a6d-2403edb0a47a', 'Miyamoto Musashi', 'https://aoemobileguides.com/wp-content/uploads/2024/05/Miyamoto-Musashi-Icon.png', 39, true),
  ('7ae67777-b2b3-4c4a-84a6-e90ffcd0c2da', 'Frederick Barbarossa', 'https://aoemobileguides.com/wp-content/uploads/2024/05/Frederick-Barbarossa-Icon.png', 40, true),
  ('0fa34801-7d22-4337-89f2-ea32b73f5aab', 'Philip IV', 'https://aoemobileguides.com/wp-content/uploads/2024/05/Philip-IV-Icon.png', 41, true),
  ('47b0cde4-4f70-49a1-b209-64f1af020342', 'Rani Durgavati', 'https://aoemobileguides.com/wp-content/uploads/2024/05/Rani-Durgavati-Icon.png', 42, true),
  ('21eecd84-7354-4436-81fe-3541c8b226a8', 'Theodora', 'https://aoemobileguides.com/wp-content/uploads/2024/05/Theodora-Icon-1.png', 43, true),
  ('15e74f70-3d3c-4f50-932e-2ffc819f5a8e', 'Justinian the Great', 'https://aoemobileguides.com/wp-content/uploads/2024/05/Justinian-the-Great-Icon.png', 44, true),
  ('3bf0a331-0fe8-4252-8374-79f643aea29a', 'King Derrick', 'https://aoemobileguides.com/wp-content/uploads/2024/10/King-Derrick-Icon.png', 45, true),
  ('d3d2d756-02dd-4ebf-95f8-85aa48adfdaf', 'Ashoka', 'https://aoemobileguides.com/wp-content/uploads/2024/05/Ashoka-Icon.png', 46, true),
  ('662cb956-bfb6-4343-937a-b9f26203d62b', 'Attila The Hun', 'https://aoemobileguides.com/wp-content/uploads/2024/05/Attila-The-Hun-Icon.png', 47, true),
  ('8620a174-079c-4422-bc17-5bf52cff09e9', 'Harald', 'https://aoemobileguides.com/wp-content/uploads/2024/05/Harald-Icon.png', 48, true),
  ('9a33f357-1a59-4603-97a0-fd7023121370', 'Guan Yu', 'https://aoemobileguides.com/wp-content/uploads/2024/05/Guan-Yu-Icon.png', 49, true),
  ('170bd27b-ef7c-49d1-9a0a-3138fd50e3c0', 'Hammurabi', 'https://aoemobileguides.com/wp-content/uploads/2024/05/Hammurabi-Icon.png', 50, true),
  ('018ffd0f-d758-4fa7-97b9-76220228a7ae', 'Joan Of Arc', 'https://aoemobileguides.com/wp-content/uploads/2024/05/Joan-Of-Arc-Icon.png', 51, true),
  ('0c4217b0-1407-40e7-b940-00901046b5eb', 'Josephine', 'https://aoemobileguides.com/wp-content/uploads/2024/05/Josephine-Icon-1.png', 52, true),
  ('acaa35ba-665d-4e3c-9679-8e1fdf8d4340', 'Darius the Great', 'https://aoemobileguides.com/wp-content/uploads/2024/05/Darius-the-Great-Icon.png', 53, true),
  ('77cd87c3-6438-4a98-a56d-793e75ab2fff', 'Li Daoxuan', 'https://aoemobileguides.com/wp-content/uploads/2024/05/Li-Daoxuan-Icon.png', 54, true),
  ('860d3e51-8f8c-42dc-a72b-3edded1727f5', 'Leo', 'https://aoemobileguides.com/wp-content/uploads/2024/05/Leo-Icon.png', 55, true),
  ('0c49ca1d-4b2b-4c6f-acb6-6cb2a43bb222', 'Leon', 'https://aoemobileguides.com/wp-content/uploads/2024/05/Leon-Icon.png', 56, true),
  ('9752d991-d3e6-432d-af9d-3486af95dca5', 'Axel', 'https://aoemobileguides.com/wp-content/uploads/2024/05/Axel-Icon.png', 57, true),
  ('effa4c69-eb0a-4f1d-956f-5ee8e55661c0', 'Baldassi', 'https://aoemobileguides.com/wp-content/uploads/2024/05/Baldassi-Icon.png', 58, true),
  ('3b04be0f-0830-4ce5-9a8f-486e026d46a1', 'Wu Wei', 'https://aoemobileguides.com/wp-content/uploads/2024/05/Wu-Wei-Icon.png', 59, true),
  ('e1311b21-6842-4f35-b0cd-9b3626c4b9b6', 'Nino', 'https://aoemobileguides.com/wp-content/uploads/2024/05/Nino-Icon.png', 60, true),
  ('b6355b30-06c7-412e-b27f-e94e10a6a5a5', 'Clyde', 'https://aoemobileguides.com/wp-content/uploads/2024/05/Clyde-Icon.png', 61, true),
  ('6ecc0a65-4cf5-47b6-8427-94135c6047fe', 'Cui Ruyi', 'https://aoemobileguides.com/wp-content/uploads/2024/05/Cui-Ruyi-Icon.png', 62, true),
  ('bf89ce3f-5238-423a-acb6-5f703c709555', 'Gao Meng', 'https://aoemobileguides.com/wp-content/uploads/2024/05/Gao-Meng-Icon.png', 63, true),
  ('886c1a16-1859-4af7-b40b-0b1d3dcb0471', 'Yuan Xia', 'https://aoemobileguides.com/wp-content/uploads/2024/05/Yuan-Xia-Icon.png', 64, true),
  ('493abfd7-a8eb-46a3-be05-8b81cfb67e86', 'Gatos', 'https://aoemobileguides.com/wp-content/uploads/2024/05/Gatos-Icon.png', 65, true),
  ('f5cb5e4f-3281-44c7-84a5-75307b9466a8', 'Narses', 'https://aoemobileguides.com/wp-content/uploads/2024/05/Narses-Icon.png', 66, true),
  ('6f4a1f10-57d9-4feb-b7ac-1c70d9adacee', 'Luki', 'https://aoemobileguides.com/wp-content/uploads/2024/05/Luki-Icon.png', 67, true),
  ('945f8a49-f70f-4b00-a630-50ec52533269', 'Kaso', 'https://aoemobileguides.com/wp-content/uploads/2024/05/Kaso-Icon.png', 68, true),
  ('d7dd4ec3-3e76-45b0-9f96-8fa8336fafa0', 'Thanius', 'https://aoemobileguides.com/wp-content/uploads/2024/05/Thanius-Icon.png', 69, true),
  ('c3717a51-c42a-4df7-b8c9-ba220ab0fc32', 'Tribhuwana', 'https://aoemobileguides.com/wp-content/uploads/2024/07/Tribhuwana-Icon.png', 70, true),
  ('08678070-50c9-41bc-adc4-a93c38252fff', 'Sejong The Great', 'https://aoemobileguides.com/wp-content/uploads/2024/09/Yi-Seong-Gye.png', 71, true),
  ('8a5c62dc-980d-4c63-aab6-73c755203364', 'Otto', 'https://aoemobileguides.com/wp-content/uploads/2025/09/Otto-Icon.png', 72, true),
  ('1403b9a9-19f6-4040-a3f7-bb4ebb9230b4', 'Robin Hood', 'https://aoemobileguides.com/wp-content/uploads/2025/09/Robin-Hood-Icon.png', 73, true),
  ('09f7c165-8653-468e-b273-e260a36c8841', 'Vlad', 'https://aoemobileguides.com/wp-content/uploads/2025/09/Vlad-Icon.png', 74, true),
  ('d14e57a7-e45b-441b-86fe-dc09aa79913a', 'Zhuge Liang', 'https://aoemobileguides.com/wp-content/uploads/2025/09/Zhuge-Liang-Icon.png', 75, true),
  ('fb072a18-b440-4478-9e7b-fadbf0074204', 'Qin Shi Shuang', 'https://aoemobileguides.com/wp-content/uploads/2025/09/Qin-Shi-Huang-Icon.png', 76, true)
ON CONFLICT DO NOTHING;

-- Skills
INSERT INTO skills (id, name, description, icon_url, sort_order, is_active) VALUES
  ('566e6f1a-b90b-420e-9998-d7125df0c5b1', 'Formation Attack', 'Deals might damage every 12s (damage rate: 47.94%, might bonus).', 'https://aoemobileguides.com/wp-content/uploads/2024/04/Formation-Attack.png', 1, true),
  ('35400e30-569f-4b61-996a-b6737b71b0d0', 'Change of Formation', 'Deals might damage every 12s (damage rate: 35.68%, might bonus) and increases the damage of the commander’s next strike of turn-based skill by 8.94%.', 'https://aoemobileguides.com/wp-content/uploads/2024/04/Change-of-Formation.png', 2, true),
  ('35d22c67-6a31-41f2-ba51-f006ef1b3669', 'King’s Blade', 'When hit by a normal attack, there is a 15% chance to immediately counterattack, dealing might damage to the attacker (damage rate: 26.76%, might bonus, deals counterattack damage up to once per second).', 'https://aoemobileguides.com/wp-content/uploads/2024/04/Kings-Blade.png', 3, true),
  ('4c6682f5-5da0-4e27-aa65-0ed76b798ad3', 'Savage', 'Deals might damage every 9s (damage rate: 70.03%, might bonus) and reduces the armor of the enemy hero with the highest armor by 15.15 (might bonus) for 3s.', 'https://aoemobileguides.com/wp-content/uploads/2024/04/Savage.png', 4, true),
  ('4708d798-ab2f-4559-aa34-cafe92ffcba6', 'Whirlwind Sweep', 'Increases the hero’s might damage by 3.94% once every 6s. Up to 5 stacks.', 'https://aoemobileguides.com/wp-content/uploads/2024/04/Whirlwind-Sweep.png', 5, true),
  ('f1527341-2444-4bc2-85e9-19f62162c6a7', 'Coordination', 'Reduces the damage of the hero’s normal attacks by 20.00%. Increases the damage of the hero’s turn-based skills by 6.06% (might bonus).', 'https://aoemobileguides.com/wp-content/uploads/2024/04/Coordination.png', 6, true),
  ('f147276c-102e-4829-adea-dcdc58cca2f9', 'Crashing Boulder', 'Deals might damage to the enemy troop (damage rate: 45.72%, might bonus).', 'https://aoemobileguides.com/wp-content/uploads/2024/04/Crashing-Boulder.png', 7, true),
  ('533dce0d-6f3c-4b3a-b964-dc3a24624f50', 'Infuriation', 'After launching a normal attack, deals might damage to the enemy troop (damage rate: 55.75%, might bonus) and increases the hero’s might by 14.90 for 3s.', 'https://aoemobileguides.com/wp-content/uploads/2024/04/Infuriation.png', 8, true),
  ('665e685c-6cb7-4060-bfdc-a27a47048506', 'Spirited Pursuit', 'After launching a normal attack, deals might damage to the enemy troop (damage rate: 86.86%, might bonus).', 'https://aoemobileguides.com/wp-content/uploads/2024/04/Spirited-Pursuit.png', 9, true),
  ('9ef399ce-eb4b-4329-9ed8-660483c11f01', 'Peerless Strike', 'Deals high might damage to the enemy troop (damage rate: 70.70%, might bonus).', 'https://aoemobileguides.com/wp-content/uploads/2024/04/Peerless-Strike.png', 10, true),
  ('6cbe502d-569e-4eaa-bc7d-caa89197c5cc', 'High Spirit', 'Increases the activation chance of the hero’s active skills by 3.64% (increases by 4.55% for charging skills).', 'https://aoemobileguides.com/wp-content/uploads/2024/04/High-Spirit.png', 11, true),
  ('2ddb369b-7972-4383-a5c9-1c861485de14', 'Furious Charge', 'Every time the hero activates their signature skill (except for passive skills), increases the hero’s might damage by 3.94%. Up to 5 stacks.', 'https://aoemobileguides.com/wp-content/uploads/2024/04/Furious-Charge.png', 12, true),
  ('25c5669e-925b-4da5-aed9-3aa0c51c3125', 'Efficient Harvest', 'Increases the gathering speed for all resources by 14.35%.', 'https://aoemobileguides.com/wp-content/uploads/2024/04/Efficient-Harvest.png', 13, true),
  ('e834ea58-d4bf-43d1-9671-79c78063f70a', 'Sowing Discord', 'After launching a normal attack, deals strategy damage to the enemy troop (damage rate: 41.26%, strategy bonus) and steals 6.69 strategy from the enemy commander to your commander for 3s.', 'https://aoemobileguides.com/wp-content/uploads/2024/04/Sowing-Discord.png', 14, true),
  ('aa995818-33f2-4a7c-847e-7950725b1b45', 'Windfall', 'Increases the gathering speed for all resources by 15.38%. Obtains 2.05% extra resources upon successful gathering.', 'https://aoemobileguides.com/wp-content/uploads/2024/04/Windfall.png', 15, true),
  ('29b853b2-fda7-4d33-8fbb-56094a293abc', 'War Tactic', 'Deals strategy damage to the enemy troop (damage rate: 56.56%, strategy bonus) and recovers your troop’s units (recovery rate: 31.31%, War Tactic strategy bonus).', 'https://aoemobileguides.com/wp-content/uploads/2024/04/War-Tactic.png', 16, true),
  ('ca1a5b7c-9504-47d5-83e9-e5967e58e25a', 'Double Attack', 'Enters the double attack state and increases the hero’s might, strategy, and armor by 4.04 for 3s.', 'https://aoemobileguides.com/wp-content/uploads/2024/04/Double-Attack.png', 17, true),
  ('e12e1543-6dee-4313-b909-e3e35c743330', 'Crushing Impact', 'After launching a normal attack, deals strategy damage to the enemy troop (damage rate: 53.53%, strategy bonus) and reduces the enemy commander’s might by 16.16 (strategy bonus) for 6s (This effect can’t be stacked).', 'https://aoemobileguides.com/wp-content/uploads/2024/04/Crushing-Impact.png', 18, true),
  ('f23b5f8d-08e1-476f-91c3-61487ad2cd0c', 'Armor Piercer', 'After launching a normal attack, deals might damage to the enemy troop (damage rate: 55.75%, might bonus) and reduces all enemy heroes’ armor by 14.90 for 3s.', 'https://aoemobileguides.com/wp-content/uploads/2024/04/Armor-Piercera.png', 19, true),
  ('d1857be1-7636-4676-996a-4f368e6d75f3', 'Roar of Victory', 'After launching a normal attack, deals might damage to the enemy troop (damage rate: 107.28%, might bonus) and increases your troop’s rage by 7.17.', 'https://aoemobileguides.com/wp-content/uploads/2024/04/Roar-of-Victory.png', 20, true),
  ('b7fce8ab-a0e5-4219-8966-91ab14ed99ad', 'Weak Spot Attack', 'After launching a normal attack, deals might damage to the enemy troop (damage rate: 74.74%, might bonus) and increases the hero’s damage by 6.06% (might bonus) for 3s.', 'https://aoemobileguides.com/wp-content/uploads/2024/04/Weak-Spot-Attack.png', 21, true),
  ('65f6feb3-614e-4f23-ae66-89d160b7913c', 'Deception', 'Deals 1 instance of strategy damage to the enemy troop (damage rate: 45.72%, strategy bonus).', 'https://aoemobileguides.com/wp-content/uploads/2024/04/Deception.png', 22, true),
  ('f707592c-ad41-4bf0-84fe-58dfe01d1c43', 'Boulder Trap', 'Enters charging state. After 3s, deals strategy damage to the enemy troop (damage rate: 76.93%, strategy bonus).', 'https://aoemobileguides.com/wp-content/uploads/2024/04/Boulder-Trap.png', 23, true),
  ('b7c33d9b-f455-4eeb-8de5-cf95e3c0894e', 'Ultimate Strategy', 'Deals 1 instance of strategy damage to the enemy troop (damage rate: 70.70%, strategy bonus).', 'https://aoemobileguides.com/wp-content/uploads/2024/04/Ultimate-Strategy.png', 24, true),
  ('42a53afe-97da-4f2f-807b-32d729493452', 'Flash of Inspiration', 'When the hero’s signature active skill enters charging state, there is a/an 17.17% chance to skip the charging. If failed to skip the charging, increases the skill’s activation chance by 4.04% for 6s.', 'https://aoemobileguides.com/wp-content/uploads/2024/04/Flash-of-Inspiration.png', 25, true),
  ('e357f4b8-925c-47a4-8513-1a428b0e442c', 'Strategy Master’s Gift', 'Increases the hero’s strategy damage by 8.94% and the activation chance of signature active skills by 3.03%.', 'https://aoemobileguides.com/wp-content/uploads/2024/04/Strategy-Masters-Gift.png', 26, true),
  ('3e053d77-f7e6-4fcd-ba71-f351e74ade72', 'Triple Offensive', 'Randomly triggers one of the following effects once every 9s against the enemy troop: 1) Deals might damage (damage rate: 80.80%, might bonus). 2) Deals strategy damage (damage rate: 80.80%, strategy bonus). 3) Increases damage taken by 6.46% for 3s.', 'https://aoemobileguides.com/wp-content/uploads/2024/04/Triple-Offensive.png', 27, true),
  ('22264d9f-1006-4368-a303-4f507a0512ad', 'Act of Mercy', 'After launching a normal attack, deals might damage to the enemy troop (damage rate: 47.47%, might bonus). Increases your damage by 2.00% (up to 100%) every time when the target loses 1% of its units.', 'https://aoemobileguides.com/wp-content/uploads/2024/04/Act-of-Mercy.png', 28, true),
  ('9df8e36f-2bf0-4851-88ff-a4796372e384', 'Blaze Impact', 'Deals strategy damage to the enemy troop (damage rate: 49.17%, strategy bonus) and inflicts the burn effect, dealing strategy damage each second (damage rate: 8.92%,strategy bonus) for 3s.', 'https://aoemobileguides.com/wp-content/uploads/2024/04/Blaze-Impact.png', 29, true),
  ('c42b337a-235a-4d46-b6f2-0cca50853dae', 'Conflagration', 'Deals strategy damage to the enemy troop (damage rate: 59.60%, strategy bonus) and inflicts the burn effect, dealing strategy damage every second (damage rate: 6.06%, strategy bonus) for 6s.', 'https://aoemobileguides.com/wp-content/uploads/2024/04/Conflagration.png', 30, true),
  ('f9e84dc8-eb0a-41d3-b305-4d9190678e7c', 'Organized Retreat', 'Increases the gathering speed for all resources by 15.38%. If a battle breaks out when gathering, converts 5.13% lost units into lightly wounded at the end of the battle and increases retreat speed by 25.63%.', 'https://aoemobileguides.com/wp-content/uploads/2024/04/Organized-Retreat.png', 31, true),
  ('043a08a4-15ea-4b8d-8464-fc61bd13dfdf', 'Mettle', 'After every 12 normal attacks taken by your troop (counts up to 2 normal attacks per second), recovers your troop’s units (recovery rate: 37.91%, might bonus, armor bonus).', 'https://aoemobileguides.com/wp-content/uploads/2024/04/Mettle.png', 32, true),
  ('3973593c-639e-440c-a8a9-4e03761a0d06', 'Fortification', 'Deals might damage to the enemy troop (damage rate:45.72%, might bonus).', 'https://aoemobileguides.com/wp-content/uploads/2024/04/Fortification.png', 33, true),
  ('b4d5b1bb-df76-413e-a53c-8e6df01655d8', 'Tenacity', 'Recovers your troop’s units every 9s (recovery rate: 65.65%, armor bonus).', 'https://aoemobileguides.com/wp-content/uploads/2024/04/Tenacity.png', 34, true),
  ('5ec32d53-ec0a-4fb2-9cb1-767cfb79d474', 'Darkness Strike', 'Enters charging state. After 3s, deals might damage to the enemy troop (damage rate: 83.83%, might bonus). Reduces the enemy troop’s healing effect by 10.10% for 6s.', 'https://aoemobileguides.com/wp-content/uploads/2024/04/Darkness-Strike.png', 35, true),
  ('3d5bfc95-cceb-400c-b348-8f485ba4d3ef', 'Peaceful Haven', 'After the hero recovers units, reduces your troop’s damage taken by 4.04% for 3s.', 'https://aoemobileguides.com/wp-content/uploads/2024/04/Peaceful-Haven.png', 36, true),
  ('a853a5b4-f419-416d-bc33-e01adec2bb6c', 'Maneuver', 'When the commander activates the charging skill, there is a 16.72% chance to skip the charging state.', 'https://aoemobileguides.com/wp-content/uploads/2024/04/Maneuver.png', 37, true),
  ('b876ae72-62ac-450f-b3b3-9a220b26d626', 'Immortal Army', 'Recovers your troop’s units (recovery rate: 66.66%, strategy bonus) and has a/an 29.80% chance to purify all your heroes’ attribute debuffs (only those debuffs obtained in battle).', 'https://aoemobileguides.com/wp-content/uploads/2024/04/Immortal-Army.png', 38, true),
  ('f64f70df-2db6-4caf-baa5-715669214e44', 'Counterattack', 'When hit by a normal attack, there is a 15% chance to immediately counterattack, dealing might damage to the attacker (damage rate: 26.76%, might bonus, deals counterattack damage up to once per second).', 'https://aoemobileguides.com/wp-content/uploads/2024/04/Counterattack.png', 39, true),
  ('5b6eb762-b30f-49ce-87a0-a557a659e15b', 'Vigilance', 'When hit by a normal attack, there is a 15% chance to immediately counterattack (only once per second), dealing might damage to the attacker (damage rate: 18.95%, might bonus). Meanwhile, there is a 50% chance to inflict the rout effect, dealing might damage every second (damage rate: 7.45%, might bonus) for 3s.', 'https://aoemobileguides.com/wp-content/uploads/2024/04/Vigilance.png', 40, true),
  ('f31edb2f-b5b6-4145-9533-f642666ac2b7', 'Fearless Retribution', 'When hit by a normal attack, there is a 20% chance to immediately counterattack dealing might damage to the attacker once per second (damage 24.24%, might bonus). Meanwhile, recovers rate: your troop’s units (recovery rate: 7.45%, might bonus, triggers every 6s).', 'https://aoemobileguides.com/wp-content/uploads/2024/04/Fearless-Retribution.png', 41, true),
  ('2e093098-5c29-444e-8851-8e8c01be00d7', 'Forceful Retaliation', 'When hit by a normal attack, there is a 20% chance to immediately counterattack, dealing might damage to the attacker once per second (damage rate: 26.26%, might bonus). Meanwhile, increases the hero’s might by 8.94 for 6s.', 'https://aoemobileguides.com/wp-content/uploads/2024/04/Forceful-Retaliation.png', 42, true),
  ('e59d9a0c-b156-49de-8a26-ebc1d07a9590', 'Bloodthirst', 'Deals might damage to the enemy troop (damage 60.60%, might bonus) and recovers your rate: troop’s units (recovery rate: 27.27%, might bonus).', 'https://aoemobileguides.com/wp-content/uploads/2024/04/Bloodthirst.png', 43, true),
  ('ef1a39ff-1dc1-48f1-ac1d-ad499cda56e6', 'Tactical Pursuit', 'After launching a normal attack, deals might damage (damage rate: 36.36%, might bonus) and strategy damage (damage rate: 36.36%, strategy bonus) to the enemy troop.', 'https://aoemobileguides.com/wp-content/uploads/2024/04/Tactical-Pursuit.png', 44, true),
  ('b82eecd8-a7e9-46ea-ab42-fdc43fa0db30', 'Shield Slam', 'Deals might damage to the enemy troop (damage rate: 47.94%, might bonus, armor bonus).', 'https://aoemobileguides.com/wp-content/uploads/2024/04/Shield-Slam.png', 45, true),
  ('f15e243d-5c99-4a81-b3cf-713bb2726fb3', 'Earth Crush', 'Deals might damage to the enemy troop (damage 59.60%, might bonus) and inflicts the rout rate: effect, dealing might damage every second (damage rate: 6.06%, might bonus) for 6s.', 'https://aoemobileguides.com/wp-content/uploads/2024/04/Earth-Crush.png', 46, true),
  ('42fb9b37-d9e3-4c7e-b7c2-ca9578c8e4ad', 'Suppression', 'Deals strategy damage to the enemy troop (damage rate: 40.14%, strategy bonus) and reduces the enemy commander’s might or strategy by 7.45 (strategy bonus) for 6s.', 'https://aoemobileguides.com/wp-content/uploads/2024/04/Suppression.png', 47, true),
  ('92f7f133-c47e-47f1-8552-121b93eb1381', 'Sunder', 'After launching a normal attack, deals might damage to the enemy troop (damage rate: 53.64%, might bonus) and inflicts the rout effect, dealing might damage every second (damage rate: 7.81%, might bonus) for 3s.', 'https://aoemobileguides.com/wp-content/uploads/2024/04/Sunder.png', 48, true),
  ('a6de98c7-6827-4521-89ae-b9556206838f', 'War Drums', 'Every 9s, increases all your heroes’ armor by and strategy by 6 69 for 3s.', 'https://aoemobileguides.com/wp-content/uploads/2024/04/War-Drums.png', 49, true),
  ('26200806-5e2f-4526-9fa7-2afda811f309', 'Righteous Judgement', 'Enters charging state. After 3s, deals might damage to the enemy troop (damage rate: 79.79%, might bonus) and reduces all enemy heroes’ might and strategy by 17.88 (might bonus) for 3s.', 'https://aoemobileguides.com/wp-content/uploads/2024/04/Righteous-Judgement.png', 50, true),
  ('c86ee66b-a9e3-4a07-be68-85bfab19c886', 'Warrior’s Hymn', 'Increases the next hero’s might by 25.25 (might bonus) and critical strike rate by 4.04% for 3s.', 'https://aoemobileguides.com/wp-content/uploads/2024/04/Warriors-Hymn.png', 51, true),
  ('41d1bc95-4607-44d2-a4f7-5b22058bd823', 'Fearless Frontrunner', 'Increases the hero’s siege by 51.25. When being defeated during a siege, converts 10.25% of your lost units into gravely wounded.', 'https://aoemobileguides.com/wp-content/uploads/2024/04/Fearless-Frontrunner.png', 52, true),
  ('8c6d2fa2-4828-46ce-973a-445c29ab1b44', 'Prayer For Harvest', 'Recovers your troop’s units (recovery rate: 43.49%, strategy bonus).', 'https://aoemobileguides.com/wp-content/uploads/2024/04/Prayer-For-Harvest.png', 53, true),
  ('183da0ba-bb78-4c0b-b9eb-1a6f0d5ba5d6', 'Protracted Battle', 'Recovers your troop’s units after every 6 normal attacks your troop launches (recovery rate: 29.29%, might bonus).', 'https://aoemobileguides.com/wp-content/uploads/2024/04/Protracted-Battle.png', 54, true),
  ('5d2d7146-1dd7-4769-9404-1b3c0a5afcca', 'Critical Insight', 'Increase all your heroes’ critical strike rates by 5.13%. After dealing a critical strike, reduces all enemy heroes’ armor by 7.69 for up to 3 stacks.', 'https://aoemobileguides.com/wp-content/uploads/2024/04/Critical-Insight.png', 55, true),
  ('4ab28b4a-95f8-41d8-a2fa-4a55d59108a2', 'Fatal Blow', 'After launching a normal attack, deals might damage to the enemy troop (damage rate: 62.62%, might bonus, can deal critical strikes).', 'https://aoemobileguides.com/wp-content/uploads/2024/04/Bloodthirst.png', 56, true),
  ('6ad7ae17-7739-47a2-a191-1d085083e39c', 'Berserker', 'When the hero’s normal attack deals a critical strike, increases the hero’s might by (might 32.32 bonus) for 3s.', 'https://aoemobileguides.com/wp-content/uploads/2024/04/Berserker.png', 57, true),
  ('1c9692cf-5f6b-4f41-bfa1-d9deeb0891ae', 'Siege and Plunder', '(Can be activated during sieges) Deals 174.25 damage to city defense and increases the hero’s siege by 10.25. Up to 5 stacks.', 'https://aoemobileguides.com/wp-content/uploads/2024/04/Siege-and-Plunder.png', 58, true),
  ('88f17913-ddeb-4aa9-b38e-21a79ffcb574', 'Siege Breaker', '(Can be activated during sieges) After launching a normal attack, deals damage to city 297.25 defenses (siege bonus).', 'https://aoemobileguides.com/wp-content/uploads/2024/04/Siege-Breaker.png', 59, true),
  ('eed243ec-7174-4cd2-9077-ab7c4b035b10', 'Mighty Strike', 'Deals might damage to the enemy troop (damage rate: 50.74%, might bonus).', 'https://aoemobileguides.com/wp-content/uploads/2024/04/Mighty-Strike.png', 60, true),
  ('fbb191be-d69d-4af9-9b64-2b615b787efa', 'Double Strike', 'After launching a normal attack, deals might damage to the enemy troop (damage rate: 37.98%, might bonus).', 'https://aoemobileguides.com/wp-content/uploads/2024/04/Double-Strike.png', 61, true),
  ('799e3277-1b05-497a-a920-bf019d919377', 'Rapid Gathering', 'Increases the gathering speed for all resources by 8.20%.', 'https://aoemobileguides.com/wp-content/uploads/2024/04/Rapid-Gathering.png', 62, true),
  ('e309db32-f38d-4fe1-b6e2-41c2adc029f1', 'Rest and Recover', 'Recovers your troop’s units (recovery rate: 36.75%, strategy bonus).', 'https://aoemobileguides.com/wp-content/uploads/2024/04/Rest-and-Recover.png', 63, true),
  ('2f0330d3-ab7b-4e8d-8d8a-315f9974485d', 'Prudent Handling', 'Increases the gathering speed for all resources by 10.25%. Obtains 3.07% extra resources upon successful gathering.', 'https://aoemobileguides.com/wp-content/uploads/2024/04/Prudent-Handling.png', 64, true),
  ('eb7c2128-5ecf-4bd3-a9c2-dd6a7ea8e14f', 'Surprise Attack', 'Deals strategy damage to the enemy troop (damage rate: 30.62%, strategy bonus).', 'https://aoemobileguides.com/wp-content/uploads/2024/04/Surprise-Attack.png', 65, true),
  ('823a3042-571d-418e-82dd-43cc45876a17', 'Focused Mind', 'When the hero’s signature active skill enters charging state, there is a/an 14.50% chance for your troop to obtain control immunity (immune to control effects) for 3s.', 'https://aoemobileguides.com/wp-content/uploads/2024/04/Focused-Mind.png', 66, true),
  ('f6a7c337-8e95-455c-8f9d-67923b522593', 'Fervor', 'For the first 18s after entering battle, increases all your heroes’ might, armor, and strategy by 3.35 and increases your troop’s rage by 0.78 per second.', 'https://aoemobileguides.com/wp-content/uploads/2024/04/Fervor.png', 67, true),
  ('f09504af-6edd-475c-b9a4-f317bf70690b', 'Critical Blade', 'Increases the hero’s critical strike rate by 1.35%.', 'https://aoemobileguides.com/wp-content/uploads/2024/04/Critical-Blade.png', 68, true),
  ('88bcc84a-17ec-475d-92c7-affa6dc92527', 'Pacifying Strike', 'After launching a normal attack, deals might damage to the enemy troop (damage rate: 46.19%, might bonus) and reduces their rage by 6.69.', 'https://aoemobileguides.com/wp-content/uploads/2024/04/Pacifying-Strike-1.png', 69, true),
  ('c244032a-0538-4c7e-a663-08568c7e9132', 'Calm in Peril', 'Increases the gathering speed for all resources by 10.25%. If a battle breaks out when gathering, reduces your damage taken by 4.10% and converts 10.25% gravely wounded units into lightly wounded at the end of the battle.', 'https://aoemobileguides.com/wp-content/uploads/2024/04/Calm-in-Peril.png', 70, true),
  ('9a03fb15-dbd8-44e6-91b1-872b701bea57', 'Load Boost', 'Increases the gathering speed for all resources by 10.25%. Increases your troop’s load by 6.15%.', 'https://aoemobileguides.com/wp-content/uploads/2024/04/Load-Boost.png', 71, true),
  ('4cb654c4-d411-4a57-a39b-51d950f69325', 'Fast Retreat', 'Increases the gathering speed for all resources by 10.25%. If a battle breaks out when gathering, converts 3.07% lost units into lightly wounded at the end of the battle and increases retreat speed by 17.94%.', 'https://aoemobileguides.com/wp-content/uploads/2024/04/Fast-Retreat.png', 72, true),
  ('0341ed42-5cc6-4dae-b808-0e4957545bb9', 'Executor', 'Increases the hero’s signature active skill activation chance by 3.03%. Every time the hero activates a signature active skill, there is a/an 10.10% chance to increase the skill damage by 16.16%.', 'https://aoemobileguides.com/wp-content/uploads/2024/04/Executor.png', 73, true),
  ('7bc3dc8e-77de-45ca-b809-7e2f351fd82b', 'Battle-Roar', 'Deals might damage to the enemy troop (damage rate: 89.40%, might bonus) and increases the hero’s damage by 2.98% (might bonus) for 6s.', 'https://aoemobileguides.com/wp-content/uploads/2024/04/Battle-Roar.png', 74, true),
  ('04b7f851-2f5c-4bbe-a44c-fe0fc4756c13', 'War Elephant', 'Deals might damage to the enemy troop every 9s (damage rate: 60.60%, might bonus), with a 50% chance to reduce your troop’s damage taken from the next enemy skill by 4.04% (might bonus).', 'https://aoemobileguides.com/wp-content/uploads/2024/08/War-Elephant.png', 75, true),
  ('5a2cc456-ed6f-472e-b9c1-42dfa5bdb326', 'Ripper Tiger', 'After launching a normal attack, deals might damage to the enemy troop (damage rate: 64.64%, might bonus) and increases the hero’s critical strike rate by 3.03% for 3s.', 'https://aoemobileguides.com/wp-content/uploads/2024/08/Ripper-Tiger.png', 76, true),
  ('662ab573-04d0-4b06-b982-f5c30d92ce75', 'Pay in Blood', 'After launching a normal attack, deals might damage to the enemy troop (damage rate: 74.74%, might bonus) and recovers your units (recovery rate: 24.24%, might bonus).', 'https://aoemobileguides.com/wp-content/uploads/2024/08/Pay-in-Blood.png', 77, true),
  ('317fb1e6-adc5-43a9-a2e0-ae38ebebd602', 'Dark Flag', 'After launching a normal attack, increases the might of your hero with the highest might by 22.22 and reduces the armor of the enemy hero with the highest armor by for 6s. 20.20,', 'https://aoemobileguides.com/wp-content/uploads/2024/08/Dark-Flag.png', 78, true),
  ('e9d517bb-8477-476c-b994-a3895cdcc87e', 'Entrenchment', 'Your troop enters the steadfast state. Recovers your units once per second (recovery rate: 16.16%. armor bonus) and reduces your troop’s damage taken by 1.41% (armor bonus), for 3s.', 'https://aoemobileguides.com/wp-content/uploads/2024/09/Entrenchment.png', 79, true),
  ('bcbcebe3-c304-4f0e-9df5-ee81a590ca0c', 'Supplies Transportation', 'Increases the gathering speed for all resources by 15.38%. Increases your troop’s load by 7.69%.', 'https://aoemobileguides.com/wp-content/uploads/2024/09/Supplies-Transportation.png', 80, true),
  ('eb634c47-1444-452a-9832-574a259a166c', 'Flame of Genesis', 'Each time the hero activates the signature active skill, increases the hero''s strategy by 6.06, up to 6 stacks. For every 3 activations of the signature active skill, increases the damage of the next signature active skill by 5.05%.', 'https://aoemobileguides.com/wp-content/uploads/2025/01/Flame-of-Genesis.png', 81, true),
  ('ee970583-b773-4c53-94ee-78d9d191edea', 'Golden Odyssey', 'After your troop takes 12 normal attacks (counts up to 2 times per second), recovers your troop''s units (recovery rate: 26.26%, might bonus, armor bonus) and increases the damage dealt by your commander by 4.04% (might bonus) for 3s.', 'https://aoemobileguides.com/wp-content/uploads/2025/01/Golden-Odyssey.png', 82, true),
  ('edc0427d-eb64-440f-8516-862571d0a758', 'Enraged Strike', 'Deals strategy damage to the enemy troop (damage rate: 41.72%, strategy bonus) and increases your troop''s rage by 4.46.', 'https://aoemobileguides.com/wp-content/uploads/2025/01/Enraged-Strike.png', 83, true),
  ('73f24e11-aa00-4d43-ba75-347a18a5e448', 'Owl''s Lament', 'Every 6s, recovers your units (recovery rate: 32.32%, might bonus). Upon taking skill damage, there is a/an 75.00% chance to recover units equal to 5.05% of the damage taken for 3s (triggers once only).', 'https://aoemobileguides.com/wp-content/uploads/2025/01/Owls-Lament.png', 84, true),
  ('38e05528-933f-41cd-a7f1-556156186000', 'Conquering Iron Hoof', 'After launching a normal attack, deals strategy damage to the enemy troop (damage rate: 60.60%, strategy bonus). Each time when activated, the skill deals 2.02% additional damage, up to 4 stacks.', 'https://aoemobileguides.com/wp-content/uploads/2025/04/Conquering-Iron-Hoof.webp', 85, true),
  ('04231bf0-813e-40fb-aabe-443d9af33f08', 'Raging Bloodline', 'After using 3 signature active skills, increases the might of your hero with the highest might by 10.10, increases their damage by 2.02% (might bonus), and reduces the critical strike damage taken by 6.06% for 6s.', 'https://aoemobileguides.com/wp-content/uploads/2025/04/Raging-Bloodline.webp', 86, true),
  ('422d05a7-57b1-4cab-8560-9241f1babc85', 'Child of Prophecy', 'When hit by a normal attack, there is a/an 30% chance to immediately Counterattack, dealing might damage to the attacker (damage rate: 27.27%, might bonus, triggers once per second at most). Every 4th trigger of this skill guarantees a critical strike. Meanwhile, the critical damage taken by your troops is reduced by 7.07% for 3s.', 'https://aoemobileguides.com/wp-content/uploads/2025/06/Child-of-Prophecy.webp', 87, true),
  ('4842b0af-733e-4482-9f26-3c69d3c98d73', 'Tempered Steel', 'After any of your heroes triggers a critical strike, recovers your troop’s units (recovery rate: 21.21%, might bonus) and reduces your troop’s damage taken by 1.01% (might bonus) for 3s (triggers every 6s).', 'https://aoemobileguides.com/wp-content/uploads/2025/06/Tempered-Steel.webp', 88, true),
  ('369110ff-d8f2-440b-80ea-69bf5301c725', 'Rending Covenant', 'After your troop performs 12 normal attacks, your commander enters the Double Attack state for 3s. Each time your commander activates a secondary strike skill, damage dealt to the main target increases by 0.61%, up to 4 stacks.', 'https://aoemobileguides.com/wp-content/uploads/2025/06/Rending-Covenant.webp', 89, true),
  ('03cc8c44-f79c-4932-8708-0e9a18dd06b4', 'Borrowing the East Wind', 'after entering battle, increases the damage of your commander''s signature active skill by 6.06% and activation chance by 2.98% for 9s. Afterward, reduces the damage bonus to 3.03% and the activation chance bonus to 1.49% until the battle ends.a', 'https://aoemobileguides.com/wp-content/uploads/2025/09/Borrowing-the-East-Wind.webp', 90, true),
  ('b72c036b-7fdf-4112-a579-b243d25572df', 'Deadly Dragonthron', 'When hit by a normal attack, there is a/an 25% chance to Counterattack dealing might damage to the attacker (damage rate: 28.28%, might bonus; triggers once per second at most). Every 4 times this skill triggers, the next activation of this skill ignores 8.08% of the enemy''s defense and increases damage dealt by your hero with the highest might (excluding self) by 5.05% for 3s.', 'https://aoemobileguides.com/wp-content/uploads/2025/09/Deadly-Dragonthron.webp', 91, true),
  ('7ffd6e2d-1626-4422-b210-f1ee2bb35df4', 'Holy Roman Empire', 'Once every 6s, deals might damage to an enemy troop (damage rate: 26.26%, might bonus) while reducing damage taken by your troop by 2.02% for 3s. Every 3 times the hero triggers their signature turn-based skill, the damage of their next signature turn-based skill increases by 1.01% (might bonus).', 'https://aoemobileguides.com/wp-content/uploads/2025/09/Holy-Roman-Empire.webp', 92, true)
ON CONFLICT DO NOTHING;

-- Champion <-> Skill assignments
INSERT INTO champion_skill_assignments (champion_id, skill_id) VALUES
  ('abae2f73-f845-4bbf-9f6c-2cc189ea1c9a', '566e6f1a-b90b-420e-9998-d7125df0c5b1'),
  ('c7b74ebe-0978-4edc-8af4-63bc6898c605', '566e6f1a-b90b-420e-9998-d7125df0c5b1'),
  ('77cd87c3-6438-4a98-a56d-793e75ab2fff', '566e6f1a-b90b-420e-9998-d7125df0c5b1'),
  ('d7dd4ec3-3e76-45b0-9f96-8fa8336fafa0', '566e6f1a-b90b-420e-9998-d7125df0c5b1'),
  ('003d75ca-9569-414b-af35-5211b0289785', '566e6f1a-b90b-420e-9998-d7125df0c5b1'),
  ('8a5c62dc-980d-4c63-aab6-73c755203364', '566e6f1a-b90b-420e-9998-d7125df0c5b1'),
  ('fb072a18-b440-4478-9e7b-fadbf0074204', '566e6f1a-b90b-420e-9998-d7125df0c5b1'),
  ('abae2f73-f845-4bbf-9f6c-2cc189ea1c9a', '35400e30-569f-4b61-996a-b6737b71b0d0'),
  ('c7b74ebe-0978-4edc-8af4-63bc6898c605', '35400e30-569f-4b61-996a-b6737b71b0d0'),
  ('77cd87c3-6438-4a98-a56d-793e75ab2fff', '35400e30-569f-4b61-996a-b6737b71b0d0'),
  ('d7dd4ec3-3e76-45b0-9f96-8fa8336fafa0', '35400e30-569f-4b61-996a-b6737b71b0d0'),
  ('003d75ca-9569-414b-af35-5211b0289785', '35400e30-569f-4b61-996a-b6737b71b0d0'),
  ('8a5c62dc-980d-4c63-aab6-73c755203364', '35400e30-569f-4b61-996a-b6737b71b0d0'),
  ('abae2f73-f845-4bbf-9f6c-2cc189ea1c9a', '35d22c67-6a31-41f2-ba51-f006ef1b3669'),
  ('c7b74ebe-0978-4edc-8af4-63bc6898c605', '35d22c67-6a31-41f2-ba51-f006ef1b3669'),
  ('386ac1dd-9bef-4c74-9df3-d965690be3be', '35d22c67-6a31-41f2-ba51-f006ef1b3669'),
  ('5d71950b-583f-4dba-b188-537e6e419056', '35d22c67-6a31-41f2-ba51-f006ef1b3669'),
  ('7ae67777-b2b3-4c4a-84a6-e90ffcd0c2da', '35d22c67-6a31-41f2-ba51-f006ef1b3669'),
  ('47b0cde4-4f70-49a1-b209-64f1af020342', '35d22c67-6a31-41f2-ba51-f006ef1b3669'),
  ('018ffd0f-d758-4fa7-97b9-76220228a7ae', '35d22c67-6a31-41f2-ba51-f006ef1b3669'),
  ('32b23b69-ec9c-4733-86a0-0886ba9d4e66', '35d22c67-6a31-41f2-ba51-f006ef1b3669'),
  ('003d75ca-9569-414b-af35-5211b0289785', '35d22c67-6a31-41f2-ba51-f006ef1b3669'),
  ('7e339f39-6449-4c30-beb0-4c352500d919', '35d22c67-6a31-41f2-ba51-f006ef1b3669'),
  ('69090804-b19a-47df-9934-e00c8c098a1f', '35d22c67-6a31-41f2-ba51-f006ef1b3669'),
  ('fb072a18-b440-4478-9e7b-fadbf0074204', '35d22c67-6a31-41f2-ba51-f006ef1b3669'),
  ('abae2f73-f845-4bbf-9f6c-2cc189ea1c9a', '4c6682f5-5da0-4e27-aa65-0ed76b798ad3'),
  ('59f4228d-3001-4a6b-9e09-3edccce71a8c', '4c6682f5-5da0-4e27-aa65-0ed76b798ad3'),
  ('003d75ca-9569-414b-af35-5211b0289785', '4c6682f5-5da0-4e27-aa65-0ed76b798ad3'),
  ('8a5c62dc-980d-4c63-aab6-73c755203364', '4c6682f5-5da0-4e27-aa65-0ed76b798ad3'),
  ('abae2f73-f845-4bbf-9f6c-2cc189ea1c9a', '4708d798-ab2f-4559-aa34-cafe92ffcba6'),
  ('c7b74ebe-0978-4edc-8af4-63bc6898c605', '4708d798-ab2f-4559-aa34-cafe92ffcba6'),
  ('5d71950b-583f-4dba-b188-537e6e419056', '4708d798-ab2f-4559-aa34-cafe92ffcba6'),
  ('65b2e1db-362f-4df4-a575-2cc213e80f38', '4708d798-ab2f-4559-aa34-cafe92ffcba6'),
  ('32b23b69-ec9c-4733-86a0-0886ba9d4e66', '4708d798-ab2f-4559-aa34-cafe92ffcba6'),
  ('003d75ca-9569-414b-af35-5211b0289785', '4708d798-ab2f-4559-aa34-cafe92ffcba6'),
  ('b33c3090-2913-4810-a3bc-8ef14cedf5e1', '4708d798-ab2f-4559-aa34-cafe92ffcba6'),
  ('09f7c165-8653-468e-b273-e260a36c8841', '4708d798-ab2f-4559-aa34-cafe92ffcba6'),
  ('abae2f73-f845-4bbf-9f6c-2cc189ea1c9a', 'f1527341-2444-4bc2-85e9-19f62162c6a7'),
  ('c7b74ebe-0978-4edc-8af4-63bc6898c605', 'f1527341-2444-4bc2-85e9-19f62162c6a7'),
  ('8c49064b-30a9-40fc-a1ff-ec4570c55eee', 'f147276c-102e-4829-adea-dcdc58cca2f9'),
  ('fe7459d6-12b7-421d-8336-1992f69b1abc', 'f147276c-102e-4829-adea-dcdc58cca2f9'),
  ('44226358-a0e8-4d43-9a6d-2403edb0a47a', 'f147276c-102e-4829-adea-dcdc58cca2f9'),
  ('170bd27b-ef7c-49d1-9a0a-3138fd50e3c0', 'f147276c-102e-4829-adea-dcdc58cca2f9'),
  ('77cd87c3-6438-4a98-a56d-793e75ab2fff', 'f147276c-102e-4829-adea-dcdc58cca2f9'),
  ('bf89ce3f-5238-423a-acb6-5f703c709555', 'f147276c-102e-4829-adea-dcdc58cca2f9'),
  ('6f4a1f10-57d9-4feb-b7ac-1c70d9adacee', 'f147276c-102e-4829-adea-dcdc58cca2f9'),
  ('b2e15fcb-1826-442a-ae81-d272f5f9f4f4', 'f147276c-102e-4829-adea-dcdc58cca2f9'),
  ('c3717a51-c42a-4df7-b8c9-ba220ab0fc32', 'f147276c-102e-4829-adea-dcdc58cca2f9'),
  ('4e27f685-ec5c-4186-97f5-16e917936ae1', 'f147276c-102e-4829-adea-dcdc58cca2f9'),
  ('ce4e1b67-4265-4525-8d7f-c70daaaf351a', 'f147276c-102e-4829-adea-dcdc58cca2f9'),
  ('8c49064b-30a9-40fc-a1ff-ec4570c55eee', '533dce0d-6f3c-4b3a-b964-dc3a24624f50'),
  ('87722f44-f01b-493e-880d-898ce3dabc28', '533dce0d-6f3c-4b3a-b964-dc3a24624f50'),
  ('98c3b32f-d9e9-48b6-be1b-d6de0364e917', '533dce0d-6f3c-4b3a-b964-dc3a24624f50'),
  ('4730ba18-7418-4a20-82ba-ed43b4022b33', '533dce0d-6f3c-4b3a-b964-dc3a24624f50'),
  ('289e2978-5ea6-49e4-9462-64ea411fd46f', '533dce0d-6f3c-4b3a-b964-dc3a24624f50'),
  ('d3d2d756-02dd-4ebf-95f8-85aa48adfdaf', '533dce0d-6f3c-4b3a-b964-dc3a24624f50'),
  ('662cb956-bfb6-4343-937a-b9f26203d62b', '533dce0d-6f3c-4b3a-b964-dc3a24624f50'),
  ('9a33f357-1a59-4603-97a0-fd7023121370', '533dce0d-6f3c-4b3a-b964-dc3a24624f50'),
  ('8620a174-079c-4422-bc17-5bf52cff09e9', '533dce0d-6f3c-4b3a-b964-dc3a24624f50'),
  ('0c4217b0-1407-40e7-b940-00901046b5eb', '533dce0d-6f3c-4b3a-b964-dc3a24624f50'),
  ('9752d991-d3e6-432d-af9d-3486af95dca5', '533dce0d-6f3c-4b3a-b964-dc3a24624f50'),
  ('6ecc0a65-4cf5-47b6-8427-94135c6047fe', '533dce0d-6f3c-4b3a-b964-dc3a24624f50'),
  ('f5cb5e4f-3281-44c7-84a5-75307b9466a8', '533dce0d-6f3c-4b3a-b964-dc3a24624f50'),
  ('71a026f1-f595-4c73-b456-8eacaa3bb7cd', '533dce0d-6f3c-4b3a-b964-dc3a24624f50'),
  ('78edfcf7-523a-4b9c-bb70-b725ddfbfa9c', '533dce0d-6f3c-4b3a-b964-dc3a24624f50'),
  ('6888c239-c500-499b-afb7-d16d8bba00a6', '533dce0d-6f3c-4b3a-b964-dc3a24624f50'),
  ('378ccd26-9dfa-4c2c-9d18-ffcf8bb90bca', '533dce0d-6f3c-4b3a-b964-dc3a24624f50'),
  ('8c49064b-30a9-40fc-a1ff-ec4570c55eee', '665e685c-6cb7-4060-bfdc-a27a47048506'),
  ('289e2978-5ea6-49e4-9462-64ea411fd46f', '665e685c-6cb7-4060-bfdc-a27a47048506'),
  ('47b0cde4-4f70-49a1-b209-64f1af020342', '665e685c-6cb7-4060-bfdc-a27a47048506'),
  ('71a026f1-f595-4c73-b456-8eacaa3bb7cd', '665e685c-6cb7-4060-bfdc-a27a47048506'),
  ('acaa35ba-665d-4e3c-9679-8e1fdf8d4340', '665e685c-6cb7-4060-bfdc-a27a47048506'),
  ('6888c239-c500-499b-afb7-d16d8bba00a6', '665e685c-6cb7-4060-bfdc-a27a47048506'),
  ('8c49064b-30a9-40fc-a1ff-ec4570c55eee', '9ef399ce-eb4b-4329-9ed8-660483c11f01'),
  ('44226358-a0e8-4d43-9a6d-2403edb0a47a', '9ef399ce-eb4b-4329-9ed8-660483c11f01'),
  ('b2e15fcb-1826-442a-ae81-d272f5f9f4f4', '9ef399ce-eb4b-4329-9ed8-660483c11f01'),
  ('c3717a51-c42a-4df7-b8c9-ba220ab0fc32', '9ef399ce-eb4b-4329-9ed8-660483c11f01'),
  ('4e27f685-ec5c-4186-97f5-16e917936ae1', '9ef399ce-eb4b-4329-9ed8-660483c11f01'),
  ('ce4e1b67-4265-4525-8d7f-c70daaaf351a', '9ef399ce-eb4b-4329-9ed8-660483c11f01'),
  ('8c49064b-30a9-40fc-a1ff-ec4570c55eee', '6cbe502d-569e-4eaa-bc7d-caa89197c5cc'),
  ('0d9c1dfd-1f5d-49fc-a79d-fb8e4aed4f8f', '6cbe502d-569e-4eaa-bc7d-caa89197c5cc'),
  ('fe7459d6-12b7-421d-8336-1992f69b1abc', '6cbe502d-569e-4eaa-bc7d-caa89197c5cc'),
  ('44226358-a0e8-4d43-9a6d-2403edb0a47a', '6cbe502d-569e-4eaa-bc7d-caa89197c5cc'),
  ('0fa34801-7d22-4337-89f2-ea32b73f5aab', '6cbe502d-569e-4eaa-bc7d-caa89197c5cc'),
  ('8620a174-079c-4422-bc17-5bf52cff09e9', '6cbe502d-569e-4eaa-bc7d-caa89197c5cc'),
  ('170bd27b-ef7c-49d1-9a0a-3138fd50e3c0', '6cbe502d-569e-4eaa-bc7d-caa89197c5cc'),
  ('4e27f685-ec5c-4186-97f5-16e917936ae1', '6cbe502d-569e-4eaa-bc7d-caa89197c5cc'),
  ('ce4e1b67-4265-4525-8d7f-c70daaaf351a', '6cbe502d-569e-4eaa-bc7d-caa89197c5cc'),
  ('8c49064b-30a9-40fc-a1ff-ec4570c55eee', '2ddb369b-7972-4383-a5c9-1c861485de14'),
  ('87722f44-f01b-493e-880d-898ce3dabc28', '2ddb369b-7972-4383-a5c9-1c861485de14'),
  ('98c3b32f-d9e9-48b6-be1b-d6de0364e917', '2ddb369b-7972-4383-a5c9-1c861485de14'),
  ('44226358-a0e8-4d43-9a6d-2403edb0a47a', '2ddb369b-7972-4383-a5c9-1c861485de14'),
  ('b2e15fcb-1826-442a-ae81-d272f5f9f4f4', '2ddb369b-7972-4383-a5c9-1c861485de14'),
  ('4e27f685-ec5c-4186-97f5-16e917936ae1', '2ddb369b-7972-4383-a5c9-1c861485de14'),
  ('8a5c62dc-980d-4c63-aab6-73c755203364', '2ddb369b-7972-4383-a5c9-1c861485de14'),
  ('806b6ca2-7533-42b3-8a1c-dff396a5331d', '25c5669e-925b-4da5-aed9-3aa0c51c3125'),
  ('684ae4b1-c802-435b-8ce2-59def6e95382', '25c5669e-925b-4da5-aed9-3aa0c51c3125'),
  ('3bf0a331-0fe8-4252-8374-79f643aea29a', '25c5669e-925b-4da5-aed9-3aa0c51c3125'),
  ('acaa35ba-665d-4e3c-9679-8e1fdf8d4340', '25c5669e-925b-4da5-aed9-3aa0c51c3125'),
  ('64601d48-2663-4116-bd67-4daced6dee4c', '25c5669e-925b-4da5-aed9-3aa0c51c3125'),
  ('69090804-b19a-47df-9934-e00c8c098a1f', '25c5669e-925b-4da5-aed9-3aa0c51c3125'),
  ('806b6ca2-7533-42b3-8a1c-dff396a5331d', 'e834ea58-d4bf-43d1-9671-79c78063f70a'),
  ('4730ba18-7418-4a20-82ba-ed43b4022b33', 'e834ea58-d4bf-43d1-9671-79c78063f70a'),
  ('15e74f70-3d3c-4f50-932e-2ffc819f5a8e', 'e834ea58-d4bf-43d1-9671-79c78063f70a'),
  ('b6355b30-06c7-412e-b27f-e94e10a6a5a5', 'e834ea58-d4bf-43d1-9671-79c78063f70a'),
  ('493abfd7-a8eb-46a3-be05-8b81cfb67e86', 'e834ea58-d4bf-43d1-9671-79c78063f70a'),
  ('69c35ba3-878a-4bb9-9a82-5f6cb4d32b83', 'e834ea58-d4bf-43d1-9671-79c78063f70a'),
  ('cddca2d5-08e6-4437-8a75-b88db4bc4587', 'e834ea58-d4bf-43d1-9671-79c78063f70a'),
  ('d14e57a7-e45b-441b-86fe-dc09aa79913a', 'e834ea58-d4bf-43d1-9671-79c78063f70a'),
  ('806b6ca2-7533-42b3-8a1c-dff396a5331d', 'aa995818-33f2-4a7c-847e-7950725b1b45'),
  ('3bf0a331-0fe8-4252-8374-79f643aea29a', 'aa995818-33f2-4a7c-847e-7950725b1b45'),
  ('64601d48-2663-4116-bd67-4daced6dee4c', 'aa995818-33f2-4a7c-847e-7950725b1b45'),
  ('806b6ca2-7533-42b3-8a1c-dff396a5331d', '29b853b2-fda7-4d33-8fbb-56094a293abc'),
  ('684ae4b1-c802-435b-8ce2-59def6e95382', '29b853b2-fda7-4d33-8fbb-56094a293abc'),
  ('177a7163-6e16-4f98-bd1a-565851bf64e9', '29b853b2-fda7-4d33-8fbb-56094a293abc'),
  ('0fa34801-7d22-4337-89f2-ea32b73f5aab', '29b853b2-fda7-4d33-8fbb-56094a293abc'),
  ('21eecd84-7354-4436-81fe-3541c8b226a8', '29b853b2-fda7-4d33-8fbb-56094a293abc'),
  ('15e74f70-3d3c-4f50-932e-2ffc819f5a8e', '29b853b2-fda7-4d33-8fbb-56094a293abc'),
  ('d14e57a7-e45b-441b-86fe-dc09aa79913a', '29b853b2-fda7-4d33-8fbb-56094a293abc'),
  ('806b6ca2-7533-42b3-8a1c-dff396a5331d', 'ca1a5b7c-9504-47d5-83e9-e5967e58e25a'),
  ('87722f44-f01b-493e-880d-898ce3dabc28', 'ca1a5b7c-9504-47d5-83e9-e5967e58e25a'),
  ('98c3b32f-d9e9-48b6-be1b-d6de0364e917', 'ca1a5b7c-9504-47d5-83e9-e5967e58e25a'),
  ('4730ba18-7418-4a20-82ba-ed43b4022b33', 'ca1a5b7c-9504-47d5-83e9-e5967e58e25a'),
  ('0c4217b0-1407-40e7-b940-00901046b5eb', 'ca1a5b7c-9504-47d5-83e9-e5967e58e25a'),
  ('69c35ba3-878a-4bb9-9a82-5f6cb4d32b83', 'ca1a5b7c-9504-47d5-83e9-e5967e58e25a'),
  ('806b6ca2-7533-42b3-8a1c-dff396a5331d', 'e12e1543-6dee-4313-b909-e3e35c743330'),
  ('4730ba18-7418-4a20-82ba-ed43b4022b33', 'e12e1543-6dee-4313-b909-e3e35c743330'),
  ('15e74f70-3d3c-4f50-932e-2ffc819f5a8e', 'e12e1543-6dee-4313-b909-e3e35c743330'),
  ('69c35ba3-878a-4bb9-9a82-5f6cb4d32b83', 'e12e1543-6dee-4313-b909-e3e35c743330'),
  ('cddca2d5-08e6-4437-8a75-b88db4bc4587', 'e12e1543-6dee-4313-b909-e3e35c743330'),
  ('87722f44-f01b-493e-880d-898ce3dabc28', 'f23b5f8d-08e1-476f-91c3-61487ad2cd0c'),
  ('98c3b32f-d9e9-48b6-be1b-d6de0364e917', 'f23b5f8d-08e1-476f-91c3-61487ad2cd0c'),
  ('289e2978-5ea6-49e4-9462-64ea411fd46f', 'f23b5f8d-08e1-476f-91c3-61487ad2cd0c'),
  ('47b0cde4-4f70-49a1-b209-64f1af020342', 'f23b5f8d-08e1-476f-91c3-61487ad2cd0c'),
  ('662cb956-bfb6-4343-937a-b9f26203d62b', 'f23b5f8d-08e1-476f-91c3-61487ad2cd0c'),
  ('9a33f357-1a59-4603-97a0-fd7023121370', 'f23b5f8d-08e1-476f-91c3-61487ad2cd0c'),
  ('8620a174-079c-4422-bc17-5bf52cff09e9', 'f23b5f8d-08e1-476f-91c3-61487ad2cd0c'),
  ('9752d991-d3e6-432d-af9d-3486af95dca5', 'f23b5f8d-08e1-476f-91c3-61487ad2cd0c'),
  ('6ecc0a65-4cf5-47b6-8427-94135c6047fe', 'f23b5f8d-08e1-476f-91c3-61487ad2cd0c'),
  ('945f8a49-f70f-4b00-a630-50ec52533269', 'f23b5f8d-08e1-476f-91c3-61487ad2cd0c'),
  ('f5cb5e4f-3281-44c7-84a5-75307b9466a8', 'f23b5f8d-08e1-476f-91c3-61487ad2cd0c'),
  ('6f4a1f10-57d9-4feb-b7ac-1c70d9adacee', 'f23b5f8d-08e1-476f-91c3-61487ad2cd0c'),
  ('71a026f1-f595-4c73-b456-8eacaa3bb7cd', 'f23b5f8d-08e1-476f-91c3-61487ad2cd0c'),
  ('78edfcf7-523a-4b9c-bb70-b725ddfbfa9c', 'f23b5f8d-08e1-476f-91c3-61487ad2cd0c'),
  ('6888c239-c500-499b-afb7-d16d8bba00a6', 'f23b5f8d-08e1-476f-91c3-61487ad2cd0c'),
  ('378ccd26-9dfa-4c2c-9d18-ffcf8bb90bca', 'f23b5f8d-08e1-476f-91c3-61487ad2cd0c'),
  ('1403b9a9-19f6-4040-a3f7-bb4ebb9230b4', 'f23b5f8d-08e1-476f-91c3-61487ad2cd0c'),
  ('87722f44-f01b-493e-880d-898ce3dabc28', 'd1857be1-7636-4676-996a-4f368e6d75f3'),
  ('289e2978-5ea6-49e4-9462-64ea411fd46f', 'd1857be1-7636-4676-996a-4f368e6d75f3'),
  ('d3d2d756-02dd-4ebf-95f8-85aa48adfdaf', 'd1857be1-7636-4676-996a-4f368e6d75f3'),
  ('acaa35ba-665d-4e3c-9679-8e1fdf8d4340', 'd1857be1-7636-4676-996a-4f368e6d75f3'),
  ('378ccd26-9dfa-4c2c-9d18-ffcf8bb90bca', 'd1857be1-7636-4676-996a-4f368e6d75f3'),
  ('87722f44-f01b-493e-880d-898ce3dabc28', 'b7fce8ab-a0e5-4219-8966-91ab14ed99ad'),
  ('98c3b32f-d9e9-48b6-be1b-d6de0364e917', 'b7fce8ab-a0e5-4219-8966-91ab14ed99ad'),
  ('4730ba18-7418-4a20-82ba-ed43b4022b33', 'b7fce8ab-a0e5-4219-8966-91ab14ed99ad'),
  ('289e2978-5ea6-49e4-9462-64ea411fd46f', 'b7fce8ab-a0e5-4219-8966-91ab14ed99ad'),
  ('9a33f357-1a59-4603-97a0-fd7023121370', 'b7fce8ab-a0e5-4219-8966-91ab14ed99ad'),
  ('d3d2d756-02dd-4ebf-95f8-85aa48adfdaf', 'b7fce8ab-a0e5-4219-8966-91ab14ed99ad'),
  ('662cb956-bfb6-4343-937a-b9f26203d62b', 'b7fce8ab-a0e5-4219-8966-91ab14ed99ad'),
  ('0c4217b0-1407-40e7-b940-00901046b5eb', 'b7fce8ab-a0e5-4219-8966-91ab14ed99ad'),
  ('71a026f1-f595-4c73-b456-8eacaa3bb7cd', 'b7fce8ab-a0e5-4219-8966-91ab14ed99ad'),
  ('78edfcf7-523a-4b9c-bb70-b725ddfbfa9c', 'b7fce8ab-a0e5-4219-8966-91ab14ed99ad'),
  ('acaa35ba-665d-4e3c-9679-8e1fdf8d4340', 'b7fce8ab-a0e5-4219-8966-91ab14ed99ad'),
  ('6888c239-c500-499b-afb7-d16d8bba00a6', 'b7fce8ab-a0e5-4219-8966-91ab14ed99ad'),
  ('0d9c1dfd-1f5d-49fc-a79d-fb8e4aed4f8f', '65f6feb3-614e-4f23-ae66-89d160b7913c'),
  ('b990e194-84c9-468a-ac58-460341cc125d', '65f6feb3-614e-4f23-ae66-89d160b7913c'),
  ('e1311b21-6842-4f35-b0cd-9b3626c4b9b6', '65f6feb3-614e-4f23-ae66-89d160b7913c'),
  ('b6355b30-06c7-412e-b27f-e94e10a6a5a5', '65f6feb3-614e-4f23-ae66-89d160b7913c'),
  ('493abfd7-a8eb-46a3-be05-8b81cfb67e86', '65f6feb3-614e-4f23-ae66-89d160b7913c'),
  ('0d9c1dfd-1f5d-49fc-a79d-fb8e4aed4f8f', 'f707592c-ad41-4bf0-84fe-58dfe01d1c43'),
  ('0fa34801-7d22-4337-89f2-ea32b73f5aab', 'f707592c-ad41-4bf0-84fe-58dfe01d1c43'),
  ('effa4c69-eb0a-4f1d-956f-5ee8e55661c0', 'f707592c-ad41-4bf0-84fe-58dfe01d1c43'),
  ('0d9c1dfd-1f5d-49fc-a79d-fb8e4aed4f8f', 'b7c33d9b-f455-4eeb-8de5-cf95e3c0894e'),
  ('b990e194-84c9-468a-ac58-460341cc125d', 'b7c33d9b-f455-4eeb-8de5-cf95e3c0894e'),
  ('177a7163-6e16-4f98-bd1a-565851bf64e9', 'b7c33d9b-f455-4eeb-8de5-cf95e3c0894e'),
  ('21eecd84-7354-4436-81fe-3541c8b226a8', 'b7c33d9b-f455-4eeb-8de5-cf95e3c0894e'),
  ('cddca2d5-08e6-4437-8a75-b88db4bc4587', 'b7c33d9b-f455-4eeb-8de5-cf95e3c0894e'),
  ('0d9c1dfd-1f5d-49fc-a79d-fb8e4aed4f8f', '42a53afe-97da-4f2f-807b-32d729493452'),
  ('b990e194-84c9-468a-ac58-460341cc125d', '42a53afe-97da-4f2f-807b-32d729493452'),
  ('0d9c1dfd-1f5d-49fc-a79d-fb8e4aed4f8f', 'e357f4b8-925c-47a4-8513-1a428b0e442c'),
  ('b990e194-84c9-468a-ac58-460341cc125d', 'e357f4b8-925c-47a4-8513-1a428b0e442c'),
  ('684ae4b1-c802-435b-8ce2-59def6e95382', 'e357f4b8-925c-47a4-8513-1a428b0e442c'),
  ('0fa34801-7d22-4337-89f2-ea32b73f5aab', 'e357f4b8-925c-47a4-8513-1a428b0e442c'),
  ('c7b74ebe-0978-4edc-8af4-63bc6898c605', '3e053d77-f7e6-4fcd-ba71-f351e74ade72'),
  ('cddca2d5-08e6-4437-8a75-b88db4bc4587', '3e053d77-f7e6-4fcd-ba71-f351e74ade72'),
  ('fb072a18-b440-4478-9e7b-fadbf0074204', '3e053d77-f7e6-4fcd-ba71-f351e74ade72'),
  ('98c3b32f-d9e9-48b6-be1b-d6de0364e917', '22264d9f-1006-4368-a303-4f507a0512ad'),
  ('289e2978-5ea6-49e4-9462-64ea411fd46f', '22264d9f-1006-4368-a303-4f507a0512ad'),
  ('d3d2d756-02dd-4ebf-95f8-85aa48adfdaf', '22264d9f-1006-4368-a303-4f507a0512ad'),
  ('662cb956-bfb6-4343-937a-b9f26203d62b', '22264d9f-1006-4368-a303-4f507a0512ad'),
  ('78edfcf7-523a-4b9c-bb70-b725ddfbfa9c', '22264d9f-1006-4368-a303-4f507a0512ad'),
  ('b990e194-84c9-468a-ac58-460341cc125d', '9df8e36f-2bf0-4851-88ff-a4796372e384'),
  ('684ae4b1-c802-435b-8ce2-59def6e95382', '9df8e36f-2bf0-4851-88ff-a4796372e384'),
  ('177a7163-6e16-4f98-bd1a-565851bf64e9', '9df8e36f-2bf0-4851-88ff-a4796372e384'),
  ('0c49ca1d-4b2b-4c6f-acb6-6cb2a43bb222', '9df8e36f-2bf0-4851-88ff-a4796372e384'),
  ('b990e194-84c9-468a-ac58-460341cc125d', 'c42b337a-235a-4d46-b6f2-0cca50853dae'),
  ('684ae4b1-c802-435b-8ce2-59def6e95382', 'c42b337a-235a-4d46-b6f2-0cca50853dae'),
  ('177a7163-6e16-4f98-bd1a-565851bf64e9', 'c42b337a-235a-4d46-b6f2-0cca50853dae'),
  ('0fa34801-7d22-4337-89f2-ea32b73f5aab', 'c42b337a-235a-4d46-b6f2-0cca50853dae'),
  ('21eecd84-7354-4436-81fe-3541c8b226a8', 'c42b337a-235a-4d46-b6f2-0cca50853dae'),
  ('d14e57a7-e45b-441b-86fe-dc09aa79913a', 'c42b337a-235a-4d46-b6f2-0cca50853dae'),
  ('684ae4b1-c802-435b-8ce2-59def6e95382', 'f9e84dc8-eb0a-41d3-b305-4d9190678e7c'),
  ('386ac1dd-9bef-4c74-9df3-d965690be3be', '043a08a4-15ea-4b8d-8464-fc61bd13dfdf'),
  ('018ffd0f-d758-4fa7-97b9-76220228a7ae', '043a08a4-15ea-4b8d-8464-fc61bd13dfdf'),
  ('860d3e51-8f8c-42dc-a72b-3edded1727f5', '043a08a4-15ea-4b8d-8464-fc61bd13dfdf'),
  ('3b04be0f-0830-4ce5-9a8f-486e026d46a1', '043a08a4-15ea-4b8d-8464-fc61bd13dfdf'),
  ('bf89ce3f-5238-423a-acb6-5f703c709555', '043a08a4-15ea-4b8d-8464-fc61bd13dfdf'),
  ('6f4a1f10-57d9-4feb-b7ac-1c70d9adacee', '043a08a4-15ea-4b8d-8464-fc61bd13dfdf'),
  ('7e339f39-6449-4c30-beb0-4c352500d919', '043a08a4-15ea-4b8d-8464-fc61bd13dfdf'),
  ('386ac1dd-9bef-4c74-9df3-d965690be3be', '3973593c-639e-440c-a8a9-4e03761a0d06'),
  ('fe7459d6-12b7-421d-8336-1992f69b1abc', '3973593c-639e-440c-a8a9-4e03761a0d06'),
  ('860d3e51-8f8c-42dc-a72b-3edded1727f5', '3973593c-639e-440c-a8a9-4e03761a0d06'),
  ('59f4228d-3001-4a6b-9e09-3edccce71a8c', '3973593c-639e-440c-a8a9-4e03761a0d06'),
  ('c3717a51-c42a-4df7-b8c9-ba220ab0fc32', '3973593c-639e-440c-a8a9-4e03761a0d06'),
  ('08678070-50c9-41bc-adc4-a93c38252fff', '3973593c-639e-440c-a8a9-4e03761a0d06'),
  ('7e339f39-6449-4c30-beb0-4c352500d919', '3973593c-639e-440c-a8a9-4e03761a0d06'),
  ('69090804-b19a-47df-9934-e00c8c098a1f', '3973593c-639e-440c-a8a9-4e03761a0d06'),
  ('fb072a18-b440-4478-9e7b-fadbf0074204', '3973593c-639e-440c-a8a9-4e03761a0d06'),
  ('1403b9a9-19f6-4040-a3f7-bb4ebb9230b4', '3973593c-639e-440c-a8a9-4e03761a0d06'),
  ('386ac1dd-9bef-4c74-9df3-d965690be3be', 'b4d5b1bb-df76-413e-a53c-8e6df01655d8'),
  ('5d71950b-583f-4dba-b188-537e6e419056', 'b4d5b1bb-df76-413e-a53c-8e6df01655d8'),
  ('65b2e1db-362f-4df4-a575-2cc213e80f38', 'b4d5b1bb-df76-413e-a53c-8e6df01655d8'),
  ('fe7459d6-12b7-421d-8336-1992f69b1abc', 'b4d5b1bb-df76-413e-a53c-8e6df01655d8'),
  ('7ae67777-b2b3-4c4a-84a6-e90ffcd0c2da', 'b4d5b1bb-df76-413e-a53c-8e6df01655d8'),
  ('018ffd0f-d758-4fa7-97b9-76220228a7ae', 'b4d5b1bb-df76-413e-a53c-8e6df01655d8'),
  ('59f4228d-3001-4a6b-9e09-3edccce71a8c', 'b4d5b1bb-df76-413e-a53c-8e6df01655d8'),
  ('32b23b69-ec9c-4733-86a0-0886ba9d4e66', 'b4d5b1bb-df76-413e-a53c-8e6df01655d8'),
  ('08678070-50c9-41bc-adc4-a93c38252fff', 'b4d5b1bb-df76-413e-a53c-8e6df01655d8'),
  ('64601d48-2663-4116-bd67-4daced6dee4c', 'b4d5b1bb-df76-413e-a53c-8e6df01655d8'),
  ('378ccd26-9dfa-4c2c-9d18-ffcf8bb90bca', 'b4d5b1bb-df76-413e-a53c-8e6df01655d8'),
  ('386ac1dd-9bef-4c74-9df3-d965690be3be', '5ec32d53-ec0a-4fb2-9cb1-767cfb79d474'),
  ('8620a174-079c-4422-bc17-5bf52cff09e9', '5ec32d53-ec0a-4fb2-9cb1-767cfb79d474'),
  ('386ac1dd-9bef-4c74-9df3-d965690be3be', '3d5bfc95-cceb-400c-b348-8f485ba4d3ef'),
  ('fe7459d6-12b7-421d-8336-1992f69b1abc', '3d5bfc95-cceb-400c-b348-8f485ba4d3ef'),
  ('7ae67777-b2b3-4c4a-84a6-e90ffcd0c2da', '3d5bfc95-cceb-400c-b348-8f485ba4d3ef'),
  ('15e74f70-3d3c-4f50-932e-2ffc819f5a8e', '3d5bfc95-cceb-400c-b348-8f485ba4d3ef'),
  ('59f4228d-3001-4a6b-9e09-3edccce71a8c', '3d5bfc95-cceb-400c-b348-8f485ba4d3ef'),
  ('08678070-50c9-41bc-adc4-a93c38252fff', '3d5bfc95-cceb-400c-b348-8f485ba4d3ef'),
  ('64601d48-2663-4116-bd67-4daced6dee4c', '3d5bfc95-cceb-400c-b348-8f485ba4d3ef'),
  ('7e339f39-6449-4c30-beb0-4c352500d919', '3d5bfc95-cceb-400c-b348-8f485ba4d3ef'),
  ('69090804-b19a-47df-9934-e00c8c098a1f', '3d5bfc95-cceb-400c-b348-8f485ba4d3ef'),
  ('378ccd26-9dfa-4c2c-9d18-ffcf8bb90bca', '3d5bfc95-cceb-400c-b348-8f485ba4d3ef'),
  ('d14e57a7-e45b-441b-86fe-dc09aa79913a', '3d5bfc95-cceb-400c-b348-8f485ba4d3ef'),
  ('fb072a18-b440-4478-9e7b-fadbf0074204', '3d5bfc95-cceb-400c-b348-8f485ba4d3ef'),
  ('1403b9a9-19f6-4040-a3f7-bb4ebb9230b4', '3d5bfc95-cceb-400c-b348-8f485ba4d3ef'),
  ('177a7163-6e16-4f98-bd1a-565851bf64e9', 'a853a5b4-f419-416d-bc33-e01adec2bb6c'),
  ('21eecd84-7354-4436-81fe-3541c8b226a8', 'a853a5b4-f419-416d-bc33-e01adec2bb6c'),
  ('effa4c69-eb0a-4f1d-956f-5ee8e55661c0', 'a853a5b4-f419-416d-bc33-e01adec2bb6c'),
  ('e1311b21-6842-4f35-b0cd-9b3626c4b9b6', 'a853a5b4-f419-416d-bc33-e01adec2bb6c'),
  ('886c1a16-1859-4af7-b40b-0b1d3dcb0471', 'a853a5b4-f419-416d-bc33-e01adec2bb6c'),
  ('177a7163-6e16-4f98-bd1a-565851bf64e9', 'b876ae72-62ac-450f-b3b3-9a220b26d626'),
  ('21eecd84-7354-4436-81fe-3541c8b226a8', 'b876ae72-62ac-450f-b3b3-9a220b26d626'),
  ('5d71950b-583f-4dba-b188-537e6e419056', 'f64f70df-2db6-4caf-baa5-715669214e44'),
  ('65b2e1db-362f-4df4-a575-2cc213e80f38', 'f64f70df-2db6-4caf-baa5-715669214e44'),
  ('3b04be0f-0830-4ce5-9a8f-486e026d46a1', 'f64f70df-2db6-4caf-baa5-715669214e44'),
  ('32b23b69-ec9c-4733-86a0-0886ba9d4e66', 'f64f70df-2db6-4caf-baa5-715669214e44'),
  ('b33c3090-2913-4810-a3bc-8ef14cedf5e1', 'f64f70df-2db6-4caf-baa5-715669214e44'),
  ('09f7c165-8653-468e-b273-e260a36c8841', 'f64f70df-2db6-4caf-baa5-715669214e44'),
  ('5d71950b-583f-4dba-b188-537e6e419056', '5b6eb762-b30f-49ce-87a0-a557a659e15b'),
  ('65b2e1db-362f-4df4-a575-2cc213e80f38', '5b6eb762-b30f-49ce-87a0-a557a659e15b'),
  ('018ffd0f-d758-4fa7-97b9-76220228a7ae', '5b6eb762-b30f-49ce-87a0-a557a659e15b'),
  ('3b04be0f-0830-4ce5-9a8f-486e026d46a1', '5b6eb762-b30f-49ce-87a0-a557a659e15b'),
  ('32b23b69-ec9c-4733-86a0-0886ba9d4e66', '5b6eb762-b30f-49ce-87a0-a557a659e15b'),
  ('b33c3090-2913-4810-a3bc-8ef14cedf5e1', '5b6eb762-b30f-49ce-87a0-a557a659e15b'),
  ('09f7c165-8653-468e-b273-e260a36c8841', '5b6eb762-b30f-49ce-87a0-a557a659e15b'),
  ('5d71950b-583f-4dba-b188-537e6e419056', 'f31edb2f-b5b6-4145-9533-f642666ac2b7'),
  ('65b2e1db-362f-4df4-a575-2cc213e80f38', 'f31edb2f-b5b6-4145-9533-f642666ac2b7'),
  ('018ffd0f-d758-4fa7-97b9-76220228a7ae', 'f31edb2f-b5b6-4145-9533-f642666ac2b7'),
  ('b33c3090-2913-4810-a3bc-8ef14cedf5e1', 'f31edb2f-b5b6-4145-9533-f642666ac2b7'),
  ('65b2e1db-362f-4df4-a575-2cc213e80f38', '2e093098-5c29-444e-8851-8e8c01be00d7'),
  ('32b23b69-ec9c-4733-86a0-0886ba9d4e66', '2e093098-5c29-444e-8851-8e8c01be00d7'),
  ('b33c3090-2913-4810-a3bc-8ef14cedf5e1', '2e093098-5c29-444e-8851-8e8c01be00d7'),
  ('09f7c165-8653-468e-b273-e260a36c8841', '2e093098-5c29-444e-8851-8e8c01be00d7'),
  ('fe7459d6-12b7-421d-8336-1992f69b1abc', 'e59d9a0c-b156-49de-8a26-ebc1d07a9590'),
  ('47b0cde4-4f70-49a1-b209-64f1af020342', 'e59d9a0c-b156-49de-8a26-ebc1d07a9590'),
  ('003d75ca-9569-414b-af35-5211b0289785', 'e59d9a0c-b156-49de-8a26-ebc1d07a9590'),
  ('4e27f685-ec5c-4186-97f5-16e917936ae1', 'e59d9a0c-b156-49de-8a26-ebc1d07a9590'),
  ('ce4e1b67-4265-4525-8d7f-c70daaaf351a', 'e59d9a0c-b156-49de-8a26-ebc1d07a9590'),
  ('4730ba18-7418-4a20-82ba-ed43b4022b33', 'ef1a39ff-1dc1-48f1-ac1d-ad499cda56e6'),
  ('d3d2d756-02dd-4ebf-95f8-85aa48adfdaf', 'ef1a39ff-1dc1-48f1-ac1d-ad499cda56e6'),
  ('69c35ba3-878a-4bb9-9a82-5f6cb4d32b83', 'ef1a39ff-1dc1-48f1-ac1d-ad499cda56e6'),
  ('44226358-a0e8-4d43-9a6d-2403edb0a47a', 'b82eecd8-a7e9-46ea-ab42-fdc43fa0db30'),
  ('bf89ce3f-5238-423a-acb6-5f703c709555', 'b82eecd8-a7e9-46ea-ab42-fdc43fa0db30'),
  ('b2e15fcb-1826-442a-ae81-d272f5f9f4f4', 'b82eecd8-a7e9-46ea-ab42-fdc43fa0db30'),
  ('4e27f685-ec5c-4186-97f5-16e917936ae1', 'b82eecd8-a7e9-46ea-ab42-fdc43fa0db30'),
  ('ce4e1b67-4265-4525-8d7f-c70daaaf351a', 'b82eecd8-a7e9-46ea-ab42-fdc43fa0db30'),
  ('44226358-a0e8-4d43-9a6d-2403edb0a47a', 'f15e243d-5c99-4a81-b3cf-713bb2726fb3'),
  ('3bf0a331-0fe8-4252-8374-79f643aea29a', 'f15e243d-5c99-4a81-b3cf-713bb2726fb3'),
  ('170bd27b-ef7c-49d1-9a0a-3138fd50e3c0', 'f15e243d-5c99-4a81-b3cf-713bb2726fb3'),
  ('0fa34801-7d22-4337-89f2-ea32b73f5aab', '42fb9b37-d9e3-4c7e-b7c2-ca9578c8e4ad'),
  ('21eecd84-7354-4436-81fe-3541c8b226a8', '42fb9b37-d9e3-4c7e-b7c2-ca9578c8e4ad'),
  ('0c49ca1d-4b2b-4c6f-acb6-6cb2a43bb222', '42fb9b37-d9e3-4c7e-b7c2-ca9578c8e4ad'),
  ('b6355b30-06c7-412e-b27f-e94e10a6a5a5', '42fb9b37-d9e3-4c7e-b7c2-ca9578c8e4ad'),
  ('886c1a16-1859-4af7-b40b-0b1d3dcb0471', '42fb9b37-d9e3-4c7e-b7c2-ca9578c8e4ad'),
  ('493abfd7-a8eb-46a3-be05-8b81cfb67e86', '42fb9b37-d9e3-4c7e-b7c2-ca9578c8e4ad'),
  ('69c35ba3-878a-4bb9-9a82-5f6cb4d32b83', '42fb9b37-d9e3-4c7e-b7c2-ca9578c8e4ad'),
  ('cddca2d5-08e6-4437-8a75-b88db4bc4587', '42fb9b37-d9e3-4c7e-b7c2-ca9578c8e4ad'),
  ('d14e57a7-e45b-441b-86fe-dc09aa79913a', '42fb9b37-d9e3-4c7e-b7c2-ca9578c8e4ad'),
  ('7ae67777-b2b3-4c4a-84a6-e90ffcd0c2da', '92f7f133-c47e-47f1-8552-121b93eb1381'),
  ('47b0cde4-4f70-49a1-b209-64f1af020342', '92f7f133-c47e-47f1-8552-121b93eb1381'),
  ('3bf0a331-0fe8-4252-8374-79f643aea29a', '92f7f133-c47e-47f1-8552-121b93eb1381'),
  ('d3d2d756-02dd-4ebf-95f8-85aa48adfdaf', '92f7f133-c47e-47f1-8552-121b93eb1381'),
  ('170bd27b-ef7c-49d1-9a0a-3138fd50e3c0', '92f7f133-c47e-47f1-8552-121b93eb1381'),
  ('0c4217b0-1407-40e7-b940-00901046b5eb', '92f7f133-c47e-47f1-8552-121b93eb1381'),
  ('9752d991-d3e6-432d-af9d-3486af95dca5', '92f7f133-c47e-47f1-8552-121b93eb1381'),
  ('6ecc0a65-4cf5-47b6-8427-94135c6047fe', '92f7f133-c47e-47f1-8552-121b93eb1381'),
  ('945f8a49-f70f-4b00-a630-50ec52533269', '92f7f133-c47e-47f1-8552-121b93eb1381'),
  ('6f4a1f10-57d9-4feb-b7ac-1c70d9adacee', '92f7f133-c47e-47f1-8552-121b93eb1381'),
  ('acaa35ba-665d-4e3c-9679-8e1fdf8d4340', '92f7f133-c47e-47f1-8552-121b93eb1381'),
  ('7ae67777-b2b3-4c4a-84a6-e90ffcd0c2da', 'a6de98c7-6827-4521-89ae-b9556206838f'),
  ('77cd87c3-6438-4a98-a56d-793e75ab2fff', 'a6de98c7-6827-4521-89ae-b9556206838f'),
  ('3b04be0f-0830-4ce5-9a8f-486e026d46a1', 'a6de98c7-6827-4521-89ae-b9556206838f'),
  ('d7dd4ec3-3e76-45b0-9f96-8fa8336fafa0', 'a6de98c7-6827-4521-89ae-b9556206838f'),
  ('7ae67777-b2b3-4c4a-84a6-e90ffcd0c2da', '26200806-5e2f-4526-9fa7-2afda811f309'),
  ('3bf0a331-0fe8-4252-8374-79f643aea29a', '26200806-5e2f-4526-9fa7-2afda811f309'),
  ('8620a174-079c-4422-bc17-5bf52cff09e9', '26200806-5e2f-4526-9fa7-2afda811f309'),
  ('018ffd0f-d758-4fa7-97b9-76220228a7ae', '26200806-5e2f-4526-9fa7-2afda811f309'),
  ('1403b9a9-19f6-4040-a3f7-bb4ebb9230b4', '26200806-5e2f-4526-9fa7-2afda811f309'),
  ('47b0cde4-4f70-49a1-b209-64f1af020342', 'c86ee66b-a9e3-4a07-be68-85bfab19c886'),
  ('662cb956-bfb6-4343-937a-b9f26203d62b', 'c86ee66b-a9e3-4a07-be68-85bfab19c886'),
  ('3bf0a331-0fe8-4252-8374-79f643aea29a', '41d1bc95-4607-44d2-a4f7-5b22058bd823'),
  ('15e74f70-3d3c-4f50-932e-2ffc819f5a8e', '8c6d2fa2-4828-46ce-973a-445c29ab1b44'),
  ('860d3e51-8f8c-42dc-a72b-3edded1727f5', '8c6d2fa2-4828-46ce-973a-445c29ab1b44'),
  ('6ecc0a65-4cf5-47b6-8427-94135c6047fe', '8c6d2fa2-4828-46ce-973a-445c29ab1b44'),
  ('e1311b21-6842-4f35-b0cd-9b3626c4b9b6', '8c6d2fa2-4828-46ce-973a-445c29ab1b44'),
  ('b6355b30-06c7-412e-b27f-e94e10a6a5a5', '8c6d2fa2-4828-46ce-973a-445c29ab1b44'),
  ('bf89ce3f-5238-423a-acb6-5f703c709555', '8c6d2fa2-4828-46ce-973a-445c29ab1b44'),
  ('493abfd7-a8eb-46a3-be05-8b81cfb67e86', '8c6d2fa2-4828-46ce-973a-445c29ab1b44'),
  ('945f8a49-f70f-4b00-a630-50ec52533269', '8c6d2fa2-4828-46ce-973a-445c29ab1b44'),
  ('59f4228d-3001-4a6b-9e09-3edccce71a8c', '8c6d2fa2-4828-46ce-973a-445c29ab1b44'),
  ('08678070-50c9-41bc-adc4-a93c38252fff', '8c6d2fa2-4828-46ce-973a-445c29ab1b44'),
  ('15e74f70-3d3c-4f50-932e-2ffc819f5a8e', '183da0ba-bb78-4c0b-b9eb-1a6f0d5ba5d6'),
  ('0c4217b0-1407-40e7-b940-00901046b5eb', '183da0ba-bb78-4c0b-b9eb-1a6f0d5ba5d6'),
  ('08678070-50c9-41bc-adc4-a93c38252fff', '183da0ba-bb78-4c0b-b9eb-1a6f0d5ba5d6'),
  ('7e339f39-6449-4c30-beb0-4c352500d919', '183da0ba-bb78-4c0b-b9eb-1a6f0d5ba5d6'),
  ('69090804-b19a-47df-9934-e00c8c098a1f', '183da0ba-bb78-4c0b-b9eb-1a6f0d5ba5d6'),
  ('fb072a18-b440-4478-9e7b-fadbf0074204', '183da0ba-bb78-4c0b-b9eb-1a6f0d5ba5d6'),
  ('1403b9a9-19f6-4040-a3f7-bb4ebb9230b4', '183da0ba-bb78-4c0b-b9eb-1a6f0d5ba5d6'),
  ('662cb956-bfb6-4343-937a-b9f26203d62b', '5d2d7146-1dd7-4769-9404-1b3c0a5afcca'),
  ('9a33f357-1a59-4603-97a0-fd7023121370', '5d2d7146-1dd7-4769-9404-1b3c0a5afcca'),
  ('71a026f1-f595-4c73-b456-8eacaa3bb7cd', '5d2d7146-1dd7-4769-9404-1b3c0a5afcca'),
  ('6888c239-c500-499b-afb7-d16d8bba00a6', '5d2d7146-1dd7-4769-9404-1b3c0a5afcca'),
  ('9a33f357-1a59-4603-97a0-fd7023121370', '4ab28b4a-95f8-41d8-a2fa-4a55d59108a2'),
  ('8620a174-079c-4422-bc17-5bf52cff09e9', '4ab28b4a-95f8-41d8-a2fa-4a55d59108a2'),
  ('170bd27b-ef7c-49d1-9a0a-3138fd50e3c0', '4ab28b4a-95f8-41d8-a2fa-4a55d59108a2'),
  ('9a33f357-1a59-4603-97a0-fd7023121370', '6ad7ae17-7739-47a2-a191-1d085083e39c'),
  ('170bd27b-ef7c-49d1-9a0a-3138fd50e3c0', '1c9692cf-5f6b-4f41-bfa1-d9deeb0891ae'),
  ('0c4217b0-1407-40e7-b940-00901046b5eb', '88f17913-ddeb-4aa9-b38e-21a79ffcb574'),
  ('77cd87c3-6438-4a98-a56d-793e75ab2fff', 'eed243ec-7174-4cd2-9077-ab7c4b035b10'),
  ('3b04be0f-0830-4ce5-9a8f-486e026d46a1', 'eed243ec-7174-4cd2-9077-ab7c4b035b10'),
  ('6ecc0a65-4cf5-47b6-8427-94135c6047fe', 'eed243ec-7174-4cd2-9077-ab7c4b035b10'),
  ('bf89ce3f-5238-423a-acb6-5f703c709555', 'eed243ec-7174-4cd2-9077-ab7c4b035b10'),
  ('d7dd4ec3-3e76-45b0-9f96-8fa8336fafa0', 'eed243ec-7174-4cd2-9077-ab7c4b035b10'),
  ('493abfd7-a8eb-46a3-be05-8b81cfb67e86', 'eed243ec-7174-4cd2-9077-ab7c4b035b10'),
  ('6f4a1f10-57d9-4feb-b7ac-1c70d9adacee', 'eed243ec-7174-4cd2-9077-ab7c4b035b10'),
  ('77cd87c3-6438-4a98-a56d-793e75ab2fff', 'fbb191be-d69d-4af9-9b64-2b615b787efa'),
  ('9752d991-d3e6-432d-af9d-3486af95dca5', 'fbb191be-d69d-4af9-9b64-2b615b787efa'),
  ('3b04be0f-0830-4ce5-9a8f-486e026d46a1', 'fbb191be-d69d-4af9-9b64-2b615b787efa'),
  ('6ecc0a65-4cf5-47b6-8427-94135c6047fe', 'fbb191be-d69d-4af9-9b64-2b615b787efa'),
  ('bf89ce3f-5238-423a-acb6-5f703c709555', 'fbb191be-d69d-4af9-9b64-2b615b787efa'),
  ('493abfd7-a8eb-46a3-be05-8b81cfb67e86', 'fbb191be-d69d-4af9-9b64-2b615b787efa'),
  ('945f8a49-f70f-4b00-a630-50ec52533269', 'fbb191be-d69d-4af9-9b64-2b615b787efa'),
  ('f5cb5e4f-3281-44c7-84a5-75307b9466a8', 'fbb191be-d69d-4af9-9b64-2b615b787efa'),
  ('6f4a1f10-57d9-4feb-b7ac-1c70d9adacee', 'fbb191be-d69d-4af9-9b64-2b615b787efa'),
  ('860d3e51-8f8c-42dc-a72b-3edded1727f5', '799e3277-1b05-497a-a920-bf019d919377'),
  ('effa4c69-eb0a-4f1d-956f-5ee8e55661c0', '799e3277-1b05-497a-a920-bf019d919377'),
  ('0c49ca1d-4b2b-4c6f-acb6-6cb2a43bb222', '799e3277-1b05-497a-a920-bf019d919377'),
  ('e1311b21-6842-4f35-b0cd-9b3626c4b9b6', '799e3277-1b05-497a-a920-bf019d919377'),
  ('d7dd4ec3-3e76-45b0-9f96-8fa8336fafa0', '799e3277-1b05-497a-a920-bf019d919377'),
  ('886c1a16-1859-4af7-b40b-0b1d3dcb0471', '799e3277-1b05-497a-a920-bf019d919377'),
  ('945f8a49-f70f-4b00-a630-50ec52533269', '799e3277-1b05-497a-a920-bf019d919377'),
  ('f5cb5e4f-3281-44c7-84a5-75307b9466a8', '799e3277-1b05-497a-a920-bf019d919377'),
  ('64601d48-2663-4116-bd67-4daced6dee4c', '799e3277-1b05-497a-a920-bf019d919377'),
  ('860d3e51-8f8c-42dc-a72b-3edded1727f5', 'e309db32-f38d-4fe1-b6e2-41c2adc029f1'),
  ('0c49ca1d-4b2b-4c6f-acb6-6cb2a43bb222', 'e309db32-f38d-4fe1-b6e2-41c2adc029f1'),
  ('b6355b30-06c7-412e-b27f-e94e10a6a5a5', 'e309db32-f38d-4fe1-b6e2-41c2adc029f1'),
  ('860d3e51-8f8c-42dc-a72b-3edded1727f5', '2f0330d3-ab7b-4e8d-8d8a-315f9974485d'),
  ('effa4c69-eb0a-4f1d-956f-5ee8e55661c0', '2f0330d3-ab7b-4e8d-8d8a-315f9974485d'),
  ('0c49ca1d-4b2b-4c6f-acb6-6cb2a43bb222', '2f0330d3-ab7b-4e8d-8d8a-315f9974485d'),
  ('945f8a49-f70f-4b00-a630-50ec52533269', '2f0330d3-ab7b-4e8d-8d8a-315f9974485d'),
  ('effa4c69-eb0a-4f1d-956f-5ee8e55661c0', 'eb7c2128-5ecf-4bd3-a9c2-dd6a7ea8e14f'),
  ('e1311b21-6842-4f35-b0cd-9b3626c4b9b6', 'eb7c2128-5ecf-4bd3-a9c2-dd6a7ea8e14f'),
  ('b6355b30-06c7-412e-b27f-e94e10a6a5a5', 'eb7c2128-5ecf-4bd3-a9c2-dd6a7ea8e14f'),
  ('886c1a16-1859-4af7-b40b-0b1d3dcb0471', 'eb7c2128-5ecf-4bd3-a9c2-dd6a7ea8e14f'),
  ('effa4c69-eb0a-4f1d-956f-5ee8e55661c0', '823a3042-571d-418e-82dd-43cc45876a17'),
  ('886c1a16-1859-4af7-b40b-0b1d3dcb0471', '823a3042-571d-418e-82dd-43cc45876a17'),
  ('0c49ca1d-4b2b-4c6f-acb6-6cb2a43bb222', 'f6a7c337-8e95-455c-8f9d-67923b522593'),
  ('9752d991-d3e6-432d-af9d-3486af95dca5', 'f09504af-6edd-475c-b9a4-f317bf70690b'),
  ('9752d991-d3e6-432d-af9d-3486af95dca5', '88bcc84a-17ec-475d-92c7-affa6dc92527'),
  ('f5cb5e4f-3281-44c7-84a5-75307b9466a8', '88bcc84a-17ec-475d-92c7-affa6dc92527'),
  ('e1311b21-6842-4f35-b0cd-9b3626c4b9b6', 'c244032a-0538-4c7e-a663-08568c7e9132'),
  ('d7dd4ec3-3e76-45b0-9f96-8fa8336fafa0', '9a03fb15-dbd8-44e6-91b1-872b701bea57'),
  ('886c1a16-1859-4af7-b40b-0b1d3dcb0471', '9a03fb15-dbd8-44e6-91b1-872b701bea57'),
  ('f5cb5e4f-3281-44c7-84a5-75307b9466a8', '4cb654c4-d411-4a57-a39b-51d950f69325'),
  ('b2e15fcb-1826-442a-ae81-d272f5f9f4f4', '0341ed42-5cc6-4dae-b808-0e4957545bb9'),
  ('b2e15fcb-1826-442a-ae81-d272f5f9f4f4', '7bc3dc8e-77de-45ca-b809-7e2f351fd82b'),
  ('09f7c165-8653-468e-b273-e260a36c8841', '7bc3dc8e-77de-45ca-b809-7e2f351fd82b'),
  ('59f4228d-3001-4a6b-9e09-3edccce71a8c', '04b7f851-2f5c-4bbe-a44c-fe0fc4756c13'),
  ('8a5c62dc-980d-4c63-aab6-73c755203364', '04b7f851-2f5c-4bbe-a44c-fe0fc4756c13'),
  ('71a026f1-f595-4c73-b456-8eacaa3bb7cd', '5a2cc456-ed6f-472e-b9c1-42dfa5bdb326'),
  ('78edfcf7-523a-4b9c-bb70-b725ddfbfa9c', '662ab573-04d0-4b06-b982-f5c30d92ce75'),
  ('1403b9a9-19f6-4040-a3f7-bb4ebb9230b4', '662ab573-04d0-4b06-b982-f5c30d92ce75'),
  ('78edfcf7-523a-4b9c-bb70-b725ddfbfa9c', '317fb1e6-adc5-43a9-a2e0-ae38ebebd602'),
  ('08678070-50c9-41bc-adc4-a93c38252fff', 'e9d517bb-8477-476c-b994-a3895cdcc87e'),
  ('7e339f39-6449-4c30-beb0-4c352500d919', 'e9d517bb-8477-476c-b994-a3895cdcc87e'),
  ('64601d48-2663-4116-bd67-4daced6dee4c', 'bcbcebe3-c304-4f0e-9df5-ee81a590ca0c'),
  ('69090804-b19a-47df-9934-e00c8c098a1f', 'bcbcebe3-c304-4f0e-9df5-ee81a590ca0c'),
  ('7f2db33f-0efb-4782-849e-a0be2b56507f', 'eb634c47-1444-452a-9832-574a259a166c'),
  ('2ccb85d1-e30c-45c7-a865-8e952db3af70', 'ee970583-b773-4c53-94ee-78d9d191edea'),
  ('00fefc3e-6543-4fc5-ba6f-76f011e51479', 'edc0427d-eb64-440f-8516-862571d0a758'),
  ('d13106e6-77ab-4f80-80d4-73daa7d72c8c', '73f24e11-aa00-4d43-ba75-347a18a5e448'),
  ('69c35ba3-878a-4bb9-9a82-5f6cb4d32b83', '38e05528-933f-41cd-a7f1-556156186000'),
  ('ce4e1b67-4265-4525-8d7f-c70daaaf351a', '04231bf0-813e-40fb-aabe-443d9af33f08'),
  ('b33c3090-2913-4810-a3bc-8ef14cedf5e1', '422d05a7-57b1-4cab-8560-9241f1babc85'),
  ('6888c239-c500-499b-afb7-d16d8bba00a6', '4842b0af-733e-4482-9f26-3c69d3c98d73'),
  ('378ccd26-9dfa-4c2c-9d18-ffcf8bb90bca', '369110ff-d8f2-440b-80ea-69bf5301c725'),
  ('d14e57a7-e45b-441b-86fe-dc09aa79913a', '03cc8c44-f79c-4932-8708-0e9a18dd06b4'),
  ('09f7c165-8653-468e-b273-e260a36c8841', 'b72c036b-7fdf-4112-a579-b243d25572df'),
  ('8a5c62dc-980d-4c63-aab6-73c755203364', '7ffd6e2d-1626-4422-b210-f1ee2bb35df4')
ON CONFLICT DO NOTHING;

⚠ Unmatched heroes (not in heroes list, check ALIASES):
  - Yi Seong Gye

✓ 76 champions, 92 skills, 419 assignments

-- ============================================================
-- Seed — S6 Heroes supplement
-- ============================================================

-- S6 Heroes: Scipio Africanus, Zhao Yun, Alp Arslan, William the Conqueror, Dae Jang Geum
-- Source: AllClash.com build guides (2025)

-- ============================================================
-- 1. NEW SKILLS (only those not already in the DB)
-- ============================================================
INSERT INTO skills (id, name, is_active, sort_order)
VALUES
  (gen_random_uuid(), 'One-man Army',              true, 93),
  (gen_random_uuid(), 'Dragon Manifestation',      true, 94),
  (gen_random_uuid(), 'Valorous Reputation',       true, 95),
  (gen_random_uuid(), 'Crown Claim',               true, 96),
  (gen_random_uuid(), 'Strengthening Fortification', true, 97)
ON CONFLICT DO NOTHING;

-- ============================================================
-- 2. NEW CHAMPIONS
-- ============================================================
INSERT INTO champions (id, name, is_active, sort_order)
VALUES
  (gen_random_uuid(), 'Scipio Africanus',      true, 76),
  (gen_random_uuid(), 'Zhao Yun',              true, 77),
  (gen_random_uuid(), 'Alp Arslan',            true, 78),
  (gen_random_uuid(), 'William the Conqueror', true, 79),
  (gen_random_uuid(), 'Dae Jang Geum',         true, 80)
ON CONFLICT DO NOTHING;

-- ============================================================
-- 3. CHAMPION_SKILL_ASSIGNMENTS
-- ============================================================

-- Scipio Africanus
INSERT INTO champion_skill_assignments (champion_id, skill_id)
SELECT c.id, s.id FROM champions c, skills s
WHERE c.name = 'Scipio Africanus'
  AND s.name IN ('One-man Army', 'Bloodthirst', 'Righteous Judgement', 'Fortification', 'King''s Blade')
ON CONFLICT DO NOTHING;

-- Zhao Yun
INSERT INTO champion_skill_assignments (champion_id, skill_id)
SELECT c.id, s.id FROM champions c, skills s
WHERE c.name = 'Zhao Yun'
  AND s.name IN ('Dragon Manifestation', 'Pay in Blood', 'Dark Flag', 'Critical Insight', 'Armor Piercer', 'Infuriation')
ON CONFLICT DO NOTHING;

-- Alp Arslan
INSERT INTO champion_skill_assignments (champion_id, skill_id)
SELECT c.id, s.id FROM champions c, skills s
WHERE c.name = 'Alp Arslan'
  AND s.name IN ('Valorous Reputation', 'Peerless Strike', 'High Spirit', 'Bloodthirst', 'Shield Slam')
ON CONFLICT DO NOTHING;

-- William the Conqueror
INSERT INTO champion_skill_assignments (champion_id, skill_id)
SELECT c.id, s.id FROM champions c, skills s
WHERE c.name = 'William the Conqueror'
  AND s.name IN ('Crown Claim', 'Ultimate Strategy', 'Triple Offensive', 'Formation Attack', 'Tenacity')
ON CONFLICT DO NOTHING;

-- Dae Jang Geum
INSERT INTO champion_skill_assignments (champion_id, skill_id)
SELECT c.id, s.id FROM champions c, skills s
WHERE c.name = 'Dae Jang Geum'
  AND s.name IN ('Immortal Army', 'Peaceful Haven', 'Strengthening Fortification', 'War Drums', 'King''s Blade')
ON CONFLICT DO NOTHING;

-- ============================================================
-- Seed — Gem icon URLs
-- ============================================================

-- Gem icon URLs from aoemobileguides.com
UPDATE gems SET icon_url = 'https://aoemobileguides.com/wp-content/uploads/2024/10/All-unit-types-health-up.webp'               WHERE name = 'Health';
UPDATE gems SET icon_url = 'https://aoemobileguides.com/wp-content/uploads/2024/10/All-unit-types-attack-up.webp'               WHERE name = 'Unit attack';
UPDATE gems SET icon_url = 'https://aoemobileguides.com/wp-content/uploads/2024/10/All-unit-types-defense-up.webp'              WHERE name = 'Unit defense';
UPDATE gems SET icon_url = 'https://aoemobileguides.com/wp-content/uploads/2024/10/Heros-unit-capacity-up.webp'                 WHERE name = 'Unit capacity';
UPDATE gems SET icon_url = 'https://aoemobileguides.com/wp-content/uploads/2024/10/Troops-gathering-speed-up.webp'              WHERE name = 'Gathering speed';
UPDATE gems SET icon_url = 'https://aoemobileguides.com/wp-content/uploads/2024/10/Heros-might-up.webp'                         WHERE name = 'Might';
UPDATE gems SET icon_url = 'https://aoemobileguides.com/wp-content/uploads/2024/10/Heros-strategy-up.webp'                      WHERE name = 'Strategy';
UPDATE gems SET icon_url = 'https://aoemobileguides.com/wp-content/uploads/2024/10/Heros-armor-up.webp'                         WHERE name = 'Armor';
UPDATE gems SET icon_url = 'https://aoemobileguides.com/wp-content/uploads/2024/10/Heros-siege-up.webp'                         WHERE name = 'Siege';
UPDATE gems SET icon_url = 'https://aoemobileguides.com/wp-content/uploads/2024/10/Heros-all-attributes-up.webp'                WHERE name = 'All attributes';
UPDATE gems SET icon_url = 'https://aoemobileguides.com/wp-content/uploads/2024/10/Heros-passive-skill-damage-up.webp'          WHERE name = 'Passive';
UPDATE gems SET icon_url = 'https://aoemobileguides.com/wp-content/uploads/2024/10/Heros-secondary-strike-skill-damage-up.webp' WHERE name = 'Secondary strike';
UPDATE gems SET icon_url = 'https://aoemobileguides.com/wp-content/uploads/2024/10/Heros-active-skill-damage-up.webp'           WHERE name = 'Active';
UPDATE gems SET icon_url = 'https://aoemobileguides.com/wp-content/uploads/2024/10/Heros-turn-based-skill-damage-up.webp'       WHERE name = 'Turn based';
UPDATE gems SET icon_url = 'https://aoemobileguides.com/wp-content/uploads/2024/10/Heros-healing-effect-up.webp'                WHERE name = 'Healing';
UPDATE gems SET icon_url = 'https://aoemobileguides.com/wp-content/uploads/2024/10/Troops-normal-attack-damage-up.webp'         WHERE name = 'Normal attack';

-- ============================================================
-- Seed — Ring icon URLs
-- ============================================================

-- Ring icon URLs from aoemobileguides.com
UPDATE rings SET icon_url = 'https://aoemobileguides.com/wp-content/uploads/2024/10/Azure-Moon.png'               WHERE name = 'Azure Moon';
UPDATE rings SET icon_url = 'https://aoemobileguides.com/wp-content/uploads/2024/10/Effulgent-Sun.png'            WHERE name = 'Effulgent Sun';
UPDATE rings SET icon_url = 'https://aoemobileguides.com/wp-content/uploads/2024/10/Everflame-Wings-Ring.png'     WHERE name = 'Everflame Wings';
UPDATE rings SET icon_url = 'https://aoemobileguides.com/wp-content/uploads/2024/10/Lofty-Mountain.png'           WHERE name = 'Lofty Mountain';
UPDATE rings SET icon_url = 'https://aoemobileguides.com/wp-content/uploads/2024/10/Lord-of-the-Eastern-Heavens.png' WHERE name = 'Lord of the Eastern Heavens';
UPDATE rings SET icon_url = 'https://aoemobileguides.com/wp-content/uploads/2024/10/Messenger-of-Destruction.png' WHERE name = 'Messenger of Destruction';
UPDATE rings SET icon_url = 'https://aoemobileguides.com/wp-content/uploads/2024/10/Radiant-Guardian.png'         WHERE name = 'Radiant Guardian';
UPDATE rings SET icon_url = 'https://aoemobileguides.com/wp-content/uploads/2024/10/Ring-of-Badger.png'           WHERE name = 'Ring of Badger';
UPDATE rings SET icon_url = 'https://aoemobileguides.com/wp-content/uploads/2024/10/Ring-of-Bear.png'             WHERE name = 'Ring of Bear';
UPDATE rings SET icon_url = 'https://aoemobileguides.com/wp-content/uploads/2024/10/Ring-of-Boar.png'             WHERE name = 'Ring of Boar';
UPDATE rings SET icon_url = 'https://aoemobileguides.com/wp-content/uploads/2024/10/Ring-of-Clover.png'           WHERE name = 'Ring of Clover';
UPDATE rings SET icon_url = 'https://aoemobileguides.com/wp-content/uploads/2024/10/Ring-of-Crow.png'             WHERE name = 'Ring of Crow';
UPDATE rings SET icon_url = 'https://aoemobileguides.com/wp-content/uploads/2024/10/Ring-of-Daisy.png'            WHERE name = 'Ring of Daisy';
UPDATE rings SET icon_url = 'https://aoemobileguides.com/wp-content/uploads/2024/10/Ring-of-Deer.png'             WHERE name = 'Ring of Deer';
UPDATE rings SET icon_url = 'https://aoemobileguides.com/wp-content/uploads/2024/10/Ring-of-Elephant.png'         WHERE name = 'Ring of Elephant';
UPDATE rings SET icon_url = 'https://aoemobileguides.com/wp-content/uploads/2024/10/Ring-of-Falcon.png'           WHERE name = 'Ring of Falcon';
UPDATE rings SET icon_url = 'https://aoemobileguides.com/wp-content/uploads/2024/10/Ring-of-Hyacinth.png'         WHERE name = 'Ring of Hyacinth';
UPDATE rings SET icon_url = 'https://aoemobileguides.com/wp-content/uploads/2024/10/Ring-of-Iris.png'             WHERE name = 'Ring of Iris';
UPDATE rings SET icon_url = 'https://aoemobileguides.com/wp-content/uploads/2024/10/Ring-of-Laurel.png'           WHERE name = 'Ring of Laurel';
UPDATE rings SET icon_url = 'https://aoemobileguides.com/wp-content/uploads/2024/10/Ring-of-Lily.png'             WHERE name = 'Ring of Lily';
UPDATE rings SET icon_url = 'https://aoemobileguides.com/wp-content/uploads/2024/10/Ring-of-Lion.png'             WHERE name = 'Ring of Lion';
UPDATE rings SET icon_url = 'https://aoemobileguides.com/wp-content/uploads/2024/10/Ring-of-Night-Wolf.png'       WHERE name = 'Ring of Night Wolf';
UPDATE rings SET icon_url = 'https://aoemobileguides.com/wp-content/uploads/2024/10/Ring-of-Rhino.png'            WHERE name = 'Ring of Rhino';
UPDATE rings SET icon_url = 'https://aoemobileguides.com/wp-content/uploads/2024/10/Ring-of-Rose-1.png'           WHERE name = 'Ring of Rose';
UPDATE rings SET icon_url = 'https://aoemobileguides.com/wp-content/uploads/2024/10/Ring-of-Seahorse.png'         WHERE name = 'Ring of Seahorse';
UPDATE rings SET icon_url = 'https://aoemobileguides.com/wp-content/uploads/2024/10/Ring-of-Serpent.png'          WHERE name = 'Ring of Serpent';
UPDATE rings SET icon_url = 'https://aoemobileguides.com/wp-content/uploads/2024/10/Ring-of-Shark.png'            WHERE name = 'Ring of Shark';
UPDATE rings SET icon_url = 'https://aoemobileguides.com/wp-content/uploads/2024/10/Ring-of-Sunflower.png'        WHERE name = 'Ring of Sunflower';
UPDATE rings SET icon_url = 'https://aoemobileguides.com/wp-content/uploads/2024/10/Ring-of-Tulip.png'            WHERE name = 'Ring of Tulip';
UPDATE rings SET icon_url = 'https://aoemobileguides.com/wp-content/uploads/2024/10/Ring-of-Violet.png'           WHERE name = 'Ring of Violet';
UPDATE rings SET icon_url = 'https://aoemobileguides.com/wp-content/uploads/2024/10/Sacred-Sage-Ring-1.png'       WHERE name = 'Sacred Sage';
UPDATE rings SET icon_url = 'https://aoemobileguides.com/wp-content/uploads/2024/10/Scorching-Flame.png'          WHERE name = 'Scorching Flame';
UPDATE rings SET icon_url = 'https://aoemobileguides.com/wp-content/uploads/2024/10/Skyward-Knight.png'           WHERE name = 'Skyward Knight';
UPDATE rings SET icon_url = 'https://aoemobileguides.com/wp-content/uploads/2024/10/Tranquil-Water.png'           WHERE name = 'Tranquil Water';
