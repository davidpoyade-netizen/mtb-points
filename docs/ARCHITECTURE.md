# 🚴 MTB Points - Architecture Réorganisée

## 📋 Vue d'ensemble du flux organisateur

Cette réorganisation clarifie le parcours de l'organisateur pour créer un événement, ajouter des épreuves, importer des résultats et publier les classements.

---

## 🔄 Flux de travail complet

```
┌─────────────────────────────────────────────────────────────┐
│  1️⃣  TABLEAU DE BORD ORGANISATEUR                           │
│     organizer-dashboard.html                                │
│     • Créer un événement (meeting)                          │
│     • Voir tous mes événements                              │
└─────────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────┐
│  2️⃣  DÉTAIL ÉVÉNEMENT                                        │
│     meeting.html?id=xxx                                     │
│     • Vue d'ensemble de l'événement                         │
│     • Liste des épreuves de cet événement                   │
│     • Bouton "Créer une épreuve"                            │
└─────────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────┐
│  3️⃣  CRÉATION D'ÉPREUVE                                      │
│     course-create.html?meetingId=xxx                        │
│     • Formulaire de création                                │
│     • Import GPX avec analyse automatique                   │
│     • Calcul auto distance/D+/scores                        │
│     • Rattachement automatique à l'événement                │
└─────────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────┐
│  4️⃣  FICHE ÉPREUVE                                           │
│     race.html?id=xxx                                        │
│     • Détails complets de l'épreuve                         │
│     • Carte / Profil d'altitude                             │
│     • Bouton "Importer résultats"                           │
│     • Bouton "Voir classement"                              │
└─────────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────┐
│  5️⃣  IMPORT RÉSULTATS                                        │
│     import-results.html?raceId=xxx                          │
│     • Upload CSV/XLSX                                       │
│     • Mapping automatique des colonnes                      │
│     • Validation & Import                                   │
└─────────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────┐
│  6️⃣  CLASSEMENT PUBLIC                                       │
│     race-ranking.html?id=xxx                                │
│     • Classements H/F × Musculaire/VAE                      │
│     • Par catégorie d'âge                                   │
│     • Vue publique pour tous                                │
└─────────────────────────────────────────────────────────────┘
```

---

## 📁 Fichiers modifiés/créés

### ✅ Fichiers créés/mis à jour

1. **organizer-dashboard.html** (✨ amélioré)
   - Ajout d'un guide visuel du flux de travail
   - Clarification des étapes
   - Lien vers meeting.html

2. **meeting.html** (✨ créé)
   - Page détail d'un événement
   - Liste des épreuves associées
   - Boutons d'action clairs (Voir / Importer / Classement)

3. **course-create.html** (✅ déjà existant, amélioré avec le fix du sélecteur GPX)
   - Rattachement automatique au meeting via `?meetingId=xxx`
   - Analyse GPX automatique

4. **race.html** (✅ déjà existant)
   - Affiche les détails de l'épreuve
   - Liens vers import-results et race-ranking

5. **import-results.html** (✅ déjà existant)
   - Import CSV/XLSX
   - Passage du `?raceId=xxx` en paramètre

6. **race-ranking.html** (✅ déjà existant)
   - Affichage public du classement
   - 4 tableaux : H/F × Musculaire/VAE

---

## 🎯 Points clés de l'architecture

### Navigation claire
- **organizer-dashboard.html** → point d'entrée pour les organisateurs
- **meeting.html** → hub central pour un événement
- Chaque page a des boutons d'action clairs vers l'étape suivante

### Paramètres URL
```javascript
// Création d'épreuve rattachée à un événement
course-create.html?meetingId=xxx

// Import résultats pour une épreuve
import-results.html?raceId=xxx

// Classement d'une épreuve
race-ranking.html?id=xxx
```

### Guides visuels
- Instructions pas à pas sur organizer-dashboard
- Encadré informatif sur meeting.html
- Flux logique toujours visible

---

## 🔧 Prochaines étapes recommandées

### JavaScript à adapter
Les fichiers JS suivants doivent être mis à jour pour suivre cette nouvelle architecture :

1. **js/organizer-dashboard.js**
   - Au clic sur un événement → redirection vers `meeting.html?id=xxx`

2. **js/course-create.js** (✅ déjà corrigé)
   - Récupération du `meetingId` depuis l'URL
   - Rattachement automatique

3. **js/import-results.js**
   - Récupération du `raceId` depuis l'URL
   - Pré-sélection de l'épreuve

4. **js/race-ranking.js**
   - Récupération de l'`id` (raceId) depuis l'URL
   - Affichage du classement

---

## 🎨 Pages publiques vs privées

### Pages organisateur (authentification requise)
- ✅ organizer-dashboard.html
- ✅ meeting.html (vue organisateur)
- ✅ course-create.html
- ✅ import-results.html

### Pages publiques (accessibles à tous)
- ✅ meetings.html (liste publique des événements)
- ✅ races.html (liste publique des épreuves)
- ✅ race.html (détail public d'une épreuve)
- ✅ race-ranking.html (classement public)

---

## 📱 Navigation responsive

Tous les écrans sont responsive et s'adaptent aux mobiles/tablettes :
- Grilles adaptatives
- Boutons empilés sur mobile
- Navigation sticky
- Touch-friendly

---

## 🚀 Déploiement

1. Remplacer les fichiers HTML par les nouvelles versions
2. Vérifier que les fichiers JS importent correctement
3. Tester le flux complet :
   - Créer événement
   - Créer épreuve
   - Importer résultats
   - Voir classement public

---

## ❓ Support

En cas de problème, vérifier :
- Les paramètres URL (`meetingId`, `raceId`, `id`)
- Les fonctions de stockage (localStorage ou Supabase)
- Les logs console du navigateur

---

**Dernière mise à jour : 16 janvier 2026**
