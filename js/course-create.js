// js/course-create.js (ESM)
// MTB Points — Création épreuve (organizer)
// Exigences projet:
// - Multi-tours (case + grille) NE JAMAIS SUPPRIMER
// - Bouton "Créer + dupliquer (Musculaire ↔ E-bike)" NE JAMAIS SUPPRIMER
// - Analyse GPX/OSM obligatoire (via window.analyzeGPX de js/gpx.js)
// - Ne pas afficher les scores (ils seront affichés dans race.html)
// - Distance et D+ sont calculés automatiquement (pas de champs à saisir)

import {
  loadMeetingsHybrid,
  findMeetingHybrid,
  updateMeetingHybrid,
  addStoredEventHybrid,
  makeIdFromName,
} from "./storage-supabase.js";

const $ = (id) => document.getElementById(id);

const AGE_CATS = [
  { id: "U7", label: "U7 (Poussin 7–8)" },
  { id: "U9", label: "U9 (Pupille 9–10)" },
  { id: "U11", label: "U11 (Benjamin 11–12)" },
  { id: "U13", label: "U13 (Minime 13–14)" },
  { id: "U15", label: "U15 (Cadet 15–16)" },
  { id: "U17", label: "U17 (Junior 17–18)" },
  { id: "U23", label: "U23 (Espoir 19–22)" },
  { id: "SEN", label: "SEN (Senior/Élite 19–34)" },
  { id: "M1", label: "M1 (35–39)" },
  { id: "M2", label: "M2 (40–44)" },
  { id: "M3", label: "M3 (45–49)" },
  { id: "M4", label: "M4 (50–54)" },
  { id: "M5", label: "M5 (55–59)" },
  { id: "M6", label: "M6 (60–64)" },
  { id: "M7", label: "M7 (65–69)" },
  { id: "M8", label: "M8 (70–74)" },
  { id: "M9", label: "M9 (75–79)" },
];

let ANALYSIS = null;
let ANALYZE_BUSY = false;

function clamp04(v){
  const n = Math.round(Number(v));
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(4, n));
}

/**
 * Suggestion automatique de discipline à partir de l'analyse GPX/OSM.
 * - Gravel si tech01 très faible (terrain très roulant)
 * - DH (optionnel) si très court
 * - XCC / XCO / XCM selon distance
 */
function inferDisciplineFromAnalysis(analysis){
  const km = Number(analysis?.distanceKm);
  const tech01 = Number(analysis?.techV2?.tech01 ?? analysis?.techV2?.tech01_avg ?? analysis?.tech01);

  if (!Number.isFinite(km) || km <= 0) return null;

  // Gravel si terrain très roulant
  if (Number.isFinite(tech01) && tech01 <= 0.18) return "Gravel";

  // DH (heuristique simple: très court)
  if (km < 6) return "DH";

  if (km < 12) return "XCC";
  if (km < 40) return "XCO";
  if (km < 100) return "XCM_marathon";
  return "XCM_ultra";
}


function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (m) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[m]));
}

function showMsg(html, ok = true) {
  const el = $("msg");
  if (!el) return;
  el.style.display = html ? "block" : "none";
  el.innerHTML = html ? (ok ? `✅ ${html}` : `❌ ${html}`) : "";
  el.style.borderColor = ok ? "#c7f9cc" : "#fecaca";
}

function showStatus(on) {
  const box = $("statusBox");
  if (box) box.style.display = on ? "block" : "none";
}

function setStatus(phase, msg, prog = null, sub = "") {
  showStatus(true);
  const phaseEl = $("statusPhase");
  const msgEl = $("statusMsg");
  const subEl = $("statusSub");
  const wrap = $("statusBarWrap");
  const bar = $("statusBar");

  if (phaseEl) phaseEl.innerHTML = `<span class="dot"></span> ${esc(phase || "—")}`;
  if (msgEl) msgEl.textContent = msg || "—";
  if (subEl) subEl.textContent = sub || "";

  if (wrap && bar) {
    if (prog == null) {
      wrap.style.display = "none";
      bar.style.width = "0%";
    } else {
      wrap.style.display = "block";
      bar.style.width = `${Math.max(0, Math.min(100, prog))}%`;
    }
  }
}

