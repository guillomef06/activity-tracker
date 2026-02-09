# Super Admin 401 Fix - Summary

## Problèmes identifiés et corrigés

### 1. ✅ Suppression d'utilisateurs (DÉJÀ CORRIGÉ)
**Problème**: `auth.admin.deleteUser()` causait 401 (nécessite service_role key)  
**Solution**: Fonction RPC `delete_user_complete()` dans [delete-user-function.sql](./delete-user-function.sql)  
**Fichier modifié**: [super-admin-users.page.ts](../src/app/pages/super-admin-users/super-admin-users.page.ts)

### 2. ✅ Rollback signup admin (CORRIGÉ)
**Problème**: `auth.admin.deleteUser()` dans rollback de signup admin causait 401  
**Solution**: Supprimé l'appel à auth.admin (utilisateur orphelin ne peut pas se connecter de toute façon)  
**Fichier modifié**: [auth.service.ts](../src/app/core/services/auth.service.ts#L258)

### 3. ⏳ Gestion des activités (À APPLIQUER)
**Problème**: Super admin ne peut ni modifier ni supprimer les activités des autres  
**Solution**: Ajout de `is_super_admin(auth.uid())` aux policies UPDATE/DELETE de `activities`  
**Fichier SQL**: [fix-super-admin-policies.sql](./fix-super-admin-policies.sql)

### 4. ⏳ Gestion des invitation tokens (À APPLIQUER)
**Problème**: Policy UPDATE permettait à n'importe qui de modifier les tokens  
**Solution**: Restriction de la policy UPDATE aux admins et super_admin  
**Fichier SQL**: [fix-super-admin-policies.sql](./fix-super-admin-policies.sql)

## Migrations à exécuter

### Migration 1: Fonction de suppression d'utilisateur
```bash
# Exécuter dans Supabase SQL Editor
cat supabase/delete-user-function.sql | psql $DATABASE_URL
```
Ou copier-coller le contenu de `delete-user-function.sql` dans SQL Editor.

### Migration 2: Correction des policies RLS
```bash
# Exécuter dans Supabase SQL Editor
cat supabase/fix-super-admin-policies.sql | psql $DATABASE_URL
```
Ou copier-coller le contenu de `fix-super-admin-policies.sql` dans SQL Editor.

## Vérification

Après l'application des migrations, le super admin peut:
- ✅ Voir tous les utilisateurs, alliances, activités
- ✅ Modifier tous les utilisateurs, alliances, activités, tokens
- ✅ Supprimer tous les utilisateurs (via RPC), alliances, activités, tokens
- ✅ Créer pour n'importe quelle alliance (invitations, rules)

## Tests à effectuer

1. **Suppression d'utilisateur**:
   - En tant que super_admin, aller sur la page des utilisateurs
   - Cliquer sur le bouton de suppression d'un utilisateur non-super_admin
   - Vérifier que l'utilisateur est supprimé de `user_profiles` ET `auth.users`

2. **Modification d'activité**:
   - En tant que super_admin, essayer de modifier une activité d'un autre utilisateur
   - Devrait fonctionner sans erreur 401/403

3. **Suppression d'activité**:
   - En tant que super_admin, essayer de supprimer une activité d'un autre utilisateur
   - Devrait fonctionner sans erreur 401/403

4. **Modification de token d'invitation**:
   - En tant que super_admin, essayer de modifier un token d'une autre alliance
   - Devrait fonctionner sans erreur 401/403
