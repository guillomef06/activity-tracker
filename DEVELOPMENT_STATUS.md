# État d'Avancement du Développement

**Dernière mise à jour:** 18 août 2026

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
- Calendrier d'activités piloté par **Seasons** (voir section dédiée ci-dessous) — remplace l'ancien cycle fixe de 6 semaines
- Scores sur N semaines glissantes (multiplicateur configurable : 1×6, 2×12, 3×18 semaines) — indépendant du calendrier de seasons, non affecté par ce changement
- Activité tiebreaker (départage à égalité de score, exclue du calcul des points)
- Désactivation d'activités par serveur
- Entrée rétroactive admin (pour n'importe quel membre, n'importe quelle semaine)
- Import Excel batch (wizard upload → preview → done, matching joueur, upsert)
- Catalogue d'activités (`APP_CONSTANTS.ACTIVITY_TYPES`, `src/app/shared/constants/constants.ts`) : 9 types dont `behemoth conquest` (points de repli : 8, ajouté migration `32-behemoth-conquest.sql`) — source unique consommée partout (input, rétroactif, import Excel, réglages serveur, wizard seasons), traduit dans les 14 locales. Champ `availableWeeks` retiré de `ActivityType` (dead code post-migration Seasons — n'était plus lu nulle part, hormis un test qui vérifiait juste qu'il était non-vide) ; le planning par semaine est désormais entièrement piloté par `season_activities`
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
- **Seuils par rang configurables par serveur** (data layer + UI complets) : table `server_mg_slot_config` (migration `33-mg-slot-config.sql`, non appliquée en prod — fichier commité, à appliquer manuellement) — un rang/médaille reste fixe (`MG_SLOT_DEFAULTS` dans `src/app/shared/constants/mg-slots.constant.ts`), seuls `cost`/`target_min`/`target_max` sont overridables par serveur, une ligne par `slot_order` (1-10). `MgEventService.loadSlotConfig()`/`saveSlotConfig()` ajoutés. `buildMgSlotRows()` (`src/app/shared/utils/mg-slot.util.ts`) fusionne la config serveur par-dessus les defaults — source unique de merge consommée à la fois par la table player-facing et le formulaire admin.
  - **Player-facing** (`MightiestGovernorComponent`) : ancien `SLOTS_DATA` local supprimé ; `slots` devenu un `computed()` dérivé de `buildMgSlotRows(slotConfig())`, `slotConfig` chargé en parallèle de l'event courant dans `ngOnInit` via `Promise.all`.
  - **Admin** (`MgAdminTabComponent`) : nouvelle section "Slot Cost & Target Configuration" sous la config serveur existante — `FormArray` de 10 lignes (rang/médaille en lecture seule, `cost`/`targetMin`/`targetMax` éditables), `targetRangeValidator` (group-level, erreur si `targetMax < targetMin`), rebuild complet du `FormArray` au chargement (pas de `patchValue`), bouton Save dédié (`isSavingSlotConfig`) appelant `saveSlotConfig()`.
  - i18n : nouvelles clés `mg.admin.slotConfig.*` + `mg.admin.slotConfigSaved`/`slotConfigSaveError` dans `en.json`/`fr.json`/`it.json`/`es.json` (ko/de/etc. non mis à jour, hors périmètre).
  - **Limitation connue** : la migration `33-mg-slot-config.sql` doit être appliquée manuellement en prod avant que `loadSlotConfig`/`saveSlotConfig` ne fonctionnent réellement contre Supabase (table absente sinon → erreurs silencieuses loggées, fallback sur les defaults côté UI).

### Seasons (calendrier d'activités dynamique)

Remplace l'ancien cycle fixe de 6 semaines par des **seasons configurables par un super_admin** (globales, cross-server) : plages de dates contiguës découpées en semaines, chacune déclarant les types d'activité sélectionnables.

- Migration `31-season-schedule.sql` : tables `activity_seasons` / `season_activities`, contraintes DB (lundi obligatoire, pas de chevauchement, contiguïté forcée par trigger, verrouillage dès qu'une activité est loggée dans la plage, `CHECK` sur le catalogue de types)
- `SeasonService` (`src/app/core/services/season.service.ts`) : résolution des types d'activité disponibles par date, suggestion de date de début (contiguïté), verrouillage, CRUD
- Aucune season active → saisie bloquée (input du jour + rétroactif admin), bannière dédiée
- UI Super Admin : `src/app/pages/super-admin/seasons/` — liste (passé/actuel/futur), wizard de création, édition avec verrouillage visuel si activités déjà loggées
- Import Excel : feuille "Reference" adaptée à la season active du jour
- `date.util.ts` : logique de cycle fixe supprimée (`CYCLE_REFERENCE_DATE` et dérivés), conservé `getWeekStart`/`getWeekEnd`/`getDateForWeeksAgo`

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
- **Seasons — revue sécurité migration** : 2 failles Medium + 1 Low identifiées sur `31-season-schedule.sql` (contiguïté cassable hors app, orphelins `season_activities`, `activity_type` sans contrainte catalogue) — corrigées avant merge, migration appliquée
- **Seasons — wizard fond opaque** : `mat-stepper` masquait le glass-effect du `mat-card` englobant — fix CSS scoped (`--mat-stepper-container-color: transparent`)
- **`mat-datepicker` — premier jour de la semaine** : `MAT_DATE_LOCALE` absent forçait tous les calendriers à démarrer un dimanche — fix global via `DateAdapter.setLocale()` synchronisé sur `LanguageService.currentLanguage()`
- **Seasons — "must be a Monday" sur un lundi cliqué** : décalage UTC/local dans `mat-datepicker` (minuit local vs validation UTC) — fix par ré-ancrage à minuit UTC dans `onStartDateChange()`

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
- **Seasons** : triggers SQL non couverts par des tests automatisés (pas de harnais pgTAP), validés par revue manuelle uniquement
- **Seasons** : `SeasonService.updateSeasonStructure()` non transactionnel (3 appels séquentiels, pas de compensation si échec partiel) — risque faible, à durcir via RPC atomique si besoin
- **Seasons** : `CHECK` sur `activity_type` codé en dur — toute évolution du catalogue nécessite une migration de suivi

---

## 📊 Statut

**État actuel :** ✅ Application complète et fonctionnelle en production (GitHub Pages)
