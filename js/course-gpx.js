// js/course-gpx.js
window.GPX_CACHE = null;

const fileInput = document.getElementById("gpxFile");
const btn = document.getElementById("analyzeGpxBtn");
const stats = document.getElementById("gpxStats");
const canvas = document.getElementById("profileCanvas");

const distAuto = document.getElementById("distanceKmAuto");
const dplusAuto = document.getElementById("dplusMAuto");
const autoScores = document.getElementById("autoScores");

// sliders + values
const road = document.getElementById("roadPct");
const track = document.getElementById("trackPct");
const single = document.getElementById("singlePct");
const roadVal = document.getElementById("roadVal");
const trackVal = document.getElementById("trackVal");
const singleVal = document.getElementById("singleVal");
const remainEl = document.getElementById("remain");

// terrain inputs
const rockyPctEl = document.getElementById("rockyPct");
const hairpinsEl = document.getElementById("hairpins");
const jumpsEl = document.getElementById("jumps");
const hikeEl = document.getElementById("hikeabike");

// technicité finale (checkbox behaving like radio)
const techBoxes = Array.from(document.querySelectorAll(".techFinal"));
const techHint = document.getElementById("techFinalHint");

function clamp(n, a, b) { return Math.max(a, Math.min(b, n)); }

function getTechFinal5() {
  const checked = techBoxes.find(b => b.checked);
  return checked ? Number(checked.value) : null;
}

techBoxes.forEach(box => {
  box.addEventListener("change", () => {
    if (box.checked) techBoxes.forEach(b => { if (b !== box) b.checked = false; });
    const v = getTechFinal5();
    techHint.textContent = "Niveau sélectionné : " + (v ? `${v}/5` : "—");
    updateAutoScores();
  });
});

// total cannot exceed 100: clamp the moved slider based on remaining capacity
function enforceMaxTotal(changed) {
  let r = Number(road.value || 0);
  let t = Number(track.value || 0);
  let s = Number(single.value || 0);

  if (changed === "road") {
    const maxR = 100 - t - s;
    r = clamp(r, 0, maxR);
    road.value = r;
  } else if (changed === "track") {
    const maxT = 100 - r - s;
    t = clamp(t, 0, maxT);
    track.value = t;
  } else if (changed === "single") {
    const maxS = 100 - r - t;
    s = clamp(s, 0, maxS);
    single.value = s;
  }

  updateRoadUI();
}

function updateRoadUI() {
  const r = Number(road.value || 0);
  const t = Number(track.value || 0);
  const s = Number(single.value || 0);

  roadVal.textContent = r;
  trackVal.textContent = t;
  singleVal.textContent = s;

  const remain = 100 - (r + t + s);
  remainEl.textContent = String(remain);

  updateAutoScores();
}

road.addEventListener("input", () => enforceMaxTotal("road"));
track.addEventListener("input", () => enforceMaxTotal("track"));
single.addEventListener("input", () => enforceMaxTotal("single"));

[rockyPctEl, hairpinsEl, jumpsEl, hikeEl].forEach(el => el.addEventListener("input", updateAutoScores));

function computePhysScore(gpx) {
  const D = gpx.distanceKm;
  const H = gpx.dplusM ?? 0;
  const effort = Math.sqrt(Math.max(0, D)) + (H / 1000);

  const p10 = gpx.steep?.p10 ?? 0;
  const p15 = gpx.steep?.p15 ?? 0;

  const steep = clamp(0.7 * p10 + 1.3 * p15, 0, 1);
  const effN = clamp(effort / 12, 0, 1); // 12 = gros effort (tunable)
  const phys = 100 * (0.78 * effN + 0.22 * steep);

  return { effort: Math.round(effort * 100) / 100, phys: Math.round(phys) };
}

function computeTechScore() {
  const r = Number(road.value || 0) / 100;
  const t = Number(track.value || 0) / 100;
  const s = Number(single.value || 0) / 100;

  const rockyN = clamp(Number(rockyPctEl.value || 0) / 100, 0, 1);
  const hairN = clamp(Number(hairpinsEl.value || 0) / 5, 0, 1);
  const jumpN = clamp(Number(jumpsEl.value || 0) / 5, 0, 1);
  const hikeN = clamp(Number(hikeEl.value || 0) / 5, 0, 1);

  // surface score (0..1): road penalized, single boosted
  const surfaceScore = clamp((0.0 * r) + (0.45 * t) + (1.0 * s), 0, 1);

  const tech100 = 100 * (
    0.30 * rockyN +
    0.30 * surfaceScore +
    0.15 * hairN +
    0.15 * jumpN +
    0.10 * hikeN
  );

  // technicité finale imposée (1..5) si choisie
  const techFinal5 = getTechFinal5();
  const tech5 = techFinal5 ? clamp(techFinal5, 1, 5) : (1 + Math.round(4 * clamp(tech100 / 100, 0, 1)));

  return { tech100: Math.round(tech100), tech5 };
}

function updateAutoScores() {
  const techChosen = getTechFinal5();
  if (!window.GPX_CACHE) {
    autoScores.textContent = techChosen
      ? `Technicité: ${techChosen}/5 • Analyse GPX requise pour score physique/global.`
      : "Choisis une technicité finale (1–5) + analyse GPX pour score physique/global.";
    return;
  }

  const physObj = computePhysScore(window.GPX_CACHE);
  const techObj = computeTechScore();

  const global100 = Math.round(0.60 * physObj.phys + 0.40 * techObj.tech100);
  const global5 = 1 + Math.round(4 * clamp(global100 / 100, 0, 1));

  autoScores.textContent =
    `Auto: Effort=${physObj.effort} • Phys=${physObj.phys}/100 • Tech=${techObj.tech100}/100 (final=${techObj.tech5}/5) • Global=${global100}/100 (≈${global5}/5)`;
}

btn.addEventListener("click", async () => {
  const file = fileInput.files && fileInput.files[0];
  if (!file) { alert("Choisis un fichier GPX"); return; }

  try {
    const res = await analyzeGPXFile(file);

    window.GPX_CACHE = {
      fileName: file.name,
      distanceKm: res.distanceKm,
      dplusM: res.dplusM,
      hasElevation: res.hasElevation,
      profile: res.pointsProfile,
      map: res.pointsMap,
      steep: res.steepStats
    };

    distAuto.value = `${res.distanceKm} km`;
    dplusAuto.value = (res.dplusM !== null && res.dplusM !== undefined) ? `${res.dplusM} m` : "indisponible";

    stats.textContent =
      `GPX: ${file.name} • Distance: ${res.distanceKm} km • D+: ${
        res.dplusM !== null && res.dplusM !== undefined ? res.dplusM + " m" : "indisponible"
      } • p>10%: ${Math.round((res.steepStats.p10 || 0) * 100)}% • p>15%: ${Math.round((res.steepStats.p15 || 0) * 100)}%`;

    // draw profile
    if (canvas && typeof drawProfile === "function") {
      const rect = canvas.getBoundingClientRect();
      if (rect.width > 0) {
        canvas.width = Math.floor(rect.width * window.devicePixelRatio);
        canvas.height = Math.floor(220 * window.devicePixelRatio);
        canvas.style.height = "220px";
      }
      drawProfile(canvas, res.pointsProfile);
    }

    if (!res.hasElevation) {
      alert("⚠️ Ton GPX ne contient pas d'altitude (<ele>). Le D+ sera indisponible.");
    }

    updateAutoScores();
  } catch (e) {
    console.error(e);
    alert("Erreur GPX: " + e.message);
  }
});

// init
updateRoadUI();
updateAutoScores();