// écoute les events de js/gpx.js
window.addEventListener("mtb:status", (e) => {
  const d = e?.detail || {};
  const phase = d.phase || "—";
  const msg = d.message || "—";
  const p = typeof d.progress === "number" ? Math.round(d.progress * 100) : null;
  setStatus(phase, msg, p, $("statusSub")?.textContent || "");
});

function normalizeISODate(v) {
  const s = String(v || "").trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}

function pushRaceId(meeting, raceId) {
  const m = { ...(meeting || {}) };
  m.raceIds = Array.isArray(m.raceIds) ? m.raceIds : [];
  if (!m.raceIds.includes(raceId)) m.raceIds.push(raceId);
  return m;
}

async function initMeetings() {
  const sel = $("meetingId");
  if (!sel) return;

  const params = new URLSearchParams(location.search);
  const mid = params.get("meetingId") || "";

  let meetings = [];
  try {
    meetings = await loadMeetingsHybrid();
  } catch (e) {
    console.warn("[course-create] loadMeetingsHybrid", e);
    meetings = [];
  }

  meetings = (meetings || []).slice().sort((a, b) => String(b?.date || "").localeCompare(String(a?.date || "")));

  sel.innerHTML = `<option value="">— Choisir —</option>` + meetings.map((m) => {
    const d = m?.date ? ` • ${esc(m.date)}` : "";
    return `<option value="${esc(m.id)}">${esc(m.name || "Événement")}${d}</option>`;
  }).join("");

  if (mid) {
    sel.value = mid;
    await applyMeetingDefaults(mid);
  } else {
    const hint = $("meetingHint");
    if (hint) hint.textContent = "Sélectionne un événement.";
  }

  sel.addEventListener("change", async () => {
    await applyMeetingDefaults(sel.value);
  });
}

// defaults (si page ouverte sans meeting sélectionné)
const timeEl0 = $("time");
if (timeEl0 && !timeEl0.value) timeEl0.value = "08:30";
const lvl0 = $("level");
if (lvl0 && !lvl0.value) lvl0.value = "Locale";

const mech0 = $("mechanic");
if (mech0 && (mech0.value === "" || mech0.value == null)) mech0.value = "0";
const feeds0 = $("feeds");
if (feeds0 && (feeds0.value === "" || feeds0.value == null)) feeds0.value = "0";

// Discipline obligatoire: on force required au cas où (HTML doit aussi l'avoir)
const disc0 = $("disc");
if (disc0) disc0.required = true;

// Nouvel UI : case "Ouvert VAE" + heure de départ VAE
const ebOpen0 = $("ebikeOpen");
const ebStart0 = $("ebikeStartTime");
if (ebOpen0 && ebStart0) {
  const apply = () => {
    ebStart0.disabled = !ebOpen0.checked;
    if (!ebOpen0.checked) ebStart0.value = "";
  };
  ebOpen0.addEventListener("change", apply);
  apply();
}


async function applyMeetingDefaults(meetingId) {
  const hint = $("meetingHint");
  if (!meetingId) {
    if (hint) hint.textContent = "⚠️ Sélectionne un événement.";
    return;
  }

  let meeting = null;
  try {
    meeting = await findMeetingHybrid(meetingId);
  } catch (e) {
    console.warn("[course-create] findMeetingHybrid", e);
    meeting = null;
  }

  if (!meeting) {
    if (hint) hint.textContent = "⚠️ Événement introuvable.";
    return;
  }

  const start = meeting.date || "";
  const end = meeting.endDate || "";

  if (hint) {
    hint.textContent = end
      ? `📅 Plage événement : ${start || "—"} → ${end}`
      : `📅 Date événement : ${start || "—"}`;
  }

  const back = $("btnBack");
  if (back) back.href = `meeting.html?id=${encodeURIComponent(meeting.id)}`;

  const dateEl = $("date");
  if (dateEl) {
    dateEl.min = start || "";
    dateEl.max = end || start || "";
    if (!dateEl.value && start) dateEl.value = start;
    if (start && dateEl.value && dateEl.value < start) dateEl.value = start;
    if (end && dateEl.value && dateEl.value > end) dateEl.value = start || end;
  }

  const timeEl = $("time");
  if (timeEl && !timeEl.value) timeEl.value = "08:30";

  const lvlEl = $("level");
  if (lvlEl) { lvlEl.required = true; if (!lvlEl.value) lvlEl.value = "Locale"; }
}

