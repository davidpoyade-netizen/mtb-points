// js/auth.js
import { supabase } from "./supabaseClient.js";

/* ------------------------------------------------------------------ */
/* Helpers UI */
/* ------------------------------------------------------------------ */
function $(id) {
  return document.getElementById(id);
}

function setMsg(text = "") {
  const el = $("authMsg");
  if (el) el.textContent = text;
}

/* ------------------------------------------------------------------ */
/* Auth actions */
/* ------------------------------------------------------------------ */

/**
 * Inscription par email / mot de passe
 */
export async function signUp(email, password) {
  setMsg("Inscription en cours…");

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
  });

  if (error) {
    setMsg(error.message);
    throw error;
  }

  setMsg("Compte créé. Vérifie ton email si la confirmation est activée.");
  return data;
}

/**
 * Connexion par email / mot de passe
 */
export async function signIn(email, password) {
  setMsg("Connexion…");

  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    setMsg(error.message);
    throw error;
  }

  setMsg("Connecté ✅");
  return data;
}

/**
 * Déconnexion
 */
export async function signOut() {
  setMsg("Déconnexion…");

  const { error } = await supabase.auth.signOut();
  if (error) {
    setMsg(error.message);
    throw error;
  }

  setMsg("Déconnecté.");
}

/* ------------------------------------------------------------------ */
/* Session & état */
/* ------------------------------------------------------------------ */

/**
 * Retourne la session courante (ou null)
 */
export async function getSession() {
  const { data, error } = await supabase.auth.getSession();
  if (error) {
    console.error("[auth] getSession error:", error);
    return null;
  }
  return data.session;
}

/**
 * Retourne l'utilisateur courant (ou null)
 */
export async function getUser() {
  const { data, error } = await supabase.auth.getUser();
  if (error) {
    console.error("[auth] getUser error:", error);
    return null;
  }
  return data.user;
}

/**
 * Met à jour un petit indicateur UI de connexion
 */
export async function renderAuthState() {
  const el = $("authState");
  if (!el) return;

  const session = await getSession();

  if (!session) {
    el.textContent = "Non connecté";
    return;
  }

  const user = session.user;
  el.textContent = `Connecté : ${user.email}`;
}

/* ------------------------------------------------------------------ */
/* Listener global */
/* ------------------------------------------------------------------ */

// Rafraîchit automatiquement l’UI quand l’état change
supabase.auth.onAuthStateChange(() => {
  renderAuthState();
});

// Premier rendu au chargement
renderAuthState();
