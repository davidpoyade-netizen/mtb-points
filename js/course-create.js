// Remplir la liste des événements existants
(function initMeetingSelect(){
  const sel = document.getElementById("eventGroupId");
  if (!sel) return;
  const meetings = loadMeetings();
  meetings.forEach(m => {
    const opt = document.createElement("option");
    opt.value = m.id;
    opt.textContent = `${m.name} (${m.date || "—"})`;
    sel.appendChild(opt);
  });
})();
function val(id) {
  const el = document.getElementById(id);
  return el ? el.value.trim() : "";
}
function getCheckedValues(selector){
  return Array.from(document.querySelectorAll(selector))
    .filter(x => x.checked)
    .map(x => x.value);
}

function num(id) {
  const v = val(id);
  if (!v) return null;
  const n = Number(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : null;
}
function getTechFinal5() {
  const checked = document.querySelector(".techFinal:checked");
  return checked ? Number(checked.value) : null;
}

document.getElementById("saveCourseBtn").addEventListener("click", () => {
  const name = val("courseName");
  const date = val("courseDate");
  const disc = val("disc");

  if (!name || !date || !disc) {
    alert("⚠️ Champs obligatoires : Nom, Date, Discipline");
    return;
  }

  // GPX is mandatory for distance/dplus
  if (!window.GPX_CACHE) {
    alert("⚠️ Analyse d'abord la trace GPX (obligatoire) pour calculer Distance et D+.");
    return;
  }

  // technicité finale obligatoire
  const tech5 = getTechFinal5();
  if (!tech5) {
    alert("⚠️ Choisis une technicité finale (1 à 5).");
    return;
  }

  // total % must be <=100 (UI clamps, but we check)
  const roadPct = Number(document.getElementById("roadPct").value || 0);
  const trackPct = Number(document.getElementById("trackPct").value || 0);
  const singlePct = Number(document.getElementById("singlePct").value || 0);
  const total = roadPct + trackPct + singlePct;
  if (total > 100) {
    alert("⚠️ Le total des types de voie ne peut pas dépasser 100%.");
    return;
  }

  const ev = {
    id: makeIdFromName(name),
    name,
    date,
    disc,

    ebike: (val("ebike") === "1"),
    bikeWash: (val("bikeWash") === "1"),
ageCategories: getCheckedValues(".ageCat"),

const level = val("level");
if (!name || !date || !disc || !level) {
  alert("⚠️ Champs obligatoires : Nom, Date, Discipline, Niveau");
  return;
}
eventGroupId: val("eventGroupId") || null,
laps: {
  default: Number(val("lapsDefault") || 1),
  bySex: {
    M: Number(val("lapsMen") || 1),
    F: Number(val("lapsWomen") || 1)
  },
  rules: [] // on ajoutera la version par catégories d’âge ensuite
},

    // FROM GPX ONLY
    distanceKm: window.GPX_CACHE.distanceKm,
    dplusM: window.GPX_CACHE.dplusM,

    category: val("category"),
    startPlace: val("startPlace"),
    finishPlace: val("finishPlace"),
    startTime: val("startTime") || null,

    aidStations: num("aidStations"),
    mechStations: num("mechStations"),
    cutoffTime: val("cutoffTime") || null,
    participantsCount: num("participantsCount"),
    comment: val("comment"),

    // type de voie
    surface: { roadPct, trackPct, singlePct },

    // terrain / obstacles
    rockyPct: num("rockyPct"),
    hairpins: num("hairpins"),
    jumps: num("jumps"),
    hikeabike: num("hikeabike"),

    // technicité finale imposée
    tech5,

    // GPX data for profile + map on event page
    gpx: {
      fileName: window.GPX_CACHE.fileName,
      distanceKm: window.GPX_CACHE.distanceKm,
      dplusM: window.GPX_CACHE.dplusM,
      hasElevation: window.GPX_CACHE.hasElevation,
      profile: window.GPX_CACHE.profile,
      map: window.GPX_CACHE.map,
      steep: window.GPX_CACHE.steep
    }
  };

  addStoredEvent(ev);
  if (ev.eventGroupId) {
  const m = findMeeting(ev.eventGroupId);
  if (m) {
    m.raceIds = m.raceIds || [];
    if (!m.raceIds.includes(ev.id)) m.raceIds.push(ev.id);
    updateMeeting(m);
  }
}

  alert("✅ Épreuve enregistrée !");
  window.location.href = "events.html";
});
