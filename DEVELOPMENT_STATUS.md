# État d'Avancement du Développement

**Dernière mise à jour:** 24 mars 2026

## 📋 Résumé

Application Angular 21 de gestion d'activités avec backend Supabase et système multi-alliance. Mobile-first, déployée sur GitHub Pages.

---

## ✅ Fonctionnalités Complétées

### Infrastructure
- Backend Supabase : `alliances`, `user_profiles`, `activities`, `invitation_tokens`, `activity_point_rules`, `discord_webhooks`
- Authentification par username uniquement (email généré en interne `username@app.tracker`)
- RLS configuré avec helper functions `SECURITY DEFINER`
- PWA (manifest, service worker, banner d'installation A2HS)
- GitHub Pages SPA routing (404.html → sessionStorage → index.html)

### Authentification & Comptes
- Signup admin (crée une alliance) / member (via token d'invitation)
- Login par username + password
- Dialog "Mon Compte" : modifier display name, mot de passe, question de récupération + préférences langue
- Account recovery : question secrète → reset mot de passe (rate limiting custom, sans email)
- Rôles : `super_admin` (accès global), `admin` (gestion alliance), `member`

### Invitations
- Tokens multi-usage avec date d'expiration configurable
- Validation côté anon via RPC `validate_invitation_token` (bypasse RLS sur `alliances`)
- Vue stats temps réel (`invitation_stats`)

### Activités & Scores
- Saisie activité avec position → calcul points automatique selon règles configurables
- Mode participation par activité (toggle à la place du champ position, points fixes)
- Cycle de 6 semaines pour la disponibilité des activités (date ref : 25 jan 2026 = semaine 1)
- Scores sur N semaines glissantes (multiplicateur configurable : 1×6, 2×12, 3×18 semaines)
- Activité tiebreaker (départage à égalité de score, exclue du calcul des points)
- Désactivation d'activités par alliance
- Entrée rétroactive admin (pour n'importe quel membre, n'importe quelle semaine)
- Import Excel batch (wizard upload → preview → done, matching joueur, upsert)
- Suppression globale des activités (admin, avec confirmation)

### Alliance Settings
- Gestion membres (invitations, suppression)
- Règles de points configurables par activité + plage de positions
- Paramètres d'activités (activation, mode participation, tiebreaker, multiplicateur de semaines)
- Discord webhooks : envoi de messages vers channels Discord
- Alliance tag (3 caractères, affiché dans le header)

### UI / Design
- Système de thèmes : Light / Dark / Auto / Glass Light / Glass Dark / High Contrast
- Design "Command Post" (header gradient marine, rank gold/silver/bronze)
- Material Design 3, Inter, OnPush, Signals
- Internationalisation : EN, FR, ES, IT

### Outils (Tools Hub)
- **Gem Calculator** : calculateur de score de gemme sur commander
- **Pack Value Calculator** : évalue la valeur d'un pack en jeu en Apex Coins

### Super Admin
- Dashboard, gestion alliances, gestion users
- Suppression complète d'un user via RPC `delete_user_complete`

---

## 🐛 Corrections Notables

- **Join token invalide** : RLS `alliances` bloquait les anon → RPC `validate_invitation_token` SECURITY DEFINER
- **UTC dates** : normalisation timezone dans `date.util.ts` (impact import Excel + activity input)
- **Password rules** : validation regex renforcée (join/signup)
- **Recovery answer** : fix vérification lors du reset
- **Angular 21 upgrade** : CSS tokens Material renommés post-migration
- **Home page** : fusion activité + scores en page unique, suppression dépendances chart.js
- **Auth double requête** : suppression `getSession()` dans `initializeAuth()`, source unique via `onAuthStateChange`
- **GitHub Pages SPA** : 404.html corrigé (save + redirect), index.html restaure l'URL avant bootstrap Angular

---

## ⚙️ Architecture

- Standalone components, Signals, OnPush, Reactive Forms
- Smart/dumb pattern : pages (smart) + components (dumb)
- Lazy loading sur toutes les routes
- Guards : `authGuard`, `adminGuard`, `superAdminGuard`, `guestGuard`

---

## 🚧 Limitations Connues

- Rate limiting account recovery : repose sur RPCs custom, non couvert par le rate limit Supabase Auth natif
- Dialog "Mon Compte" → onglet Préférences : thème et notifications (champs DB existants) pas encore exposés

---

## 📊 Statut

**État actuel :** ✅ Application complète et fonctionnelle en production (GitHub Pages)
