// js/meeting-create.js
// Création meeting (localStorage) — robuste GitHub Pages
(function () {
  const $ = (id) => document.getElementById(id);

  const KEY_MEETINGS = "mtb.meetings.v1";

  function dbg(text){
    const el = $("debug");
    if (el) el.textContent = text;
    console.log("[meeting-create]", text);
  }

  function showMsg(text) {
    const el = $("msg");
    if (!el) return;
    el.style.display = text ? "block" : "none";
    el.innerHTML = text ? String(text) : "";
  }

  function safeTrim(v) { return String(v || "").trim(); }

  function toISODate(v) {
    const s = safeTrim(v);
    return s || null;
  }

  function parseISODate(s) {
    if (!s) return null;
    const d = new Date(`${s}T00:00:00`);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  function isBefore(aISO, bISO) {
    const a = parseISODate(aISO);
    const b = parseISODate(bISO);
    if (!a || !b) return false;
    return a.getTime() < b.getTime();
  }

  function slugify(s) {
    return safeTrim(s)
      .toLowerCase()
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "")
      .slice(0, 60) || "meeting";
  }

  function makeIdFromName(name) {
    return `${slugify(name)}-${Date.now()}`;
  }

  // storage adapters (compat)
  function readMeetings() {
    if (typeof window.getMeetings === "function") return window.getMeetings();
    if (typeof window.listMeetings === "function") return window.listMeetings();
    try {
      const raw = localStorage.getItem(KEY_MEETINGS);
      const arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr : [];
    } catch (_) {
      return [];
    }
  }

  function writeMeetings(arr) {
    if (typeof window.saveMeetings === "function") return window.saveMeetings(arr);
    localStorage.setItem(KEY_MEETINGS, JSON.stringify(arr || []));
  }

  function upsertMeetingLocal(meeting) {
    if (typeof window.upsertMeeting === "function") return window.upsertMeeting(meeting);
    const all = readMeetings();
    const idx = all.findIndex((m) => m && m.id === meeting.id);
    if (idx >= 0) all[idx] = meeting;
    else all.unshift(meeting);
    writeMeetings(all);
    return meeting;
  }

  function validate(name, startDateISO, endDateISO) {
    if (!name) return "Le nom de l’événement est obligatoire.";
    if (!startDateISO) return "La date de début est obligatoire.";
    const start = parseISODate(startDateISO);
    if (!start) return "Date de début invalide.";

    if (endDateISO) {
      const end = parseISODate(endDateISO);
      if (!end) return "Date de fin invalide.";
      if (isBefore(endDateISO, startDateISO)) return "La date de fin ne peut pas être avant la date de début.";
    }
    return null;
  }

  function buildMeetingFromForm() {
    const name = safeTrim($("mName")?.value);
    const date = toISODate($("mDate")?.value);
    const endDate = toISODate($("mEndDate")?.value);
    const location = safeTrim($("mLocation")?.value) || null;
    const comment = safeTrim($("mComment")?.value) || null;

    const err = validate(name, date, endDate);
    if (err) throw new Error(err);

    return {
      id: makeIdFromName(name),
      name,
      date,
      endDate,
      location,
      comment,
      raceIds: [],
      createdAt: new Date().toISOString()
    };
  }

  function resetForm() {
    $("mName").value = "";
    $("mDate").value = "";
    $("mEndDate").value = "";
    $("mLocation").value = "";
    $("mComment").value = "";
    showMsg("");
  }

  async function createMeeting({ goCreateRace = false } = {}) {
    try {
      const meeting = buildMeetingFromForm();
      upsertMeetingLocal(meeting);

      // enlève le fallback si on est là : le script a bien chargé
      window.__fallbackCreateMeeting = null;

      showMsg("✅ Événement créé. Redirection…");
      dbg(`Meeting créé: ${meeting.id}`);

      // IMPORTANT: page de création d'épreuve = course-create.html (dans ton projet)
      if (goCreateRace) {
        location.href = `course-create.html?meetingId=${encodeURIComponent(meeting.id)}`;
      } else {
        location.href = `meeting.html?id=${encodeURIComponent(meeting.id)}`;
      }
    } catch (e) {
      console.error(e);
      showMsg(`❌ ${e?.message || e}`);
    }
  }

  // Wire UI
  const btnCreate = $("btnCreate");
  const btnCreateAndRace = $("btnCreateAndRace");
  const btnReset = $("btnReset");

  if (!btnCreate || !btnCreateAndRace) {
    dbg("ERREUR: boutons introuvables (ids btnCreate / btnCreateAndRace).");
    return;
  }

  btnCreate.addEventListener("click", () => createMeeting({ goCreateRace: false }));
  btnCreateAndRace.addEventListener("click", () => createMeeting({ goCreateRace: true }));
  btnReset?.addEventListener("click", resetForm);

  $("mDate")?.addEventListener("change", () => {
    const start = toISODate($("mDate").value);
    const endEl = $("mEndDate");
    if (endEl && start) endEl.min = start;
  });

  dbg("Script chargé ✅ prêt à créer un événement.");
})();