// ---------- Multi-tours (NE PAS SUPPRIMER)
function renderAgeRows() {
  const box = $("ageRows");
  if (!box) return;

  box.innerHTML = AGE_CATS.map((cat) => `
    <div class="ageRow">
      <div>
        <label>
          <input type="checkbox" data-cat="${esc(cat.id)}" class="catOn" />
          <div>
            <div style="font-weight:900">${esc(cat.id)}</div>
            <div class="muted2">${esc(cat.label)}</div>
          </div>
        </label>
      </div>

      <div><input type="number" min="0" step="1" placeholder="—" class="lapsM" data-cat="${esc(cat.id)}" disabled></div>
      <div><input type="time" class="startM" data-cat="${esc(cat.id)}" disabled></div>

      <div><input type="number" min="0" step="1" placeholder="—" class="lapsF" data-cat="${esc(cat.id)}" disabled></div>
      <div><input type="time" class="startF" data-cat="${esc(cat.id)}" disabled></div>
    </div>
  `).join("");

  box.querySelectorAll(".catOn").forEach((chk) => {
    chk.addEventListener("change", () => {
      const id = chk.getAttribute("data-cat");
      const m = box.querySelector(`.lapsM[data-cat="${CSS.escape(id)}"]`);
      const f = box.querySelector(`.lapsF[data-cat="${CSS.escape(id)}"]`);
      const tm = box.querySelector(`.startM[data-cat="${CSS.escape(id)}"]`);
      const tf = box.querySelector(`.startF[data-cat="${CSS.escape(id)}"]`);
      const on = chk.checked;

      if (m) { m.disabled = !on; if (!on) m.value = ""; }
      if (f) { f.disabled = !on; if (!on) f.value = ""; }
      if (tm) { tm.disabled = !on; if (!on) tm.value = ""; }
      if (tf) { tf.disabled = !on; if (!on) tf.value = ""; }
    });
  });
}


function initMultiToggle() {
  const chk = $("enableMultiLaps");
  const wrap = $("multiLapsWrap");
  if (!chk || !wrap) return;

  const apply = () => {
    wrap.style.display = chk.checked ? "block" : "none";
    if (!chk.checked) {
      document.querySelectorAll(".catOn").forEach((c) => (c.checked = false));
      document.querySelectorAll(".lapsM,.lapsF,.startM,.startF").forEach((i) => { i.value = ""; i.disabled = true; });
    }
  };

  chk.addEventListener("change", apply);
  apply();
}

function collectLapsByCategorySex() {
  if (!$("enableMultiLaps")?.checked) return null;
  const box = $("ageRows");
  if (!box) return null;

  const out = {};
  box.querySelectorAll(".catOn").forEach((chk) => {
    if (!chk.checked) return;
    const id = chk.getAttribute("data-cat");
    const m = box.querySelector(`.lapsM[data-cat="${CSS.escape(id)}"]`);
    const f = box.querySelector(`.lapsF[data-cat="${CSS.escape(id)}"]`);
    const tm = box.querySelector(`.startM[data-cat="${CSS.escape(id)}"]`);
    const tf = box.querySelector(`.startF[data-cat="${CSS.escape(id)}"]`);

    const mVal = m && m.value !== "" ? Number(m.value) : null;
    const fVal = f && f.value !== "" ? Number(f.value) : null;

    const mTime = tm && tm.value ? String(tm.value) : null;
    const fTime = tf && tf.value ? String(tf.value) : null;

    out[id] = {
      M: {
        laps: Number.isFinite(mVal) ? mVal : null,
        start: mTime,
      },
      F: {
        laps: Number.isFinite(fVal) ? fVal : null,
        start: fTime,
      },
    };
  });

  return Object.keys(out).length ? out : {};
}

// ---------- GPX/OSM
function clearGpx() {
  ANALYSIS = null;
  const inp = $("gpxFile");
  if (inp) inp.value = "";
  const name = $("pickedFileName");
  if (name) name.textContent = "";
  showStatus(false);
  showMsg("");
}

function setAnalyzeBusy(on) {
  ANALYZE_BUSY = !!on;
  const btn = $("btnPickAnalyze");
  if (!btn) return;
  if (on) {
    btn.disabled = true;
    btn.dataset.label = btn.textContent;
    btn.textContent = "⏳ Analyse en cours…";
  } else {
    btn.disabled = false;
    btn.textContent = btn.dataset.label || "📂 Choisir un GPX & analyser";
  }
}

