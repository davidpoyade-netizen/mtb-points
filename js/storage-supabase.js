// js/storage-supabase.js
// MTB Points — storage hybride : Supabase (si connecté) sinon localStorage
//
// Dépendances:
// - ./supabaseClient.js  (export supabase)
// - ./storage.js         (tes fonctions localStorage existantes)
//
// Usage (dans une page):
// <script type="module">
//   import { loadMeetingsHybrid } from "./js/storage-supabase.js";
// </script>

import { supabase } from "./supabaseClient.js";

// Fallback localStorage (ton fichier actuel)
import {
  loadStoredEvents as lsLoadStoredEvents,
  saveStoredEvents as lsSaveStoredEvents,
  addStoredEvent as lsAddStoredEvent,
  updateStoredEvent as lsUpdateStoredEvent,
  findStoredEvent as lsFindStoredEvent,
  makeIdFromName as lsMakeIdFromName,

  loadMeetings as lsLoadMeetings,
  saveMeetings as lsSaveMeetings,
  addMeeting as lsAddMeeting,
  updateMeeting as lsUpdateMeeting,
  findMeeting as lsFindMeeting,
  deleteMeeting as lsDeleteMeeting,
} from "./storage.js";

/* ------------------------------------------------------------------ */
/* Helpers                                                            */
/* ------------------------------------------------------------------ */
function normalizeDateToISO(d) {
  // accepte "YYYY-MM-DD" ou Date -> renvoie "YYYY-MM-DD" ou null
  if (!d) return null;
  if (d instanceof Date && !isNaN(d)) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const da = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${da}`;
  }
  const s = String(d).trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}

async function getSessionSafe() {
  try {
    const { data, error } = await supabase.auth.getSession();
    if (error) return null;
    return data.session || null;
  } catch {
    return null;
  }
}

async function getUserSafe() {
  try {
    const { data, error } = await supabase.auth.getUser();
    if (error) return null;
    return data.user || null;
  } catch {
    return null;
  }
}

async function isAuthed() {
  const s = await getSessionSafe();
  return !!s;
}

function mapRaceDbToLocal(r) {
  // DB -> format "event" utilisé dans ton front (localStorage)
  return {
    id: r.id,
    name: r.name,
    date: r.date,              // YYYY-MM-DD
    disc: r.disc ?? null,
    level: r.level ?? null,
    ebike: !!r.ebike,
    distanceKm: r.distance_km == null ? null : Number(r.distance_km),
    dplusM: r.dplus_m == null ? null : Number(r.dplus_m),

    // optionnel (si tu stockes)
    scorePhys: r.score_phys ?? null,
    scoreTech: r.score_tech ?? null,
    scoreGlobal: r.score_global ?? null,

    eventGroupId: r.meeting_id ?? null, // aligné à ton UI meeting/course-create
    gpx: r.gpx ?? null,
  };
}

function mapRaceLocalToDb(ev, organizerId) {
  // local -> DB
  return {
    id: ev.id,
    organizer_id: organizerId,
    meeting_id: ev.eventGroupId || ev.meeting_id || null,

    name: ev.name,
    date: normalizeDateToISO(ev.date) || null,

    disc: ev.disc ?? null,
    level: ev.level ?? null,
    ebike: !!ev.ebike,

    distance_km: ev.distanceKm == null ? null : Number(ev.distanceKm),
    dplus_m: ev.dplusM == null ? null : Number(ev.dplusM),

    score_phys: ev.scorePhys ?? ev.score_phys ?? null,
    score_tech: ev.scoreTech ?? ev.score_tech ?? null,
    score_global: ev.scoreGlobal ?? ev.score_global ?? null,

    gpx: ev.gpx ?? null,
  };
}

function mapMeetingDbToLocal(m) {
  return {
    id: m.id,
    name: m.name,
    date: m.date ?? null,           // YYYY-MM-DD
    location: m.location ?? null,
    comment: m.comment ?? null,
    raceIds: Array.isArray(m.race_ids) ? m.race_ids : [],
    isPublished: !!m.is_published,
  };
}

function mapMeetingLocalToDb(meeting, organizerId) {
  return {
    id: meeting.id,
    organizer_id: organizerId,
    name: meeting.name,
    date: normalizeDateToISO(meeting.date) || null,
    location: meeting.location ?? null,
    comment: meeting.comment ?? null,
    race_ids: Array.isArray(meeting.raceIds) ? meeting.raceIds : [],
    is_published: !!meeting.isPublished,
  };
}

/* ------------------------------------------------------------------ */
/* EVENTS / RACES (hybride)                                           */
/* ------------------------------------------------------------------ */

export function makeIdFromName(name) {
  // on garde la même logique que localStorage pour être compatible
  return lsMakeIdFromName(name);
}

export async function loadStoredEventsHybrid() {
  if (!(await isAuthed())) return lsLoadStoredEvents();

  const user = await getUserSafe();
  if (!user) return lsLoadStoredEvents();

  const { data, error } = await supabase
    .from("races")
    .select("*")
    .order("date", { ascending: false })
    .limit(5000);

  if (error) {
    console.warn("[storage-supabase] loadStoredEventsHybrid fallback local:", error);
    return lsLoadStoredEvents();
  }

  return (data || []).map(mapRaceDbToLocal);
}

export async function findStoredEventHybrid(id) {
  if (!(await isAuthed())) return lsFindStoredEvent(id);

  const { data, error } = await supabase
    .from("races")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    console.warn("[storage-supabase] findStoredEventHybrid fallback local:", error);
    return lsFindStoredEvent(id);
  }
  return data ? mapRaceDbToLocal(data) : null;
}

export async function addStoredEventHybrid(ev) {
  if (!(await isAuthed())) return lsAddStoredEvent(ev);

  const user = await getUserSafe();
  if (!user) return lsAddStoredEvent(ev);

  // assure id
  if (!ev.id) ev.id = makeIdFromName(ev.name || "event");

  const payload = mapRaceLocalToDb(ev, user.id);

  const { error } = await supabase
    .from("races")
    .insert(payload);

  if (error) {
    console.warn("[storage-supabase] addStoredEventHybrid fallback local:", error);
    return lsAddStoredEvent(ev);
  }
}

export async function updateStoredEventHybrid(ev) {
  if (!(await isAuthed())) return lsUpdateStoredEvent(ev);

  const user = await getUserSafe();
  if (!user) return lsUpdateStoredEvent(ev);

  if (!ev.id) return;

  const payload = mapRaceLocalToDb(ev, user.id);

  const { error } = await supabase
    .from("races")
    .update(payload)
    .eq("id", ev.id);

  if (error) {
    console.warn("[storage-supabase] updateStoredEventHybrid fallback local:", error);
    return lsUpdateStoredEvent(ev);
  }
}

/* Optionnel: si tu veux forcer l’écriture localStorage (rarement utile) */
export function saveStoredEventsLocalOnly(events) {
  return lsSaveStoredEvents(events);
}

/* ------------------------------------------------------------------ */
/* MEETINGS (hybride)                                                 */
/* ------------------------------------------------------------------ */

export async function loadMeetingsHybrid() {
  if (!(await isAuthed())) return lsLoadMeetings();

  const user = await getUserSafe();
  if (!user) return lsLoadMeetings();

  const { data, error } = await supabase
    .from("meetings")
    .select("*")
    .order("date", { ascending: false })
    .limit(2000);

  if (error) {
    console.warn("[storage-supabase] loadMeetingsHybrid fallback local:", error);
    return lsLoadMeetings();
  }

  return (data || []).map(mapMeetingDbToLocal);
}

export async function findMeetingHybrid(id) {
  if (!(await isAuthed())) return lsFindMeeting(id);

  const { data, error } = await supabase
    .from("meetings")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    console.warn("[storage-supabase] findMeetingHybrid fallback local:", error);
    return lsFindMeeting(id);
  }
  return data ? mapMeetingDbToLocal(data) : null;
}

export async function addMeetingHybrid(meeting) {
  if (!(await isAuthed())) return lsAddMeeting(meeting);

  const user = await getUserSafe();
  if (!user) return lsAddMeeting(meeting);

  if (!meeting.id) meeting.id = makeIdFromName(meeting.name || "meeting");
  if (!Array.isArray(meeting.raceIds)) meeting.raceIds = [];

  const payload = mapMeetingLocalToDb(meeting, user.id);

  const { error } = await supabase
    .from("meetings")
    .insert(payload);

  if (error) {
    console.warn("[storage-supabase] addMeetingHybrid fallback local:", error);
    return lsAddMeeting(meeting);
  }
}

export async function updateMeetingHybrid(meeting) {
  if (!(await isAuthed())) return lsUpdateMeeting(meeting);

  const user = await getUserSafe();
  if (!user) return lsUpdateMeeting(meeting);

  if (!meeting.id) return;

  if (!Array.isArray(meeting.raceIds)) meeting.raceIds = [];

  const payload = mapMeetingLocalToDb(meeting, user.id);

  const { error } = await supabase
    .from("meetings")
    .update(payload)
    .eq("id", meeting.id);

  if (error) {
    console.warn("[storage-supabase] updateMeetingHybrid fallback local:", error);
    return lsUpdateMeeting(meeting);
  }
}

export async function deleteMeetingHybrid(id) {
  if (!(await isAuthed())) return lsDeleteMeeting(id);

  const { error } = await supabase
    .from("meetings")
    .delete()
    .eq("id", id);

  if (error) {
    console.warn("[storage-supabase] deleteMeetingHybrid fallback local:", error);
    return lsDeleteMeeting(id);
  }
}

/* ------------------------------------------------------------------ */
/* BONUS: Sync local -> Supabase (migration)                           */
/* ------------------------------------------------------------------ */
/**
 * Utile le jour où tu veux migrer les données localStorage vers Supabase.
 * - ne supprime rien en local
 * - fait des upserts (insert or update)
 */
export async function migrateLocalToSupabase() {
  if (!(await isAuthed())) {
    throw new Error("Non connecté : migration impossible.");
  }

  const user = await getUserSafe();
  if (!user) throw new Error("User introuvable.");

  // Meetings
  const meetings = lsLoadMeetings().map(m => {
    if (!m.id) m.id = makeIdFromName(m.name || "meeting");
    if (!Array.isArray(m.raceIds)) m.raceIds = [];
    return mapMeetingLocalToDb(m, user.id);
  });

  if (meetings.length) {
    const { error } = await supabase
      .from("meetings")
      .upsert(meetings, { onConflict: "id" });
    if (error) throw error;
  }

  // Races
  const races = lsLoadStoredEvents().map(ev => {
    if (!ev.id) ev.id = makeIdFromName(ev.name || "event");
    return mapRaceLocalToDb(ev, user.id);
  });

  if (races.length) {
    const { error } = await supabase
      .from("races")
      .upsert(races, { onConflict: "id" });
    if (error) throw error;
  }

  return { meetings: meetings.length, races: races.length };
}

/* ------------------------------------------------------------------ */
/* Option compat: exposer sur window pour scripts non-module           */
/* ------------------------------------------------------------------ */
export function exposeHybridToWindow() {
  window.loadStoredEvents = () => loadStoredEventsHybrid();
  window.findStoredEvent = (id) => findStoredEventHybrid(id);
  window.addStoredEvent = (ev) => addStoredEventHybrid(ev);
  window.updateStoredEvent = (ev) => updateStoredEventHybrid(ev);

  window.loadMeetings = () => loadMeetingsHybrid();
  window.findMeeting = (id) => findMeetingHybrid(id);
  window.addMeeting = (m) => addMeetingHybrid(m);
  window.updateMeeting = (m) => updateMeetingHybrid(m);
  window.deleteMeeting = (id) => deleteMeetingHybrid(id);

  window.makeIdFromName = makeIdFromName;
}
