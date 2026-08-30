-- ============================================
-- Migration 35: RLS Performance Fixes
-- ============================================
-- Purpose: Addresses three categories from Supabase's performance
-- advisor. Every policy below was read directly from pg_policies on the
-- live database before being rewritten — no policy's authorization logic
-- is changed, only how it's expressed. A fourth category (unused_index,
-- 5 hits) is deliberately NOT touched — see note at the bottom.
--
-- Category 1 — auth_rls_initplan (20 hits, guides feature only):
-- these 5 tables' policies call auth.uid()/is_super_admin() directly,
-- so Postgres re-evaluates them per row instead of once per query.
-- Fixed with ALTER POLICY, wrapping each call as (select auth.uid())/
-- (select is_super_admin()) — the same optimization already applied to
-- every table created after 15-fix-rls-performance.sql. No DROP/CREATE
-- needed; ALTER POLICY can redefine USING/WITH CHECK in place.
--
-- Category 2 — multiple_permissive_policies (40 hits, 8 underlying
-- overlaps across 7 tables): each table has a "members can read" policy
-- and an "admins can manage" (FOR ALL) policy that both apply to SELECT,
-- so Postgres evaluates and ORs both on every read. Two different fixes,
-- depending on whether the admin condition is a strict subset of the
-- member condition:
--   - discord_webhooks, mg_events, mg_selections, server_activity_settings,
--     server_mg_config, server_mg_slot_config: verified (by reading the
--     live qual/with_check) that the admin FOR ALL policy's condition
--     always implies the member SELECT policy's condition — an admin who
--     satisfies the admin condition necessarily also satisfies the member
--     condition. So the FOR ALL policy's SELECT-covering behavior is
--     already fully redundant. Split it into FOR INSERT / FOR UPDATE /
--     FOR DELETE policies (each keeping the exact same condition), and
--     leave the existing member SELECT policy as the sole SELECT-granting
--     policy — behavior is unchanged, the redundant evaluation is gone.
--   - mg_registrations (DELETE and INSERT pairs): here the admin and
--     member conditions are genuinely different (admin: any registration
--     in their server; member: only their own, only while registration is
--     open) — neither implies the other, so instead each pair is merged
--     into a single policy with the two conditions OR'd together. This
--     is behavior-identical to today (Postgres already ORs separate
--     permissive policies), just expressed as one policy instead of two.
--
-- Category 3 — unindexed_foreign_keys (6 hits, guides feature only):
-- 6 foreign key columns with no covering index, forcing a full table
-- scan on the referenced side whenever a referenced row is
-- updated/deleted (e.g. deleting a gem must scan all of
-- guide_champion_gems to enforce ON DELETE RESTRICT) and on any join
-- filtering by that FK. Purely additive — CREATE INDEX IF NOT EXISTS,
-- zero behavioral risk.
-- ============================================

-- ============================================
-- 1. auth_rls_initplan — wrap auth.<function>() calls in (select ...)
-- ============================================

-- guides
ALTER POLICY guides_select_published_or_author ON guides
  USING ((is_published = true) OR (author_id = (select auth.uid())));

ALTER POLICY guides_insert_authenticated ON guides
  WITH CHECK (((select auth.uid()) IS NOT NULL) AND (author_id = (select auth.uid())));

ALTER POLICY guides_update_author_or_super_admin ON guides
  USING ((author_id = (select auth.uid())) OR (select is_super_admin()));

ALTER POLICY guides_delete_author_or_super_admin ON guides
  USING ((author_id = (select auth.uid())) OR (select is_super_admin()));

-- guide_champions
ALTER POLICY guide_champions_select ON guide_champions
  USING (EXISTS (
    SELECT 1 FROM guides g
    WHERE g.id = guide_champions.guide_id
      AND ((g.is_published = true) OR (g.author_id = (select auth.uid())))
  ));

