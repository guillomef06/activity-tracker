# Migrations SQL - Guide d'Exécution

Ce document décrit l'ordre d'exécution des migrations SQL pour le projet Activity Tracker.

## 📋 Vue d'Ensemble

Les migrations sont numérotées de `01` à `06` pour indiquer l'ordre chronologique d'exécution. **Respecter cet ordre est critique** car certaines migrations dépendent des précédentes.

## 🗂️ Ordre d'Exécution

| # | Fichier | Type | Description | Dépendances |
|---|---------|------|-------------|-------------|
| **01** | `01-initial-schema.sql` | Base | Schéma initial complet avec tables, fonctions helper, et RLS policies | Aucune |
| **02** | `02-fix-rls-infinite-recursion.sql` | Fix | Correction récursion infinie dans RLS (helper functions SECURITY DEFINER) | 01 |
| **03** | `03-add-invitation-tracking.sql` | Feature | Ajout tracking d'utilisation des tokens d'invitation + vue stats | 01, 02 |
| **04** | `04-fix-unauthenticated-token-validation.sql` | Fix | Permet validation token avant authentification (workflow signup) | 01, 02 |
| **05** | `05-add-super-admin-delete-user-rpc.sql` | Feature | Fonction RPC delete_user_complete() pour super admin | 01, 02 |
| **06** | `06-fix-super-admin-activity-token-permissions.sql` | Fix | Permissions modération multi-alliance (activities + tokens) | 01, 02 |
| **07** | `07-allow-admin-add-activities-for-members.sql` | Feature | Permet aux admins d'ajouter des activités pour les membres de leur alliance | 01, 02 |

## 📊 Graphe de Dépendances

```
01-initial-schema.sql (FOUNDATION)
    ↓
02-fix-rls-infinite-recursion.sql (CRITICAL FIX)
    ↓
    ├─→ 03-add-invitation-tracking.sql (FEATURE)
    ├─→ 04-fix-unauthenticated-token-validation.sql (AUTH FIX)
    ├─→ 06-fix-super-admin-activity-token-permissions.sql (ADMIN PERMISSIONS)
    └─→ 07-allow-admin-add-activities-for-members.sql (RETROACTIVE ACTIVITIE
    └─→ 06-fix-super-admin-activity-token-permissions.sql (ADMIN PERMISSIONS)
```

## 📖 Détails des Migrations

### 01 - Initial Schema (FOUNDATION)

**Crée:**
- Tables: `alliances`, `user_profiles`, `activities`, `activity_point_rules`, `invitation_tokens`
- Helper functions: `get_user_alliance_id()`, `is_user_admin()`, `is_super_admin()`
- Business function: `calculate_activity_points()`
- RLS policies de base pour toutes les tables
- Indexes de performance

**Bug corrigé:** Aucun (schéma initial)

---

### 02 - Fix RLS Infinite Recursion (CRITICAL)

**Modifie:**
- Supprime TOUTES les policies RLS existantes
- Recrée les policies en utilisant les helper functions avec `SECURITY DEFINER`
- Garantit que les helper functions existent

**Bug corrigé:** Récursion infinie quand les policies RLS interrogent `user_profiles` qui elle-même a des policies RLS. Sans `SECURITY DEFINER`, les opérations d'authentification échouent.

**Impact:** ⚠️ CRITIQUE - L'application ne peut PAS fonctionner sans cette migration.

---

### 03 - Add Invitation Tracking (FEATURE)

**Ajoute:**
- Colonne `invitation_token_id` dans `user_profiles` (foreign key vers `invitation_tokens`)
- Index sur `invitation_token_id` pour performance
- Vue `invitation_stats` avec JSON aggregation des membres

**Bug corrigé:** Aucun

**Feature ajoutée:** Permet de tracer qui s'est inscrit avec quel token d'invitation (tracking multi-usage).

---

### 04 - Fix Unauthenticated Token Validation (AUTH FIX)

**Modifie:**
- Policy SELECT sur `invitation_tokens`
- Ajoute condition `auth.uid() IS NULL` pour permettre accès public

**Bug corrigé:** Impossible de valider un token d'invitation pendant le signup (utilisateur non authentifié → erreur 403). La route `/join/:token` ne peut pas vérifier la validité du token.

**Impact:** Workflow d'inscription via invitation bloqué sans ce fix.

---

### 05 - Add Super Admin Delete User RPC (ADMIN FEATURE)

