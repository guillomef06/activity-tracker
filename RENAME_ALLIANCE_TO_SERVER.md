# Renommage alliance → server

Chaque étape est indépendante et atomique. Ne pas commencer l'étape suivante avant que les fichiers de l'étape courante compilent sans erreur TypeScript.

---

## Étape 1 — Migration SQL (Supabase)

**Fichier :** `supabase/24-rename-alliance-to-server.sql`

Exécuter le fichier dans le SQL Editor de Supabase (ou via CLI).

Ce que fait la migration dans l'ordre :
1. Drop de la vue `invitation_stats`
2. Drop de toutes les policies RLS qui référencent `alliance_id` ou la table `alliances`
3. Drop des fonctions `get_user_alliance_id` et `calculate_activity_points`
4. `alliances` → `servers`, `alliance_activity_settings` → `server_activity_settings`
5. Colonne `alliance_id` → `server_id` dans les 5 tables concernées
6. Renommage des indexes, du trigger et de la contrainte CHECK
7. Recréation de `get_user_server_id` et `calculate_activity_points`
8. Recréation de la vue `invitation_stats` (avec `server_id`)
9. Recréation de toutes les policies RLS avec les nouveaux noms

> **Point d'attention :** si d'autres Edge Functions Supabase appellent `get_user_alliance_id`, les mettre à jour vers `get_user_server_id` avant ou juste après.

---

## Étape 2 — Modèles TypeScript

Remplacement mécanique `alliance_id` → `server_id` dans ces 5 fichiers :

| Fichier | Interfaces touchées |
|---------|-------------------|
| `src/app/shared/models/user.model.ts` | `UserProfile`, `CreateUserProfileRequest` |
| `src/app/shared/models/activity-point-rule.model.ts` | `ActivityPointRule` |
| `src/app/shared/models/invitation.model.ts` | `InvitationToken`, `CreateInvitationRequest` |
| `src/app/shared/models/server-activity-settings.model.ts` | `ServerActivitySettings` |
| `src/app/shared/models/discord-webhook.model.ts` | `DiscordWebhook` |

Dans chacun : renommer la propriété `alliance_id: string` en `server_id: string`.

---

## Étape 3 — Services

### `src/app/core/services/auth.service.ts`

| Ligne approx. | Avant | Après |
|---------------|-------|-------|
| ~100 | `.select('id, alliance_id, ...')` | `.select('id, server_id, ...')` |
| ~144 | `.from('alliances').insert(...)` | `.from('servers').insert(...)` |
| ~160 | `alliance_id: serverData.id` | `server_id: serverData.id` |
| ~218 | `alliance_id: null` | `server_id: null` |
| ~280 | `alliance_id: tokenData.alliance_id` | `server_id: tokenData.server_id` |
| ~458 | `this.userProfileSignal()?.alliance_id` | `this.userProfileSignal()?.server_id` |

### `src/app/core/services/server.service.ts`

| Recherche | Remplacement |
|-----------|-------------|
| `.from('alliances')` | `.from('servers')` |
| `alliance_activity_settings` (dans les `.select()`) | `server_activity_settings` |
| `.from('alliance_activity_settings')` | `.from('server_activity_settings')` |
| `alliance_id` (toutes les occurrences) | `server_id` |
| `const { ..., alliance_activity_settings, ...server }` | `const { ..., server_activity_settings, ...server }` |
| `this.settingsSignal.set(alliance_activity_settings ?? [])` | `this.settingsSignal.set(server_activity_settings ?? [])` |
| `onConflict: 'alliance_id,activity_type'` | `onConflict: 'server_id,activity_type'` |

> Ligne ~463 : vérifier aussi si `data.alliance_id` / `data.alliance_name` existent dans le mapping de réponse.

### `src/app/core/services/discord.service.ts`

| Recherche | Remplacement |
|-----------|-------------|
| `.eq('alliance_id', serverId)` | `.eq('server_id', serverId)` |
| `alliance_id: serverId` | `server_id: serverId` |

---

## Étape 4 — Composants et Pages

### `src/app/core/layout/app-header/app-header.component.ts`

Ligne ~68 : `profile?.alliance_id` → `profile?.server_id`

### `src/app/pages/super-admin/servers/super-admin-servers.page.ts`

Lignes ~82, ~128, ~165 : `.from('alliances')` → `.from('servers')`

### `src/app/pages/super-admin/dashboard/super-admin-dashboard.page.ts`

Ligne ~44 : `.from('alliances')` → `.from('servers')`

---

## Étape 5 — Styles SCSS

Remplacement de classes CSS (cosmétique, pas de risque fonctionnel) :

