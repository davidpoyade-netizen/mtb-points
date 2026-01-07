// js/course-create.js
// MTB Points — course-create (organizer)
// - Auto analyse GPX au chargement du fichier (window.analyzeGPX de gpx.js)
// - Remplit distance/D+ + KPIs + met window.GPX_CACHE
// - Empêche "Créer l’épreuve" tant que GPX pas analysé

(function () {
  const $ = (id) => document.getElementById(id);

  // --- Elements (doivent exister dans course-create.html)
  const selMeeting = $("eventGroupId");
  const inpName = $("courseName");
  const inpDate = $("courseDate");
  const inpStartTime = $("startTime");
  const selDisc = $("disc");
  const selEbike = $("ebike");
  const selLevel = $("level");
  const inpDistance = $("distanceKm");
  const inpDplus = $("dplusM");
  const inpParticipants = $("participantsCount");
  const inpComment = $("comment");

  const inpGpx = $("courseGpxFile");
  const btnClearGPX = $("btnClearGPX");
  const btnSave = $("saveCourseBtn");

  const kpiPhys = $("kpiPhys");
  const kpiPhysSub = $("kpiPhysSub");
  const kpiTech = $("kpiTech");
  const kpiTechSub = $("kpiTechSub");
  const kpiGlobal = $("kpiGlobal");
  const kpiGlobalSub = $("kpiGlobalSub");

  // (optionnel) si tu as une box status dans le HTML
  const statusBox = $("statusBox");
  const statusPhase = $("statusPhase");
  const statusMsg = $("statusMsg");
  const statusBarWrap = $("statusBarWrap");
  const statusBar = $("statusBar");
  const statusSub = $("statusSub");

  // --- Helpers
  function esc(s) {
    return String(s ?? "").replace(/[&<>"']/g, (m) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    }[m]));
  }

  function showMsg(text, ok = true) {
    const el = $("msg");
    if (!el) return;
    el.style.display = text ? "block" : "none";
    el.innerHTML = text ? (ok ? `✅ ${esc(text)}` : `❌ ${esc(text)}`) : "";
  }

  function toNumberOrNull(v) {
    const n = Number(String(v ?? "").replace(",", "."));
    return Number.isFinite(n) ? n : null;
  }

  function makeIdFromName(name) {
    const slug = String(name || "")
      .trim()
      .toLowerCase()
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "")
      .slice(0, 60) || "race";
    return `${slug}-${Date.now()}`;
  }

  // --- STATUS UI (écoute mtb:status émis par gpx.js)
  function setStatusUI(d) {
    if (!statusBox) return;

    statusBox.style.display = "block";
    const phase = d?.phase || "—";
    const message = d?.message || "—";
    const progress = (typeof d?.progress === "number") ? d.progress : null;
    const spinning = d?.spinning !== false;

    const dotClass = phase === "error" ? "err" : (phase === "done" ? "ok" : (phase === "osm" ? "warn" : ""));
    if (statusPhase) statusPhase.innerHTML = `<span class="dot ${dotClass}"></span> ${esc(phase)}`;
    if (statusMsg) statusMsg.textContent = message;

    const hasProgress = typeof progress === "number" && progress >= 0 && progress <= 1;
    if (statusBarWrap) statusBarWrap.style.display = hasProgress ? "block" : "none";
    if (statusBar && hasProgress) statusBar.style.width = Math.round(progress * 100) + "%";

    if (statusSub) {
      const sub =
        phase === "gpx" ? "Analyse pente • effort • stats…" :
        phase === "osm" ? "Analyse terrain OSM • technicité…" :
        phase === "done" ? "Terminé" :
        phase === "error" ? "Erreur" : "—";
      statusSub.textContent = spinning ? sub : "";
    }
  }

  window.addEventListener("mtb:status", (e) => setStatusUI(e.detail || {}));

  // --- Meetings select (depuis storage.js local)
  function loadMeetingsSafe() {
    if (typeof window.loadMeetings === "function") return window.loadMeetings();
    if (typeof window.listMeetings === "function") return window.listMeetings();
    try {
      const raw = localStorage.getItem("mtb.meetings.v1");
      const arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr : [];
    } catch (_) {
      return [];
    }
  }

  function findMeetingSafe(id) {
    if (!id) return null;
    if (typeof window.findMeeting === "function") return window.findMeeting(id);
    const all = loadMeetingsSafe();
    return all.find(m => m && m.id === id) || null;
  }

  function initMeetingSelect() {
    if (!selMeeting) return;

    const meetings = loadMeetingsSafe();
    selMeeting.innerHTML = "";

    const opt0 = document.createElement("option");
    opt0.value = "";
    opt0.textContent = meetings.length ? "— Sélectionner un événement —" : "⚠️ Aucun événement (crée-en un d’abord)";
    selMeeting.appendChild(opt0);

    meetings.forEach(m => {
      const opt = document.createElement("option");
      opt.value = m.id;
      opt.textContent = `${m.name} (${m.date || "—"})`;
      selMeeting.appendChild(opt);
    });
  }

  // --- GPX analysis
  async function runAnalysisFromFile(file) {
    showMsg("", true);
    window.GPX_CACHE = null;

    if (!file) return;
    if (typeof window.analyzeGPX !== "function") {
      showMsg("analyzeGPX introuvable : vérifie que js/gpx.js est bien chargé.", false);
      return;
    }

    try {
      // Option: on ne renvoie pas les points si tu ne fais pas encore le profil/carte ici
      const a = await window.analyzeGPX(file, { keepPoints: false });

      // Cache global pour sauver l’épreuve
      window.GPX_CACHE = a;

      // Autofill distance / d+
      if (inpDistance) inpDistance.value = String(a.distanceKm ?? "");
      if (inpDplus) inpDplus.value = String(a.dplusM ?? "");

      // KPIs
      if (kpiPhys) kpiPhys.textContent = (a?.phys?.score ?? "—");
      if (kpiPhysSub) kpiPhysSub.textContent = a?.phys ? `Effort: ${a.phys.effort ?? "—"} • IPB: ${a.phys.ipbOverall ?? "—"}` : "—";

      const techScore = (a?.techV2 && typeof a.techV2.techScoreV2 === "number") ? a.techV2.techScoreV2 : null;
      if (kpiTech) kpiTech.textContent = techScore ?? "—";
      if (kpiTechSub) kpiTechSub.textContent = techScore != null ? "TechScoreV2 officiel (OSM + bonus GPX capé)" : "ScoreTech indisponible (serveur / réseau)";

      if (kpiGlobal) kpiGlobal.textContent = (typeof a?.mrs === "number") ? a.mrs : "—";
      if (kpiGlobalSub) kpiGlobalSub.textContent = (typeof a?.mrs === "number") ? "0.55 Phys + 0.45 Tech" : "Score global si Tech disponible";

      // Discipline auto hint (si pas choisi)
      if (selDisc && !selDisc.value && a?.discipline?.hint) selDisc.value = a.discipline.hint;

      showMsg("Analyse GPX terminée : distance/D+ renseignés ✅", true);
    } catch (e) {
      window.GPX_CACHE = null;
      showMsg(e?.message || "Erreur analyse GPX/OSM.", false);
    }
  }

  function clearGPX() {
    window.GPX_CACHE = null;
    if (inpGpx) inpGpx.value = "";
    if (inpDistance) inpDistance.value = "";
    if (inpDplus) inpDplus.value = "";

    if (kpiPhys) kpiPhys.textContent = "—";
    if (kpiPhysSub) kpiPhysSub.textContent = "—";
    if (kpiTech) kpiTech.textContent = "—";
    if (kpiTechSub) kpiTechSub.textContent = "—";
    if (kpiGlobal) kpiGlobal.textContent = "—";
    if (kpiGlobalSub) kpiGlobalSub.textContent = "—";

    if (statusBox) statusBox.style.display = "none";
    showMsg("GPX effacé.", true);
  }

  // --- Save (localStorage via storage.js)
  function requireFields() {
    const meetingId = selMeeting?.value || "";
    const name = inpName?.value?.trim() || "";
    const date = inpDate?.value || "";
    const disc = selDisc?.value || "";

    if (!meetingId) return "Événement obligatoire.";
    if (!name) return "Nom d’épreuve obligatoire.";
    if (!date) return "Date d’épreuve obligatoire.";
    if (!disc) return "Discipline obligatoire (ou Auto si tu gardes l’option Auto).";
    if (!window.GPX_CACHE) return "Importe un GPX : l’analyse est obligatoire pour distance/D+.";

    return null;
  }

  function saveCourse() {
    const err = requireFields();
    if (err) {
      alert("⚠️ " + err);
      return;
    }

    // build object (simple + stable)
    const meetingId = selMeeting.value;
    const m = findMeetingSafe(meetingId);

    const ev = {
      id: makeIdFromName(inpName.value),
      name: inpName.value.trim(),
      date: inpDate.value,
      disc: selDisc.value,

      // infos
      level: selLevel?.value || null,
      startTime: inpStartTime?.value || null,
      ebike: (selEbike?.value === "1"),
      participantsCount: toNumberOrNull(inpParticipants?.value),
      comment: (inpComment?.value || "").trim() || null,

      // rattachement
      eventGroupId: meetingId,
      meetingName: m?.name || null,

      // FROM GPX
      distanceKm: window.GPX_CACHE.distanceKm,
      dplusM: window.GPX_CACHE.dplusM,

      // scores
      physScore: window.GPX_CACHE?.phys?.score ?? null,
      techV2: window.GPX_CACHE?.techV2 ?? null,
      globalScore: window.GPX_CACHE?.mrs ?? null,

      // gpx meta (si tu veux l’afficher ensuite)
      gpx: {
        fileName: window.GPX_CACHE.fileName,
        distanceKm: window.GPX_CACHE.distanceKm,
        dplusM: window.GPX_CACHE.dplusM,
        hasElevation: window.GPX_CACHE.hasElevation,
        steep: window.GPX_CACHE.steep
      },

      createdAt: Date.now()
    };

    // storage.js : tu utilises addStoredEvent(ev)
    if (typeof window.addStoredEvent === "function") window.addStoredEvent(ev);
    else {
      // fallback minimal si jamais
      const key = "vtt_events_v1";
      let arr = [];
      try { arr = JSON.parse(localStorage.getItem(key) || "[]"); } catch (_) { arr = []; }
      if (!Array.isArray(arr)) arr = [];
      arr.unshift(ev);
      localStorage.setItem(key, JSON.stringify(arr));
    }

    alert("✅ Épreuve enregistrée !");
    location.href = "events.html";
  }

  // --- Wire
  initMeetingSelect();

  if (inpGpx) {
    inpGpx.addEventListener("change", () => {
      const file = inpGpx.files?.[0] || null;
      runAnalysisFromFile(file);
    });
  }

  if (btnClearGPX) btnClearGPX.addEventListener("click", clearGPX);
  if (btnSave) btnSave.addEventListener("click", saveCourse);

  // optional
  if (window.ensureMTBSpinnerCSS) window.ensureMTBSpinnerCSS();
})();


