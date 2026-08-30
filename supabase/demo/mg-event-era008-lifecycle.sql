-- ============================================================
-- DEMO — Cycle de vie complet d'un MG Event (serveur ERA008-DEMO)
-- ============================================================
-- Script de démonstration, PAS une migration numérotée. Ne pas l'ajouter
-- à la chaîne supabase/NN-*.sql, ne pas le passer par apply_migration sur
-- un projet contenant de vraies données.
--
-- Objectif : dérouler à la main, requête par requête, chaque transition
-- d'état d'un MG event pour montrer comment les points sont retirés du
-- leaderboard :
--   upcoming → registration_open (joueurs inscrits)
--            → registration_closed
--            → selection_published (sélection générée + publiée)
--            → ongoing → finished
--   puis vérification que le total du leaderboard reflète la déduction
--   DKP (mg_selections.cost) une fois la semaine de l'event terminée
--   (cf. MgEventService.loadCostDeductions — la déduction n'apparaît
--   qu'après la fin calendaire de la semaine de l'event, jamais en cours).
--
-- Toutes les entités créées ici sont scoppées au serveur "ERA008-DEMO" et
-- à des comptes @example.invalid, donc aucune donnée réelle n'est touchée.
--
-- PRÉREQUIS (une seule fois, via l'appli — pas en SQL) :
--   1. Écran de signup admin de l'appli
--   2. Créer un compte avec "Nom du serveur" = ERA008-DEMO
--   3. Se connecter avec ce compte pour suivre la démo dans
--      Server Settings > MG Admin pendant/après l'exécution du script
--
-- Nettoyage : voir supabase/demo/mg-event-era008-cleanup.sql
-- ============================================================


-- ------------------------------------------------------------
-- ÉTAPE 0 — Config MG du serveur (capacity=10, sélection automatique, DKP on)
-- ------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM servers WHERE name = 'ERA008-DEMO') THEN
    RAISE EXCEPTION 'Serveur ERA008-DEMO introuvable — créez-le d''abord via le signup admin de l''appli.';
  END IF;
END $$;

INSERT INTO server_mg_config (server_id, capacity, assignment_mode, dkp_enabled)
SELECT id, 10, 'automatic', true
FROM servers WHERE name = 'ERA008-DEMO'
ON CONFLICT (server_id) DO UPDATE
  SET capacity = EXCLUDED.capacity,
      assignment_mode = EXCLUDED.assignment_mode,
      dkp_enabled = EXCLUDED.dkp_enabled;

-- Vérification
SELECT s.name, mc.capacity, mc.assignment_mode, mc.dkp_enabled
FROM server_mg_config mc JOIN servers s ON s.id = mc.server_id
WHERE s.name = 'ERA008-DEMO';


-- ------------------------------------------------------------
-- ÉTAPE 1 — 15 joueurs fictifs rattachés à ERA008-DEMO
-- ------------------------------------------------------------
-- rank_seed 1 = meilleur score (sera sélectionné en rang 1), 15 = plus faible.
-- Ces comptes ne sont pas prévus pour se connecter (mot de passe jetable) :
-- ils n'existent que pour satisfaire la FK user_profiles → auth.users.

CREATE TEMP TABLE IF NOT EXISTS demo_mg_players (
  rank_seed    INT PRIMARY KEY,
  display_name TEXT,
  user_id      UUID
);
TRUNCATE demo_mg_players;

DO $$
DECLARE
  v_server_id UUID;
  v_user_id   UUID;
  v_email     TEXT;
  i           INT;
BEGIN
  SELECT id INTO v_server_id FROM servers WHERE name = 'ERA008-DEMO';

  FOR i IN 1..15 LOOP
    v_email   := format('era008-demo-player-%s@example.invalid', i);
    v_user_id := gen_random_uuid();

    INSERT INTO auth.users (
      instance_id, id, aud, role, email, encrypted_password,
      email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
      created_at, updated_at, confirmation_token, email_change,
      email_change_token_new, recovery_token
    ) VALUES (
      '00000000-0000-0000-0000-000000000000', v_user_id, 'authenticated', 'authenticated',
      v_email, crypt('demo-not-a-real-login', gen_salt('bf')),
      now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb,
      now(), now(), '', '', '', ''
    );

    INSERT INTO auth.identities (
      id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at
    ) VALUES (
      gen_random_uuid(), v_user_id,
      jsonb_build_object('sub', v_user_id::text, 'email', v_email),
      'email', v_user_id::text, now(), now(), now()
    );

    -- recovery_question_id/recovery_answer_hash sont NOT NULL (18-add-account-recovery.sql) ;
    -- la valeur passée ici est hashée automatiquement par le trigger BEFORE INSERT.
    INSERT INTO user_profiles (
      id, server_id, display_name, username, role,
      recovery_question_id, recovery_answer_hash
    )
    VALUES (
      v_user_id, v_server_id, 'Demo Player ' || i, 'era008_demo_player_' || i, 'member',
      2, 'demo-recovery-answer'
    );

    INSERT INTO demo_mg_players (rank_seed, display_name, user_id)
    VALUES (i, 'Demo Player ' || i, v_user_id);
  END LOOP;
