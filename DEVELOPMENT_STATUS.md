# État d'Avancement du Développement

**Dernière mise à jour:** 8 février 2026

## 📋 Résumé

Application Angular de gestion d'activités avec backend Supabase et système multi-alliance. Le backend et les services sont complétés, les pages d'authentification restent à créer.

---

## ✅ Complété

### 1. Infrastructure Backend (Supabase)

- **Base de données:** Schema PostgreSQL avec 4 tables
  - `alliances` - Équipes/organisations
  - `user_profiles` - Profils utilisateurs (admin/member)
  - `activities` - Activités des utilisateurs avec points
  - `invitation_tokens` - Tokens d'invitation sécurisés
- **Sécurité:** RLS (Row Level Security) configuré sur toutes les tables
- **Fichiers:**
  - `supabase/schema.sql` - Schema complet avec RLS
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
- Inscription admin (crée utilisateur + alliance)
- Inscription membre (via token d'invitation)
- Connexion/déconnexion
- État réactif: `currentUser`, `userProfile`, `isAuthenticated`, `isAdmin`
- Méthodes:
  - `signUpAdmin(AdminSignUpRequest)`
  - `signUpMember(MemberSignUpRequest)`
  - `signIn(SignInRequest)`
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
- `adminGuard` - Réservé aux admins
- `guestGuard` - Réservé aux non-authentifiés (login/signup)

### 5. Modèles TypeScript

Réorganisés par domaine avec pattern Request/Response:

- **activity.model.ts:** Activity, ActivityRequest, ActivityResponse, ActivityWithUser, WeeklyScore, UserScore
- **user.model.ts:** User, UserProfile, CreateUserProfileRequest, UpdateUserProfileRequest
- **alliance.model.ts:** Alliance, CreateAllianceRequest, UpdateAllianceRequest, AllianceWithStats
- **auth.model.ts:** AdminSignUpRequest, MemberSignUpRequest, SignInRequest, AuthResponse, AuthErrorResponse
- **invitation.model.ts:** InvitationToken, CreateInvitationRequest/Response, ValidateInvitationRequest/Response, InvitationWithAlliance
- **index.ts:** Barrel file avec `export type` pour TypeScript

### 6. Corrections Effectuées

- ✅ Dark mode: Conversion des couleurs hardcodées vers variables CSS Material Design 3
- ✅ LocalStorage: Fix parsing JSON pour valeurs legacy (plain strings)
- ✅ Translation: Mise à jour `defaultLanguage` → `fallbackLang`
- ✅ TypeScript: Fix exports avec `export type` pour `isolatedModules`

---

## 🚧 En Cours / À Faire

### Phase 1: Pages d'Authentification (PRIORITAIRE)

#### 1.1 Page Signup Admin (`/signup`)
- Créer `src/app/pages/signup/`
  - `signup.page.ts`
  - `signup.page.html`
  - `signup.page.scss`
- Formulaire:
  - Email, password, confirm password
  - Alliance name
  - Username
- Utiliser Material components (`mat-form-field`, `mat-input`, etc.)
- Validation: email format, password strength, passwords match
- Appeler `authService.signUpAdmin()`
- Redirection vers dashboard après succès

#### 1.2 Page Login (`/login`)
- Créer `src/app/pages/login/`
  - `login.page.ts`
  - `login.page.html`
  - `login.page.scss`
- Formulaire: email, password
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
- Formulaire: email, password, confirm password, username
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
      }
    ]
  }
];
```

### Phase 4: Mise à Jour du Header

Fichier: `src/app/core/layout/app-header/app-header.component.ts`

- Afficher le nom de l'utilisateur
- Afficher le nom de l'alliance
- Bouton de déconnexion
- Lien vers alliance-settings (si admin)
- Utiliser `authService.currentUser()`, `authService.userProfile()`, `authService.isAdmin()`

### Phase 5: Traductions

Ajouter les clés dans `src/assets/i18n/*.json`:

```json
{
  "auth": {
    "signup": "Sign Up",
    "login": "Login",
    "logout": "Logout",
    "email": "Email",
    "password": "Password",
    "confirmPassword": "Confirm Password",
    "username": "Username",
    "allianceName": "Alliance Name",
    "createAccount": "Create Account",
    "alreadyHaveAccount": "Already have an account?",
    "dontHaveAccount": "Don't have an account?",
    "joinAlliance": "Join Alliance",
    "invalidToken": "Invalid or expired invitation",
    "errors": {
      "emailRequired": "Email is required",
      "emailInvalid": "Invalid email format",
      "passwordRequired": "Password is required",
      "passwordMismatch": "Passwords don't match",
      "usernameRequired": "Username is required",
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
    "expiresAt": "Expires at",
    "updateName": "Update Alliance Name"
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
- Les utilisateurs ne voient QUE les données de leur alliance
- Les admins peuvent créer des invitations
- Les tokens expirent après X jours (configurable)

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

2. **Créer page Signup** (30-45 min)
   - Créer les fichiers
   - Implémenter le formulaire avec Material
   - Ajouter validations
   - Connecter avec authService

3. **Créer page Login** (20-30 min)
   - Même structure que Signup
   - Plus simple (email/password seulement)

4. **Créer page Join** (30-40 min)
   - Valider le token
   - Afficher l'alliance
   - Formulaire d'inscription

5. **Mettre à jour les routes** (10 min)
   - Ajouter les guards
   - Configurer lazy loading

6. **Mettre à jour le header** (20 min)
   - Afficher user/alliance
   - Bouton logout
   - Lien settings (admin)

7. **Ajouter les traductions** (10 min)
   - Clés auth et alliance dans les 4 langues

8. **Créer page Alliance Settings** (45-60 min)
   - Gestion invitations
   - Liste membres
   - Modifier nom alliance

9. **Tests end-to-end** (30 min)
   - Signup → Login → Add Activity → Dashboard
   - Create Invitation → Join → Verify access

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
3. **Validation:** Valider côté client ET serveur (Supabase functions si besoin)
4. **Mobile-first:** Tous les nouveaux composants doivent être responsive
5. **Material:** Toujours utiliser les composants Material quand disponibles
6. **Formulaires:** Toujours wrapper les inputs dans `<mat-form-field>`

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
- `src/app/core/guards/auth.guard.ts` - authGuard, adminGuard, guestGuard

### Modèles
- `src/app/shared/models/` - Tous les modèles TypeScript par domaine

### Configuration
- `src/environments/environment.ts` - Config dev (⚠️ à compléter)
- `src/environments/environment.production.ts` - Config prod (⚠️ à compléter)
- `src/app/app.routes.ts` - Routes (⚠️ à mettre à jour)

---

**Pour reprendre:** Lire ce fichier, configurer Supabase, puis créer les pages d'authentification dans l'ordre recommandé ci-dessus.
