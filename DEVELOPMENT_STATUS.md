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
  - Email généré en interne: `username@app.tracker` pour la compatibilité Supabase Auth
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
- Génération auto d'email interne: `username@app.tracker`
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
2. Le système génère un email interne: `{username}@app.tracker`
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

## 🎯 Système de Points Configurables (NOUVEAU - À IMPLÉMENTER)

### Besoin Fonctionnel

**Actuellement :**
- Les points sont **fixes** dans `constants.ts` (ex: Development = 15 pts)
- L'utilisateur saisit juste le type d'activité

**Besoin :**
- L'utilisateur saisit sa **position/classement** (ex: "1" = 1ère place, "5" = 5ème)
- L'**admin configure les règles** de points pour chaque alliance
- Les **points sont calculés automatiquement** selon la position saisie

**Exemples de règles configurables par l'admin :**
```
Development:
  - Position 1       → 50 points
  - Positions 2-5    → 30 points
  - Positions 6-10   → 20 points
  - Positions 11+    → 10 points

Code Review:
  - Position 1       → 40 points
  - Positions 2-3    → 25 points
  - Positions 4-10   → 15 points
```

### Changements Nécessaires

#### 1. Base de Données - Nouvelle table

```sql
-- Table pour les règles de points configurables par alliance
CREATE TABLE IF NOT EXISTS activity_point_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  alliance_id UUID REFERENCES alliances(id) ON DELETE CASCADE,
  activity_type TEXT NOT NULL,
  position_min INTEGER NOT NULL CHECK (position_min > 0),
  position_max INTEGER NOT NULL,
  points INTEGER NOT NULL CHECK (points >= 0),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT valid_position_range CHECK (position_min <= position_max)
);

-- Index pour performance
CREATE INDEX IF NOT EXISTS idx_point_rules_alliance_type 
  ON activity_point_rules(alliance_id, activity_type);

-- Ajouter position à activities
ALTER TABLE activities ADD COLUMN position INTEGER CHECK (position > 0);

-- Index pour les queries
CREATE INDEX IF NOT EXISTS idx_activities_position 
  ON activities(position);

-- RLS Policies pour activity_point_rules
ALTER TABLE activity_point_rules ENABLE ROW LEVEL SECURITY;

-- Users can view rules in their alliance (super_admin can view all)
CREATE POLICY "Users can view their alliance point rules"
  ON activity_point_rules FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role = 'super_admin'
    )
    OR
    alliance_id IN (
      SELECT alliance_id FROM user_profiles WHERE id = auth.uid()
    )
  );

-- Admins can manage rules for their alliance (super_admin can manage all)
CREATE POLICY "Admins can manage their alliance point rules"
  ON activity_point_rules FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role = 'super_admin'
    )
    OR
    alliance_id IN (
      SELECT alliance_id FROM user_profiles 
      WHERE id = auth.uid() AND role IN ('admin', 'super_admin')
    )
  );

-- Trigger pour updated_at
CREATE TRIGGER update_point_rules_updated_at
  BEFORE UPDATE ON activity_point_rules
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
```

#### 2. Modifier Modèles TypeScript

**Fichier: `src/app/shared/models/activity.model.ts`**
```typescript
// Modifier Activity pour ajouter position
export interface Activity {
  id: string;
  userId: string;
  userName: string;
  activityType: string;
  position: number;        // NOUVEAU : position saisie (1, 5, 10, etc.)
  points: number;          // Calculé selon les règles
  date: Date;
  timestamp: number;
}

// Modifier ActivityRequest
export interface ActivityRequest {
  activityType: string;
  position: number;        // NOUVEAU : l'utilisateur saisit sa position
  date: Date;
  // points sera calculé côté serveur
}

// Modifier ActivityResponse
export interface ActivityResponse {
  id: string;
  user_id: string;
  activity_type: string;
  position: number;        // NOUVEAU
  points: number;
  date: string;
  created_at: string;
  updated_at: string;
}
```

