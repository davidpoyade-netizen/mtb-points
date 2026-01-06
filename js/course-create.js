// js/course-create.js
// MTB Points — Course Create (épreuve rattachée à un événement)
// - Corrige "Événement introuvable" en supportant plusieurs clés localStorage (compat anciennes versions)
// - Rend le debugging plus clair (status + logs)
// - Sécurise les bindings (si un élément manque, message explicite)
// - Garde ton comportement : meeting obligatoire, date bornée, GPX optionnel, "Créer + autre épreuve"

(function () {
  const $ = (id) => document.getElementById(id);
  const params = new URLSearchParams(location.search);

  // ⚠️ Compat keys : si ton storage a changé de clé, on récupère quand même.
  const MEETING_KEYS = [
    "mtb.meetings.v1",
    "mtb.meetings.v0",
    "mtb.meetings",
    "mtbMeetings",
    "meetings"
  ];

  const RACE_KEYS = [
    "mtb.races.v1",
    "mtb.races.v0",
    "mtb.races",
    "mtbRaces",
    "races",
    "events" // vieux code parfois
  ];

  function dbg(t) {
    console.log("[course-create]", t);
    const el = $("debug");
    if (el) el.textContent = t;
  }

  function esc(s) {
    return String(s ?? "").replace(/[&<>"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));
  }

  function showMsg(html, ok = true) {
    const el = $("msg");
    if (!el) return;
    el.style.display = html ? "block" : "none";
    el.innerHTML = html ? (ok ? `✅ ${html}` : `❌ ${html}`) : "";
  }

  // ----------------------------
  // Storage helpers (robustes)
  // ----------------------------
  function readJSON(key) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : null;
    } catch (_) {
      return null;
    }
  }

  function writeJSON(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (_) {
      return false;
    }
  }

  function readArrayFromFirstExistingKey(keys) {
    for (const k of keys) {
      const v = readJSON(k);
      if (Array.isArray(v) && v.length) return { key: k, arr: v };
    }
    // si aucune clé n'existe/contient, on retourne la clé par défaut
    const v0 = readJSON(keys[0]);
    if (Array.isArray(v0)) return { key: keys[0], arr: v0 };
    return { key: keys[0], arr: [] };
  }

  // ------- Meetings -------
  function listMeetingsSafe() {
    // priorité aux helpers globaux si présents
    if (typeof window.listMeetings === "function") return window.listMeetings();
    if (typeof window.getMeetings === "function") return window.getMeetings();

    return readArrayFromFirstExistingKey(MEETING_KEYS).arr;
  }

  function upsertMeetingSafe(meeting) {
    if (typeof window.upsertMeeting === "function") return window.upsertMeeting(meeting);
    const { key, arr } = readArrayFromFirstExistingKey(MEETING_KEYS);
    const all = Array.isArray(arr) ? arr.slice() : [];
    const idx = all.findIndex((m) => m && m.id === meeting.id);
    if (idx >= 0) all[idx] = meeting;
    else all.unshift(meeting);
    writeJSON(key, all);
    return meeting;
  }

  function findMeetingSafe(id) {
    if (!id) return null;
    if (typeof window.findMeeting === "function") return window.findMeeting(id);
    const all = listMeetingsSafe();
    return all.find((m) => m && m.id === id) || null;
  }

  // ------- Races -------
  function listRacesSafe() {
    if (typeof window.listRaces === "function") return window.listRaces();
    if (typeof window.getRaces === "function") return window.getRaces();

    return readArrayFromFirstExistingKey(RACE_KEYS).arr;
  }

  function upsertRaceSafe(race) {
    if (typeof window.upsertRace === "function") return window.upsertRace(race);

    // on écrit dans la clé "principale" (première), mais on lit partout
    const primaryKey = RACE_KEYS[0];
    const current = readJSON(primaryKey);
    const all = Array.isArray(current) ? current.slice() : listRacesSafe().slice();

    const idx = all.findIndex((r) => r && r.id === race.id);
    if (idx >= 0) all[idx] = race;
    else all.unshift(race);

    writeJSON(primaryKey, all);
    return race;
  }

  // ----------------------------
  // ID helpers
  // ----------------------------
  function slugify(s) {
    return String(s || "")
      .trim()
      .toLowerCase()
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "")
      .slice(0, 60) || "race";
  }

  function makeIdFromName(name) {
    return `${slugify(name)}-${Date.now()}`;
  }

  // ----------------------------
  // Meeting defaults (date + hint)
  // ----------------------------
  function applyMeetingDefaults(mid) {
    const m = findMeetingSafe(mid);
    const hint = $("meetingHint");
    const dateEl = $("date");
    const dateHint = $("dateHint");
    const back = $("btnBack");

    if (!m) {
      if (hint) hint.innerHTML = `⚠️ Événement introuvable. Crée d’abord un événement sur <b>le même site</b> (GitHub Pages) puis reviens ici.`;
      if (dateEl) { dateEl.min = ""; dateEl.max = ""; }
      if (dateHint) dateHint.textContent = "La date sera pré-remplie à partir de l’événement.";
      if (back) back.href = "meetings.html";
      return;
    }

    const start = m.date || null;
    const end = m.endDate || null;

    if (hint) {
      const range = end ? `${esc(start)} → ${esc(end)}` : esc(start || "—");
      hint.innerHTML = `<b>${esc(m.name)}</b> • ${esc(m.location || "Lieu non précisé")} • Dates: <b>${range}</b>`;
    }

    if (dateEl) {
      dateEl.min = start || "";
      dateEl.max = end || "";
      if (!dateEl.value && start) dateEl.value = start;
      if (start && dateEl.value && dateEl.value < start) dateEl.value = start;
      if (end && dateEl.value && dateEl.value > end) dateEl.value = start || end;
    }

    if (dateHint) {
      dateHint.textContent = end
        ? "Événement multi-jours : la date de l’épreuve doit être dans la plage."
        : "Événement 1 jour : date de l’épreuve = date de l’événement (par défaut).";
    }

    if (back) back.href = `meeting.html?id=${encodeURIComponent(m.id)}`;
  }

  function initMeetings() {
    const sel = $("meetingId");
    if (!sel) throw new Error("Select #meetingId introuvable (course-create.html).");

    const meetings = listMeetingsSafe();
    sel.innerHTML = "";

    const opt0 = document.createElement("option");
    opt0.value = "";
    opt0.textContent = meetings.length ? "— Sélectionner un événement —" : "⚠️ Aucun événement (crée-en un d’abord)";
    sel.appendChild(opt0);

    for (const m of meetings) {
      if (!m || !m.id) continue;
      const opt = document.createElement("option");
      opt.value = m.id;

      const start = m.date || "—";
      const end = m.endDate ? `→ ${m.endDate}` : "";
      opt.textContent = `${m.name} (${start} ${end})`;
      sel.appendChild(opt);
    }

    sel.addEventListener("change", () => applyMeetingDefaults(sel.value));

    const mid = params.get("meetingId");
    if (mid) {
      sel.value = mid;
      applyMeetingDefaults(mid);
    } else if (meetings.length === 1) {
      sel.value = meetings[0].id;
      applyMeetingDefaults(meetings[0].id);
    } else {
      applyMeetingDefaults(sel.value);
    }

    // message utile si aucun meeting
    if (!meetings.length) {
      showMsg(
        `Aucun événement trouvé dans ce navigateur. Crée un événement via <b>meeting-create.html</b> sur <b>${esc(location.host)}</b>.`,
        false
      );
    }
  }

  // ----------------------------
  // GPX status hooks
  // ----------------------------
  let gpxAnalysis = null;

  function showStatusBox(on) {
    const box = $("statusBox");
    if (box) box.style.display = on ? "block" : "none";
  }

  function setStatusUI(phase, message, progress, spinning) {
    showStatusBox(true);

    const phaseEl = $("statusPhase");
    const msgEl = $("statusMsg");
    const subEl = $("statusSub");
    const barWrap = $("statusBarWrap");
    const bar = $("statusBar");

    const dotClass = phase === "error" ? "err" : (phase === "done" ? "ok" : (phase === "osm" ? "warn" : ""));
    if (phaseEl) phaseEl.innerHTML = `<span class="dot ${dotClass}"></span> ${esc(phase || "—")}`;
    if (msgEl) msgEl.textContent = message || "—";

    const hasProgress = typeof progress === "number" && progress >= 0 && progress <= 1;
    if (barWrap) barWrap.style.display = hasProgress ? "block" : "none";
    if (bar && hasProgress) bar.style.width = Math.round(progress * 100) + "%";

    if (subEl) subEl.textContent = spinning ? "Analyse en cours…" : "";
  }

  window.addEventListener("mtb:status", (e) => {
    const d = e.detail || {};
    setStatusUI(d.phase, d.message, d.progress, d.spinning);
  });

  function updateKpisFromAnalysis(a) {
    if (!a) return;

    const distEl = $("distanceKm");
    const dplusEl = $("dplusM");

    if (typeof a.distanceKm === "number" && distEl) distEl.value = a.distanceKm;
    if (typeof a.dplusM === "number" && dplusEl) dplusEl.value = a.dplusM;

    $("kpiPhys").textContent = (a.phys && typeof a.phys.score === "number") ? a.phys.score : "—";
    $("kpiPhysSub").textContent = (a.phys)
      ? `Effort: ${a.phys.effort ?? "—"} • IPB: ${a.phys.ipbOverall ?? "—"}`
      : "—";

    const techScore = a.techV2 && typeof a.techV2.techScoreV2 === "number" ? a.techV2.techScoreV2 : null;
    $("kpiTech").textContent = techScore != null ? techScore : "—";
    $("kpiTechSub").textContent = techScore != null
      ? "TechScoreV2 officiel"
      : (a.serverMeta && a.serverMeta.mode === "LOCAL_ONLY" ? "Indisponible (site statique)" : "—");

    $("kpiGlobal").textContent = (typeof a.mrs === "number") ? a.mrs : "—";
    $("kpiGlobalSub").textContent = (typeof a.mrs === "number")
      ? "0.55 Phys + 0.45 Tech"
      : "Score global calculé si Tech disponible";
  }

  async function analyzeSelectedGPX() {
    showMsg("", true);

    if (!window.analyzeGPX) {
      showMsg("Erreur : analyzeGPX introuvable (vérifie js/gpx.js).", false);
      return;
    }

    const f = $("gpxFile")?.files?.[0] || null;
    if (!f) {
      showMsg("Choisis un fichier GPX.", false);
      return;
    }

    try {
      gpxAnalysis = await window.analyzeGPX(f, { keepPoints: false });
      updateKpisFromAnalysis(gpxAnalysis);
      showMsg("GPX analysé ✅ (distance/D+ pré-remplis).", true);
    } catch (e) {
      showMsg(e?.message || String(e), false);
    }
  }

  function clearGPX() {
    gpxAnalysis = null;
    const f = $("gpxFile");
    if (f) f.value = "";

    $("kpiPhys").textContent = "—";
    $("kpiPhysSub").textContent = "—";
    $("kpiTech").textContent = "—";
    $("kpiTechSub").textContent = "—";
    $("kpiGlobal").textContent = "—";
    $("kpiGlobalSub").textContent = "—";

    showMsg("GPX effacé.", true);
    showStatusBox(false);
  }

  // ----------------------------
  // Save
  // ----------------------------
  function getVal(id) { return String($(id)?.value || "").trim(); }
  function numOrNull(v) { const n = Number(v); return Number.isFinite(n) ? n : null; }

  function validateForm() {
    const meetingId = getVal("meetingId");
    const name = getVal("name");
    const date = getVal("date");

    if (!meetingId) return "Tu dois sélectionner un événement (meeting obligatoire).";
    if (!name) return "Le nom de l’épreuve est obligatoire.";
    if (!date) return "La date de l’épreuve est obligatoire.";

    const m = findMeetingSafe(meetingId);
    if (!m) return "Événement introuvable (storage vide ou clé différente).";
    if (m.date && date < m.date) return "La date de l’épreuve ne peut pas être avant le début de l’événement.";
    if (m.endDate && date > m.endDate) return "La date de l’épreuve ne peut pas être après la fin de l’événement.";

    return null;
  }

  function buildRace() {
    const meetingId = getVal("meetingId");
    const m = findMeetingSafe(meetingId);

    const name = getVal("name");
    const date = getVal("date");
    const time = getVal("time") || null;
    const disc = getVal("disc") || null;
    const ebike = getVal("ebike") === "1";

    const distanceKm = numOrNull(getVal("distanceKm"));
    const dplusM = numOrNull(getVal("dplusM"));
    const participants = numOrNull(getVal("participants"));
    const comment = getVal("comment") || null;

    const physScore = gpxAnalysis?.phys?.score ?? null;
    const techV2 = gpxAnalysis?.techV2 ?? null;
    const mrs = gpxAnalysis?.mrs ?? null;

    return {
      id: makeIdFromName(name),
      name,
      date,
      time,
      disc,
      ebike,

      distanceKm,
      dplusM,
      participants,
      comment,

      meetingId,
      meetingName: m?.name || null,

      // scores optionnels
      physScore,
      techV2,
      globalScore: mrs,

      // gpx meta
      gpxFileName: gpxAnalysis?.fileName || null,

      createdAt: Date.now()
    };
  }

  function attachRaceToMeeting(meetingId, raceId) {
    const m = findMeetingSafe(meetingId);
    if (!m) return;

    const arr = Array.isArray(m.raceIds) ? m.raceIds.slice() : [];
    if (!arr.includes(raceId)) arr.push(raceId);

    upsertMeetingSafe({ ...m, raceIds: arr });
  }

  function resetForm() {
    $("name").value = "";
    $("disc").value = "";
    $("ebike").value = "0";
    $("distanceKm").value = "";
    $("dplusM").value = "";
    $("participants").value = "";
    $("comment").value = "";
    $("time").value = "";
    clearGPX();
    showMsg("", true);

    // re-apply meeting default date (keep meeting selection)
    applyMeetingDefaults(getVal("meetingId"));
  }

  function saveRace({ goNew = false }) {
    const err = validateForm();
    if (err) { showMsg(err, false); return; }

    const race = buildRace();
    upsertRaceSafe(race);
    attachRaceToMeeting(race.meetingId, race.id);

    showMsg(`Épreuve créée ✅ (${esc(race.name)})`, true);

    if (goNew) {
      location.href = `course-create.html?meetingId=${encodeURIComponent(race.meetingId)}`;
    } else {
      location.href = `event.html?id=${encodeURIComponent(race.id)}`;
    }
  }

  // ----------------------------
  // Wire
  // ----------------------------
  function must(id) {
    const el = $(id);
    if (!el) throw new Error(`Élément introuvable: #${id}`);
    return el;
  }

  try {
    must("btnAnalyze").addEventListener("click", analyzeSelectedGPX);
    must("btnClearGPX").addEventListener("click", clearGPX);

    must("btnSave").addEventListener("click", () => saveRace({ goNew: false }));
    must("btnSaveAndNew").addEventListener("click", () => saveRace({ goNew: true }));
    must("btnReset").addEventListener("click", resetForm);

    initMeetings();

    if (window.ensureMTBSpinnerCSS) window.ensureMTBSpinnerCSS();

    dbg("Script chargé ✅ (course-create) — boutons bindés.");
  } catch (e) {
    console.error(e);
    showMsg(e.message || String(e), false);
    dbg("ERREUR: " + (e.message || String(e)));
  }
})();
