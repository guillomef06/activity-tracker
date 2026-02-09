# Supabase Setup - Activity Tracker

Configuration et déploiement de la base de données PostgreSQL via Supabase pour l'application Activity Tracker.

## 🚀 Quick Start

### Prérequis

- Un projet Supabase créé (https://supabase.com)
- Accès au SQL Editor de votre projet

### Setup Complet (5 minutes)

1. **Exécuter les migrations dans l'ordre:**
   
   Ouvrir Supabase Dashboard → SQL Editor, puis copier-coller **dans l'ordre**:
   
   ```
   01-initial-schema.sql              ← Tables, fonctions, RLS policies
   02-fix-rls-infinite-recursion.sql  ← Fix CRITICAL récursion RLS
   03-add-invitation-tracking.sql     ← Tracking invitations multi-usage
   04-fix-unauthenticated-token-validation.sql  ← Fix workflow signup
   05-add-super-admin-delete-user-rpc.sql      ← Fonction delete user
   06-fix-super-admin-activity-token-permissions.sql  ← Permissions super admin
   ```

   **⚠️ Important:** Respecter l'ordre numérique (01 → 06). Voir [MIGRATIONS.md](MIGRATIONS.md) pour détails.

2. **Récupérer les credentials Supabase:**
   
   Project Settings → API → Copier:
   - **Project URL**: `https://xxxxx.supabase.co`
   - **anon public key**: `eyJhbGc...`

3. **Configurer l'environnement Angular:**
   
   Mettre à jour `src/environments/environment.ts` et `environment.production.ts`:
   ```typescript
   export const environment = {
     production: false, // true pour production
     supabase: {
       url: 'YOUR_PROJECT_URL',
       key: 'YOUR_ANON_KEY'
     }
   };
   ```

4. **Vérifier le setup:**
   
   SQL Editor → Run:
   ```sql
   -- Vérifier les tables
   SELECT table_name FROM information_schema.tables 
   WHERE table_schema = 'public' ORDER BY table_name;
   
   -- Vérifier les fonctions
   SELECT routine_name FROM information_schema.routines 
   WHERE specific_schema = 'public';
   ```

---

## 📋 Architecture Base de Données

### Tables (5)

| Table | Description | RLS |
|-------|-------------|-----|
| `alliances` | Teams/organisations avec propriétaire | ✅ |
| `user_profiles` | Profils utilisateurs (username, role, alliance) | ✅ |
| `activities` | Activités utilisateurs (points, positions) | ✅ |
| `activity_point_rules` | Règles de scoring personnalisables | ✅ |
| `invitation_tokens` | Tokens multi-usage avec tracking | ✅ |

### Fonctions PostgreSQL

| Fonction | Type | Description |
|----------|------|-------------|
| `get_user_alliance_id(uuid)` | Helper | Retourne l'alliance d'un utilisateur |
| `is_user_admin(uuid)` | Helper | Vérifie si admin ou super_admin |
| `is_super_admin(uuid)` | Helper | Vérifie si super_admin uniquement |
| `calculate_activity_points(...)` | Business | Calcule les points selon règles configurées |
| `delete_user_complete(uuid)` | RPC | Suppression complète utilisateur (super admin) |

**Note:** Toutes les helper functions utilisent `SECURITY DEFINER` pour bypass RLS dans les policies.

### Vues

- `invitation_stats`: Statistiques d'utilisation des tokens avec JSON aggregation des membres

---

## 🎮 Types d'Activités

Valeurs par défaut configurées dans `01-initial-schema.sql`:

| Activité | Points par défaut |
|----------|-------------------|
| **KvK Prep** | 15 points |
| **KvK Cross Border** | 10 points |
| **Legion** | 8 points |
| **Desolate Desert** | 8 points |
| **Golden Expedition** | 5 points |

**Personnalisation:** Les admins peuvent override ces valeurs via `activity_point_rules` (par alliance + par range de positions).

---

## 🔐 Authentification Supabase

### Configuration Requise

1. **Authentication → Providers → Email:** Activé (requis)
2. **Authentication → URL Configuration:**
   - Site URL: `http://localhost:4200` (dev) ou `https://yourdomain.github.io/management` (prod)
   - Redirect URLs: Ajouter les URLs de callback

### Système Username (Sans Email Visible)

L'application utilise uniquement des **usernames** (pas d'email visible):

