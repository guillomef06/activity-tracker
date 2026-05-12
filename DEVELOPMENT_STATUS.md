# État d'Avancement du Développement

**Dernière mise à jour:** 24 avril 2026

## 📋 Résumé

Application Angular 21 de gestion d'activités avec backend Supabase et système multi-serveur. Mobile-first, déployée sur GitHub Pages.

---

## ✅ Fonctionnalités Complétées

### Infrastructure
- Backend Supabase : `servers`, `user_profiles`, `activities`, `invitation_tokens`, `activity_point_rules`, `discord_webhooks`, `server_activity_settings`, `mg_events`, `server_mg_config`, `mg_registrations`, `mg_selections`
- Authentification par username uniquement (email généré en interne `username@app.tracker`)
- RLS configuré avec helper functions `SECURITY DEFINER`
- PWA (manifest, service worker, banner d'installation A2HS)
- GitHub Pages SPA routing (404.html → sessionStorage → index.html)

### Authentification & Comptes
- Signup admin (crée un serveur) / member (via token d'invitation)
- Login par username + password
- Dialog "Mon Compte" : modifier display name, mot de passe, question de récupération + préférences langue
- Account recovery : question secrète → reset mot de passe (rate limiting custom, sans email)
- Rôles : `super_admin` (accès global), `admin` (gestion serveur), `member`

### Invitations
- Tokens multi-usage avec date d'expiration configurable
- Validation côté anon via RPC `validate_invitation_token` (bypasse RLS sur `servers`)
- Vue stats temps réel (`invitation_stats`)

### Activités & Scores
- Saisie activité avec position → calcul points automatique selon règles configurables
- Mode participation par activité (toggle à la place du champ position, points fixes)
- Cycle de 6 semaines pour la disponibilité des activités (date ref : 25 jan 2026 = semaine 1)
- Scores sur N semaines glissantes (multiplicateur configurable : 1×6, 2×12, 3×18 semaines)
- Activité tiebreaker (départage à égalité de score, exclue du calcul des points)
- Désactivation d'activités par serveur
- Entrée rétroactive admin (pour n'importe quel membre, n'importe quelle semaine)
- Import Excel batch (wizard upload → preview → done, matching joueur, upsert)
- Suppression globale des activités (admin, avec confirmation)
- **Détection et résolution de conflits de position** : `ActivityService.getConflictsForCurrentUser()` — dérive les conflits depuis le signal existant, sans requête Supabase additionnelle. Interface `PositionConflict` dans `activity.model.ts`. Composant `ActivityConflictComponent` (renommé depuis `ActivityConflictCardComponent`, sélecteur `app-activity-conflict`) dans `src/app/pages/home/components/activity-conflict/`. Quand des conflits existent, la card **remplace** le formulaire (pas d'affichage simultané). Bouton "J'ai compris" → mode édition forcée : formulaire prérempli avec les données de l'activité en conflit, champs `week` et `activityType` désactivés, `position` modifiable. Résolution automatique : retour au mode création quand `conflicts()` devient vide après soumission.

### Server Settings
- Gestion membres (invitations, suppression)
- Règles de points configurables par activité + plage de positions
- Paramètres d'activités (activation, mode participation, tiebreaker, multiplicateur de semaines)
- Discord webhooks : envoi de messages vers channels Discord
- Server tag (3 caractères, affiché dans le header)
- **Lien d'invitation Discord** : admins configurent un lien `discord.gg` ou `discord.com/invite` depuis l'onglet Serveur ; les membres voient un banner dismissible sous le formulaire d'activité

### Banner Discord (membres)
- `DiscordInviteBannerComponent` : banner dismissible (localStorage) affiché si un lien Discord est configuré
- Intégré dans `ActivityInputComponent` via computed signal `discordInviteUrl`

### UI / Design
- Système de thèmes : Light / Dark / Auto / Glass Light / Glass Dark / High Contrast
- Design "Command Post" (header gradient marine, rank gold/silver/bronze)
- Material Design 3, Inter, OnPush, Signals
- Internationalisation : EN, FR, ES, IT, DE, TR, PT, EL, KO, HI, ZH, KU, AR (13 langues)

### Outils (Tools Hub)
- **Gem Calculator** : calculateur de score de gemme sur commander
- **Pack Value Calculator** : évalue la valeur d'un pack en jeu en Apex Coins

### Super Admin
- Dashboard, gestion serveurs, gestion users
- Suppression complète d'un user via RPC `delete_user_complete`
- Gestion serveurs : N+1 supprimé (1 requête avec join `user_profiles` au lieu de 1 + N×2)
- Gestion users : pagination cursor-based 20 par 20 + infinite scroll (`IntersectionObserver`)

### MG Event (Mightiest Governor)

- Tables Supabase : `mg_events`, `server_mg_config`, `mg_registrations`, `mg_selections`
- Migration 26 appliquée en production
- 4 pg_cron jobs : create-events, close-registrations, start-events, end-events
- RLS complet (members SELECT, admins ALL, mg_selections SELECT gated sur `selection_published_at`)
- `MgEventService` : register/unregister, load selection, save/publish, génération auto (calcul client-side)
- **Player-facing** : onglet MG existant (`MightiestGovernorComponent` upgradé en smart) — card dynamique selon statut de l'event
- **Admin** : nouvel onglet "MG Event" dans server-settings — config capacité/mode, liste inscriptions, génération sélection auto (preview + confirm), publication

### Guides

Guides stratégiques partageables : création (jusqu'à 10 par user), upvote anonyme, accès public sans login. Guides de formation avec 3 slots champions configurables (skills, gems, traits, ornement, anneau). Page super admin pour gérer les référentiels (champions, skills, gems, ornements, anneaux, tempéraments).

Pages publiques (`/guides`, `/guides/:slug`) routées via `PublicLayoutComponent` — header présent même sans auth (logo + titre uniquement si non connecté, menu complet si connecté).

### Internationalisation

13 langues : EN, FR, ES, IT, DE, TR, PT, EL, KO, HI, ZH, KU, AR. Fichiers JSON dans `src/assets/i18n/`. Script de vérification des clés inutilisées : `npm run i18n:check`.

### Performance & Optimisations
- `ActivityService.loadActivities()` : filtre côté DB sur les N dernières semaines (`.gte('date', cutoffDate)`) selon le multiplicateur — évite de charger l'historique complet
- `InfiniteScrollDirective` réutilisable (`src/app/shared/directives/infinite-scroll/`) basée sur `IntersectionObserver` natif (zéro dépendance)

---

## 🐛 Corrections Notables

- **Join token invalide** : RLS `servers` bloquait les anon → RPC `validate_invitation_token` SECURITY DEFINER
- **UTC dates** : normalisation timezone dans `date.util.ts` (impact import Excel + activity input)
- **Password rules** : validation regex renforcée (join/signup)
- **Recovery answer** : fix vérification lors du reset
- **Angular 21 upgrade** : CSS tokens Material renommés post-migration
- **Home page** : fusion activité + scores en page unique, suppression dépendances chart.js
- **Multiplicateur semaines (retroactive)** : le sélecteur de semaine s'adapte dynamiquement au multiplicateur (6/12/18 semaines)
- **Auth double requête** : suppression `getSession()` dans `initializeAuth()`, source unique via `onAuthStateChange`
- **GitHub Pages SPA** : 404.html corrigé (save + redirect), index.html restaure l'URL avant bootstrap Angular

---

## ⚙️ Architecture

- Standalone components, Signals, OnPush, Reactive Forms
- Smart/dumb pattern : pages (smart) + components (dumb)
- Lazy loading sur toutes les routes
- Guards : `authGuard`, `adminGuard`, `superAdminGuard`, `guestGuard`

---

## 🚧 Limitations Connues

- Rate limiting account recovery : repose sur RPCs custom, non couvert par le rate limit Supabase Auth natif
- Dialog "Mon Compte" → onglet Préférences : thème et notifications (champs DB existants) pas encore exposés

---

## 📊 Statut

**État actuel :** ✅ Application complète et fonctionnelle en production (GitHub Pages)