END $$;

-- Vérification
SELECT * FROM demo_mg_players ORDER BY rank_seed;


-- ------------------------------------------------------------
-- ÉTAPE 2 — Activités récentes : établissent le classement de base
-- ------------------------------------------------------------
-- Un seul type d'activité, points strictement décroissants avec rank_seed,
-- daté il y a 10 jours (dans la fenêtre glissante de 6 semaines) pour que
-- le classement soit sans ambiguïté avant tout MG event.

INSERT INTO activities (user_id, activity_type, position, points, date)
SELECT
  user_id,
  'kill_event',
  NULL,
  1000 - (rank_seed - 1) * 50,
  now() - interval '10 days'
FROM demo_mg_players;

-- Vérification — classement AVANT le MG event
SELECT up.display_name, a.points
FROM activities a
JOIN user_profiles up ON up.id = a.user_id
WHERE a.activity_type = 'kill_event'
ORDER BY a.points DESC;


-- ------------------------------------------------------------
-- ÉTAPE 3 — Créer le MG event : status = 'upcoming'
-- ------------------------------------------------------------
-- Dates volontairement placées ~3 semaines dans le passé : le reste du
-- script avance le statut "à la main" (au lieu d'attendre les pg_cron
-- jobs), et il faut que la semaine de l'event soit bien terminée par
-- rapport à NOW() pour que la déduction DKP soit visible à l'étape 8.

INSERT INTO mg_events (server_id, start_date, end_date, registration_open_at, registration_close_at, status)
SELECT id, CURRENT_DATE - 24, CURRENT_DATE - 18, CURRENT_DATE - 24, CURRENT_DATE - 21, 'upcoming'
FROM servers WHERE name = 'ERA008-DEMO';

-- Vérification
SELECT e.id, e.status, e.start_date, e.end_date, e.registration_open_at, e.registration_close_at
FROM mg_events e JOIN servers s ON s.id = e.server_id
WHERE s.name = 'ERA008-DEMO';


-- ------------------------------------------------------------
-- ÉTAPE 4 — registration_open : les joueurs s'inscrivent
-- ------------------------------------------------------------
-- 13 des 15 joueurs s'inscrivent (rank_seed 9 et 15 ne s'inscrivent jamais
-- — ils resteront absents du leaderboard MG, quel que soit leur score).

UPDATE mg_events e SET status = 'registration_open'
FROM servers s WHERE e.server_id = s.id AND s.name = 'ERA008-DEMO';

INSERT INTO mg_registrations (mg_event_id, user_id)
SELECT e.id, p.user_id
FROM mg_events e
JOIN servers s ON s.id = e.server_id
CROSS JOIN demo_mg_players p
WHERE s.name = 'ERA008-DEMO' AND p.rank_seed NOT IN (9, 15);

-- Vérification — qui s'est inscrit, dans quel ordre
SELECT p.rank_seed, p.display_name, r.registered_at
FROM mg_registrations r
JOIN demo_mg_players p ON p.user_id = r.user_id
JOIN mg_events e ON e.id = r.mg_event_id
JOIN servers s ON s.id = e.server_id
WHERE s.name = 'ERA008-DEMO'
ORDER BY p.rank_seed;


-- ------------------------------------------------------------
-- ÉTAPE 5 — registration_closed : la fenêtre d'inscription se ferme
-- ------------------------------------------------------------
UPDATE mg_events e SET status = 'registration_closed'
FROM servers s WHERE e.server_id = s.id AND s.name = 'ERA008-DEMO';

SELECT status FROM mg_events e JOIN servers s ON s.id = e.server_id WHERE s.name = 'ERA008-DEMO';


-- ------------------------------------------------------------
-- ÉTAPE 6 — Génération de la sélection automatique (top 10 par score)
-- ------------------------------------------------------------
-- Reproduit MgEventService.generateAutoSelectionPayload() : les inscrits
-- sont triés par score desc, les 10 meilleurs (capacity) prennent les rangs
-- 1..10, coût figé par rang selon MG_SLOT_DEFAULTS
-- (src/app/shared/utils/mg-slot.util.ts / mg-slots.constant.ts) :
--   rang 1→150 · 2→140 · 3→130 · 4→120 · 5→100 · 6-7→90 · 8-10→80
-- Avec 13 inscrits et capacity=10, il n'y a pas de slot FFA ici.