1. Utilisateur saisit un username
2. Backend génère email interne: `{username}@app.tracker`
3. Supabase Auth utilise cet email (invisible pour l'utilisateur)
4. Stockage: `user_profiles.username` + `auth.users.user_metadata.username`

### Hiérarchie des Rôles

| Rôle | Permissions | Alliance | Création |
|------|-------------|----------|----------|
| **super_admin** | Accès global toutes alliances | NULL | `signUpSuperAdmin()` |
| **admin** | Gestion alliance + membres | Propriétaire | Signup classique |
| **member** | Activités personnelles | Membre | Invitation token |

---

## 🧪 Tests de Validation

### Test 1: RLS Policies Actives

Après signup/login d'un utilisateur classique:

```sql
-- Doit retourner uniquement l'alliance de l'utilisateur connecté
SELECT * FROM alliances;

-- Doit retourner uniquement les membres de la même alliance
SELECT * FROM user_profiles;

-- Doit retourner uniquement les activités de la même alliance
SELECT * FROM activities;
```

### Test 2: Super Admin Permissions

Connecté en tant que super_admin:

```sql
-- Doit retourner TOUTES les alliances
SELECT * FROM alliances;

-- Doit retourner TOUS les utilisateurs
SELECT * FROM user_profiles;

-- Doit retourner TOUTES les activités
SELECT * FROM activities;
```

### Test 3: Invitation Workflow

1. Admin crée token via UI → vérifie présence dans `invitation_tokens`
2. Visiteur anonyme accède `/join/{token}` → ne doit PAS avoir erreur 403
3. Visiteur s'inscrit → vérifie `user_profiles.invitation_token_id` rempli
4. Admin vérifie stats → `invitation_stats` doit montrer usage_count = 1

### Test 4: Super Admin User Deletion

```sql
-- Via RPC (côté client TypeScript)
await supabase.rpc('delete_user_complete', { user_id: 'uuid-here' });

-- Vérifier suppression
SELECT * FROM user_profiles WHERE id = 'uuid-here'; -- Doit être vide
SELECT * FROM auth.users WHERE id = 'uuid-here'; -- Doit être vide
```

---

## 📊 Monitoring & Maintenance

### Dashboard Supabase

- **Database → Table Editor:** Visualiser/éditer les données manuellement
- **Database → Logs:** Logs de requêtes SQL (debug RLS)
- **Authentication → Users:** Gestion manuelle des utilisateurs
- **SQL Editor → Query History:** Historique des migrations exécutées

### Requêtes Utiles

```sql
-- Compter utilisateurs par alliance
SELECT a.name, COUNT(up.id) as member_count
FROM alliances a
LEFT JOIN user_profiles up ON a.id = up.alliance_id
GROUP BY a.id, a.name
ORDER BY member_count DESC;

-- Activités des 7 derniers jours
SELECT u.username, a.activity_type, a.position, a.points, a.created_at
FROM activities a
JOIN user_profiles u ON a.user_id = u.id
WHERE a.created_at >= NOW() - INTERVAL '7 days'
ORDER BY a.created_at DESC;

-- Efficacité des tokens d'invitation
SELECT * FROM invitation_stats
WHERE usage_count > 0
ORDER BY usage_count DESC;
```

---

## ⚠️ Troubleshooting

### Erreur: "infinite recursion detected in policy"

**Cause:** Migration 02 non exécutée ou policies corrompues  
**Solution:** Exécuter `02-fix-rls-infinite-recursion.sql` en entier (DROP + recréation)

### Erreur 406: "Token validation failed during signup"

**Cause:** Migration 04 non exécutée  
**Solution:** Exécuter `04-fix-unauthenticated-token-validation.sql`

### Erreur 401: "Super admin cannot delete user"

**Cause:** Migration 05 non exécutée ou mauvaise méthode appelée  
**Solution:** 
1. Exécuter `05-add-super-admin-delete-user-rpc.sql`
2. Utiliser `supabase.rpc('delete_user_complete', { user_id })` au lieu de `auth.admin.deleteUser()`

### Erreur 403: "Super admin cannot edit other users' activities"

**Cause:** Migration 06 non exécutée  
**Solution:** Exécuter `06-fix-super-admin-activity-token-permissions.sql`

### Signup bloqué: "userProfile is null after signup"

**Cause:** Timing RLS ou loadUserProfile() échoue  
**Solution:** Code Angular déjà fixé (userProfile.set() directement), vérifier migrations 01-04 exécutées

---

## 📚 Documentation Complémentaire

- **[MIGRATIONS.md](MIGRATIONS.md)** - Guide détaillé d'exécution des 6 migrations (dépendances, tests, troubleshooting)
- **[SUPER_ADMIN_401_FIX.md](SUPER_ADMIN_401_FIX.md)** - Documentation approfondie des correctifs super admin
- **[../DEVELOPMENT_STATUS.md](../DEVELOPMENT_STATUS.md)** - Statut du projet et fonctionnalités complétées

---

## 🔒 Sécurité

- ✅ **Row Level Security (RLS)** activé sur TOUTES les tables
- ✅ **Helper functions** en `SECURITY DEFINER` pour éviter récursion RLS
- ✅ **Policies strictes** - Utilisateurs ne voient que leur alliance
- ✅ **Super admin isolation** - Alliance NULL, policies spéciales
- ✅ **Token validation sécurisée** - Expiration automatique, soft delete
- ✅ **Protection anti-auto-suppression** - Super admin ne peut se supprimer lui-même

---

**Dernière mise à jour:** 9 février 2026  
**Version:** PostgreSQL 15.8 (Supabase)  
**Migrations:** 01-06 validées avec Angular 19 + Supabase JS v2
