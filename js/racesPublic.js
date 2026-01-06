// js/racesPublic.js
import { supabase } from "./supabaseClient.js";

export async function fetchPublishedRaces(limit = 50) {
  // Si ta policy "races_public_read" autorise SELECT sur is_published=true,
  // ça marche avec l'anon key + RLS.
  const { data, error } = await supabase
    .from("races")
    .select("id, name, date, discipline, level, distance_km, dplus_m, score_global")
    .eq("is_published", true)
    .order("date", { ascending: false })
    .limit(limit);

  if (error) throw error;
  return data || [];
}
