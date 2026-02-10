# État d'Avancement du Développement

**Dernière mise à jour:** 9 février 2026 - 04:45

## 📋 Résumé

Application Angular de gestion d'activités avec backend Supabase et système multi-alliance. Le backend et les services sont complétés avec support **Super Admin** et **authentification par username** (pas d'email requis).

---

## ✅ Complété

### 1. Infrastructure Backend (Supabase)
- Base de données PostgreSQL: `alliances`, `user_profiles`, `activities`, `invitation_tokens`, `activity_point_rules`
- Authentification username + password (email généré en interne: `username@app.tracker`)
- RLS (Row Level Security) configuré avec helper functions SECURITY DEFINER
- Migrations SQL numérotées 01-06 (voir `supabase/MIGRATIONS.md`)

### 2. Services Core
- **SupabaseService** - Client Supabase singleton
- **AuthService** - Auth par username, signup admin/super_admin/member, état réactif (signals)
- **AllianceService** - Gestion invitations multi-usage avec tracking, gestion membres
- **ActivityService** - Mode dual Supabase/localStorage, calcul weekly scores
- **PointRulesService** - Configuration règles de points par position

### 3. Guards & Modèles
- **Guards:** authGuard, adminGuard, superAdminGuard, guestGuard
- **Modèles TypeScript:** Pattern Request/Response par domaine (activity, user, alliance, auth, invitation, point-rules)

### 4. Pages Complétées
- **Authentification:** `/login`, `/signup`, `/join/:token`, `/super-admin-setup`
- **Membre:** `/activity-input`, `/activities-details`
- **Admin:** `/management-dashboard`, `/alliance-settings`
- **Super Admin:** `/super-admin`, `/super-admin/alliances`, `/super-admin/users`
- **Routes:** Toutes configurées avec guards appropriés

### 5. Corrections Effectuées

- ✅ Dark mode: Conversion des couleurs hardcodées vers variables CSS Material Design 3
- ✅ LocalStorage: Fix parsing JSON pour valeurs legacy (plain strings)
- ✅ Translation: Mise à jour `defaultLanguage` → `fallbackLang`
- ✅ TypeScript: Fix exports avec `export type` pour `isolatedModules`
- ✅ **Authentification par username:** Suppression de l'email, génération auto interne
- ✅ **Super Admin:** Ajout du rôle super_admin avec accès global
- ✅ **Navigation active:** Ajout de routerLinkActive pour indicateur visuel de page active
- ✅ **Styles globaux:** Suppression de ::ng-deep, migration vers styles.scss
- ✅ **Fichiers i18n:** Alignement et formatage cohérent des 4 fichiers de langue (en, fr, es, it - 216 lignes chacun)
- ✅ **Activity types:** Mise à jour avec activités de jeu (KvK, Legion, Desolate Desert, Golden Expedition)
- ✅ **Build budgets:** Ajustement des limites de taille (initial: 700kB, component styles: 6kB) pour Angular Material et pages complexes
- ✅ **CI/CD Workflows:** Suppression du workflow dev-checks.yml redondant (tests unifiés dans pr-checks.yml)
- ✅ **Activity Details - Week Labels:** Correction ordre chronologique des semaines (weeks.push() au lieu de unshift())
- ✅ **Activity Details - Chip Layout:** Remplacement mat-chip-row par div custom avec flexbox (évite overflow et warnings Material)
- ✅ **Ranking Chart:** Refactorisation en composant autonome avec injection ActivityService standalone
- ✅ **Join Workflow:** Correction state management - userProfile.set() directement au lieu de loadUserProfile() après signup
- ✅ **Super Admin - User Deletion:** Ajout fonction RPC delete_user_complete() avec SECURITY DEFINER (bypass auth.admin limitations)
- ✅ **Super Admin - RLS Policies:** Correction permissions activities/tokens pour modération multi-alliance (is_super_admin() checks)
- ✅ **Activités Rétroactives - RLS Policies:** Ajout policies permettant aux admins de créer des activités pour les membres de leur alliance et aux super admins pour tous les utilisateurs (migration 07)
- ✅ **ConfirmDialog Component:** Remplacement de tous les confirm() natifs par un composant Material réutilisable avec i18n (4 langues)