async function analyzeGpx() {
  const f = $("gpxFile")?.files?.[0];
  if (!f) {
    showMsg("GPX obligatoire : sélectionne un fichier GPX.", false);
    return;
  }
  if (typeof window.analyzeGPX !== "function") {
    showMsg("analyzeGPX introuvable : vérifie que js/gpx.js est bien chargé.", false);
    return;
  }

  setAnalyzeBusy(true);
  showMsg("");

  try {
    setStatus("Préparation", "Lecture du fichier…", 5, "Démarrage…");

    const res = await window.analyzeGPX(f, {
      keepPoints: true,
      // si tu veux basculer sur une autre URL:
      // apiBase: "https://mtb-points.onrender.com",
      timeoutMs: 45000,
    });

    ANALYSIS = {
      fileName: f.name,
      analyzedAt: Date.now(),
      distanceKm: res?.distanceKm ?? res?.meta?.stats?.distanceKm ?? null,
      dplusM: res?.dplusM ?? res?.meta?.stats?.dplusM ?? null,
      hasElevation: res?.hasElevation ?? res?.meta?.stats?.hasElevation ?? null,

      // Tech V2 (serveur)
      techV2: res?.techV2 ?? res?.tech ?? null,
      surfaceEstimate: res?.surfaceEstimate ?? res?.tech?.surfaceEstimate ?? null,

      // Phys (côté serveur si renvoyé, sinon on laisse null)
      phys: res?.phys ?? null,

      // score global (mrs)
      mrs: typeof res?.mrs === "number" ? res.mrs : null,

      discipline: res?.discipline ?? null,

      // points: selon API
      points: res?.points ?? null,
      raw: res || null,
    };

    setStatus("done", "Analyse terminée.", 100, "Tu peux enregistrer l’épreuve.");
    showMsg("Analyse GPX/OSM terminée.", true);

    // Discipline: auto-suggestion après analyse (sans écraser un choix manuel)
    const discEl = $("disc");
    if (discEl) {
      discEl.required = true;
      const userAlreadyPicked = !!discEl.value;
      if (!userAlreadyPicked) {
        const inferred = inferDisciplineFromAnalysis(ANALYSIS);
        if (inferred) discEl.value = inferred;
      }
    }
  } catch (e) {
    ANALYSIS = null;
    console.warn(e);
    setStatus("error", "Analyse impossible.", null, e?.message || "Erreur serveur / réseau.");
    showMsg(`Analyse GPX/OSM impossible : ${esc(e?.message || "erreur")}`, false);
  } finally {
    setAnalyzeBusy(false);
  }
}

// ---------- Save
function validate() {
  const meetingId = ($("meetingId")?.value || "").trim();
  const date = ($("date")?.value || "").trim();
  const name = ($("name")?.value || "").trim();

  const level = ($("level")?.value || "").trim();
  const disc = ($("disc")?.value || "").trim();
  // UI: épreuve ouverte au VAE (checkbox)
  const ebikeOpen = !!$("ebikeOpen")?.checked;

  if (!meetingId) return "Événement obligatoire.";
  if (!date) return "Date obligatoire.";
  if (!name) return "Nom de l’épreuve obligatoire.";

  if (!level) return "Catégorie obligatoire (par défaut : Locale).";
  if (!disc) return "Discipline obligatoire.";
  // "Ouvert VAE" n'est pas obligatoire

  // Force 0..4 (au cas où)
  const mech = Math.max(0, Math.min(4, Number(($("mechanic")?.value ?? 0))));
  const feeds = Math.max(0, Math.min(4, Number(($("feeds")?.value ?? 0))));
  if ($("mechanic")) $("mechanic").value = String(mech);
  if ($("feeds")) $("feeds").value = String(feeds);

  if (!ANALYSIS) return "GPX/OSM obligatoire : importe un GPX et lance l’analyse.";
  return null;
}