**Nouveau fichier: `src/app/shared/models/activity-point-rule.model.ts`**
```typescript
/**
 * Activity Point Rule Models
 * Règles de calcul des points basées sur la position
 */

export interface ActivityPointRule {
  id: string;
  alliance_id: string;
  activity_type: string;
  position_min: number;
  position_max: number;
  points: number;
  created_at: string;
  updated_at: string;
}

export interface CreatePointRuleRequest {
  activity_type: string;
  position_min: number;
  position_max: number;
  points: number;
}

export interface UpdatePointRuleRequest {
  position_min?: number;
  position_max?: number;
  points?: number;
}

export interface PointCalculationResult {
  points: number;
  matchedRule?: ActivityPointRule;
  usedFallback: boolean; // true si on utilise les points par défaut
}
```

**Mettre à jour: `src/app/shared/models/index.ts`**
```typescript
// Ajouter les exports
export type {
  ActivityPointRule,
  CreatePointRuleRequest,
  UpdatePointRuleRequest,
  PointCalculationResult
} from './activity-point-rule.model';
```

#### 3. Nouveau Service - PointRulesService

**Fichier: `src/app/core/services/point-rules.service.ts`**
```typescript
import { Injectable, inject, signal } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { AuthService } from './auth.service';
import { 
  ActivityPointRule, 
  CreatePointRuleRequest,
  UpdatePointRuleRequest,
  PointCalculationResult 
} from '../../shared/models';
import { getActivityTypePoints } from '../../shared/constants/constants';

@Injectable({
  providedIn: 'root'
})
export class PointRulesService {
  private supabase = inject(SupabaseService);
  private authService = inject(AuthService);
  
  // Cache des règles
  private rulesSignal = signal<ActivityPointRule[]>([]);
  readonly rules = this.rulesSignal.asReadonly();

  /**
   * Charger toutes les règles de l'alliance courante
   */
  async loadRules(): Promise<{ error: Error | null }> {
    const allianceId = this.authService.getAllianceId();
    if (!allianceId) return { error: new Error('No alliance ID') };

    const { data, error } = await this.supabase
      .from('activity_point_rules')
      .select('*')
      .eq('alliance_id', allianceId)
      .order('activity_type', { ascending: true })
      .order('position_min', { ascending: true });

    if (error) return { error };
    
    this.rulesSignal.set(data || []);
    return { error: null };
  }

  /**
   * Créer une nouvelle règle (admin seulement)
   */
  async createRule(rule: CreatePointRuleRequest): Promise<{ error: Error | null }> {
    const allianceId = this.authService.getAllianceId();
    if (!allianceId) return { error: new Error('No alliance ID') };

    // Validation chevauchement
    const validation = this.validateNoOverlap(rule, this.rulesSignal());
    if (!validation.valid) {
      return { error: new Error(`Chevauchement avec règle existante: ${validation.conflictingRule?.activity_type} positions ${validation.conflictingRule?.position_min}-${validation.conflictingRule?.position_max}`) };
    }

    const { error } = await this.supabase
      .from('activity_point_rules')
      .insert({
        alliance_id: allianceId,
        ...rule
      });

    if (!error) {
      await this.loadRules(); // Recharger les règles
    }

    return { error };
  }

  /**
   * Mettre à jour une règle existante
   */
  async updateRule(id: string, updates: UpdatePointRuleRequest): Promise<{ error: Error | null }> {
    const { error } = await this.supabase
      .from('activity_point_rules')
      .update(updates)
      .eq('id', id);

    if (!error) {
      await this.loadRules();
    }

    return { error };
  }

  /**
   * Supprimer une règle
   */
  async deleteRule(id: string): Promise<{ error: Error | null }> {
    const { error } = await this.supabase
      .from('activity_point_rules')
      .delete()
      .eq('id', id);

    if (!error) {
      await this.loadRules();
    }

    return { error };
  }

  /**
   * Calculer les points pour une activité selon la position
   */
  calculatePoints(activityType: string, position: number): PointCalculationResult {
    // Chercher une règle qui match
    const matchedRule = this.rulesSignal().find(
      rule => rule.activity_type === activityType &&
              position >= rule.position_min &&
              position <= rule.position_max
    );

    if (matchedRule) {
      return {
        points: matchedRule.points,
        matchedRule,
        usedFallback: false
      };
    }

    // Fallback: utiliser les points fixes de constants.ts
    const fallbackPoints = getActivityTypePoints(activityType);
    return {
      points: fallbackPoints,
      usedFallback: true
    };
  }

  /**
   * Valider qu'il n'y a pas de chevauchement de règles
   */
  validateNoOverlap(
    newRule: CreatePointRuleRequest, 
    existingRules: ActivityPointRule[]
  ): { valid: boolean; conflictingRule?: ActivityPointRule } {
    const conflictingRule = existingRules.find(
      rule => rule.activity_type === newRule.activity_type &&
              !(newRule.position_max < rule.position_min || 
                newRule.position_min > rule.position_max)
    );

    return {
      valid: !conflictingRule,
      conflictingRule
    };
  }
}
```