ALTER POLICY guide_champions_write_author ON guide_champions
  WITH CHECK (EXISTS (
    SELECT 1 FROM guides g
    WHERE g.id = guide_champions.guide_id AND g.author_id = (select auth.uid())
  ));

ALTER POLICY guide_champions_update_author ON guide_champions
  USING (EXISTS (
    SELECT 1 FROM guides g
    WHERE g.id = guide_champions.guide_id AND g.author_id = (select auth.uid())
  ));

ALTER POLICY guide_champions_delete_author ON guide_champions
  USING (EXISTS (
    SELECT 1 FROM guides g
    WHERE g.id = guide_champions.guide_id AND g.author_id = (select auth.uid())
  ));

-- guide_champion_skills
ALTER POLICY guide_champion_skills_select ON guide_champion_skills
  USING (EXISTS (
    SELECT 1 FROM guide_champions gc JOIN guides g ON g.id = gc.guide_id
    WHERE gc.id = guide_champion_skills.guide_champion_id
      AND ((g.is_published = true) OR (g.author_id = (select auth.uid())))
  ));

ALTER POLICY guide_champion_skills_write_author ON guide_champion_skills
  WITH CHECK (EXISTS (
    SELECT 1 FROM guide_champions gc JOIN guides g ON g.id = gc.guide_id
    WHERE gc.id = guide_champion_skills.guide_champion_id AND g.author_id = (select auth.uid())
  ));

ALTER POLICY guide_champion_skills_update_author ON guide_champion_skills
  USING (EXISTS (
    SELECT 1 FROM guide_champions gc JOIN guides g ON g.id = gc.guide_id
    WHERE gc.id = guide_champion_skills.guide_champion_id AND g.author_id = (select auth.uid())
  ));

ALTER POLICY guide_champion_skills_delete_author ON guide_champion_skills
  USING (EXISTS (
    SELECT 1 FROM guide_champions gc JOIN guides g ON g.id = gc.guide_id
    WHERE gc.id = guide_champion_skills.guide_champion_id AND g.author_id = (select auth.uid())
  ));

-- guide_champion_gems
ALTER POLICY guide_champion_gems_select ON guide_champion_gems
  USING (EXISTS (
    SELECT 1 FROM guide_champions gc JOIN guides g ON g.id = gc.guide_id
    WHERE gc.id = guide_champion_gems.guide_champion_id
      AND ((g.is_published = true) OR (g.author_id = (select auth.uid())))
  ));

ALTER POLICY guide_champion_gems_write_author ON guide_champion_gems
  WITH CHECK (EXISTS (
    SELECT 1 FROM guide_champions gc JOIN guides g ON g.id = gc.guide_id
    WHERE gc.id = guide_champion_gems.guide_champion_id AND g.author_id = (select auth.uid())
  ));

ALTER POLICY guide_champion_gems_update_author ON guide_champion_gems
  USING (EXISTS (
    SELECT 1 FROM guide_champions gc JOIN guides g ON g.id = gc.guide_id
    WHERE gc.id = guide_champion_gems.guide_champion_id AND g.author_id = (select auth.uid())
  ));

ALTER POLICY guide_champion_gems_delete_author ON guide_champion_gems
  USING (EXISTS (
    SELECT 1 FROM guide_champions gc JOIN guides g ON g.id = gc.guide_id
    WHERE gc.id = guide_champion_gems.guide_champion_id AND g.author_id = (select auth.uid())
  ));

-- guide_champion_horse_traits
ALTER POLICY guide_champion_horse_traits_select ON guide_champion_horse_traits
  USING (EXISTS (
    SELECT 1 FROM guide_champions gc JOIN guides g ON g.id = gc.guide_id
    WHERE gc.id = guide_champion_horse_traits.guide_champion_id
      AND ((g.is_published = true) OR (g.author_id = (select auth.uid())))
  ));