async function buildRace({ ebikeOverride = null, nameSuffix = "", idSalt = 0 } = {}) {
  const meetingId = $("meetingId").value;
  const meeting = await findMeetingHybrid(meetingId);
  const lapsByCategorySex = collectLapsByCategorySex();

  const baseName = $("name").value.trim();
  const finalName = (baseName + (nameSuffix ? ` ${nameSuffix}` : "")).trim();

  const ebikeVal = ebikeOverride === null ? !!$("ebikeOpen")?.checked : !!ebikeOverride;
  const ebikeStartTime = ($("ebikeStartTime")?.value || "").trim() || null;

  const id = makeIdFromName(finalName);
  const finalId = idSalt ? `${id}-${idSalt}` : id;

  return {
    id: finalId,
    name: finalName,
    date: normalizeISODate($("date").value),
    time: $("time").value || null,

    // rattachement meeting
    eventGroupId: meetingId,
    meetingId,
    meetingName: meeting?.name || null,

    // infos
    cutoffTime: $("cutoff").value.trim() || null,
    level: $("level").value || null,
    disc: $("disc").value || null,

    ebike: ebikeVal,
    ebikeOpen: ebikeVal,
    ebikeStartTime,
    bikeWash: $("wash").value || null,
    mechAssist: clamp04($("mechanic")?.value ?? 0),
    feeds: clamp04($("feeds")?.value ?? 0),
    sexAllowed: $("sexAllowed").value || "all",

    comment: $("comment").value.trim() || null,

    // auto from analysis (pas de champs distance/d+)
    distanceKm: ANALYSIS?.distanceKm ?? null,
    dplusM: ANALYSIS?.dplusM ?? null,
    surfaceEstimate: ANALYSIS?.surfaceEstimate ?? null,

    // scores stockés mais NON affichés sur cette page
    scorePhys: ANALYSIS?.phys?.score ?? null,
    scoreTech: (typeof ANALYSIS?.techV2?.techScoreV2 === "number") ? ANALYSIS.techV2.techScoreV2 : (ANALYSIS?.techV2?.techScore ?? null),
    scoreGlobal: ANALYSIS?.mrs ?? null,

    techV2: ANALYSIS?.techV2 ?? null,

    gpx: {
      fileName: ANALYSIS?.fileName || null,
      hasElevation: ANALYSIS?.hasElevation ?? null,
      // on peut stocker un échantillon ou rien selon tes besoins
      points: ANALYSIS?.points ?? null,
    },

    lapsByCategorySex: (lapsByCategorySex && Object.keys(lapsByCategorySex).length) ? lapsByCategorySex : null,

    createdAt: Date.now(),
    isPublished: false,
  };
}

function afterSaveLinks(race, race2 = null) {
  const b1 = $("btnViewRace");
  const b2 = $("btnViewRace2");
  if (b1 && race) {
    b1.href = `race.html?id=${encodeURIComponent(race.id)}`;
    b1.style.display = "inline-flex";
  }
  if (b2 && race2) {
    b2.href = `race.html?id=${encodeURIComponent(race2.id)}`;
    b2.style.display = "inline-flex";
  } else if (b2) {
    b2.href = "#";
    b2.style.display = "none";
  }
}

async function persistRace(race) {
  // 1) insert race (supabase si connecté, sinon local)
  await addStoredEventHybrid(race);

  // 2) push raceId into meeting (supabase si connecté, sinon local)
  const meeting = await findMeetingHybrid(race.meetingId);
  if (meeting) {
    const updated = pushRaceId(meeting, race.id);
    await updateMeetingHybrid(updated);
  }
}

async function saveSingle({ thenNew = false } = {}) {
  $("btnViewRace")?.style && ($("btnViewRace").style.display = "none");
  $("btnViewRace2")?.style && ($("btnViewRace2").style.display = "none");
  showMsg("");

  const err = validate();
  if (err) {
    showMsg(esc(err), false);
    return;
  }

  try {
    const race = await buildRace();
    await persistRace(race);

    showMsg(`Épreuve créée : <b>${esc(race.name)}</b>`, true);
    afterSaveLinks(race);

    if (thenNew) {
      setTimeout(() => resetForm(true), 80);
    }
  } catch (e) {
    console.warn(e);
    showMsg(`Enregistrement impossible : ${esc(e?.message || "erreur")}`, false);
  }
}