**Mettre à jour: `src/app/core/services/index.ts`**
```typescript
export { PointRulesService } from './point-rules.service';
```

#### 4. Modifier ActivityService

**Fichier: `src/app/core/services/activity.service.ts`**
```typescript
// Ajouter injection
private pointRulesService = inject(PointRulesService);

// Modifier addActivity
async addActivity(request: ActivityRequest): Promise<{ error: Error | null }> {
  try {
    const userId = this.authService.getUserId();
    if (!userId) return { error: new Error('Not authenticated') };

    // Calculer les points selon la position
    const pointsResult = this.pointRulesService.calculatePoints(
      request.activityType,
      request.position
    );

    // Mode Supabase
    if (this.authService.isAuthenticated() && !this.environment.enableMockData) {
      const { error } = await this.supabase
        .from('activities')
        .insert({
          user_id: userId,
          activity_type: request.activityType,
          position: request.position,
          points: pointsResult.points,
          date: request.date.toISOString()
        });

      if (error) return { error };
      await this.initialize();
      return { error: null };
    }

    // Mode localStorage (dev)
    const activity: Activity = {
      id: this.generateId(),
      userId,
      userName: this.authService.userProfile()?.display_name || 'User',
      activityType: request.activityType,
      position: request.position,
      points: pointsResult.points,
      date: request.date,
      timestamp: request.date.getTime()
    };

    this.activitiesSignal.update(activities => [...activities, activity]);
    this.saveToStorage();
    return { error: null };
  } catch (error) {
    return { error: error as Error };
  }
}
```

#### 5. Modifier UI

**A. Page Activity Input**

**Fichier: `src/app/pages/activity-input/activity-input.page.ts`**
```typescript
// Ajouter au FormGroup
this.activityForm = this.fb.group({
  activityType: ['', Validators.required],
  position: [1, [Validators.required, Validators.min(1), Validators.max(100)]], // NOUVEAU
  date: [new Date(), Validators.required]
});

// Ajouter signal pour points calculés
calculatedPoints = signal<PointCalculationResult | null>(null);

// Écouter les changements pour calculer les points en temps réel
ngOnInit() {
  combineLatest([
    this.activityForm.get('activityType')!.valueChanges,
    this.activityForm.get('position')!.valueChanges
  ]).pipe(
    debounceTime(300),
    filter(([type, position]) => !!type && !!position)
  ).subscribe(([type, position]) => {
    const result = this.pointRulesService.calculatePoints(type, position);
    this.calculatedPoints.set(result);
  });
}
```