---

## ⚙️ Architecture

### Authentification par Username
- Interface utilisateur: **username** uniquement (pas d'email visible)
- Backend: email généré automatiquement `{username}@app.tracker` pour compatibilité Supabase

### Hiérarchie des Rôles
- **super_admin**: Accès global toutes alliances, aucune alliance assignée
- **admin**: Propriétaire d'alliance, gestion membres et invitations
- **member**: Membre d'alliance, accès lecture + activités personnelles

---

## 🔗 Système d'Invitations avec Tracking ✅
- Tokens multi-usage avec tracking d'utilisation
- Vue PostgreSQL `invitation_stats` pour statistiques temps réel
- UI Material: expansion panels avec badges de comptage
- Soft delete (expires_at) sans suppression membres
- Migration: `supabase/03-add-invitation-tracking.sql`

---

## 🔔 Composant ConfirmDialog Réutilisable ✅
- Remplacement de tous les `confirm()` natifs par un dialog Material cohérent
- Composant standalone: `src/app/shared/components/confirm-dialog/`
- i18n complète dans 4 langues (EN, FR, ES, IT)
- Couleurs configurables (primary/warn), icônes dynamiques
- Utilisé dans 5 composants: invitations, point-rules, super-admin users/alliances, dashboard

---

## 🌍 Système de Préférences Linguistiques ✅
- **Persistance DB:** Colonne JSONB `preferences` dans `user_profiles` (migration 08)
- **LanguageService:** Gestion centralisée avec priorité (DB → Browser → Fallback)
- **UI:** Sélecteur de langue intégré dans le menu utilisateur avec drapeaux emoji
- **4 langues:** 🇬🇧 English, 🇫🇷 Français, 🇪🇸 Español, 🇮🇹 Italiano
- **Réactivité:** Pipe `ActivityLabelPipe` pour traduction dynamique des activités
- **Corrections i18n:** Suppression de `translate.instant()` au profit du pipe `translate` pour mise à jour temps réel
- **Architecture extensible:** Structure JSON permet ajout futur de thème, notifications, etc.

---

## 🎯 Système de Points Configurables ✅

### Fonctionnalité
Calcul automatique des points selon la position/classement de l'utilisateur dans l'activité.

**Configuration:**
- Table `activity_point_rules` (règles par alliance + type d'activité + range de positions)
- PointRulesService pour CRUD et calcul points avec fallback
- UI admin pour configurer les règles (tableau + formulaire)
- Champ `position` dans formulaire activité avec preview points temps réel

**Exemple:**
- Position 1 = 50 pts, 2-5 = 30 pts, 6-10 = 15 pts
- Membre saisit position 3 → système calcule automatiquement 30 pts
- Si aucune règle configurée, utilise points par défaut de `constants.ts`

---

## 🔄 Système de Périodicité des Activités ✅

### Vue d'ensemble
Le système utilise un **cycle répétitif de 6 semaines** pour déterminer quelles activités sont disponibles à un moment donné. Le cycle recommence automatiquement après 6 semaines : 1 → 2 → 3 → 4 → 5 → 6 → 1 → 2 → ...

### Configuration du Cycle
- **Date de référence**: Dimanche 25 janvier 2026 = Semaine 1 du cycle
- **Cycle**: 1 → 2 → 3 → 4 → 5 → 6 → 1 → 2 → ... (répète à l'infini)
- **Semaines**: Commencent le dimanche

### Disponibilité des Activités par Semaine du Cycle

| Activité | Semaines du Cycle | Fréquence |
|----------|-------------------|-----------|
| **Golden Expedition** | 1, 3 | 2 fois par cycle |
| **KvK Prep** | 2, 4 | 2 fois par cycle |
| **KvK Cross Border** | 2, 4 | 2 fois par cycle |
| **Desolate Desert** | 5 | 1 fois par cycle |
| **Legion** | 1, 2, 3, 4, 5, 6 | Toujours disponible |

### Fonctionnement

#### Pour les Membres
1. Accèdent à la page **"Activity Input"**
2. Voient uniquement les activités disponibles pour **la semaine actuelle du cycle**
3. Soumettent leur activité avec leur position
4. L'activité est enregistrée avec la date actuelle

#### Pour les Admins (Entrée Rétroactive)
1. Accèdent à **"Alliance Settings"** → Onglet **"Retroactive Activities"**
2. **Sélectionnent un membre** de l'alliance dans la liste déroulante
3. **Sélectionnent la semaine** concernée (6 dernières semaines disponibles)
4. Voient uniquement les activités qui étaient disponibles **cette semaine-là selon le cycle**
5. Entrent la **position** du membre
6. Voient un **aperçu des points** qui seront attribués
7. Soumettent l'activité
8. L'activité est enregistrée **au nom du membre** avec la date de la semaine sélectionnée

**Exemple aujourd'hui (9 février 2026 = Semaine 3 du cycle):**
- **Membre** (Activity Input): Voit Golden Expedition, Legion
- **Admin** (Alliance Settings → Retroactive):
  - Sélectionne "Jean Dupont"
  - Semaine actuelle (cycle semaine 3) → Golden Expedition, Legion
  - Il y a 1 semaine (cycle semaine 2) → KvK Prep, KvK Cross Border, Legion
  - Il y a 2 semaines (cycle semaine 1) → Golden Expedition, Legion
  - Soumet → L'activité apparaît dans les scores de Jean

#### Dashboard
- **Carte "Activités Disponibles"**: Montre les activités soumissibles maintenant
- **Graphique 6 Semaines**: Scores des 6 dernières semaines (basé sur dates réelles)

---

## 🚧 Prochaines Fonctionnalités

### Améliorations Possibles
- Internationalisation étendue (langues supplémentaires)
- Statistiques avancées et graphiques
- Notifications en temps réel
- Export de données (CSV, PDF)
- Mode hors ligne (PWA)
- Thèmes personnalisables par alliance

---

## 📊 Statut du Projet

**État actuel:** ✅ Application complète et fonctionnelle

**Fonctionnalités principales:**
- ✅ Authentification multi-rôles (super_admin, admin, member)
- ✅ Gestion d'alliances et invitations avec tracking
- ✅ Système de points configurables par position
- ✅ Dashboards avec graphiques et statistiques
- ✅ Interface responsive (mobile-first)
- ✅ Internationalisation (EN, FR, ES, IT)

---

## 📝 Notes

### Mode Dual (Supabase + localStorage)
- **Mode Supabase:** Utilisateur authentifié + `environment.enableMockData = false`
- **Mode localStorage:** Développement avec données mockées
- Détection automatique dans ActivityService

### Sécurité RLS
- **Super Admin:** Accès total toutes données
- **Admin:** Accès complet à sa propre alliance
- **Member:** Lecture alliance, écriture activités personnelles

### Architecture
- Standalone components (pas de NgModules)
- Signals pour état réactif
- Material Design 3
- Reactive Forms
- Lazy loading

---

## 🔗 Fichiers Clés

**Backend:**
- `supabase/01-initial-schema.sql` → `06-fix-super-admin-activity-token-permissions.sql`
- `supabase/MIGRATIONS.md` - Guide exécution migrations
- `supabase/README.md` - Configuration complète

**Services:**
- `src/app/core/services/` - supabase, auth, alliance, activity, point-rules

**Guards:**
- `src/app/core/guards/auth.guard.ts` - authGuard, adminGuard, superAdminGuard, guestGuard

**Modèles:**
- `src/app/shared/models/` - activity, user, alliance, auth, invitation, point-rules

**Configuration:**
- `src/environments/environment.ts` - Dev config (⚠️ à compléter)
- `src/environments/environment.production.ts` - Prod config (⚠️ à compléter)
- `src/app/app.routes.ts` - Routes (⚠️ à mettre à jour)
