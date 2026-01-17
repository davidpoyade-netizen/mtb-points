// js/meeting-create.js
// Création meeting (localStorage) – robuste GitHub Pages
(function () {
  const $ = (id) => document.getElementById(id);

  const KEY_MEETINGS = "mtb.meetings.v1";

  function dbg(text){
    console.log("[meeting-create]", text);
  }

  function showMsg(text, isError = false) {
    const el = $("msg");
    if (!el) return;
    el.style.display = text ? "block" : "none";
    if (text) {
      el.innerHTML = isError ? `❌ ${text}` : `✅ ${text}`;
      el.style.color = isError ? "#dc2626" : "#16a34a";
    } else {
      el.innerHTML = "";
    }
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
    if (!name) return "Le nom de l'événement est obligatoire.";
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
    const url = safeTrim($("mUrl")?.value) || null;
    const published = $("mPublished")?.checked || false;

    // Géolocalisation
    const lat = $("mLat")?.value !== "" ? Number($("mLat").value) : null;
    const lng = $("mLng")?.value !== "" ? Number($("mLng").value) : null;
    const geo = (Number.isFinite(lat) && Number.isFinite(lng)) ? { lat, lng } : null;

    const err = validate(name, date, endDate);
    if (err) throw new Error(err);

    return {
      id: makeIdFromName(name),
      name,
      date,
      endDate,
      location,
      geo,
      url,
      comment,
      published,
      raceIds: [],
      createdAt: new Date().toISOString()
    };
  }

  function resetForm() {
    if ($("mName")) $("mName").value = "";
    if ($("mDate")) $("mDate").value = "";
    if ($("mEndDate")) $("mEndDate").value = "";
    if ($("mLocation")) $("mLocation").value = "";
    if ($("mLat")) $("mLat").value = "";
    if ($("mLng")) $("mLng").value = "";
    if ($("mUrl")) $("mUrl").value = "";
    if ($("mComment")) $("mComment").value = "";
    if ($("mPublished")) $("mPublished").checked = true;
    showMsg("");
  }

  async function createMeeting({ goCreateRace = false } = {}) {
    try {
      const meeting = buildMeetingFromForm();
      upsertMeetingLocal(meeting);

      showMsg("Événement créé. Redirection…");
      dbg(`Meeting créé: ${meeting.id}`);

      // IMPORTANT: page de création d'épreuve = course-create.html (dans ton projet)
      setTimeout(() => {
        if (goCreateRace) {
          location.href = `course-create.html?meetingId=${encodeURIComponent(meeting.id)}`;
        } else {
          location.href = `meeting.html?id=${encodeURIComponent(meeting.id)}`;
        }
      }, 500);
    } catch (e) {
      console.error(e);
      showMsg(e?.message || e, true);
    }
  }

  // Wire UI
  const btnCreate = $("btnCreate");
  const btnCreateAndRace = $("btnCreateAndRace");
  const btnReset = $("btnReset");
  const btnGeo = $("btnGeo");

  if (!btnCreate || !btnCreateAndRace) {
    dbg("ERREUR: boutons introuvables (ids btnCreate / btnCreateAndRace).");
    return;
  }

  btnCreate.addEventListener("click", () => createMeeting({ goCreateRace: false }));
  btnCreateAndRace.addEventListener("click", () => createMeeting({ goCreateRace: true }));
  btnReset?.addEventListener("click", resetForm);

  // Géolocalisation
  btnGeo?.addEventListener("click", async () => {
    const hint = $("geoHint");
    if (!navigator.geolocation) {
      if (hint) hint.textContent = "Géolocalisation indisponible sur ce navigateur.";
      return;
    }
    if (hint) hint.textContent = "Demande d'autorisation…";
    
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        if ($("mLat")) $("mLat").value = String(Math.round(lat * 1e6) / 1e6);
        if ($("mLng")) $("mLng").value = String(Math.round(lng * 1e6) / 1e6);
        if (hint) hint.textContent = "✅ Coordonnées récupérées.";
      },
      (err) => {
        if (hint) hint.textContent = "❌ Impossible de récupérer la position (refus / erreur).";
        console.warn(err);
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 }
    );
  });

  // Validation date de fin >= date de début
  $("mDate")?.addEventListener("change", () => {
    const start = toISODate($("mDate").value);
    const endEl = $("mEndDate");
    if (endEl && start) endEl.min = start;
  });

  dbg("Script chargé ✅ prêt à créer un événement.");
})();