**Fichier: `src/app/pages/activity-input/activity-input.page.html`**
```html
<!-- Ajouter après le select d'activité -->
<mat-form-field appearance="outline" class="full-width">
  <mat-label>{{ 'activityInput.position' | translate }}</mat-label>
  <input matInput type="number" formControlName="position" 
         min="1" max="100" placeholder="Ex: 1, 5, 10...">
  <mat-hint>{{ 'activityInput.positionHint' | translate }}</mat-hint>
  <mat-error *ngIf="activityForm.get('position')?.hasError('required')">
    {{ 'activityInput.positionRequired' | translate }}
  </mat-error>
  <mat-error *ngIf="activityForm.get('position')?.hasError('min')">
    {{ 'activityInput.positionMin' | translate }}
  </mat-error>
</mat-form-field>

<!-- Affichage des points calculés -->
<div class="points-preview mat-elevation-z1" *ngIf="calculatedPoints()">
  <mat-icon>stars</mat-icon>
  <span class="points-value">{{ calculatedPoints()!.points }} {{ 'activityInput.points' | translate }}</span>
  <span class="fallback-indicator" *ngIf="calculatedPoints()!.usedFallback">
    {{ 'activityInput.defaultRule' | translate }}
  </span>
</div>
```

**B. Alliance Settings - Section Règles de Points**

**Fichier: `src/app/pages/alliance-settings/alliance-settings.page.html`**
```html
<!-- Nouvelle section -->
<mat-card class="settings-card">
  <mat-card-header>
    <mat-card-title>
      <mat-icon>rule</mat-icon>
      {{ 'allianceSettings.pointRules' | translate }}
    </mat-card-title>
  </mat-card-header>
  
  <mat-card-content>
    <!-- Tableau des règles existantes -->
    <table mat-table [dataSource]="pointRules()" class="rules-table">
      <ng-container matColumnDef="activityType">
        <th mat-header-cell *matHeaderCellDef>{{ 'allianceSettings.activityType' | translate }}</th>
        <td mat-cell *matCellDef="let rule">{{ rule.activity_type }}</td>
      </ng-container>
      
      <ng-container matColumnDef="positionRange">
        <th mat-header-cell *matHeaderCellDef>{{ 'allianceSettings.positionRange' | translate }}</th>
        <td mat-cell *matCellDef="let rule">
          {{ rule.position_min === rule.position_max ? rule.position_min : rule.position_min + '-' + rule.position_max }}
        </td>
      </ng-container>
      
      <ng-container matColumnDef="points">
        <th mat-header-cell *matHeaderCellDef>{{ 'allianceSettings.points' | translate }}</th>
        <td mat-cell *matCellDef="let rule">{{ rule.points }}</td>
      </ng-container>
      
      <ng-container matColumnDef="actions">
        <th mat-header-cell *matHeaderCellDef>{{ 'allianceSettings.actions' | translate }}</th>
        <td mat-cell *matCellDef="let rule">
          <button mat-icon-button color="warn" (click)="deleteRule(rule.id)">
            <mat-icon>delete</mat-icon>
          </button>
        </td>
      </ng-container>
      
      <tr mat-header-row *matHeaderRowDef="displayedColumns"></tr>
      <tr mat-row *matRowDef="let row; columns: displayedColumns;"></tr>
    </table>
    
    <!-- Formulaire d'ajout -->
    <form [formGroup]="ruleForm" (ngSubmit)="addRule()" class="rule-form">
      <mat-form-field appearance="outline">
        <mat-label>{{ 'allianceSettings.activityType' | translate }}</mat-label>
        <mat-select formControlName="activity_type">
          <mat-option *ngFor="let type of activityTypes" [value]="type.value">
            {{ type.labelKey | translate }}
          </mat-option>
        </mat-select>
      </mat-form-field>
      
      <mat-form-field appearance="outline">
        <mat-label>{{ 'allianceSettings.positionMin' | translate }}</mat-label>
        <input matInput type="number" formControlName="position_min" min="1">
      </mat-form-field>
      
      <mat-form-field appearance="outline">
        <mat-label>{{ 'allianceSettings.positionMax' | translate }}</mat-label>
        <input matInput type="number" formControlName="position_max" min="1">
      </mat-form-field>
      
      <mat-form-field appearance="outline">
        <mat-label>{{ 'allianceSettings.points' | translate }}</mat-label>
        <input matInput type="number" formControlName="points" min="0">
      </mat-form-field>
      
      <button mat-raised-button color="primary" type="submit" [disabled]="ruleForm.invalid">
        <mat-icon>add</mat-icon>
        {{ 'allianceSettings.addRule' | translate }}
      </button>
    </form>
  </mat-card-content>
</mat-card>
```

