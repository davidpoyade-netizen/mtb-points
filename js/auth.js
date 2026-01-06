// js/auth.js
import { supabase, getSession, getUser } from "./supabaseClient.js";

function $(id){ return document.getElementById(id); }
function msg(t){ const el = $("authMsg"); if (el) el.textContent = t || ""; }

export async function signUp(email, password) {
  msg("Inscription...");
  const { data, error } = await supabase.auth.signUp({ email, password });
  if (error) throw error;

  // Optionnel: tu peux créer/mettre à jour le profile ici si tes policies l’autorisent.
  // Recommandé plutôt: trigger SQL côté DB (je te le donne juste après).
  msg("Compte créé. Vérifie tes emails si confirmation activée.");
  return data;
}

export async function signIn(email, password) {
  msg("Connexion...");
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  msg("Connecté ✅");
  return data;
}

export async function signOut() {
  msg("Déconnexion...");
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
  msg("Déconnecté.");
}

export async function renderAuthState() {
  const session = await getSession();
  const el = $("authState");
  if (!el) return;

  if (!session) {
    el.textContent = "Non connecté";
    return;
  }
  const user = await getUser();
  el.textContent = `Connecté : ${user?.email || "utilisateur"}`;
}

// Auto-refresh UI on auth state changes
supabase.auth.onAuthStateChange(async () => {
  await renderAuthState();
});
