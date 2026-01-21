// js/course-create.js (ESM) - VERSION CORRIGÉE
// MTB Points — Création épreuve (organizer)
// CORRECTIONS:
// 1. isPublished: true par défaut (au lieu de false)
// 2. Structure analysis_json pour Supabase (au lieu de gpx/techV2 séparés)
import { calculateDiscipline } from './discipline-calculator.js';
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
    const eventName = meeting.name || "Événement";
    const dateRange = end
      ? `${start || "—"} → ${end}`
      : `${start || "—"}`;
    hint.textContent = `📌 ${eventName} • ${dateRange}`;
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
      <div><input type="number" min="0" step="1" placeholder="—" class="lapsF" data-cat="${esc(cat.id)}" disabled></div>
    </div>
  `).join("");

  box.querySelectorAll(".catOn").forEach((chk) => {
    chk.addEventListener("change", () => {
      const id = chk.getAttribute("data-cat");
      const m = box.querySelector(`.lapsM[data-cat="${CSS.escape(id)}"]`);
      const f = box.querySelector(`.lapsF[data-cat="${CSS.escape(id)}"]`);
      const on = chk.checked;
      if (m) { m.disabled = !on; if (!on) m.value = ""; }
      if (f) { f.disabled = !on; if (!on) f.value = ""; }
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
      document.querySelectorAll(".lapsM,.lapsF").forEach((i) => { i.value = ""; i.disabled = true; });
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

    const mVal = m && m.value !== "" ? Number(m.value) : null;
    const fVal = f && f.value !== "" ? Number(f.value) : null;

    out[id] = {
      M: Number.isFinite(mVal) ? mVal : null,
      F: Number.isFinite(fVal) ? fVal : null,
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
      timeoutMs: 45000,
    });

    console.log("✅ Analyse GPX terminée:", res);

    // CORRECTION: Structure unifiée pour Supabase
    ANALYSIS = {
      fileName: f.name,
      analyzedAt: Date.now(),
      
      // Meta/stats (pour extraction facile)
      meta: {
        stats: {
          distanceKm: res?.distanceKm ?? null,
          dplusM: res?.dplusM ?? null,
          hasElevation: res?.hasElevation ?? null,
        }
      },
// Après avoir extrait distanceKm et dplusM de l'analyse
const distanceKm = res?.distanceKm ?? null;
const dplusM = res?.dplusM ?? null;

// NOUVEAU: Calcul automatique de la discipline
let suggestedDiscipline = null;
if (distanceKm && dplusM) {
  suggestedDiscipline = calculateDiscipline(distanceKm, dplusM);
  console.log("🏁 Discipline suggérée:", suggestedDiscipline);
  
  // Remplir automatiquement le champ discipline si vide
  const disciplineSelect = document.getElementById('discipline');
  if (disciplineSelect && suggestedDiscipline.code) {
    // Si l'option existe dans le select, la sélectionner
    const option = Array.from(disciplineSelect.options).find(
      opt => opt.value === suggestedDiscipline.code
    );
    if (option) {
      disciplineSelect.value = suggestedDiscipline.code;
    } else {
      // Sinon créer une option personnalisée
      const newOption = document.createElement('option');
      newOption.value = suggestedDiscipline.code;
      newOption.textContent = suggestedDiscipline.name;
      newOption.selected = true;
      disciplineSelect.appendChild(newOption);
    }
    
    // Afficher un message informatif
    const confidencePercent = Math.round((suggestedDiscipline.confidence || 1) * 100);
    const confidenceEmoji = confidencePercent >= 90 ? "✅" : confidencePercent >= 70 ? "👍" : "⚠️";
    
    // Créer un élément d'info sous le select
    let infoDiv = document.getElementById('discipline-suggestion-info');
    if (!infoDiv) {
      infoDiv = document.createElement('div');
      infoDiv.id = 'discipline-suggestion-info';
      infoDiv.style.cssText = 'margin-top:8px;padding:10px;background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;font-size:13px;';
      disciplineSelect.parentElement.appendChild(infoDiv);
    }
    
    infoDiv.innerHTML = `
      ${confidenceEmoji} <strong>Discipline suggérée :</strong> ${suggestedDiscipline.name}<br>
      <span style="color:#64748b;">${suggestedDiscipline.description} (${confidencePercent}% de confiance)</span><br>
      <span style="color:#64748b;font-size:12px;">Basé sur ${distanceKm.toFixed(1)} km et ${Math.round(dplusM)} m D+. Vous pouvez modifier si nécessaire.</span>
    `;
  }
}
ANALYSIS = {
  fileName: f.name,
  analyzedAt: Date.now(),
  
  // ... autres champs ...
  
  // NOUVEAU: Discipline suggérée
  suggestedDiscipline: suggestedDiscipline,
  
  // ... reste des champs ...
};
    
      // Points GPX (IMPORTANT pour le profil!)
      points: res?.points ?? null,

      // Phys
      phys: {
        score: res?.phys?.score ?? null,
        effort: res?.phys?.effort ?? null,
        ipbOverall: res?.phys?.ipbOverall ?? null,
      },

      // Tech V2
      tech: {
        techScoreV2: res?.techV2?.techScoreV2 ?? res?.tech?.techScoreV2 ?? null,
        tech01: res?.techV2?.tech01 ?? res?.tech?.tech01 ?? null,
        details: res?.techV2?.details ?? res?.tech?.details ?? null,
        surfaceEstimate: res?.techV2?.surfaceEstimate ?? res?.tech?.surfaceEstimate ?? null,
      },

      // Score global (MRS)
      mrs: typeof res?.mrs === "number" ? res.mrs : null,

      // Discipline
      discipline: res?.discipline ?? null,

      // Raw pour debug
      raw: res || null,
    };

    console.log("📦 Structure ANALYSIS créée:", ANALYSIS);

    setStatus("done", "Analyse terminée.", 100, "Tu peux enregistrer l'épreuve.");
    showMsg("Analyse GPX/OSM terminée.", true);

    // Pré-remplir la discipline si vide
    const disc = $("disc");
    if (disc && !disc.value && ANALYSIS?.discipline?.hint) {
      disc.value = ANALYSIS.discipline.hint;
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
  if (ANALYZE_BUSY) return "Analyse en cours : attends la fin.";
  if (!$("meetingId")?.value) return "Événement obligatoire.";
  if (!normalizeISODate($("date")?.value)) return "Date d'épreuve obligatoire.";
  if (!$("name")?.value?.trim()) return "Nom d'épreuve obligatoire.";

  const f = $("gpxFile")?.files?.[0];
  if (!f) return "GPX obligatoire : sélectionne un fichier GPX.";
  if (!ANALYSIS) return "Analyse GPX/OSM obligatoire : choisis un GPX et laisse l'analyse se terminer.";

  return null;
}

async function buildRace({ ebikeOverride = null, nameSuffix = "", idSalt = 0 } = {}) {
  const meetingId = $("meetingId").value;
  const meeting = await findMeetingHybrid(meetingId);
  const lapsByCategorySex = collectLapsByCategorySex();
function buildRace() {
  const disciplineSelect = document.getElementById('discipline');
  const selectedDiscipline = disciplineSelect?.value || ANALYSIS?.suggestedDiscipline?.code || null;
  
  return {
    // ... autres champs ...
    discipline: selectedDiscipline,
    // ... autres champs ...
  };
}
  const baseName = $("name").value.trim();
  const finalName = (baseName + (nameSuffix ? ` ${nameSuffix}` : "")).trim();

  // Type de vélo
  const bikeType = document.querySelector('input[name="bikeType"]:checked')?.value || 'musculaire';
  let bikeTypeAllowed = bikeType;

  const id = makeIdFromName(finalName);
  const finalId = idSalt ? `${id}-${idSalt}` : id;

  // CORRECTION: Structure pour Supabase avec analysis_json
  const race = {
    id: finalId,
    name: finalName,
    date: normalizeISODate($("date").value),
    time: $("time").value || null,

    // Rattachement meeting
    eventGroupId: meetingId,
    meetingId,
    meetingName: meeting?.name || null,

    // Infos course
    cutoffTime: $("cutoff").value.trim() || null,
    level: $("level").value || null,
    disc: $("disc").value || ANALYSIS?.discipline?.hint || null,

    // Type vélo
    bikeTypeAllowed: bikeTypeAllowed,
    ebike: bikeType === 'electrique',
    bikeWash: $("wash").value || null,
    mechAssist: $("mechanic").value || null,
    feeds: $("feeds").value || null,
    sexAllowed: $("sexAllowed").value || "all",

    comment: $("comment").value.trim() || null,

    // Métriques auto (depuis analysis)
    distance_km: ANALYSIS?.meta?.stats?.distanceKm ?? null,
    dplus_m: ANALYSIS?.meta?.stats?.dplusM ?? null,

    // Scores (colonnes directes Supabase)
    score_phys: ANALYSIS?.phys?.score ?? null,
    score_tech: ANALYSIS?.tech?.techScoreV2 ?? null,
    score_global: ANALYSIS?.mrs ?? null,

    // IMPORTANT: analysis_json avec TOUTE la structure
    analysis_json: ANALYSIS,

    // Multi-tours
    lapsByCategorySex: (lapsByCategorySex && Object.keys(lapsByCategorySex).length) ? lapsByCategorySex : null,

    createdAt: Date.now(),
    
    // 🔥 CORRECTION MAJEURE: Publication automatique!
    is_published: true, // ✅ Au lieu de false
  };

  console.log("🏁 Race créée (PUBLIÉE):", race);
  
  return race;
}

function afterSaveLinks(race) {
  const b1 = $("btnViewRace");
  if (b1 && race) {
    b1.href = `race.html?id=${encodeURIComponent(race.id)}`;
    b1.style.display = "inline-flex";
  }
}

async function persistRace(race) {
  console.log("💾 Sauvegarde de l'épreuve:", race);
  
  // 1) insert race (supabase si connecté, sinon local)
  await addStoredEventHybrid(race);

  // 2) push raceId into meeting
  const meeting = await findMeetingHybrid(race.meetingId);
  if (meeting) {
    const updated = pushRaceId(meeting, race.id);
    await updateMeetingHybrid(updated);
  }
  
  console.log("✅ Épreuve sauvegardée avec succès");
}

async function saveSingle({ thenNew = false } = {}) {
  $("btnViewRace")?.style && ($("btnViewRace").style.display = "none");
  showMsg("");

  const err = validate();
  if (err) {
    showMsg(esc(err), false);
    return;
  }

  try {
    const race = await buildRace();
    await persistRace(race);

    showMsg(`Épreuve créée et <b>PUBLIÉE</b> : <b>${esc(race.name)}</b>`, true);
    afterSaveLinks(race);

    if (thenNew) {
      setTimeout(() => resetForm(true), 800);
    }
  } catch (e) {
    console.error("❌ Erreur sauvegarde:", e);
    showMsg(`Enregistrement impossible : ${esc(e?.message || "erreur")}`, false);
  }
}

function resetForm(keepMeeting = true) {
  const keepMid = keepMeeting ? $("meetingId").value : "";
  const keepDate = keepMeeting ? $("date").value : "";

  ["name", "cutoff", "time", "comment"].forEach((id) => { const el = $(id); if (el) el.value = ""; });
  ["level", "disc", "wash", "mechanic", "feeds"].forEach((id) => { const el = $(id); if (el) el.value = ""; });
  
  // Réinitialiser les boutons radio
  const musculaireRadio = $("bikeMusculaire");
  if (musculaireRadio) musculaireRadio.checked = true;
  
  $("sexAllowed").value = "all";

  $("enableMultiLaps").checked = false;
  $("multiLapsWrap").style.display = "none";
  document.querySelectorAll(".catOn").forEach((c) => (c.checked = false));
  document.querySelectorAll(".lapsM,.lapsF").forEach((i) => { i.value = ""; i.disabled = true; });

  clearGpx();

  const b1 = $("btnViewRace");
  if (b1) { b1.style.display = "none"; b1.href = "#"; }

  showMsg("");

  if (keepMeeting) {
    $("meetingId").value = keepMid;
    applyMeetingDefaults(keepMid);
    $("date").value = keepDate;
  }
}

async function saveAndDuplicate() {
  const err = validate();
  if (err) {
    showMsg(esc(err), false);
    return;
  }

  const bikeType = document.querySelector('input[name="bikeType"]:checked')?.value || 'musculaire';

  if (bikeType !== 'both') {
    showMsg("Duplication activée uniquement si tu coches 'Les deux' pour le type de vélo.", false);
    return;
  }

  try {
    // Race musculaire
    const raceMuscu = await buildRace({ ebikeOverride: false, nameSuffix: "(Musculaire)", idSalt: 1 });
    raceMuscu.bikeTypeAllowed = 'musculaire';
    raceMuscu.ebike = false;
    await persistRace(raceMuscu);

    // Race électrique
    const raceElec = await buildRace({ ebikeOverride: true, nameSuffix: "(E-bike)", idSalt: 2 });
    raceElec.bikeTypeAllowed = 'electrique';
    raceElec.ebike = true;
    await persistRace(raceElec);

    showMsg(`2 épreuves créées et <b>PUBLIÉES</b> : ${esc(raceMuscu.name)} + ${esc(raceElec.name)}`, true);
    
    const b1 = $("btnViewRace");
    if (b1) {
      b1.href = `meeting.html?id=${encodeURIComponent(raceMuscu.meetingId)}`;
      b1.textContent = "📋 Voir l'événement";
      b1.style.display = "inline-flex";
    }

    setTimeout(() => resetForm(true), 800);
  } catch (e) {
    console.error(e);
    showMsg(`Duplication impossible : ${esc(e?.message || "erreur")}`, false);
  }
}

// ---------- Wire
(async function init() {
  await initMeetings();
  renderAgeRows();
  initMultiToggle();

  $("btnPickAnalyze")?.addEventListener("click", () => {
    showMsg("");
    const inp = $("gpxFile");
    inp.value = ""; // force change
    inp.click();
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