#### 6. Ajouter Traductions

**Fichier: `src/assets/i18n/en.json`**
```json
{
  "activityInput": {
    "position": "Position",
    "positionHint": "Your ranking/position (1 = first place)",
    "positionRequired": "Position is required",
    "positionMin": "Position must be at least 1",
    "points": "points",
    "defaultRule": "(default rule)"
  },
  "allianceSettings": {
    "pointRules": "Point Rules",
    "activityType": "Activity Type",
    "positionRange": "Position Range",
    "positionMin": "Min Position",
    "positionMax": "Max Position",
    "points": "Points",
    "actions": "Actions",
    "addRule": "Add Rule",
    "ruleAdded": "Rule added successfully",
    "ruleDeleted": "Rule deleted successfully",
    "overlapError": "This rule overlaps with an existing rule"
  }
}
```

### Questions à Clarifier Avant Implémentation

**Recommandations par défaut marquées ✅**

#### 1. Règles par défaut (Fallback)
Si l'admin n'a pas configuré de règles :
- ✅ **Option A :** Utiliser `constants.ts` comme fallback (transition progressive)
- Option B : Position obligatoire = 0 points si pas de règle
- Option C : Points fixes, position optionnelle

#### 2. Saisie utilisateur
Comment saisir la position ?
- ✅ **Option A :** Champ numérique simple (1-100)
- Option B : Dropdown pré-configuré
- Option C : Les deux

#### 3. Position obligatoire
Toutes les activités ont une position ?
- ✅ **Option A :** Oui, toujours obligatoire
- Option B : Optionnel

#### 4. Range de positions
Position max réaliste ?
- Option A : 1-100 (grandes compétitions)
- ✅ **Option B :** 1-50 (moyen)
- Option C : 1-20 (petit groupe)

#### 5. Chevauchement de règles
Si `1-5 = 30pts` ET `3-10 = 20pts`, position 4 fait quoi ?
- Option A : Règle la plus spécifique (plus petit range)
- Option B : Première trouvée
- ✅ **Option C :** Empêcher le chevauchement (validation)

#### 6. Migration données existantes
Activités sans position ?
- Option A : Assigner position = 1 par défaut
- Option B : NULL accepté temporairement
- ✅ **Option C :** Script de migration manuel

### Ordre d'Implémentation Recommandé

1. **Mettre à jour schema SQL** (10 min)
   - Ajouter dans `supabase/schema.sql`
   - Table `activity_point_rules` + RLS
   - Colonne `position` dans `activities`

2. **Créer modèles TypeScript** (15 min)
   - `activity-point-rule.model.ts`
   - Mettre à jour `activity.model.ts`
   - Exports dans `index.ts`

3. **Créer PointRulesService** (60 min)
   - CRUD des règles
   - `calculatePoints()` avec fallback
   - `validateNoOverlap()`
   - Tests unitaires

4. **Modifier ActivityService** (20 min)
   - Injection PointRulesService
   - Calcul points dans `addActivity()`
   - Support localStorage

5. **Modifier Page Activity Input** (30 min)
   - Ajouter champ `position`
   - Preview points en temps réel
   - Validation

6. **Créer section Alliance Settings** (90 min)
   - Tableau des règles
   - Formulaire CRUD
   - Validation chevauchement

7. **Ajouter traductions** (10 min)
   - En, Fr, Es, It

8. **Tests end-to-end** (30 min)
   - Créer règles
   - Ajouter activité
   - Vérifier calcul points
   - Tester fallback

**Total estimé : 4-5 heures**

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
5. **Email interne:** Ne jamais exposer l'email généré (`username@app.tracker`) à l'utilisateur
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
