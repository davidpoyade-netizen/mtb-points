# 🔧 Guide de Migration JavaScript

Ce document détaille les modifications JavaScript nécessaires pour implémenter la nouvelle architecture.

---

## 1️⃣ organizer-dashboard.js

### Modifications nécessaires

**Ligne à modifier** : Clic sur un événement dans la liste

```javascript
// ❌ AVANT (ancien comportement)
el.addEventListener("click", () => {
  // Ouvre une modal ou affiche inline
});

// ✅ APRÈS (nouvelle architecture)
el.addEventListener("click", () => {
  window.location.href = `meeting.html?id=${encodeURIComponent(meeting.id)}`;
});
```

**Ou dans le HTML rendu** :

```javascript
// ❌ AVANT
el.innerHTML = `
  <div class="item">
    <div class="title">${esc(meeting.name)}</div>
    <button onclick="viewMeeting('${meeting.id}')">Voir</button>
  </div>
`;

// ✅ APRÈS
el.innerHTML = `
  <a class="item" href="meeting.html?id=${encodeURIComponent(meeting.id)}">
    <div class="topline">
      <div class="title">${esc(meeting.name)}</div>
      <span class="badge">${esc(meeting.date || '—')}</span>
    </div>
    <div class="meta">
      📍 ${esc(meeting.location || 'Lieu non spécifié')}
      • 🏁 ${raceCount} épreuve(s)
    </div>
    <div class="miniRow">
      <span class="btn primary">👁️ Voir l'événement</span>
      <a class="btn" href="course-create.html?meetingId=${encodeURIComponent(meeting.id)}" 
         onclick="event.stopPropagation()">+ Créer une épreuve</a>
    </div>
  </a>
`;
```

---

## 2️⃣ meeting.html (nouveau fichier)

### JavaScript inline déjà inclus

Le fichier `meeting.html` contient déjà le JavaScript nécessaire :

```javascript
// Récupération du meetingId
const params = new URLSearchParams(location.search);
const meetingId = params.get("id");

// Chargement de l'événement
const meeting = findMeetingSafe(meetingId);

// Chargement des épreuves
const races = allRaces.filter(r => 
  r?.meetingId === meetingId || r?.eventGroupId === meetingId
);

// Bouton création épreuve
$("btnCreateRace").href = `course-create.html?meetingId=${encodeURIComponent(meetingId)}`;
```

✅ **Aucune modification nécessaire** si vous utilisez le fichier fourni.

---

## 3️⃣ course-create.js

### Vérifications

Le fichier devrait déjà contenir :

```javascript
// Récupération du meetingId depuis l'URL
const params = new URLSearchParams(location.search);
const meetingId = params.get("meetingId") || "";

// Initialisation
async function initMeetings() {
  const sel = $("meetingId");
  if (!sel) return;

  // ... chargement meetings ...
  
  if (meetingId) {
    sel.value = meetingId;
    await applyMeetingDefaults(meetingId);
  }
}
```

### ✅ Déjà corrigé
Le sélecteur de fichier GPX a été corrigé pour utiliser un `<label for="gpxFile">` au lieu d'un bouton avec `.click()`.

---

## 4️⃣ race.html

### Ajout des boutons d'action

Dans la section hero ou actions, ajouter :

```javascript
// Dans le rendu de la page
const raceId = params.get("id");

// Boutons d'action
const actionsHTML = `
  <div class="heroActions">
    <a class="btn" href="meeting.html?id=${encodeURIComponent(race.meetingId)}">
      ← Retour événement
    </a>
    <a class="btn primary" href="import-results.html?raceId=${encodeURIComponent(raceId)}">
      📊 Importer résultats
    </a>
    <a class="btn ghost" href="race-ranking.html?id=${encodeURIComponent(raceId)}">
      🏆 Voir classement
    </a>
  </div>
`;
```

---

## 5️⃣ import-results.js

### Modifications nécessaires

**Au chargement de la page** :