ALTER POLICY guide_champion_horse_traits_write_author ON guide_champion_horse_traits
  WITH CHECK (EXISTS (
    SELECT 1 FROM guide_champions gc JOIN guides g ON g.id = gc.guide_id
    WHERE gc.id = guide_champion_horse_traits.guide_champion_id AND g.author_id = (select auth.uid())
  ));

ALTER POLICY guide_champion_horse_traits_update_author ON guide_champion_horse_traits
  USING (EXISTS (
    SELECT 1 FROM guide_champions gc JOIN guides g ON g.id = gc.guide_id
    WHERE gc.id = guide_champion_horse_traits.guide_champion_id AND g.author_id = (select auth.uid())
  ));

ALTER POLICY guide_champion_horse_traits_delete_author ON guide_champion_horse_traits
  USING (EXISTS (
    SELECT 1 FROM guide_champions gc JOIN guides g ON g.id = gc.guide_id
    WHERE gc.id = guide_champion_horse_traits.guide_champion_id AND g.author_id = (select auth.uid())
  ));

-- ============================================
-- 2. multiple_permissive_policies — subset pattern
-- Split each "Admins can manage X" FOR ALL policy into FOR INSERT /
-- FOR UPDATE / FOR DELETE, dropping its (redundant) SELECT coverage.
-- ============================================

-- discord_webhooks
DROP POLICY "Admins can manage server discord webhooks" ON discord_webhooks;

CREATE POLICY "Admins can insert server discord webhooks" ON discord_webhooks
  FOR INSERT WITH CHECK (
    (is_super_admin((select auth.uid())) OR is_user_admin((select auth.uid())))
    AND server_id = get_user_server_id((select auth.uid()))
  );

CREATE POLICY "Admins can update server discord webhooks" ON discord_webhooks
  FOR UPDATE
  USING (
    (is_super_admin((select auth.uid())) OR is_user_admin((select auth.uid())))
    AND server_id = get_user_server_id((select auth.uid()))
  )
  WITH CHECK (
    (is_super_admin((select auth.uid())) OR is_user_admin((select auth.uid())))
    AND server_id = get_user_server_id((select auth.uid()))
  );

CREATE POLICY "Admins can delete server discord webhooks" ON discord_webhooks
  FOR DELETE USING (
    (is_super_admin((select auth.uid())) OR is_user_admin((select auth.uid())))
    AND server_id = get_user_server_id((select auth.uid()))
  );

-- mg_events
DROP POLICY "Admins can manage MG events" ON mg_events;

CREATE POLICY "Admins can insert MG events" ON mg_events
  FOR INSERT WITH CHECK (
    is_super_admin((select auth.uid()))
    OR (server_id = get_user_server_id((select auth.uid())) AND is_user_admin((select auth.uid())))
  );

CREATE POLICY "Admins can update MG events" ON mg_events
  FOR UPDATE
  USING (
    is_super_admin((select auth.uid()))
    OR (server_id = get_user_server_id((select auth.uid())) AND is_user_admin((select auth.uid())))
  )
  WITH CHECK (
    is_super_admin((select auth.uid()))
    OR (server_id = get_user_server_id((select auth.uid())) AND is_user_admin((select auth.uid())))
  );

CREATE POLICY "Admins can delete MG events" ON mg_events
  FOR DELETE USING (
    is_super_admin((select auth.uid()))
    OR (server_id = get_user_server_id((select auth.uid())) AND is_user_admin((select auth.uid())))
  );

-- mg_selections
DROP POLICY "Admins can manage selections for their server" ON mg_selections;

CREATE POLICY "Admins can insert selections for their server" ON mg_selections
  FOR INSERT WITH CHECK (
    is_super_admin((select auth.uid()))
    OR (
      is_user_admin((select auth.uid()))
      AND mg_event_id IN (SELECT id FROM mg_events WHERE server_id = get_user_server_id((select auth.uid())))
    )
  );