**Crée:**
- Fonction `delete_user_complete(user_id UUID)` avec `SECURITY DEFINER`
- Vérification que l'appelant est super_admin
- Protection anti-auto-suppression
- Suppression cascade: `user_profiles` → `auth.users`

**Bug corrigé:** Super admin ne peut pas supprimer un utilisateur car `auth.admin.deleteUser()` nécessite une clé `service_role` (indisponible côté client). L'interface affiche un bouton "Delete" mais renvoie erreur 401.

**Impact:** Fonctionnalité de gestion des utilisateurs bloquée pour super admin.

---

### 06 - Fix Super Admin Activity/Token Permissions (ADMIN PERMISSIONS)

**Modifie:**
- Policy UPDATE `activities`: Ajoute `is_super_admin(auth.uid()) OR`
- Policy DELETE `activities`: Ajoute `is_super_admin(auth.uid()) OR`
- Policy UPDATE `invitation_tokens`: Restreint aux admins (était trop permissive)

**Bug corrigé:**
1. Super admin ne peut ni modifier ni supprimer les activités des autres utilisateurs (erreur 403)
2. N'importe qui pouvait modifier les tokens d'invitation (faille de sécurité)

**Impact:** Capacités de modération limitées pour super admin + sécurité renforcée sur les tokens.

---

## ✅ Vérification Post-Migration

Après avoir exécuté toutes les migrations, vérifier que tout fonctionne:

### Test 1: Tables créées
```sql
SELECT table_name FROM information_schema.tables 
WHERE table_schema = 'public' 
ORDER BY table_name;
```

**Résultat attendu:** 5 tables (alliances, activities, activity_point_rules, invitation_tokens, user_profiles)

### Test 2: Helper functions disponibles
```sql
SELECT routines.routine_name, routines.routine_type
FROM information_schema.routines
WHERE routines.specific_schema = 'public'
ORDER BY routines.routine_name;
```

**Résultat attendu:**
- `calculate_activity_points` (FUNCTION)
- `delete_user_complete` (FUNCTION)
- `get_user_alliance_id` (FUNCTION)
- `is_super_admin` (FUNCTION)
- `is_user_admin` (FUNCTION)

### Test 3: Vue invitation_stats
```sql
SELECT * FROM invitation_stats LIMIT 1;
```

**Résultat attendu:** Pas d'erreur (liste vide OK si aucune invitation créée)

### Test 4: Policies RLS actives
```sql
SELECT tablename, policyname FROM pg_policies 
WHERE schemaname = 'public'
ORDER BY tablename, policyname;
```

**Résultat attendu:** ~20-30 policies couvrant toutes les tables

## 🐛 Troubleshooting

### Erreur: "relation already exists"
**Cause:** Migration 01 déjà exécutée  
**Solution:** Passer directement à la migration 02 (ou DROP toutes les tables pour repartir de zéro)

### Erreur: "infinite recursion detected"
**Cause:** Migration 02 non exécutée ou policies RLS corrompues  
**Solution:** Exécuter `02-fix-rls-infinite-recursion.sql` en entier (drop + recréation)

### Erreur 406 sur /join/:token
**Cause:** Migration 04 non exécutée  
**Solution:** Exécuter `04-fix-unauthenticated-token-validation.sql`

### Erreur 401 sur delete user (super admin)
**Cause:** Migration 05 non exécutée  
**Solution:** Exécuter `05-add-super-admin-delete-user-rpc.sql` et utiliser `supabase.rpc('delete_user_complete', { user_id })` côté client

### Erreur 403 sur activities (super admin)
**Cause:** Migration 06 non exécutée  
**Solution:** Exécuter `06-fix-super-admin-activity-token-permissions.sql`

### Erreur 42501 "row-level security policy" sur ajout activité pour membre
**Cause:** Migration 07 non exécutée  
**Solution:** Exécuter `07-allow-admin-add-activities-for-members.sql` pour permettre aux admins d'ajouter des activités pour les membres de leur alliance

## 📚 Documentation Complémentaire

- **Guide détaillé super admin 401/403:** Voir `SUPER_ADMIN_401_FIX.md`
- **Changelog complet:** Voir `../DEVELOPMENT_STATUS.md` section "Corrections Effectuées"
- **Setup général:** Voir `README.md`

---

**Dernière mise à jour:** 9 février 2026  
**Migrations validées:** Angular 19 + Supabase PostgreSQL 15.8
