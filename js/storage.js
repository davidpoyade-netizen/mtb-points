// js/storage.js
// MTB Points — Storage unifié (compat ancienne version)
// Objectifs :
// - Une seule source de vérité pour les clés localStorage
// - Helpers globaux cohérents : listMeetings/getMeetings, upsertMeeting, findMeeting, deleteMeeting
// - Helpers globaux cohérents : listRaces/getRaces (alias events/épreuves), upsertRace, findRace, deleteRace
// - Compatibilité avec tes anciennes clés :
//   - events: "vtt_events_v1" (ancien) + "mtb.races.v1" (nouveau)
//   - meetings: "vtt_meetings" (ancien) + "mtb.meetings.v1" (nouveau)
// - Garde les anciens noms (loadStoredEvents, addStoredEvent, loadMeetings, etc.) pour ne rien casser

(function () {
  // -----------------------------
  // Keys (nouveau + compat)
  // -----------------------------
  const KEYS = {
    MEETINGS: {
      primary: "mtb.meetings.v1",
      legacy: ["vtt_meetings", "mtb.meetings", "meetings"]
    },
    RACES: {
      primary: "mtb.races.v1",
      legacy: ["vtt_events_v1", "mtb.races", "events", "races"]
    }
  };

  // -----------------------------
  // Utils
  // -----------------------------
  function safeParseJSON(raw, fallback) {
    try {
      return JSON.parse(raw);
    } catch (_) {
      return fallback;
    }
  }

  function readArrayAnyKey(primary, legacyKeys) {
    // 1) primary
    const p = localStorage.getItem(primary);
    if (p) {
      const arr = safeParseJSON(p, []);
      if (Array.isArray(arr)) return { key: primary, arr };
    }
    // 2) legacy first non-empty
    for (const k of legacyKeys || []) {
      const raw = localStorage.getItem(k);
      if (!raw) continue;
      const arr = safeParseJSON(raw, []);
      if (Array.isArray(arr) && arr.length) return { key: k, arr };
      if (Array.isArray(arr)) return { key: k, arr }; // même vide mais valide
    }
    return { key: primary, arr: [] };
  }

  function writeArray(key, arr) {
    try {
      localStorage.setItem(key, JSON.stringify(Array.isArray(arr) ? arr : []));
      return true;
    } catch (e) {
      console.error("[storage] writeArray error", e);
      return false;
    }
  }

  function normalizeId(obj) {
    // future-proof (si jamais un objet n'a pas id)
    return obj && typeof obj.id === "string" ? obj.id : null;
  }

  function slugify(s) {
    return String(s || "")
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "")
      .slice(0, 60) || "item";
  }

  function makeIdFromName(name) {
    return `${slugify(name)}-${Date.now()}`;
  }

  // -----------------------------
  // Meetings API (nouveau)
  // -----------------------------
  function listMeetings() {
    return readArrayAnyKey(KEYS.MEETINGS.primary, KEYS.MEETINGS.legacy).arr;
  }
  function getMeetings() { return listMeetings(); } // alias

  function saveMeetings(arr) {
    // on écrit dans primary (standardise)
    writeArray(KEYS.MEETINGS.primary, arr || []);
  }

  function upsertMeeting(meeting) {
    const id = normalizeId(meeting);
    if (!id) throw new Error("upsertMeeting: meeting.id manquant");

    const all = listMeetings().slice();
    const idx = all.findIndex((m) => normalizeId(m) === id);
    if (idx >= 0) all[idx] = meeting;
    else all.unshift(meeting);

    saveMeetings(all);
    return meeting;
  }

  function addMeeting(meeting) {
    return upsertMeeting(meeting);
  }

  function updateMeeting(meeting) {
    return upsertMeeting(meeting);
  }

  function findMeeting(id) {
    if (!id) return null;
    return listMeetings().find((m) => normalizeId(m) === id) || null;
  }

  function deleteMeeting(id) {
    if (!id) return;
    const all = listMeetings().filter((m) => normalizeId(m) !== id);
    saveMeetings(all);
  }

  // -----------------------------
  // Races / Events API (nouveau)
  // -----------------------------
  function listRaces() {
    return readArrayAnyKey(KEYS.RACES.primary, KEYS.RACES.legacy).arr;
  }
  function getRaces() { return listRaces(); } // alias

  function saveRaces(arr) {
    writeArray(KEYS.RACES.primary, arr || []);
  }

  function upsertRace(race) {
    const id = normalizeId(race);
    if (!id) throw new Error("upsertRace: race.id manquant");

    const all = listRaces().slice();
    const idx = all.findIndex((r) => normalizeId(r) === id);
    if (idx >= 0) all[idx] = race;
    else all.unshift(race);

    saveRaces(all);
    return race;
  }

  function addRace(race) {
    return upsertRace(race);
  }

  function updateRace(race) {
    return upsertRace(race);
  }

  function findRace(id) {
    if (!id) return null;
    return listRaces().find((r) => normalizeId(r) === id) || null;
  }

  function deleteRace(id) {
    if (!id) return;
    const all = listRaces().filter((r) => normalizeId(r) !== id);
    saveRaces(all);
  }

  // -----------------------------
  // Backward compatible wrappers (anciens noms)
  // -----------------------------
  // "Events" dans l'ancien code = "Races" (épreuves)
  const LS_EVENTS_KEY = "vtt_events_v1"; // legacy (laissé pour référence)
  function loadStoredEvents() { return listRaces(); }
  function saveStoredEvents(events) { saveRaces(events || []); }
  function addStoredEvent(ev) { return upsertRace(ev); }
  function updateStoredEvent(ev) { return upsertRace(ev); }
  function findStoredEvent(id) { return findRace(id); }

  // "Meetings"
  const MEETINGS_KEY = "vtt_meetings"; // legacy (laissé pour référence)
  function loadMeetings() { return listMeetings(); }

  // -----------------------------
  // Expose globals (compat)
  // -----------------------------
  // Nouveau standard
  window.KEYS_MTB = KEYS;

  window.makeIdFromName = window.makeIdFromName || makeIdFromName;

  window.listMeetings = window.listMeetings || listMeetings;
  window.getMeetings = window.getMeetings || getMeetings;
  window.saveMeetings = window.saveMeetings || saveMeetings;
  window.upsertMeeting = window.upsertMeeting || upsertMeeting;
  window.addMeeting = window.addMeeting || addMeeting;
  window.updateMeeting = window.updateMeeting || updateMeeting;
  window.findMeeting = window.findMeeting || findMeeting;
  window.deleteMeeting = window.deleteMeeting || deleteMeeting;

  window.listRaces = window.listRaces || listRaces;
  window.getRaces = window.getRaces || getRaces;
  window.saveRaces = window.saveRaces || saveRaces;
  window.upsertRace = window.upsertRace || upsertRace;
  window.addRace = window.addRace || addRace;
  window.updateRace = window.updateRace || updateRace;
  window.findRace = window.findRace || findRace;
  window.deleteRace = window.deleteRace || deleteRace;

  // Anciens noms (pour ne rien casser)
  window.loadStoredEvents = window.loadStoredEvents || loadStoredEvents;
  window.saveStoredEvents = window.saveStoredEvents || saveStoredEvents;
  window.addStoredEvent = window.addStoredEvent || addStoredEvent;
  window.updateStoredEvent = window.updateStoredEvent || updateStoredEvent;
  window.findStoredEvent = window.findStoredEvent || findStoredEvent;

  window.loadMeetings = window.loadMeetings || loadMeetings;
  // saveMeetings/addMeeting/updateMeeting/findMeeting/deleteMeeting déjà exposés plus haut

  // -----------------------------
  // Optional: migration douce (une fois)
  // -----------------------------
  // Si tu veux forcer l'unification vers les clés primary, on peut migrer
  // automatiquement les données legacy -> primary quand primary est vide.
  (function migrateOnce() {
    const MIG_KEY = "mtb.storage.migrated.v1";
    if (localStorage.getItem(MIG_KEY)) return;

    // meetings
    const primaryMeet = localStorage.getItem(KEYS.MEETINGS.primary);
    if (!primaryMeet) {
      const found = readArrayAnyKey(KEYS.MEETINGS.primary, KEYS.MEETINGS.legacy);
      if (Array.isArray(found.arr) && found.arr.length) {
        writeArray(KEYS.MEETINGS.primary, found.arr);
      }
    }

    // races
    const primaryRace = localStorage.getItem(KEYS.RACES.primary);
    if (!primaryRace) {
      const found = readArrayAnyKey(KEYS.RACES.primary, KEYS.RACES.legacy);
      if (Array.isArray(found.arr) && found.arr.length) {
        writeArray(KEYS.RACES.primary, found.arr);
      }
    }

    try { localStorage.setItem(MIG_KEY, String(Date.now())); } catch (_) {}
  })();
})();
