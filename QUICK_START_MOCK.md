# 🎯 Mode Mock - Guide de Démarrage Rapide

## ✅ Installation Complète

Le système de mock est maintenant opérationnel ! Voici comment l'utiliser :

## 🚀 Démarrer l'Application

```bash
npm start
```

L'application démarrera avec le mode mock activé par défaut.

## 🔑 Connexion avec les Utilisateurs de Test

### Super Admin (Accès Total)
- **Username:** `superadmin`
- **Password:** `password123`
- Accès à toutes les alliances et utilisateurs

### Administrateurs
- **Phoenix Guild:** `admin1` / `password123`
- **Dragon Slayers:** `admin2` / `password123`
- Gestion de leur alliance respective

### Membres
- **Alice:** `alice` / `password123` (Phoenix Guild)
- **Bob:** `bob` / `password123` (Phoenix Guild)
- **Charlie:** `charlie` / `password123` (Phoenix Guild)
- **Diana:** `diana` / `password123` (Dragon Slayers)
- **Ethan:** `ethan` / `password123` (Dragon Slayers)

## 🎨 Indicateur Visuel

Quand le mode mock est actif, vous verrez un badge **"MOCK MODE"** en bas à droite de l'écran :
- 🟣 Badge violet avec icône scientifique
- Tooltip informatif au survol
- Visible sur toutes les pages

## 🧪 Scénarios de Test Recommandés

### 1. Test Multi-Rôles
```
1. Connexion avec alice (member) → Voir les restrictions
2. Déconnexion
3. Connexion avec admin1 (admin) → Voir les fonctions admin
4. Déconnexion
5. Connexion avec superadmin → Voir toutes les fonctions
```

### 2. Test Multi-Alliance
```
1. Connexion avec admin1 (Phoenix Guild)
2. Noter les membres visibles
3. Déconnexion
4. Connexion avec admin2 (Dragon Slayers)
5. Vérifier l'isolation des données
```

### 3. Test Workflow Complet
```
1. Connexion avec admin1
2. Créer un token d'invitation
3. Voir les scores des membres
4. Gérer les paramètres de l'alliance
5. Se déconnecter
```

## 💾 Gestion de la Session

### Session Persistante
- La session mock est sauvegardée dans `localStorage`
- Rechargez la page : vous restez connecté
- Même après fermeture du navigateur

### Réinitialiser
**Méthode 1 - Via l'interface:**
```
Menu utilisateur → Déconnexion
```

**Méthode 2 - Via DevTools:**
```
1. F12 → Application → Local Storage
2. Supprimer la clé "mock-auth-session"
3. Recharger la page
```

## 🔍 Logs de Développement

Ouvrez la console (F12) pour voir les logs du mode mock :
```
🔒 [MOCK MODE] Logged in as: Alice Johnson (member)
🔒 [MOCK MODE] Session restored: Alice Johnson (member)
🔒 [MOCK MODE] Logged out
```

## 📁 Fichiers Créés

### Code
- ✅ `src/app/shared/mock-data/mock-users.ts` - Données des utilisateurs
- ✅ `src/app/shared/components/mock-mode-indicator/` - Indicateur visuel
- ✅ `src/app/core/services/auth.service.ts` - Logique mock intégrée

### Documentation
- ✅ `MOCK_USERS_GUIDE.md` - Guide détaillé
- ✅ `QUICK_START_MOCK.md` - Ce fichier

## ⚙️ Configuration

Le mode mock est contrôlé dans `src/environments/environment.ts` :

```typescript
export const environment = {
  enableMockData: true,  // ← Active le mode mock
  // ...
};
```

**Pour désactiver le mock:**
```typescript
enableMockData: false  // Utilisera Supabase
```

## ✨ Avantages du Mode Mock

- ✅ **Pas de dépendance Supabase** - Développement 100% local
- ✅ **Tests rapides** - Connexion instantanée
- ✅ **Tous les rôles** - Testez super_admin, admin, member
- ✅ **Isolation des données** - Testez la séparation des alliances
- ✅ **Reproductible** - Même état à chaque démarrage
- ✅ **Offline** - Fonctionne sans connexion Internet

## 🐛 Dépannage

### Le badge "MOCK MODE" n'apparaît pas
```
Vérifier environment.ts → enableMockData: true
```

### Erreur "Invalid credentials"
```
Vérifier username/password (sensible à la casse)
Tous les mots de passe sont: password123
```

### Session non persistante
```
Vérifier que localStorage est activé dans le navigateur
```

### Données différentes de Supabase
```
Normal ! Le mode mock utilise des données locales
Pour Supabase: enableMockData: false
```

## 📚 Prochaines Étapes

Une fois les tests en mode mock terminés :

1. ✅ Tester tous les rôles et flux
2. ✅ Identifier les bugs/problèmes
3. 🚀 **Passer au Sprint 4** - Système de points configurables
4. 🔄 Basculer vers Supabase pour tests réels
5. 📦 Désactiver mock en production

## 📞 Questions ?

Consultez les fichiers de documentation :
- `MOCK_USERS_GUIDE.md` - Guide complet
- `DEVELOPMENT_STATUS.md` - État du projet
- `README.md` - Documentation générale

---

**Bon développement ! 🎉**
