// js/storage-supabase.js (ESM)
// MTB Points — stockage Supabase ONLY (aucun localStorage)
// Objectif: fournir une API stable pour le front (meetings / races) sans dépendre de js/storage.js.

import { supabase } from "./supabaseClient.js";

/* --------------------------- helpers --------------------------- */

export function makeIdFromName(name) {
  const slug = String(name || "")
    .trim()
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 60) || "item";
  return `${slug}-${Date.now()}`;
}

async function getUserOrNull() {
  try {
    const { data, error } = await supabase.auth.getUser();
    if (error) return null;
    return data?.user || null;
  } catch {
    return null;
  }
}

function stripUndefined(obj) {
  const out = {};
  for (const [k, v] of Object.entries(obj || {})) {
    if (v !== undefined) out[k] = v;
  }
  return out;
}

function toBool(v) {
  if (v === true || v === false) return v;
  if (v == null) return null;
  const s = String(v).trim().toLowerCase();
  if (["1", "true", "yes", "y", "on"].includes(s)) return true;
  if (["0", "false", "no", "n", "off"].includes(s)) return false;
  return null;
}

function toISODate(v) {
  const s = String(v || "").trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}

/**
 * IMPORTANT (compat schema actuel)
 * - Dans ta table public.races, la colonne `gpx` est TEXT (d'après tes erreurs/vues).
 *   => On stocke un JSON stringifié dedans, qui peut contenir :
 *      { gpx: {...}, lapsByCategorySex: {...}, comment: "...", surfaceEstimate: ... }
 * - Si plus tard tu passes `gpx` en JSONB, ça continuera de marcher (il suffira d'enlever stringify).
 */
function packGpxText(race) {
  try {
    const payload = {
      gpx: race?.gpx ?? null,
      lapsByCategorySex: race?.lapsByCategorySex ?? null,
      comment: race?.comment ?? null,
      surfaceEstimate: race?.surfaceEstimate ?? null,
      techV2: race?.techV2 ?? null,
    };
    return JSON.stringify(payload);
  } catch {
    return null;
  }
}

/* --------------------------- MEETINGS --------------------------- */

// Ces fonctions sont nommées "...Hybrid" pour compat avec ton code actuel.
// Ici, elles parlent UNIQUEMENT à Supabase.

export async function loadMeetingsHybrid() {
  const { data, error } = await supabase
    .from("meetings")
    .select("*")
    .order("date", { ascending: false })
    .limit(2000);

  if (error) throw error;
  return data || [];
}

export async function findMeetingHybrid(meetingId) {
  if (!meetingId) return null;
  const { data, error } = await supabase
    .from("meetings")
    .select("*")
    .eq("id", meetingId)
    .maybeSingle();

  if (error) throw error;
  return data || null;
}

export async function updateMeetingHybrid(meeting) {
  if (!meeting?.id) throw new Error("updateMeetingHybrid: meeting.id manquant");
  const patch = stripUndefined({
    name: meeting.name ?? undefined,
    date: toISODate(meeting.date) ?? meeting.date ?? undefined,
    end_date: toISODate(meeting.endDate) ?? meeting.end_date ?? undefined,
    location: meeting.location ?? undefined,
    // raceIds si tu as la colonne (ex: race_ids jsonb). Sinon c'est ignoré côté front.
    race_ids: meeting.raceIds ?? meeting.race_ids ?? undefined,
    updated_at: new Date().toISOString(),
  });

  const { data, error } = await supabase
    .from("meetings")
    .update(patch)
    .eq("id", meeting.id)
    .select("*")
    .maybeSingle();

  if (error) throw error;
  return data;
}

export async function deleteMeetingHybrid(meetingId) {
  if (!meetingId) return;
  const { error } = await supabase.from("meetings").delete().eq("id", meetingId);
  if (error) throw error;
}

/* ----------------------------- RACES ---------------------------- */

function mapRaceToDb(race) {
  // On envoie UNIQUEMENT des colonnes "probables" (d'après tes captures/erreurs)
  // pour éviter "Could not find the 'xxx' column".
  return stripUndefined({
    id: race.id,
    meeting_id: race.meetingId ?? race.meeting_id ?? race.eventGroupId ?? null,
    organizer_id: race.organizerId ?? race.organizer_id ?? undefined, // set below
    name: race.name ?? null,
    date: toISODate(race.date) ?? race.date ?? null,
    start_time: race.time ?? race.start_time ?? null,

    disc: race.disc ?? null,
    ebike: toBool(race.ebike),

    // champs calculés
    distance_km: race.distanceKm ?? race.distance_km ?? null,
    dplus_m: race.dplusM ?? race.dplus_m ?? null,

    score_phys: race.scorePhys ?? race.score_phys ?? null,
    score_tech: race.scoreTech ?? race.score_tech ?? null,
    score_global: race.scoreGlobal ?? race.score_global ?? null,

    // IMPORTANT: colonne TEXT => JSON string
    gpx: packGpxText(race),

    // optionnel si colonne existe (sinon -> erreur). On ne l'envoie pas par défaut.
    // is_published: toBool(race.isPublished),
  });
}

export async function addStoredEventHybrid(race) {
  if (!race?.id) throw new Error("addStoredEventHybrid: race.id manquant");
  const user = await getUserOrNull();
  if (!user) throw new Error("Non connecté (auth required).");

  const row = mapRaceToDb({ ...race, organizerId: user.id });

  const { data, error } = await supabase
    .from("races")
    .insert(row)
    .select("*")
    .maybeSingle();

  if (error) throw error;
  return data;
}

export async function updateStoredEventHybrid(race) {
  if (!race?.id) throw new Error("updateStoredEventHybrid: race.id manquant");
  const user = await getUserOrNull();
  if (!user) throw new Error("Non connecté (auth required).");

  const patch = mapRaceToDb({ ...race, organizerId: user.id });
  delete patch.id; // on ne modifie pas la PK

  const { data, error } = await supabase
    .from("races")
    .update(patch)
    .eq("id", race.id)
    .select("*")
    .maybeSingle();

  if (error) throw error;
  return data;
}

export async function deleteStoredEventHybrid(raceId) {
  if (!raceId) return;
  const { error } = await supabase.from("races").delete().eq("id", raceId);
  if (error) throw error;
}