WITH ranked AS (
  SELECT
    r.user_id,
    ROW_NUMBER() OVER (ORDER BY a.points DESC) AS rnk
  FROM mg_registrations r
  JOIN mg_events e ON e.id = r.mg_event_id
  JOIN servers s ON s.id = e.server_id
  JOIN activities a ON a.user_id = r.user_id AND a.activity_type = 'kill_event'
  WHERE s.name = 'ERA008-DEMO'
),
slot_cost AS (
  SELECT * FROM (VALUES
    (1,150),(2,140),(3,130),(4,120),(5,100),
    (6,90),(7,90),(8,80),(9,80),(10,80)
  ) AS t(rnk, cost)
)
INSERT INTO mg_selections (mg_event_id, user_id, rank, selection_type, selected_by, cost)
SELECT e.id, ranked.user_id, ranked.rnk, 'selected', 'automatic', slot_cost.cost
FROM ranked
JOIN slot_cost ON slot_cost.rnk = ranked.rnk
CROSS JOIN (SELECT e.id FROM mg_events e JOIN servers s ON s.id = e.server_id WHERE s.name = 'ERA008-DEMO') e
WHERE ranked.rnk <= 10;

-- Vérification — sélection générée, pas encore publiée
SELECT sel.rank, p.display_name, sel.cost, sel.selection_type, sel.selected_by
FROM mg_selections sel
JOIN demo_mg_players p ON p.user_id = sel.user_id
JOIN mg_events e ON e.id = sel.mg_event_id
JOIN servers s ON s.id = e.server_id
WHERE s.name = 'ERA008-DEMO'
ORDER BY sel.rank;


-- ------------------------------------------------------------
-- ÉTAPE 7 — Publication : status = 'selection_published'
-- ------------------------------------------------------------
-- C'est le seul moment où selection_published_at est posé — les membres
-- non-admin ne voient les lignes mg_selections qu'à partir d'ici (RLS).

UPDATE mg_events e
SET status = 'selection_published', selection_published_at = now()
FROM servers s WHERE e.server_id = s.id AND s.name = 'ERA008-DEMO';

SELECT status, selection_published_at
FROM mg_events e JOIN servers s ON s.id = e.server_id WHERE s.name = 'ERA008-DEMO';


-- ------------------------------------------------------------
-- ÉTAPE 8 — ongoing puis finished (avance manuelle des 2 derniers statuts)
-- ------------------------------------------------------------
UPDATE mg_events e SET status = 'ongoing'
FROM servers s WHERE e.server_id = s.id AND s.name = 'ERA008-DEMO';
SELECT status FROM mg_events e JOIN servers s ON s.id = e.server_id WHERE s.name = 'ERA008-DEMO';

UPDATE mg_events e SET status = 'finished'
FROM servers s WHERE e.server_id = s.id AND s.name = 'ERA008-DEMO';
SELECT status FROM mg_events e JOIN servers s ON s.id = e.server_id WHERE s.name = 'ERA008-DEMO';


-- ------------------------------------------------------------
-- ÉTAPE 9 — Vérification finale : points retirés du leaderboard
-- ------------------------------------------------------------
-- Reproduit ActivityService.getUserScores() + applyMgDeductions() :
--   total = somme des points d'activité − somme des mg_selections.cost
-- avec la même règle d'éligibilité que MgEventService.loadCostDeductions() :
-- la déduction ne compte que si la semaine calendaire contenant le
-- start_date de l'event est entièrement terminée (jamais pendant l'event).

WITH base AS (
  SELECT p.rank_seed, p.display_name, p.user_id, a.points AS raw_points
  FROM demo_mg_players p
  JOIN activities a ON a.user_id = p.user_id AND a.activity_type = 'kill_event'
),
deductions AS (
  SELECT sel.user_id, sel.cost
  FROM mg_selections sel
  JOIN mg_events e ON e.id = sel.mg_event_id
  JOIN servers s ON s.id = e.server_id
  WHERE s.name = 'ERA008-DEMO'
    -- semaine de l'event terminée par rapport à maintenant (lundi-dimanche UTC)
    AND (date_trunc('week', e.start_date)::date + 6) < CURRENT_DATE
)
SELECT
  b.rank_seed,
  b.display_name,
  b.raw_points,
  COALESCE(d.cost, 0) AS mg_deduction,
  b.raw_points - COALESCE(d.cost, 0) AS final_total
FROM base b
LEFT JOIN deductions d ON d.user_id = b.user_id
ORDER BY final_total DESC, b.raw_points DESC;

-- Comparer avec l'étape 2 : les 10 joueurs sélectionnés à l'étape 6
-- (rank_seed 1, 2, 3, 4, 5, 6, 7, 8, 10, 11 — le 9 n'a jamais concouru
-- pour un slot puisqu'il ne s'est pas inscrit) ont maintenant
-- final_total < raw_points, exactement du montant "cost" de leur rang.
-- rank_seed 12, 13, 14 (inscrits mais non sélectionnés) et 9, 15 (jamais
-- inscrits) sont inchangés.
