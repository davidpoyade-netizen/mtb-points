// js/storage-supabase.js
// MTB Points — Storage 100% Supabase (zéro localStorage)
// - Dépendance: ./supabaseClient.js (export supabase)
// - Exports conservés pour compat avec le front existant

import { supabase } from "./supabaseClient.js";

/* ------------------------------------------------------------------ */
/* Helpers                                                            */
/* ------------------------------------------------------------------ */

export function makeIdFromName(name) {
  // slug + timestamp, compatible GitHub Pages / Supabase (ids TEXT)
  const base = String(name || "")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "") // remove accents
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "item";
  return `${base}-${Date.now()}`;
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

function mapMeetingDbToLocal(m) {
  return {
    id: m.id,
    organizerId: m.organizer_id ?? null,
    name: m.name ?? "",
    date: m.date ?? null,
    endDate: m.end_date ?? null,
    location: m.location ?? "",
    comment: m.comment ?? "",
    raceIds: Array.isArray(m.race_ids) ? m.race_ids : [],
    isPublished: !!m.is_published,
    createdAt: m.created_at ? Date.parse(m.created_at) : null,
    updatedAt: m.updated_at ? Date.parse(m.updated_at) : null,
  };
}

function mapMeetingLocalToDb(meeting, organizerId) {
  return {
    id: meeting.id,
    organizer_id: organizerId,
    name: meeting.name ?? "",
    date: meeting.date ?? null,
    end_date: meeting.endDate ?? null,
    location: meeting.location ?? "",
    comment: meeting.comment ?? "",
    race_ids: Array.isArray(meeting.raceIds) ? meeting.raceIds : [],
    is_published: !!meeting.isPublished,
  };
}

function mapRaceDbToLocal(r) {
  return {
    id: r.id,
    meetingId: r.meeting_id ?? null,

    name: r.name ?? "",
    date: r.date ?? null,
    time: r.time ?? null,

    disc: r.disc ?? null,
    level: r.level ?? null,

    ebike: !!r.ebike,
    sexAllowed: r.sex_allowed ?? "all",

    wash: r.wash ?? null,
    mechanic: r.mechanic ?? null,
    feeds: r.feeds ?? null,
    cutoff: r.cutoff ?? null,
    comment: r.comment ?? null,

    distanceKm: r.distance_km ?? null,
    dplusM: r.dplus_m ?? null,
    surfaceEstimate: r.surface_estimate ?? null,

    scorePhys: r.score_phys ?? null,
    scoreTech: r.score_tech ?? null,
    scoreGlobal: r.score_global ?? null,

    techV2: r.tech_v2 ?? null,
    gpx: r.gpx ?? null,

    lapsByCategorySex: r.laps_by_category_sex ?? null,

    isPublished: !!r.is_published,
    createdAt: r.created_at ? Date.parse(r.created_at) : null,
    updatedAt: r.updated_at ? Date.parse(r.updated_at) : null,
  };
}

function mapRaceLocalToDb(ev, organizerId) {
  return {
    id: ev.id,
    organizer_id: organizerId,
    meeting_id: ev.meetingId,

    name: ev.name ?? "",
    date: ev.date ?? null,
    time: ev.time ?? null,

    disc: ev.disc ?? null,
    level: ev.level ?? null,

    ebike: !!ev.ebike,
    sex_allowed: ev.sexAllowed ?? "all",

    wash: ev.wash ?? null,
    mechanic: ev.mechanic ?? null,
    feeds: ev.feeds ?? null,
    cutoff: ev.cutoff ?? null,
    comment: ev.comment ?? null,

    distance_km: ev.distanceKm ?? null,
    dplus_m: ev.dplusM ?? null,
    surface_estimate: ev.surfaceEstimate ?? null,

    score_phys: ev.scorePhys ?? null,
    score_tech: ev.scoreTech ?? null,
    score_global: ev.scoreGlobal ?? null,

    tech_v2: ev.techV2 ?? null,
    gpx: ev.gpx ?? null,

    laps_by_category_sex: ev.lapsByCategorySex ?? null,

    is_published: !!ev.isPublished,
  };
}

/* ------------------------------------------------------------------ */
/* RACES (compat: "StoredEvents")                                     */
/* ------------------------------------------------------------------ */

export async function loadStoredEventsHybrid() {
  const { data, error } = await supabase
    .from("races")
    .select("*")
    .order("date", { ascending: false })
    .limit(5000);

  if (error) throw error;
  return (data || []).map(mapRaceDbToLocal);
}

export async function findStoredEventHybrid(id) {
  const { data, error } = await supabase
    .from("races")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) throw error;
  return data ? mapRaceDbToLocal(data) : null;
}

export async function addStoredEventHybrid(ev) {
  const user = await getUserSafe();
  if (!user) throw new Error("Non connecté (auth requise).");

  if (!ev.id) ev.id = makeIdFromName(ev.name || "race");

  const payload = mapRaceLocalToDb(ev, user.id);

  const { error } = await supabase
    .from("races")
    .insert(payload);

  if (error) throw error;
}

export async function updateStoredEventHybrid(ev) {
  const user = await getUserSafe();
  if (!user) throw new Error("Non connecté (auth requise).");
  if (!ev?.id) throw new Error("updateStoredEventHybrid: id manquant");

  const payload = mapRaceLocalToDb(ev, user.id);

  const { error } = await supabase
    .from("races")
    .update(payload)
    .eq("id", ev.id);

  if (error) throw error;
}

/* ------------------------------------------------------------------ */
/* MEETINGS                                                           */
/* ------------------------------------------------------------------ */

export async function loadMeetingsHybrid() {
  const { data, error } = await supabase
    .from("meetings")
    .select("*")
    .order("date", { ascending: false })
    .limit(2000);

  if (error) throw error;
  return (data || []).map(mapMeetingDbToLocal);
}

export async function findMeetingHybrid(id) {
  const { data, error } = await supabase
    .from("meetings")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) throw error;
  return data ? mapMeetingDbToLocal(data) : null;
}

export async function addMeetingHybrid(meeting) {
  const user = await getUserSafe();
  if (!user) throw new Error("Non connecté (auth requise).");

  if (!meeting.id) meeting.id = makeIdFromName(meeting.name || "meeting");
  if (!Array.isArray(meeting.raceIds)) meeting.raceIds = [];

  const payload = mapMeetingLocalToDb(meeting, user.id);

  const { error } = await supabase
    .from("meetings")
    .insert(payload);

  if (error) throw error;
}

export async function updateMeetingHybrid(meeting) {
  const user = await getUserSafe();
  if (!user) throw new Error("Non connecté (auth requise).");
  if (!meeting?.id) throw new Error("updateMeetingHybrid: id manquant");

  if (!Array.isArray(meeting.raceIds)) meeting.raceIds = [];

  const payload = mapMeetingLocalToDb(meeting, user.id);

  const { error } = await supabase
    .from("meetings")
    .update(payload)
    .eq("id", meeting.id);

  if (error) throw error;
}

export async function deleteMeetingHybrid(id) {
  const user = await getUserSafe();
  if (!user) throw new Error("Non connecté (auth requise).");
  if (!id) throw new Error("deleteMeetingHybrid: id manquant");

  const { error } = await supabase
    .from("meetings")
    .delete()
    .eq("id", id);

  if (error) throw error;
}
