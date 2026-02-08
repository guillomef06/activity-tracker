# État d'Avancement du Développement

**Dernière mise à jour:** 8 février 2026

## 📋 Résumé

Application Angular de gestion d'activités avec backend Supabase et système multi-alliance. Le backend et les services sont complétés avec support **Super Admin** et **authentification par username** (pas d'email requis).

---

## ✅ Complété

### 1. Infrastructure Backend (Supabase)

- **Base de données:** Schema PostgreSQL avec 4 tables
  - `alliances` - Équipes/organisations
  - `user_profiles` - Profils utilisateurs (**super_admin**/admin/member)
  - `activities` - Activités des utilisateurs avec points
  - `invitation_tokens` - Tokens d'invitation sécurisés
- **Authentification:** Username + Password (pas d'email visible pour l'utilisateur)
  - Email généré en interne: `username@app.local` pour la compatibilité Supabase Auth
  - Username stocké dans `user_profiles.username` et `auth.users.user_metadata`
- **Sécurité:** RLS (Row Level Security) configuré sur toutes les tables
  - **Super Admin:** Accès complet à toutes les alliances et utilisateurs
  - **Admin:** Accès à sa propre alliance uniquement
  - **Member:** Accès en lecture à son alliance
- **Fichiers:**
  - `supabase/schema.sql` - Schema complet avec RLS et support super_admin
  - `supabase/activity_types.csv` - Types d'activités
  - `supabase/README.md` - Instructions de configuration

### 2. Configuration

- **Package:** `@supabase/supabase-js` installé
- **Environnements:** Configuration Supabase ajoutée dans:
  - `src/environments/environment.ts`
  - `src/environments/environment.production.ts`
  - ⚠️ **À FAIRE:** Remplacer `YOUR_SUPABASE_URL` et `YOUR_SUPABASE_ANON_KEY` par les vraies valeurs

### 3. Services Core

#### SupabaseService (`src/app/core/services/supabase.service.ts`)
- Singleton pour le client Supabase
- Méthodes: `client`, `auth`, `from()`