```javascript
// ✅ AJOUTER au début
const params = new URLSearchParams(location.search);
const preselectedRaceId = params.get("raceId");

async function initRaceSelect() {
  const select = document.getElementById("raceSelect");
  const races = await loadRaces(); // votre fonction de chargement
  
  select.innerHTML = '<option value="">— Choisir une épreuve —</option>' +
    races.map(r => `
      <option value="${r.id}" ${r.id === preselectedRaceId ? 'selected' : ''}>
        ${esc(r.name)} • ${esc(r.date || '—')}
      </option>
    `).join('');
  
  // Si pré-sélectionné, charger les métadonnées
  if (preselectedRaceId) {
    await loadRaceMeta(preselectedRaceId);
  }
}

// Appeler au chargement
initRaceSelect();
```

---

## 6️⃣ race-ranking.js

### Modifications nécessaires

**Récupération de l'ID de l'épreuve** :

```javascript
// ✅ AJOUTER au début
const params = new URLSearchParams(location.search);
const raceId = params.get("id");

if (!raceId) {
  console.error("Aucun ID d'épreuve fourni");
  showError("Aucune épreuve spécifiée. URL attendue : race-ranking.html?id=xxx");
  return;
}

// Charger l'épreuve
async function loadRaceAndResults() {
  const race = await getRace(raceId);
  
  if (!race) {
    showError("Épreuve introuvable");
    return;
  }
  
  // Afficher infos épreuve
  document.getElementById("raceTitle").textContent = race.name;
  document.getElementById("raceMeta").innerHTML = `
    📅 ${esc(race.date)} • ${esc(race.disc || '—')} • ${esc(race.level || '—')}
  `;
  
  // Charger résultats
  const results = await getResults(raceId);
  renderRankings(results);
}
```

**Bouton retour** :

```javascript
// Ajouter un bouton pour retourner à la fiche épreuve
document.getElementById("btnBack").href = `race.html?id=${encodeURIComponent(raceId)}`;
```

---

## 🔄 Ordre de migration

1. ✅ **course-create.html** (déjà corrigé - sélecteur GPX)
2. ⚠️ **organizer-dashboard.js** - Modifier les clics sur événements
3. ✅ **meeting.html** - Nouveau fichier (déjà complet)
4. ⚠️ **race.html** - Ajouter boutons d'action
5. ⚠️ **import-results.js** - Ajouter pré-sélection depuis URL
6. ⚠️ **race-ranking.js** - Récupérer ID depuis URL

---

## 🧪 Tests recommandés

Après migration, tester le flux complet :

```
1. Se connecter comme organisateur
2. organizer-dashboard.html → Créer événement "Test 2026"
3. Cliquer sur l'événement → meeting.html s'ouvre
4. Cliquer "+ Créer épreuve" → course-create.html s'ouvre avec meetingId
5. Importer GPX, créer épreuve "XC Test"
6. Sur la fiche épreuve → Cliquer "Importer résultats"
7. import-results.html s'ouvre avec épreuve pré-sélectionnée
8. Importer un CSV de résultats
9. Cliquer "Voir classement" → race-ranking.html affiche les classements
10. Partager le lien race-ranking.html (public)
```

---

## 📞 Debug

Si un lien ne fonctionne pas :

```javascript
// Console navigateur
console.log("URL params:", new URLSearchParams(location.search).toString());
console.log("meetingId:", params.get("meetingId"));
console.log("raceId:", params.get("raceId"));
```

---

## ✅ Checklist finale

- [ ] organizer-dashboard.js : liens vers meeting.html
- [ ] meeting.html : déployé et testé
- [ ] course-create.js : récupère meetingId de l'URL
- [ ] race.html : boutons import/classement
- [ ] import-results.js : pré-sélection raceId
- [ ] race-ranking.js : récupère id de l'URL
- [ ] Test du flux complet bout en bout

---

**Dernière mise à jour : 16 janvier 2026**