async function saveAndDuplicate() {
  $("btnViewRace")?.style && ($("btnViewRace").style.display = "none");
  $("btnViewRace2")?.style && ($("btnViewRace2").style.display = "none");
  showMsg("");

  const err = validate();
  if (err) {
    showMsg(esc(err), false);
    return;
  }

  const isEbikeSelected = $("ebike").value === "1";

  try {
    const race1 = await buildRace({ ebikeOverride: isEbikeSelected, nameSuffix: "", idSalt: 0 });
    const race2 = await buildRace({ ebikeOverride: !isEbikeSelected, nameSuffix: isEbikeSelected ? "— Musculaire" : "— E-bike", idSalt: 7 });

    await persistRace(race1);
    await persistRace(race2);

    showMsg(`Deux épreuves créées : <b>${esc(race1.name)}</b> et <b>${esc(race2.name)}</b> (classements séparés).`, true);
    afterSaveLinks(race1, race2);
  } catch (e) {
    console.warn(e);
    showMsg(`Duplication impossible : ${esc(e?.message || "erreur")}`, false);
  }
}

function resetForm(keepMeeting = true) {
  const keepMid = keepMeeting ? $("meetingId").value : "";
  const keepDate = keepMeeting ? $("date").value : "";

  ["name", "cutoff", "time", "comment"].forEach((id) => { const el = $(id); if (el) el.value = ""; });
  // defaults
  const timeEl = $("time");
  if (timeEl) timeEl.value = "08:30";

  const lvlEl = $("level");
  if (lvlEl) lvlEl.value = "Locale";

  const discEl = $("disc");
  if (discEl) discEl.value = "";

  const washEl = $("wash");
  if (washEl) washEl.value = "";

  const mechEl = $("mechanic");
  if (mechEl) mechEl.value = "0";

  const feedsEl = $("feeds");
  if (feedsEl) feedsEl.value = "0";

  $("ebike").value = "0";
  $("sexAllowed").value = "all";

  $("enableMultiLaps").checked = false;
  $("multiLapsWrap").style.display = "none";
  document.querySelectorAll(".catOn").forEach((c) => (c.checked = false));
  document.querySelectorAll(".lapsM,.lapsF").forEach((i) => { i.value = ""; i.disabled = true; });

  clearGpx();

  const b1 = $("btnViewRace");
  const b2 = $("btnViewRace2");
  if (b1) { b1.style.display = "none"; b1.href = "#"; }
  if (b2) { b2.style.display = "none"; b2.href = "#"; }

  showMsg("");

  if (keepMeeting) {
    $("meetingId").value = keepMid;
    applyMeetingDefaults(keepMid);
    $("date").value = keepDate;
  }
}

// ---------- Wire
(async function init() {
  await initMeetings();
  renderAgeRows();
  initMultiToggle();

  // Discipline: liste autorisée (pour éviter les valeurs "fantômes")
  const allowedDisc = new Set(["DH","Enduro","XCC","XCO","XCM_marathon","XCM_ultra","Gravel"]);
  const discEl = $("disc");
  if (discEl && discEl.value && !allowedDisc.has(discEl.value)) discEl.value = "";


  // IMPORTANT:
  // - Sur certains navigateurs, inp.click() sur un <input type="file"> caché peut être bloqué.
  // - Recommandé côté HTML: utiliser <label for="gpxFile" id="btnPickAnalyze">…</label>
  // Ici on se contente de reset la valeur pour permettre de re-sélectionner le même fichier.
    const pickLbl = $("btnPickAnalyze");
  // accessibilité: Enter/Espace sur le label ouvre le picker
  pickLbl?.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      $("gpxFile")?.click();
    }
  });

$("btnPickAnalyze")?.addEventListener("click", () => {
    showMsg("");
    const inp = $("gpxFile");
    if (inp) {
      inp.value = ""; // force change
      inp.click(); // Ouvre le sélecteur de fichiers
    }
  });

  $("gpxFile")?.addEventListener("change", async () => {
    const f = $("gpxFile")?.files?.[0];
    $("pickedFileName").textContent = f ? `Fichier sélectionné : ${f.name}` : "";
    if (f) await analyzeGpx();
  });

  $("btnClearGPX")?.addEventListener("click", clearGpx);

  $("btnSave")?.addEventListener("click", () => saveSingle({ thenNew: false }));
  $("btnSaveAndNew")?.addEventListener("click", () => saveSingle({ thenNew: true }));
  $("btnSaveAndDuplicate")?.addEventListener("click", saveAndDuplicate);
  $("btnReset")?.addEventListener("click", () => resetForm(true));
})();
