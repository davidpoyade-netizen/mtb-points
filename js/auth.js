// js/auth.js
import { supabase } from "./supabaseClient.js";

function $(id){ return document.getElementById(id); }
function setMsg(t){
  const el = $("authMsg");
  if (el) el.textContent = t || "";
}

export async function signUp(email, password) {
  setMsg("Inscription...");
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      // IMPORTANT: doit être autorisé dans Auth > URL Configuration
      emailRedirectTo: `${location.origin}/login.html`
    }
  });
  if (error) throw error;

  // Si confirm email est ON : session=null et il faut confirmer par email
  if (!data?.session) {
    setMsg("Compte créé ✅ Vérifie ton email (spam) pour confirmer.");
  } else {
    setMsg("Compte créé ✅ (confirmation désactivée)");
  }

  return data;
}

export async function signIn(email, password) {
  setMsg("Connexion...");
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  setMsg("Connecté ✅");
  return data;
}

export async function signOut() {
  setMsg("Déconnexion...");
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
  setMsg("Déconnecté.");
}

export async function renderAuthState() {
  const el = $("authState");
  if (!el) return;

  const { data: s } = await supabase.auth.getSession();
  const session = s?.session;

  if (!session) {
    el.textContent = "Non connecté";
    return;
  }
  el.textContent = `Connecté : ${session.user.email || "utilisateur"}`;
}

// Auto refresh UI
supabase.auth.onAuthStateChange(async () => {
  await renderAuthState();
});