CREATE POLICY "Admins can update selections for their server" ON mg_selections
  FOR UPDATE
  USING (
    is_super_admin((select auth.uid()))
    OR (
      is_user_admin((select auth.uid()))
      AND mg_event_id IN (SELECT id FROM mg_events WHERE server_id = get_user_server_id((select auth.uid())))
    )
  )
  WITH CHECK (
    is_super_admin((select auth.uid()))
    OR (
      is_user_admin((select auth.uid()))
      AND mg_event_id IN (SELECT id FROM mg_events WHERE server_id = get_user_server_id((select auth.uid())))
    )
  );

CREATE POLICY "Admins can delete selections for their server" ON mg_selections
  FOR DELETE USING (
    is_super_admin((select auth.uid()))
    OR (
      is_user_admin((select auth.uid()))
      AND mg_event_id IN (SELECT id FROM mg_events WHERE server_id = get_user_server_id((select auth.uid())))
    )
  );

-- server_activity_settings
DROP POLICY "Admins can manage server activity settings" ON server_activity_settings;

CREATE POLICY "Admins can insert server activity settings" ON server_activity_settings
  FOR INSERT WITH CHECK (
    (is_super_admin((select auth.uid())) OR is_user_admin((select auth.uid())))
    AND server_id = get_user_server_id((select auth.uid()))
  );

CREATE POLICY "Admins can update server activity settings" ON server_activity_settings
  FOR UPDATE
  USING (
    (is_super_admin((select auth.uid())) OR is_user_admin((select auth.uid())))
    AND server_id = get_user_server_id((select auth.uid()))
  )
  WITH CHECK (
    (is_super_admin((select auth.uid())) OR is_user_admin((select auth.uid())))
    AND server_id = get_user_server_id((select auth.uid()))
  );

CREATE POLICY "Admins can delete server activity settings" ON server_activity_settings
  FOR DELETE USING (
    (is_super_admin((select auth.uid())) OR is_user_admin((select auth.uid())))
    AND server_id = get_user_server_id((select auth.uid()))
  );

-- server_mg_config
DROP POLICY "Admins can manage their server MG config" ON server_mg_config;

CREATE POLICY "Admins can insert their server MG config" ON server_mg_config
  FOR INSERT WITH CHECK (
    is_super_admin((select auth.uid()))
    OR (server_id = get_user_server_id((select auth.uid())) AND is_user_admin((select auth.uid())))
  );

CREATE POLICY "Admins can update their server MG config" ON server_mg_config
  FOR UPDATE
  USING (
    is_super_admin((select auth.uid()))
    OR (server_id = get_user_server_id((select auth.uid())) AND is_user_admin((select auth.uid())))
  )
  WITH CHECK (
    is_super_admin((select auth.uid()))
    OR (server_id = get_user_server_id((select auth.uid())) AND is_user_admin((select auth.uid())))
  );

CREATE POLICY "Admins can delete their server MG config" ON server_mg_config
  FOR DELETE USING (
    is_super_admin((select auth.uid()))
    OR (server_id = get_user_server_id((select auth.uid())) AND is_user_admin((select auth.uid())))
  );

-- server_mg_slot_config
DROP POLICY "Admins can manage their server MG slot config" ON server_mg_slot_config;

CREATE POLICY "Admins can insert their server MG slot config" ON server_mg_slot_config
  FOR INSERT WITH CHECK (
    is_super_admin((select auth.uid()))
    OR (server_id = get_user_server_id((select auth.uid())) AND is_user_admin((select auth.uid())))
  );

CREATE POLICY "Admins can update their server MG slot config" ON server_mg_slot_config
  FOR UPDATE
  USING (
    is_super_admin((select auth.uid()))
    OR (server_id = get_user_server_id((select auth.uid())) AND is_user_admin((select auth.uid())))
  )
  WITH CHECK (
    is_super_admin((select auth.uid()))
    OR (server_id = get_user_server_id((select auth.uid())) AND is_user_admin((select auth.uid())))
  );

