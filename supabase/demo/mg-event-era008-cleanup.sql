-- ============================================================
-- CLEANUP — Supprime les données créées par mg-event-era008-lifecycle.sql
-- ============================================================
-- Deux niveaux : décommenter selon ce que vous voulez garder.
-- ============================================================


-- ------------------------------------------------------------
-- NIVEAU 1 — Supprime uniquement les 15 joueurs fictifs + leurs données
-- ------------------------------------------------------------
-- Garde le serveur ERA008-DEMO et le compte admin (server_mg_config,
-- mg_events, mg_registrations, mg_selections liés au serveur restent —
-- utile si vous voulez rejouer la démo côté joueurs sans recréer l'admin).
-- ON DELETE CASCADE sur user_profiles.id → auth.users(id) : supprimer
-- auth.users suffit à nettoyer user_profiles + activities + registrations
-- + selections de ces joueurs.

DELETE FROM auth.users
WHERE email LIKE 'era008-demo-player-%@example.invalid';


-- ------------------------------------------------------------
-- NIVEAU 2 — Supprime tout, y compris le serveur ERA008-DEMO et son admin
-- ------------------------------------------------------------
-- ⚠️ Décommentez seulement si vous voulez repartir de zéro (il faudra
-- re-signup un admin avant de relancer la démo). CASCADE depuis
-- servers(id) nettoie server_mg_config / mg_events / mg_registrations /
-- mg_selections / user_profiles (donc activities) de TOUT le serveur,
-- y compris le compte admin — mais pas son auth.users (fait séparément
-- ci-dessous).

-- DELETE FROM auth.users
-- WHERE id IN (
--   SELECT id FROM user_profiles WHERE server_id = (
--     SELECT id FROM servers WHERE name = 'ERA008-DEMO'
--   )
-- );
-- DELETE FROM servers WHERE name = 'ERA008-DEMO';
