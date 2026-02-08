# 🧪 Mode Mock - Guide de Test Local

Ce fichier documente les utilisateurs de test disponibles en mode développement local.

## ✅ Activation du Mode Mock

Le mode mock est activé par défaut en développement dans `environment.ts` :
```typescript
enableMockData: true
```

Quand ce mode est activé :
- ✅ Pas besoin de Supabase
- ✅ Connexion instantanée
- ✅ Données persistées dans localStorage
- ✅ Tous les rôles testables

## 👥 Utilisateurs de Test Disponibles

### 🔐 Super Admin (Accès complet)
```
Username: superadmin
Password: password123
Rôle: super_admin
Accès: Gestion de toutes les alliances et utilisateurs
```

### 👔 Administrateurs d'Alliance

**Admin Phoenix Guild:**
```
Username: admin1
Password: password123
Rôle: admin
Alliance: Phoenix Guild
Accès: Gestion de son alliance, visualisation des scores
```

**Admin Dragon Slayers:**
```
Username: admin2
Password: password123
Rôle: admin
Alliance: Dragon Slayers
Accès: Gestion de son alliance, visualisation des scores
```

### 👤 Membres (Phoenix Guild)

**Alice Johnson:**
```
Username: alice
Password: password123
Rôle: member
Alliance: Phoenix Guild
Accès: Saisie d'activités uniquement
```

**Bob Smith:**
```
Username: bob
Password: password123
Rôle: member
Alliance: Phoenix Guild
Accès: Saisie d'activités uniquement
```

**Charlie Brown:**
```
Username: charlie
Password: password123
Rôle: member
Alliance: Phoenix Guild
Accès: Saisie d'activités uniquement
```

### 👤 Membres (Dragon Slayers)

**Diana Prince:**
```
Username: diana
Password: password123
Rôle: member
Alliance: Dragon Slayers
Accès: Saisie d'activités uniquement
```

**Ethan Hunt:**
```
Username: ethan
Password: password123
Rôle: member
Alliance: Dragon Slayers
Accès: Saisie d'activités uniquement
```

## 🧪 Scénarios de Test

### Test 1: Flux Super Admin
1. Connexion avec `superadmin`
2. Accès au dashboard super admin
3. Visualiser toutes les alliances
4. Gérer les utilisateurs
5. Accès à toutes les fonctionnalités

### Test 2: Flux Administrateur
1. Connexion avec `admin1` ou `admin2`
2. Accès au dashboard de management
3. Visualiser les scores de son alliance
4. Gérer les paramètres de l'alliance
5. Créer des tokens d'invitation
6. Voir les détails des activités

### Test 3: Flux Membre
1. Connexion avec `alice`, `bob`, `charlie`, `diana` ou `ethan`
2. Accès à la saisie d'activités uniquement
3. Soumettre des activités
4. Pas d'accès aux fonctions admin

### Test 4: Multi-Alliance
1. Connexion avec `admin1` (Phoenix Guild)
2. Noter les membres et scores
3. Déconnexion
4. Connexion avec `admin2` (Dragon Slayers)
5. Vérifier que les données sont isolées par alliance

### Test 5: Changement de Rôle
1. Connexion avec `alice` (member)
2. Noter les restrictions d'accès
3. Déconnexion
4. Connexion avec `admin1` (admin)
5. Comparer les fonctionnalités disponibles
6. Déconnexion
7. Connexion avec `superadmin`
8. Voir toutes les fonctionnalités

## 🔄 Réinitialiser les Données

Pour remettre à zéro les données de test :
1. Ouvrir DevTools (F12)
2. Application → Local Storage
3. Supprimer `mock-auth-session`
4. Recharger la page

## 📝 Ajouter de Nouveaux Utilisateurs Mock

Éditer `src/app/shared/mock-data/mock-users.ts` :

```typescript
{
  id: 'mock-member-006',
  username: 'newuser',
  password: 'password123',
  profile: {
    id: 'mock-member-006',
    username: 'newuser',
    displayName: 'New User',
    role: 'member',
    allianceId: 'mock-alliance-001',
    createdAt: new Date('2024-02-01'),
    updatedAt: new Date('2024-02-01'),
  }
}
```

## ⚠️ Important

- Le mode mock est **uniquement pour le développement**
- Ne JAMAIS activer `enableMockData` en production
- Les données mockées ne sont pas persistées en base
- Le localStorage est utilisé pour la session uniquement

## 🚀 Passer en Mode Production

Dans `environment.production.ts` :
```typescript
enableMockData: false  // Désactive le mode mock
```

L'application utilisera alors Supabase pour l'authentification réelle.
