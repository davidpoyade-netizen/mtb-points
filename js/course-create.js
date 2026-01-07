// js/course-create.js
// MTB Points — Create course (épreuve)
// - Auto analyse GPX via window.analyzeGPX (js/gpx.js)
// - Remplit distance/dplus automatiquement
// - Stocke l'analyse GPX dans l'épreuve (gpx: {...})
// - Rattache l'épreuve au meeting (eventGroupId) si présent

(function () {
  // -------------------------
  // Helpers DOM
  // -------------------------
  const $ = (id) => document.getElementById(id);

  function val(id) {
    const el = $(id);
    return el ? String(el.value || "").trim() : "";
  }

  function num(id) {
    const v = val(id);
    if (!v) return null;
    const n = Number(String(v).replace(",", "."));
    return Number.isFinite(n) ? n : null;
  }

  function getCheckedValues(selector) {
    return Array.from(document.querySelectorAll(selector))
      .filter(x => x.checked)
      .map(x => x.value);
  }

  function clamp(n, a, b) {
    return Math.max(a, Math.min(b, n));
  }

  function getTechFinal5() {
    const checked = document.querySelector(".techFinal:checked");
    return checked ? Number(checked.value) : null;
  }

  // -------------------------
  // State (GPX)
  // -------------------------
  let GPX_ANALYSIS = null; // résultat de window.analyzeGPX(file)

  // -------------------------
  // Meeting select init
  // -------------------------
  (function initMeetingSelect() {
    const sel = $("eventGroupId");
    if (!sel) return;

    const meetings = loadMeetings();
    meetings.forEach(m => {
      const opt = document.createElement("option");
      opt.value = m.id;
      opt.textContent = `${m.name} (${m.date || "—"})`;
      sel.appendChild(opt);
    });
  })();

  // -------------------------
  // UI Status (spinner + messages)
  // -------------------------
  function ensureStatusBox() {
    // Si tu as déjà un bloc status dans le HTML, on l’utilise.
    // Sinon on en injecte un minimal sous l’input GPX.
    if ($("gpxStatus")) return;

    const gpxInput =
      $("courseGpxFile") || $("raceGpxFile") || $("gpxFile") ||
      document.querySelector('input[type="file"][accept*="gpx"]');

    if (!gpxInput) return;

    const wrap = document.createElement("div");
    wrap.id = "gpxStatus";
    wrap.style.display = "none";
    wrap.style.marginTop = "10px";
    wrap.style.border = "1px solid #e5e7eb";
    wrap.style.borderRadius = "12px";
    wrap.style.padding = "10px";
    wrap.style.background = "#fff";

    wrap.innerHTML = `
      <div style="display:flex;gap:10px;align-items:center">
        <div id="gpxSpinner" class="mtb-spinner"></div>
        <div style="flex:1">
          <div id="gpxMsg" style="font-weight:900">Analyse…</div>
          <div id="gpxSub" style="font-size:12px;color:#64748b;margin-top:2px">—</div>
          <div class="mtb-progress" style="margin-top:8px"><div id="gpxBar"></div></div>
        </div>
        <span id="gpxBadge" class="mtb-badge">…</span>
      </div>
    `;
    gpxInput.insertAdjacentElement("afterend", wrap);

    // CSS spinner minimal (utilise celui de gpx.js si dispo)
    if (window.ensureMTBSpinnerCSS) window.ensureMTBSpinnerCSS();
  }

  function setUI({ show = true, message = "", sub = "—", progress = null, phase = "gpx", spinning = true }) {
    const box = $("gpxStatus");
    const msgEl = $("gpxMsg");
    const subEl = $("gpxSub");
    const barEl = $("gpxBar");
    const badgeEl = $("gpxBadge");
    const spinner = $("gpxSpinner");

    if (box) box.style.display = show ? "block" : "none";
    if (msgEl) msgEl.textContent = message || "";
    if (subEl) subEl.textContent = sub || "—";

    if (barEl) {
      const pct = (typeof progress === "number") ? Math.round(clamp(progress, 0, 1) * 100) : 0;
      barEl.style.width = pct + "%";
    }

    if (badgeEl) {
      badgeEl.textContent = String(phase || "…").toUpperCase();
      badgeEl.classList.remove("ok", "warn", "err");
      if (phase === "done") badgeEl.classList.add("ok");
      else if (phase === "error") badgeEl.classList.add("err");
      else badgeEl.classList.add("warn");
    }

    if (spinner) spinner.style.display = spinning ? "block" : "none";
  }

  function attachStatusListener() {
    // ton gpx.js émet déjà mtb:status {phase,message,progress,spinning}
    window.addEventListener("mtb:status", (e) => {
      const d = e.detail || {};
      const niceSub =
        d.phase === "gpx" ? "Lecture GPX • altitude • pente • effort…" :
        d.phase === "osm" ? "Analyse OSM • surface • technicité…" :
        d.phase === "done" ? "Terminé" :
        d.phase === "error" ? "Erreur" : "—";

      setUI({
        show: true,
        message: d.message || "Analyse…",
        sub: niceSub,
        progress: (typeof d.progress === "number") ? d.progress : null,
        phase: d.phase || "gpx",
        spinning: d.spinning !== false
      });
    });
  }

  // -------------------------
  // Auto GPX analysis on file import
  // -------------------------
  async function runAutoAnalysis(file) {
    GPX_ANALYSIS = null;

    if (!file) return;

    if (typeof window.analyzeGPX !== "function") {
      setUI({ show: true, message: "Erreur: js/gpx.js n’est pas chargé (analyzeGPX introuvable).", phase: "error", spinning: false });
      return;
    }

    try {
      setUI({ show: true, message: "Préparation de l’analyse…", sub: "Initialisation", phase: "gpx", progress: 0.05, spinning: true });
      const res = await window.analyzeGPX(file, { keepPoints: false });
      GPX_ANALYSIS = res;

      // Remplissage automatique distance/dplus si les champs existent
      // (adapte si tes IDs sont différents)
      const distEl = $("distanceKm") || $("courseDistance") || $("raceDist") || $("distance");
      const dplusEl = $("dplusM") || $("courseDplus") || $("raceDplus") || $("dplus");

      if (distEl && res?.distanceKm != null) distEl.value = String(res.distanceKm);
      if (dplusEl && res?.dplusM != null) dplusEl.value = String(res.dplusM);

      setUI({ show: true, message: "Distance et D+ renseignés ✅", sub: "Tu peux enregistrer l’épreuve", phase: "done", progress: 1, spinning: false });
    } catch (err) {
      GPX_ANALYSIS = null;
      setUI({ show: true, message: err?.message || "Erreur analyse GPX", sub: "Vérifie le GPX / réseau", phase: "error", spinning: false });
    }
  }

  function initGpxAutoAnalyze() {
    ensureStatusBox();
    attachStatusListener();

    const fileInput =
      $("courseGpxFile") || $("raceGpxFile") || $("gpxFile") ||
      document.querySelector('input[type="file"][accept*="gpx"]');

    if (!fileInput) return;

    fileInput.addEventListener("change", () => {
      const f = fileInput.files && fileInput.files[0];
      if (f) runAutoAnalysis(f);
    });
  }

  initGpxAutoAnalyze();

  // -------------------------
  // Save course
  // -------------------------
  const btn = $("saveCourseBtn");
  if (!btn) return;

  btn.addEventListener("click", () => {
    // Required fields
    const name = val("courseName");
    const date = val("courseDate");
    const disc = val("disc");
    const level = val("level"); // tu avais commencé à le rendre obligatoire

    if (!name || !date || !disc || !level) {
      alert("⚠️ Champs obligatoires : Nom, Date, Discipline, Niveau");
      return;
    }

    // GPX obligatoire (pour distance/d+ auto)
    if (!GPX_ANALYSIS) {
      alert("⚠️ Importe une trace GPX (obligatoire) : l’analyse remplira Distance et D+ automatiquement.");
      return;
    }

    // technicité finale obligatoire
    const tech5 = getTechFinal5();
    if (!tech5) {
      alert("⚠️ Choisis une technicité finale (1 à 5).");
      return;
    }

    // surface total <= 100
    const roadPct = Number(val("roadPct") || 0);
    const trackPct = Number(val("trackPct") || 0);
    const singlePct = Number(val("singlePct") || 0);
    const total = roadPct + trackPct + singlePct;
    if (total > 100) {
      alert("⚠️ Le total des types de voie ne peut pas dépasser 100%.");
      return;
    }

    // laps
    const lapsDefault = Number(val("lapsDefault") || 1);
    const lapsMen = Number(val("lapsMen") || lapsDefault || 1);
    const lapsWomen = Number(val("lapsWomen") || lapsDefault || 1);

    // Meeting link
    const eventGroupId = val("eventGroupId") || null;

    // Scores depuis analyse
    const physScore = Number(GPX_ANALYSIS?.phys?.score);
    const techScore = Number(GPX_ANALYSIS?.techV2?.techScoreV2);
    const globalScore =
      (Number.isFinite(physScore) && Number.isFinite(techScore))
        ? Math.round(0.55 * physScore + 0.45 * techScore)
        : null;

    const ev = {
      id: makeIdFromName(name),
      name,
      date,
      disc,
      level,

      eventGroupId,

      ebike: (val("ebike") === "1"),
      bikeWash: (val("bikeWash") === "1"),
      ageCategories: getCheckedValues(".ageCat"),

      laps: {
        default: Number.isFinite(lapsDefault) ? lapsDefault : 1,
        bySex: { M: Number.isFinite(lapsMen) ? lapsMen : 1, F: Number.isFinite(lapsWomen) ? lapsWomen : 1 },
        rules: []
      },

      // FROM GPX ONLY
      distanceKm: GPX_ANALYSIS.distanceKm,
      dplusM: GPX_ANALYSIS.dplusM,

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

      // scores (optionnel mais utile)
      scores: {
        phys: Number.isFinite(physScore) ? physScore : null,
        tech: Number.isFinite(techScore) ? techScore : null,
        global: Number.isFinite(globalScore) ? globalScore : null,
        disciplineHint: GPX_ANALYSIS?.discipline?.hint || null
      },

      // GPX analysis data (compact)
      gpx: {
        fileName: GPX_ANALYSIS.fileName,
        distanceKm: GPX_ANALYSIS.distanceKm,
        dplusM: GPX_ANALYSIS.dplusM,
        hasElevation: GPX_ANALYSIS.hasElevation,
        steep: GPX_ANALYSIS.steep,
        phys: GPX_ANALYSIS.phys,
        techV2: GPX_ANALYSIS.techV2,
        discipline: GPX_ANALYSIS.discipline,
        mrs: GPX_ANALYSIS.mrs
      }
    };

    // Save (localStorage)
    addStoredEvent(ev);

    // Link to meeting
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

})();
