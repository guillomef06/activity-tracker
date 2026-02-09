# Migration 07: Admin Retroactive Activities

**Date:** 9 février 2026  
**Type:** Feature Enhancement  
**Dépendances:** 01, 02

## Problème

Lors de l'implémentation de la fonctionnalité "Activités Rétroactives" permettant aux admins d'ajouter des activités pour les membres de leur alliance, une erreur RLS se produit:

```json
{
  "code": "42501",
  "details": null,
  "hint": null,
  "message": "new row violates row-level security policy for table \"activities\""
}
```

**Cause:** La policy RLS existante `"Users can create their own activities"` autorise uniquement la création d'activités où `user_id = auth.uid()`. Quand un admin essaie de créer une activité pour un autre membre (avec un `user_id` différent), la policy refuse l'opération.

## Solution

Ajouter une nouvelle policy RLS permettant aux admins (et super admins) de créer des activités pour les membres de leur alliance, tout en conservant la policy existante pour les utilisateurs normaux.

## Modifications

### RLS Policies - Activities Table

**Suppression:**
- Policy existante `"Users can create their own activities"`

**Création:**
1. **Policy 1 (Users):** `"Users can create their own activities"`
   - Permet aux utilisateurs de créer leurs propres activités
   - Condition: `user_id = auth.uid()`
   
2. **Policy 2 (Admins):** `"Admins can create activities for alliance members"`
   - Permet aux admins (non super admin) de créer des activités pour les membres de leur alliance
   - Conditions:
     - `is_user_admin(auth.uid())` → Vérifier que l'utilisateur est admin
     - `NOT is_super_admin(auth.uid())` → Exclure les super admins (ils ont leur propre policy)
     - `user_id IN (SELECT id FROM user_profiles WHERE alliance_id = get_user_alliance_id(auth.uid()))` → Vérifier que le membre cible appartient à la même alliance

3. **Policy 3 (Super Admins):** `"Super admins can create activities for any user"`
   - Permet aux super admins de créer des activités pour n'importe quel utilisateur
   - Condition: `is_super_admin(auth.uid())`

## Cas d'Usage

Cette migration supporte la fonctionnalité "Activités Rétroactives" dans l'interface admin:

- **Onglet:** Alliance Settings → Retroactive Activities
- **Permissions:** Admin et Super Admin uniquement
- **Fonction:** Permet d'ajouter des activités pour les semaines passées (jusqu'à 6 semaines) pour n'importe quel membre de l'alliance
- **Use Case:** Correction d'oublis, ajout d'activités pour membres absents, etc.

## Impact

- ✅ Les utilisateurs continuent de pouvoir créer leurs propres activités (pas de régression)
- ✅ Les admins peuvent maintenant créer des activités pour les membres de leur alliance
- ✅ Les super admins peuvent créer des activités pour n'importe quel utilisateur de n'importe quelle alliance
- ⚠️ Les admins NE PEUVENT PAS créer d'activités pour des membres d'autres alliances (sécurité maintenue)
- ⚠️ Le super admin n'a pas d'`alliance_id` (NULL), donc il nécessite une policy séparée

## Test

Après exécution de la migration:

```typescript
// En tant qu'admin, créer une activité pour un membre
const { error } = await activityService.addActivityForMember(memberUserId, {
  activity_type: 'golden expedition',
  position: 5,
  date: new Date('2026-01-25') // semaine passée
});

// Devrait réussir si le membre appartient à votre alliance
console.log(error); // null
```

## Rollback

Si besoin de revenir en arrière:

```sqlSuper admins can create activities for any user" ON activities;
DROP POLICY IF EXISTS "
DROP POLICY IF EXISTS "Admins can create activities for alliance members" ON activities;
DROP POLICY IF EXISTS "Users can create their own activities" ON activities;

CREATE POLICY "Users can create their own activities"
  ON activities FOR INSERT
  WITH CHECK (user_id = auth.uid());
```

## Fichiers Frontend Associés

- `src/app/pages/alliance-settings/components/retroactive-activities-tab/` (composant complet)
- `src/app/core/services/activity.service.ts` (méthode `addActivityForMember()`)
- `src/app/shared/utils/date.util.ts` (calcul des semaines de cycle)
