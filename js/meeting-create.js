// js/meeting-create.js
// Création meeting avec Supabase + fallback localStorage
import { supabase } from "./supabaseClient.js";

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
    const externalUrl = safeTrim($("mUrl")?.value) || null;
    const lat = safeTrim($("mLat")?.value) || null;
    const lng = safeTrim($("mLng")?.value) || null;
    const isPublished = $("mPublished")?.checked || false;

    const err = validate(name, date, endDate);
    if (err) throw new Error(err);

    return {
      id: makeIdFromName(name),
      name,
      date,
      endDate,
      location,
      comment,
      externalUrl,
      lat: lat ? Number(lat) : null,
      lng: lng ? Number(lng) : null,
      isPublished,
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
    $("mUrl").value = "";
    $("mLat").value = "";
    $("mLng").value = "";
    $("mPublished").checked = true;
    showMsg("");
  }

  // Fallback localStorage pour GitHub Pages sans auth
  function upsertMeetingLocal(meeting) {
    try {
      const raw = localStorage.getItem(KEY_MEETINGS);
      const arr = raw ? JSON.parse(raw) : [];
      const all = Array.isArray(arr) ? arr : [];
      const idx = all.findIndex((m) => m && m.id === meeting.id);
      if (idx >= 0) all[idx] = meeting;
      else all.unshift(meeting);
      localStorage.setItem(KEY_MEETINGS, JSON.stringify(all));
      return meeting;
    } catch(e) {
      console.error("localStorage save failed:", e);
      return meeting;
    }
  }

  async function getCurrentUser() {
    try {
      const { data: { user }, error } = await supabase.auth.getUser();
      if (error) throw error;
      return user;
    } catch(e) {
      console.warn("[meeting-create] getUser failed:", e);
      return null;
    }
  }

  async function createMeeting({ goCreateRace = false } = {}) {
    try {
      const meeting = buildMeetingFromForm();
      showMsg("Création en cours...");

      // Essayer Supabase d'abord
      const user = await getCurrentUser();
      
      if (user) {
        // ✅ UTILISER SUPABASE avec organizer_id
        dbg(`Création Supabase avec user: ${user.id}`);
        
        const payload = {
          id: meeting.id,
          organizer_id: user.id,  // ← IMPORTANT : assigner l'organisateur !
          name: meeting.name,
          date: meeting.date,
          end_date: meeting.endDate,
          location: meeting.location,
          comment: meeting.comment,
          external_url: meeting.externalUrl,
          lat: meeting.lat,
          lng: meeting.lng,
          is_published: meeting.isPublished,
          race_ids: []
        };

        const { error } = await supabase.from("meetings").insert(payload);
        
        if (error) {
          console.error("Supabase insert error:", error);
          throw new Error(`Erreur Supabase: ${error.message}`);
        }

        showMsg("✅ Événement créé dans Supabase. Redirection...");
        dbg(`Meeting créé: ${meeting.id}`);
      } else {
        // Fallback localStorage si pas connecté
        dbg("Pas d'utilisateur connecté, utilisation localStorage");
        upsertMeetingLocal(meeting);
        showMsg("✅ Événement créé localement. Redirection...");
      }

      // Redirection
      setTimeout(() => {
        if (goCreateRace) {
          location.href = `course-create.html?meetingId=${encodeURIComponent(meeting.id)}`;
        } else {
          location.href = `meeting.html?id=${encodeURIComponent(meeting.id)}`;
        }
      }, 800);

    } catch (e) {
      console.error(e);
      showMsg(`❌ ${e?.message || e}`);
    }
  }

  // Géolocalisation
  const btnGeo = $("btnGeo");
  if (btnGeo) {
    btnGeo.addEventListener("click", () => {
      const hint = $("geoHint");
      if (!navigator.geolocation) {
        if (hint) hint.textContent = "❌ Géolocalisation non disponible";
        return;
      }

      if (hint) hint.textContent = "🔍 Localisation en cours...";
      
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const lat = pos.coords.latitude;
          const lng = pos.coords.longitude;
          if ($("mLat")) $("mLat").value = lat.toFixed(6);
          if ($("mLng")) $("mLng").value = lng.toFixed(6);
          if (hint) hint.textContent = `✅ Position: ${lat.toFixed(4)}, ${lng.toFixed(4)}`;
        },
        (err) => {
          console.error("Geolocation error:", err);
          if (hint) hint.textContent = `❌ Erreur: ${err.message}`;
        }
      );
    });
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