CREATE POLICY "Admins can delete their server MG slot config" ON server_mg_slot_config
  FOR DELETE USING (
    is_super_admin((select auth.uid()))
    OR (server_id = get_user_server_id((select auth.uid())) AND is_user_admin((select auth.uid())))
  );

-- ============================================
-- 3. multiple_permissive_policies — OR-merge pattern (mg_registrations)
-- Admin and member conditions are genuinely different here (not a
-- subset relationship), so both policies per action are merged into one
-- with an OR — identical net behavior, one evaluation instead of two.
-- ============================================

DROP POLICY "Admins can delete registrations for their server" ON mg_registrations;
DROP POLICY "Members can delete their own registration" ON mg_registrations;

CREATE POLICY "Admins or members can delete registrations" ON mg_registrations
  FOR DELETE USING (
    is_super_admin((select auth.uid()))
    OR (
      is_user_admin((select auth.uid()))
      AND mg_event_id IN (SELECT id FROM mg_events WHERE server_id = get_user_server_id((select auth.uid())))
    )
    OR (
      user_id = (select auth.uid())
      AND mg_event_id IN (
        SELECT id FROM mg_events
        WHERE server_id = get_user_server_id((select auth.uid())) AND status = 'registration_open'
      )
    )
  );

DROP POLICY "Admins can insert registrations for their server" ON mg_registrations;
DROP POLICY "Members can register themselves" ON mg_registrations;

CREATE POLICY "Admins or members can insert registrations" ON mg_registrations
  FOR INSERT WITH CHECK (
    (
      (is_super_admin((select auth.uid())) OR is_user_admin((select auth.uid())))
      AND mg_event_id IN (SELECT id FROM mg_events WHERE server_id = get_user_server_id((select auth.uid())))
    )
    OR (
      user_id = (select auth.uid())
      AND mg_event_id IN (
        SELECT id FROM mg_events
        WHERE server_id = get_user_server_id((select auth.uid())) AND status = 'registration_open'
      )
    )
  );

-- ============================================
-- 4. unindexed_foreign_keys
-- ============================================

CREATE INDEX IF NOT EXISTS idx_guide_champion_gems_gem_id ON guide_champion_gems(gem_id);
CREATE INDEX IF NOT EXISTS idx_guide_champion_horse_traits_temperament_id ON guide_champion_horse_traits(temperament_id);
CREATE INDEX IF NOT EXISTS idx_guide_champion_skills_skill_id ON guide_champion_skills(skill_id);
CREATE INDEX IF NOT EXISTS idx_guide_champions_champion_id ON guide_champions(champion_id);
CREATE INDEX IF NOT EXISTS idx_guide_champions_ornament_id ON guide_champions(ornament_id);
CREATE INDEX IF NOT EXISTS idx_guide_champions_ring_id ON guide_champions(ring_id);

-- ============================================
-- NOT ACTIONED: unused_index (5 hits)
-- idx_invitation_tokens_created_by, idx_invitation_tokens_used_by,
-- idx_alliances_owner_id, idx_user_preferences, idx_guide_upvotes_voter_token
-- all show 0 scans in pg_stat_user_indexes as of this migration. Not
-- dropped: this project is ~6 months old with low row/traffic volume, so
-- "0 scans so far" is weak evidence of "never needed" — it as easily
-- reflects an admin-only code path that just hasn't been exercised yet
-- as a genuinely dead index. Revisit once there's more production usage
-- history to judge from.
-- ============================================

-- ============================================
-- DONE
-- ============================================