### `src/app/pages/super-admin/servers/super-admin-servers.page.scss`

| Avant | Après |
|-------|-------|
| `.super-admin-alliances` | `.super-admin-servers` |
| `.alliances-table` | `.servers-table` |
| `.alliance-name` | `.server-name` |
| `.alliance-tag` | `.server-tag` |

> Vérifier que le HTML correspondant (`super-admin-servers.page.html`) utilise les mêmes classes — les mettre à jour en même temps.

### `src/app/pages/server-settings/server-settings.page.scss`

| Avant | Après |
|-------|-------|
| `.alliance-settings-container` | `.server-settings-container` |

> Mettre à jour le HTML correspondant.

### `src/app/pages/super-admin/dashboard/super-admin-dashboard.page.scss`

| Avant | Après |
|-------|-------|
| `&.alliances-card` | `&.servers-card` |

> Mettre à jour la référence dans le HTML.

### `src/app/pages/super-admin/users/super-admin-users.page.scss`

| Avant | Après |
|-------|-------|
| `.alliance-info` | `.server-info` |
| `.no-alliance` | `.no-server` |

> Mettre à jour le HTML correspondant.

### `src/app/pages/auth/join/join.page.scss`

| Avant | Après |
|-------|-------|
| `.alliance-info` | `.server-info` |

> Mettre à jour le HTML correspondant.

---

## Étape 6 — Fichiers de test (.spec.ts)

Remplacement de `alliance_id` → `server_id` dans les mocks de ces 8 fichiers :

| Fichier | Occurrences |
|---------|-------------|
| `src/app/core/services/auth.service.spec.ts` | 1 |
| `src/app/core/services/discord.service.spec.ts` | 1 |
| `src/app/shared/components/user-account-dialog/user-account-dialog.component.spec.ts` | 1 |
| `src/app/pages/server-settings/server-settings.page.spec.ts` | 1 |
| `src/app/pages/server-settings/components/server-overview-tab/server-overview-tab.component.spec.ts` | 4 |
| `src/app/pages/server-settings/components/activity-settings-tab/activity-settings-tab.component.spec.ts` | 1 |
| `src/app/pages/server-settings/components/import-excel-tab/import-excel-tab.component.spec.ts` | 2 |
| `src/app/pages/server-settings/components/discord-tab/discord-tab.component.spec.ts` | 1 |

---

## Étape 7 — i18n

### `src/assets/i18n/fr.json`

Remplacer les 4 occurrences du mot **alliances** (en tant que terme métier) dans les valeurs :

| Clé | Texte actuel (fragment) | À remplacer |
|-----|------------------------|-------------|
| `auth.setupWarning` | `...toutes les **alliances** et...` | `...tous les **serveurs** et...` |
| `superAdmin.servers.manageServersDesc` | `...toutes les **alliances**` | `...tous les **serveurs**` |
| `superAdmin.servers.subtitle` | `...toutes les **alliances** du...` | `...tous les **serveurs** du...` |
| `superAdmin.servers.loadFailed` | `...chargement des **alliances**` | `...chargement des **serveurs**` |

> Vérifier si d'autres locales (en, it, es) ont des occurrences similaires à mettre à jour.

---

## Étape 8 — Release Notes

### `src/assets/release-notes.json`

3 occurrences du mot `alliance` dans des textes descriptifs :
- ligne ~291 (EN) : `per alliance` → `per server`
- ligne ~292 (FR) : `par alliance` → `par serveur`
- ligne ~352 (FR) : `Gestion de l'alliance` → `Gestion du serveur`

---

## Étape 9 — Vérification finale

```bash
npm run lint
npm run test:ci
```

Aucune erreur de lint ni de test ne doit subsister.

---

## Récapitulatif des fichiers à modifier

| Catégorie | Fichiers | Nb |
|-----------|----------|----|
| SQL | `supabase/24-rename-alliance-to-server.sql` | 1 (à exécuter) |
| Modèles TS | `user.model.ts`, `activity-point-rule.model.ts`, `invitation.model.ts`, `server-activity-settings.model.ts`, `discord-webhook.model.ts` | 5 |
| Services | `auth.service.ts`, `server.service.ts`, `discord.service.ts` | 3 |
| Composants/Pages | `app-header.component.ts`, `super-admin-servers.page.ts`, `super-admin-dashboard.page.ts` | 3 |
| SCSS + HTML | 5 scss + leurs HTML respectifs | ~10 |
| Specs | 8 fichiers `.spec.ts` | 8 |
| i18n | `fr.json` (+ vérifier autres locales) | 1+ |
| Release notes | `release-notes.json` | 1 |