#### AuthService (`src/app/core/services/auth.service.ts`)
- **Authentification par username** (pas d'email visible)
- Génération auto d'email interne: `username@app.local`
- Inscription admin (crée utilisateur + alliance)
- Inscription super admin (accès global, pas d'alliance)
- Inscription membre (via token d'invitation)
- Connexion/déconnexion
- État réactif: `currentUser`, `userProfile`, `isAuthenticated`, `isAdmin`, `isSuperAdmin`
- Méthodes:
  - `signUpAdmin(AdminSignUpRequest)` - Crée admin + alliance
  - `signUpSuperAdmin(username, password, displayName)` - Crée super admin
  - `signUpMember(MemberSignUpRequest)` - Rejoint via invitation
  - `signIn(SignInRequest)` - Username + password
  - `signOut()`

#### AllianceService (`src/app/core/services/alliance.service.ts`)
- Gestion des invitations
- Gestion des membres
- Méthodes:
  - `createInvitation(days)` → CreateInvitationResponse
  - `validateInvitation(token)` → ValidateInvitationResponse
  - `loadAlliance()`, `loadMembers()`, `loadInvitations()`
  - `revokeInvitation(id)`, `updateAllianceName(name)`

#### ActivityService (`src/app/core/services/activity.service.ts`)
- **Mode dual:** Supabase (prod) + localStorage (dev)
- Détection automatique du mode selon `environment.enableMockData` et authentification
- Méthodes:
  - `initialize()` - Charge les données
  - `addActivity(ActivityRequest)` - Async
  - `getActivities()`, `getUserScores()`

### 4. Guards

Fichier: `src/app/core/guards/auth.guard.ts`
- `authGuard` - Protège les routes authentifiées
- `adminGuard` - Réservé aux admins et super_admins
- `superAdminGuard` - Réservé aux super_admins uniquement
- `guestGuard` - Réservé aux non-authentifiés (login/signup)

### 5. Modèles TypeScript

Réorganisés par domaine avec pattern Request/Response:

- **activity.model.ts:** Activity, ActivityRequest, ActivityResponse, ActivityWithUser, WeeklyScore, UserScore
- **user.model.ts:** UserProfile (avec username, role: super_admin|admin|member), CreateUserProfileRequest, UpdateUserProfileRequest
- **alliance.model.ts:** Alliance, CreateAllianceRequest, UpdateAllianceRequest, AllianceWithStats
- **auth.model.ts:** AdminSignUpRequest (username, pas email), MemberSignUpRequest, SignInRequest (username, pas email), AuthResponse
- **invitation.model.ts:** InvitationToken, CreateInvitationRequest/Response, ValidateInvitationRequest/Response, InvitationWithAlliance
- **index.ts:** Barrel file avec `export type` pour TypeScript

### 6. Corrections Effectuées

- ✅ Dark mode: Conversion des couleurs hardcodées vers variables CSS Material Design 3
- ✅ LocalStorage: Fix parsing JSON pour valeurs legacy (plain strings)
- ✅ Translation: Mise à jour `defaultLanguage` → `fallbackLang`
- ✅ TypeScript: Fix exports avec `export type` pour `isolatedModules`
- ✅ **Authentification par username:** Suppression de l'email, génération auto interne
- ✅ **Super Admin:** Ajout du rôle super_admin avec accès global

---

## ⚙️ Architecture d'Authentification

### Système Username (Sans Email Visible)

**Fonctionnement:**
1. L'utilisateur saisit un **username** (pas d'email)
2. Le système génère un email interne: `{username}@app.local`
3. Supabase Auth utilise cet email en backend
4. L'utilisateur ne voit/utilise **que le username**

**Avantages:**
- Interface simplifiée (pas de validation email complexe)
- Compatibilité avec Supabase Auth (requiert un email)
- Username stocké dans `user_profiles.username` et `auth.users.user_metadata.username`

### Hiérarchie des Rôles

1. **Super Admin** (`super_admin`):
   - Accès global à toutes les alliances
   - Peut gérer tous les utilisateurs
   - N'appartient à aucune alliance (alliance_id = NULL)
   - Créé via `authService.signUpSuperAdmin()`
   - Protégé par `superAdminGuard`

2. **Admin** (`admin`):
   - Propriétaire d'une alliance
   - Peut gérer les membres de son alliance
   - Peut créer des invitations
   - Créé via signup classique ou promotion par super_admin
   - Protégé par `adminGuard`

3. **Member** (`member`):
   - Membre d'une alliance
   - Accès lecture seule aux données de l'alliance
   - Peut ajouter ses propres activités
   - Créé via invitation token

---

## 🚧 En Cours / À Faire

### Phase 1: Pages d'Authentification (PRIORITAIRE)

#### 1.1 Page Signup Admin (`/signup`)
- Créer `src/app/pages/signup/`
  - `signup.page.ts`
  - `signup.page.html`
  - `signup.page.scss`
- Formulaire:
  - **Username** (pas d'email)
  - Password, confirm password
  - Display name
  - Alliance name
- Utiliser Material components (`mat-form-field`, `mat-input`, etc.)
- Validation: username unique, password strength, passwords match
- Appeler `authService.signUpAdmin()`
- Redirection vers dashboard après succès

#### 1.2 Page Login (`/login`)
- Créer `src/app/pages/login/`
  - `login.page.ts`
  - `login.page.html`
  - `login.page.scss`
- Formulaire: **username**, password (pas d'email)
- Lien vers `/signup`
- Appeler `authService.signIn()`
- Redirection vers dashboard après succès

#### 1.3 Page Join (`/join/:token`)
- Créer `src/app/pages/join/`
  - `join.page.ts`
  - `join.page.html`
  - `join.page.scss`
- Valider le token au chargement via `allianceService.validateInvitation()`
- Afficher le nom de l'alliance
- Formulaire: **username**, password, confirm password, display name (pas d'email)
- Appeler `authService.signUpMember()`
- Redirection vers dashboard après succès

### Phase 2: Gestion de l'Alliance

#### 2.1 Page Alliance Settings (`/alliance-settings`)
- Créer `src/app/pages/alliance-settings/`
- Sections:
  - Modifier le nom de l'alliance
  - Liste des membres
  - Gestion des invitations (créer, révoquer, copier lien)
- Protégé par `adminGuard`

### Phase 2.5: Administration Globale (Super Admin)

#### 2.5.1 Page Super Admin Dashboard (`/super-admin`)
- Créer `src/app/pages/super-admin-dashboard/`
- Vue d'ensemble:
  - Nombre total d'alliances
  - Nombre total d'utilisateurs
  - Statistiques globales
- Protégé par `superAdminGuard`

#### 2.5.2 Page Gestion Alliances (`/super-admin/alliances`)
- Liste de toutes les alliances
- Actions:
  - Voir les détails d'une alliance
  - Modifier le nom
  - Supprimer une alliance
  - Voir les membres
- Protégé par `superAdminGuard`

#### 2.5.3 Page Gestion Utilisateurs (`/super-admin/users`)
- Liste de tous les utilisateurs (toutes alliances)
- Filtres: par alliance, par rôle
- Actions:
  - Promouvoir member → admin
  - Rétrograder admin → member
  - Supprimer un utilisateur
  - Réassigner à une autre alliance
- Protégé par `superAdminGuard`

#### 2.5.4 Création du Premier Super Admin
- Script ou page dédiée `/super-admin-setup` (accessible une seule fois)
- Formulaire simple: username, password, display name
- Appeler `authService.signUpSuperAdmin()`
- Désactiver la route après la première utilisation

### Phase 3: Mise à Jour des Routes

Fichier: `src/app/app.routes.ts`

```typescript
export const routes: Routes = [
  // Routes publiques (guestGuard)
  { 
    path: 'signup', 
    loadComponent: () => import('./pages/signup/signup.page').then(m => m.SignupPage),
    canActivate: [guestGuard]
  },
  { 
    path: 'login', 
    loadComponent: () => import('./pages/login/login.page').then(m => m.LoginPage),
    canActivate: [guestGuard]
  },
  { 
    path: 'join/:token', 
    loadComponent: () => import('./pages/join/join.page').then(m => m.JoinPage),
    canActivate: [guestGuard]
  },
  
  // Route setup super admin (à protéger après première utilisation)
  {
    path: 'super-admin-setup',
    loadComponent: () => import('./pages/super-admin-setup/super-admin-setup.page').then(m => m.SuperAdminSetupPage)
  },
  
  // Routes authentifiées (authGuard)
  {
    path: '',
    canActivate: [authGuard],
    children: [
      { path: '', redirectTo: 'activity-input', pathMatch: 'full' },
      { 
        path: 'activity-input', 
        loadComponent: () => import('./pages/activity-input/activity-input.page').then(m => m.ActivityInputPage)
      },
      { 
        path: 'dashboard', 
        loadComponent: () => import('./pages/management-dashboard/management-dashboard.page').then(m => m.ManagementDashboardPage)
      },
      { 
        path: 'activities-details', 
        loadComponent: () => import('./pages/activities-details/activities-details.page').then(m => m.ActivitiesDetailsPage)
      },
      
      // Routes admin (adminGuard)
      { 
        path: 'alliance-settings', 
        loadComponent: () => import('./pages/alliance-settings/alliance-settings.page').then(m => m.AllianceSettingsPage),
        canActivate: [adminGuard]
      },
      
      // Routes super admin (superAdminGuard)
      {
        path: 'super-admin',
        canActivate: [superAdminGuard],
        children: [
          { 
            path: '', 
            loadComponent: () => import('./pages/super-admin-dashboard/super-admin-dashboard.page').then(m => m.SuperAdminDashboardPage)
          },
          { 
            path: 'alliances', 
            loadComponent: () => import('./pages/super-admin-alliances/super-admin-alliances.page').then(m => m.SuperAdminAlliancesPage)
          },
          { 
            path: 'users', 
            loadComponent: () => import('./pages/super-admin-users/super-admin-users.page').then(m => m.SuperAdminUsersPage)
          }
        ]
      }
    ]
  }
];
```

### Phase 4: Mise à Jour du Header

Fichier: `src/app/core/layout/app-header/app-header.component.ts`

- Afficher le **username** (pas email)
- Afficher le nom de l'alliance (ou "Super Admin" si super_admin)
- Bouton de déconnexion
- Lien vers alliance-settings (si admin)
- Lien vers super-admin (si super_admin)
- Utiliser `authService.userProfile()`, `authService.isAdmin()`, `authService.isSuperAdmin()`

### Phase 5: Traductions

Ajouter les clés dans `src/assets/i18n/*.json`:

```json
{
  "auth": {
    "signup": "Sign Up",
    "login": "Login",
    "logout": "Logout",
    "username": "Username",
    "displayName": "Display Name",
    "password": "Password",
    "confirmPassword": "Confirm Password",
    "allianceName": "Alliance Name",
    "createAccount": "Create Account",
    "alreadyHaveAccount": "Already have an account?",
    "dontHaveAccount": "Don't have an account?",
    "joinAlliance": "Join Alliance",
    "invalidToken": "Invalid or expired invitation",
    "errors": {
      "usernameRequired": "Username is required",
      "usernameTaken": "Username already taken",
      "displayNameRequired": "Display name is required",
      "passwordRequired": "Password is required",
      "passwordTooShort": "Password must be at least 8 characters",
      "passwordMismatch": "Passwords don't match",
      "allianceNameRequired": "Alliance name is required"
    }
  },
  "alliance": {
    "settings": "Alliance Settings",
    "members": "Members",
    "invitations": "Invitations",
    "createInvitation": "Create Invitation",
    "copyLink": "Copy Link",
    "revoke": "Revoke",
    "admin": "Admin",
    "member": "Member",
    "superAdmin": "Super Admin",
    "expiresAt": "Expires at",
    "updateName": "Update Alliance Name"
  },
  "superAdmin": {
    "dashboard": "Super Admin Dashboard",
    "alliances": "Manage Alliances",
    "users": "Manage Users",
    "totalAlliances": "Total Alliances",
    "totalUsers": "Total Users",
    "createSuperAdmin": "Create Super Admin",
    "promoteToAdmin": "Promote to Admin",
    "demoteToMember": "Demote to Member",
    "deleteUser": "Delete User",
    "deleteAlliance": "Delete Alliance",
    "reassignUser": "Reassign to Alliance"
  }
}
```

---

## 🔧 Configuration Requise (Actions Utilisateur)

### 1. Configuration Supabase

1. Aller sur [Supabase Dashboard](https://supabase.com/dashboard)
2. Aller dans SQL Editor
3. Exécuter le contenu de `supabase/schema.sql`
4. Vérifier que les 4 tables sont créées

### 2. Obtenir les Credentials Supabase

1. Project Settings → API
2. Copier:
   - **Project URL**
   - **anon key**
3. Mettre à jour dans:
   - `src/environments/environment.ts`
   - `src/environments/environment.production.ts`

### 3. Activer l'Authentification Email

1. Authentication → Providers
2. Activer **Email**
3. Configurer les templates email (optionnel)

---

## 📝 Notes Importantes

### Mode Dual (Supabase + localStorage)

L'application fonctionne en 2 modes:
- **Mode Supabase:** Utilisé quand l'utilisateur est authentifié ET `environment.enableMockData = false`
- **Mode localStorage:** Utilisé pour le développement avec données mockées

Le `ActivityService` détecte automatiquement le mode approprié.

### Sécurité Row Level Security (RLS)

Toutes les tables ont des policies RLS:
- **Super Admin:** Accès total à toutes les données (toutes alliances)
- **Admin:** Accès complet à sa propre alliance
- **Member:** Accès lecture à son alliance, écriture pour ses propres activités
- Les tokens d'invitation expirent après X jours (configurable)

### Architecture des Composants

- **Standalone components** (pas de NgModules)
- **Signals** pour l'état réactif
- **Material Design 3** pour tous les composants UI
- **Reactive Forms** pour les formulaires
- **Lazy loading** pour toutes les routes

### Pattern Request/Response

Les modèles suivent le pattern:
- `*Request` - Données envoyées au backend
- `*Response` - Données reçues du backend
- Interfaces principales pour l'état de l'app

---

## 🚀 Prochaines Étapes (Ordre Recommandé)

1. **Configurer Supabase** (5 min)
   - Exécuter schema.sql
   - Copier les credentials dans environment files

2. **Créer le premier Super Admin** (10 min)
   - Créer page `/super-admin-setup`
   - Formulaire: username, password, display name
   - Appeler `authService.signUpSuperAdmin()`
   - Protéger la route après première utilisation

3. **Créer page Signup** (30-45 min)
   - Formulaire: **username**, password, display name, alliance name
   - Validation username unique
   - Connecter avec authService.signUpAdmin()

4. **Créer page Login** (20-30 min)
   - Formulaire: **username**, password (pas d'email)
   - Connecter avec authService.signIn()

5. **Créer page Join** (30-40 min)
   - Valider le token
   - Formulaire: **username**, password, display name

6. **Mettre à jour les routes** (10 min)
   - Ajouter routes super-admin avec superAdminGuard
   - Routes auth/alliance avec guards

7. **Mettre à jour le header** (20 min)
   - Afficher **username** (pas email)
   - Badge "Super Admin" si applicable
   - Liens vers super-admin si super_admin

8. **Ajouter les traductions** (15 min)
   - Clés auth (username, pas email)
   - Clés superAdmin

9. **Créer pages Super Admin** (2-3h)
   - Dashboard avec stats globales
   - Gestion alliances
   - Gestion utilisateurs

10. **Créer page Alliance Settings** (45-60 min)
    - Gestion invitations
    - Liste membres

11. **Tests end-to-end** (45 min)
    - Super admin setup
    - Signup admin → Login → Activity
    - Create Invitation → Join member
    - Super admin access à toutes les alliances

---

## 📦 Dépendances

### Installées
- `@angular/core` v19.0.0
- `@angular/material` v18.x
- `@supabase/supabase-js` v2.x
- `@ngx-translate/core`

### Aucune Installation Requise
Toutes les dépendances nécessaires sont déjà installées.

---

## ⚠️ Points d'Attention

1. **Environnement:** Ne pas commiter les vraies clés Supabase dans Git
2. **RLS:** Toujours tester les policies RLS avant la mise en prod
3. **Super Admin:** Sécuriser la route `/super-admin-setup` après création du premier super admin
4. **Username:** Validation côté client ET serveur pour unicité
5. **Email interne:** Ne jamais exposer l'email généré (`username@app.local`) à l'utilisateur
6. **Mobile-first:** Tous les nouveaux composants doivent être responsive
7. **Material:** Toujours utiliser les composants Material quand disponibles
8. **Formulaires:** Toujours wrapper les inputs dans `<mat-form-field>`

---

## 🔗 Fichiers Clés

### Backend
- `supabase/schema.sql` - Schema complet BDD
- `supabase/README.md` - Instructions configuration

### Services
- `src/app/core/services/supabase.service.ts` - Client Supabase
- `src/app/core/services/auth.service.ts` - Authentification
- `src/app/core/services/alliance.service.ts` - Gestion alliance
- `src/app/core/services/activity.service.ts` - Activités (dual-mode)

### Guards
- `src/app/core/guards/auth.guard.ts` - authGuard, adminGuard, superAdminGuard, guestGuard

### Modèles
- `src/app/shared/models/` - Tous les modèles TypeScript par domaine

### Configuration
- `src/environments/environment.ts` - Config dev (⚠️ à compléter)
- `src/environments/environment.production.ts` - Config prod (⚠️ à compléter)
- `src/app/app.routes.ts` - Routes (⚠️ à mettre à jour)

---

**Pour reprendre:** Lire ce fichier, configurer Supabase, puis créer les pages d'authentification dans l'ordre recommandé ci-dessus.