-- ============================================
-- ROLLBACK (not executed — for reference only)
-- ============================================
-- -- Section 4 — drop the new FK-covering indexes
-- DROP INDEX IF EXISTS idx_guide_champions_ring_id;
-- DROP INDEX IF EXISTS idx_guide_champions_ornament_id;
-- DROP INDEX IF EXISTS idx_guide_champions_champion_id;
-- DROP INDEX IF EXISTS idx_guide_champion_skills_skill_id;
-- DROP INDEX IF EXISTS idx_guide_champion_horse_traits_temperament_id;
-- DROP INDEX IF EXISTS idx_guide_champion_gems_gem_id;
--
-- -- Section 3 — restore the two original mg_registrations policy pairs
-- DROP POLICY "Admins or members can insert registrations" ON mg_registrations;
-- CREATE POLICY "Members can register themselves" ON mg_registrations
--   FOR INSERT WITH CHECK (
--     user_id = (select auth.uid())
--     AND mg_event_id IN (
--       SELECT id FROM mg_events
--       WHERE server_id = get_user_server_id((select auth.uid())) AND status = 'registration_open'
--     )
--   );
-- CREATE POLICY "Admins can insert registrations for their server" ON mg_registrations
--   FOR INSERT WITH CHECK (
--     (is_super_admin((select auth.uid())) OR is_user_admin((select auth.uid())))
--     AND mg_event_id IN (SELECT id FROM mg_events WHERE server_id = get_user_server_id((select auth.uid())))
--   );
-- DROP POLICY "Admins or members can delete registrations" ON mg_registrations;
-- CREATE POLICY "Members can delete their own registration" ON mg_registrations
--   FOR DELETE USING (
--     user_id = (select auth.uid())
--     AND mg_event_id IN (
--       SELECT id FROM mg_events
--       WHERE server_id = get_user_server_id((select auth.uid())) AND status = 'registration_open'
--     )
--   );
-- CREATE POLICY "Admins can delete registrations for their server" ON mg_registrations
--   FOR DELETE USING (
--     is_super_admin((select auth.uid()))
--     OR (
--       is_user_admin((select auth.uid()))
--       AND mg_event_id IN (SELECT id FROM mg_events WHERE server_id = get_user_server_id((select auth.uid())))
--     )
--   );
--
-- -- Section 2 — restore each "Admins can manage X" FOR ALL policy
-- DROP POLICY "Admins can insert their server MG slot config" ON server_mg_slot_config;
-- DROP POLICY "Admins can update their server MG slot config" ON server_mg_slot_config;
-- DROP POLICY "Admins can delete their server MG slot config" ON server_mg_slot_config;
-- CREATE POLICY "Admins can manage their server MG slot config" ON server_mg_slot_config
--   FOR ALL
--   USING (is_super_admin((select auth.uid())) OR (server_id = get_user_server_id((select auth.uid())) AND is_user_admin((select auth.uid()))))
--   WITH CHECK (is_super_admin((select auth.uid())) OR (server_id = get_user_server_id((select auth.uid())) AND is_user_admin((select auth.uid()))));
--
-- DROP POLICY "Admins can insert their server MG config" ON server_mg_config;
-- DROP POLICY "Admins can update their server MG config" ON server_mg_config;
-- DROP POLICY "Admins can delete their server MG config" ON server_mg_config;
-- CREATE POLICY "Admins can manage their server MG config" ON server_mg_config
--   FOR ALL
--   USING (is_super_admin((select auth.uid())) OR (server_id = get_user_server_id((select auth.uid())) AND is_user_admin((select auth.uid()))))
--   WITH CHECK (is_super_admin((select auth.uid())) OR (server_id = get_user_server_id((select auth.uid())) AND is_user_admin((select auth.uid()))));
--
-- DROP POLICY "Admins can insert server activity settings" ON server_activity_settings;
-- DROP POLICY "Admins can update server activity settings" ON server_activity_settings;
-- DROP POLICY "Admins can delete server activity settings" ON server_activity_settings;
-- CREATE POLICY "Admins can manage server activity settings" ON server_activity_settings
--   FOR ALL
--   USING ((is_super_admin((select auth.uid())) OR is_user_admin((select auth.uid()))) AND server_id = get_user_server_id((select auth.uid())))
--   WITH CHECK ((is_super_admin((select auth.uid())) OR is_user_admin((select auth.uid()))) AND server_id = get_user_server_id((select auth.uid())));
--
-- DROP POLICY "Admins can insert selections for their server" ON mg_selections;
-- DROP POLICY "Admins can update selections for their server" ON mg_selections;
-- DROP POLICY "Admins can delete selections for their server" ON mg_selections;
-- CREATE POLICY "Admins can manage selections for their server" ON mg_selections
--   FOR ALL
--   USING (is_super_admin((select auth.uid())) OR (is_user_admin((select auth.uid())) AND mg_event_id IN (SELECT id FROM mg_events WHERE server_id = get_user_server_id((select auth.uid())))))
--   WITH CHECK (is_super_admin((select auth.uid())) OR (is_user_admin((select auth.uid())) AND mg_event_id IN (SELECT id FROM mg_events WHERE server_id = get_user_server_id((select auth.uid())))));
--
-- DROP POLICY "Admins can insert MG events" ON mg_events;
-- DROP POLICY "Admins can update MG events" ON mg_events;
-- DROP POLICY "Admins can delete MG events" ON mg_events;
-- CREATE POLICY "Admins can manage MG events" ON mg_events
--   FOR ALL
--   USING (is_super_admin((select auth.uid())) OR (server_id = get_user_server_id((select auth.uid())) AND is_user_admin((select auth.uid()))))
--   WITH CHECK (is_super_admin((select auth.uid())) OR (server_id = get_user_server_id((select auth.uid())) AND is_user_admin((select auth.uid()))));
--
-- DROP POLICY "Admins can insert server discord webhooks" ON discord_webhooks;
-- DROP POLICY "Admins can update server discord webhooks" ON discord_webhooks;
-- DROP POLICY "Admins can delete server discord webhooks" ON discord_webhooks;
-- CREATE POLICY "Admins can manage server discord webhooks" ON discord_webhooks
--   FOR ALL
--   USING ((is_super_admin((select auth.uid())) OR is_user_admin((select auth.uid()))) AND server_id = get_user_server_id((select auth.uid())))
--   WITH CHECK ((is_super_admin((select auth.uid())) OR is_user_admin((select auth.uid()))) AND server_id = get_user_server_id((select auth.uid())));
--
-- -- Section 1 — revert each ALTER POLICY to its original bare auth.uid()/is_super_admin() form
-- ALTER POLICY guide_champion_horse_traits_delete_author ON guide_champion_horse_traits
--   USING (EXISTS (SELECT 1 FROM guide_champions gc JOIN guides g ON g.id = gc.guide_id WHERE gc.id = guide_champion_horse_traits.guide_champion_id AND g.author_id = auth.uid()));
-- ALTER POLICY guide_champion_horse_traits_update_author ON guide_champion_horse_traits
--   USING (EXISTS (SELECT 1 FROM guide_champions gc JOIN guides g ON g.id = gc.guide_id WHERE gc.id = guide_champion_horse_traits.guide_champion_id AND g.author_id = auth.uid()));
-- ALTER POLICY guide_champion_horse_traits_write_author ON guide_champion_horse_traits
--   WITH CHECK (EXISTS (SELECT 1 FROM guide_champions gc JOIN guides g ON g.id = gc.guide_id WHERE gc.id = guide_champion_horse_traits.guide_champion_id AND g.author_id = auth.uid()));
-- ALTER POLICY guide_champion_horse_traits_select ON guide_champion_horse_traits
--   USING (EXISTS (SELECT 1 FROM guide_champions gc JOIN guides g ON g.id = gc.guide_id WHERE gc.id = guide_champion_horse_traits.guide_champion_id AND ((g.is_published = true) OR (g.author_id = auth.uid()))));
--
-- ALTER POLICY guide_champion_gems_delete_author ON guide_champion_gems
--   USING (EXISTS (SELECT 1 FROM guide_champions gc JOIN guides g ON g.id = gc.guide_id WHERE gc.id = guide_champion_gems.guide_champion_id AND g.author_id = auth.uid()));
-- ALTER POLICY guide_champion_gems_update_author ON guide_champion_gems
--   USING (EXISTS (SELECT 1 FROM guide_champions gc JOIN guides g ON g.id = gc.guide_id WHERE gc.id = guide_champion_gems.guide_champion_id AND g.author_id = auth.uid()));
-- ALTER POLICY guide_champion_gems_write_author ON guide_champion_gems
--   WITH CHECK (EXISTS (SELECT 1 FROM guide_champions gc JOIN guides g ON g.id = gc.guide_id WHERE gc.id = guide_champion_gems.guide_champion_id AND g.author_id = auth.uid()));
-- ALTER POLICY guide_champion_gems_select ON guide_champion_gems
--   USING (EXISTS (SELECT 1 FROM guide_champions gc JOIN guides g ON g.id = gc.guide_id WHERE gc.id = guide_champion_gems.guide_champion_id AND ((g.is_published = true) OR (g.author_id = auth.uid()))));
--
-- ALTER POLICY guide_champion_skills_delete_author ON guide_champion_skills
--   USING (EXISTS (SELECT 1 FROM guide_champions gc JOIN guides g ON g.id = gc.guide_id WHERE gc.id = guide_champion_skills.guide_champion_id AND g.author_id = auth.uid()));
-- ALTER POLICY guide_champion_skills_update_author ON guide_champion_skills
--   USING (EXISTS (SELECT 1 FROM guide_champions gc JOIN guides g ON g.id = gc.guide_id WHERE gc.id = guide_champion_skills.guide_champion_id AND g.author_id = auth.uid()));
-- ALTER POLICY guide_champion_skills_write_author ON guide_champion_skills
--   WITH CHECK (EXISTS (SELECT 1 FROM guide_champions gc JOIN guides g ON g.id = gc.guide_id WHERE gc.id = guide_champion_skills.guide_champion_id AND g.author_id = auth.uid()));
-- ALTER POLICY guide_champion_skills_select ON guide_champion_skills
--   USING (EXISTS (SELECT 1 FROM guide_champions gc JOIN guides g ON g.id = gc.guide_id WHERE gc.id = guide_champion_skills.guide_champion_id AND ((g.is_published = true) OR (g.author_id = auth.uid()))));
--
-- ALTER POLICY guide_champions_delete_author ON guide_champions
--   USING (EXISTS (SELECT 1 FROM guides g WHERE g.id = guide_champions.guide_id AND g.author_id = auth.uid()));
-- ALTER POLICY guide_champions_update_author ON guide_champions
--   USING (EXISTS (SELECT 1 FROM guides g WHERE g.id = guide_champions.guide_id AND g.author_id = auth.uid()));
-- ALTER POLICY guide_champions_write_author ON guide_champions
--   WITH CHECK (EXISTS (SELECT 1 FROM guides g WHERE g.id = guide_champions.guide_id AND g.author_id = auth.uid()));
-- ALTER POLICY guide_champions_select ON guide_champions
--   USING (EXISTS (SELECT 1 FROM guides g WHERE g.id = guide_champions.guide_id AND ((g.is_published = true) OR (g.author_id = auth.uid()))));
--
-- ALTER POLICY guides_delete_author_or_super_admin ON guides
--   USING ((author_id = auth.uid()) OR is_super_admin());
-- ALTER POLICY guides_update_author_or_super_admin ON guides
--   USING ((author_id = auth.uid()) OR is_super_admin());
-- ALTER POLICY guides_insert_authenticated ON guides
--   WITH CHECK ((auth.uid() IS NOT NULL) AND (author_id = auth.uid()));
-- ALTER POLICY guides_select_published_or_author ON guides
--   USING ((is_published = true) OR (author_id = auth.uid()));
