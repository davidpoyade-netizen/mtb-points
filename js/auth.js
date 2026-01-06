// js/auth.js
import { supabase } from "./supabaseClient.js";

function $(id){ return document.getElementById(id); }
function setMsg(t){
  const el = $("authMsg");
  if (el) el.textContent = t || "";
}

// ✅ Base URL compatible GitHub Pages (inclut /mtb-points)
// Ex: https://davidpoyade-netizen.github.io/mtb-points
function getAppBaseUrl(){
  // pathname ex: /mtb-points/login.html -> base /mtb-points
  const parts = location.pathname.split("/").filter(Boolean);
  const base = parts.length ? `/${parts[0]}` : "";
  return `${location.origin}${base}`;
}

function humanizeAuthError(error){
  const msg = (error?.message || "").toLowerCase();

  if (msg.includes("invalid login credentials")) {
    return "Email ou mot de passe incorrect.";
  }
  if (msg.includes("email not confirmed")) {
    return "Email non confirmé. Vérifie ta boîte mail (et spam) puis réessaie.";
  }
  if (msg.includes("user already registered")) {
    return "Cet email est déjà inscrit. Essaie de te connecter.";
  }
  return error?.message || "Erreur inconnue.";
}

/** INSCRIPTION (email + password) */
export async function signUp(email, password) {
  setMsg("Inscription…");

  try{
    const redirectTo = `${getAppBaseUrl()}/login.html`;

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        // IMPORTANT: doit être autorisé dans Supabase > Auth > URL Configuration
        emailRedirectTo: redirectTo
      }
    });

    if (error) throw error;

    // Si confirmation ON => session null
    if (!data?.session) {
      setMsg("Compte créé ✅ Vérifie ton email pour confirmer (spam inclus).");
    } else {
      setMsg("Compte créé ✅ (confirmation email désactivée)");
    }

    return data;
  } catch(e){
    setMsg("❌ " + humanizeAuthError(e));
    throw e;
  }
}

/** CONNEXION (email + password) */
export async function signIn(email, password) {
  setMsg("Connexion…");

  try{
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;

    setMsg("Connecté ✅");
    return data;
  } catch(e){
    setMsg("❌ " + humanizeAuthError(e));
    throw e;
  }
}

/** ✅ CONNEXION PAR EMAIL (MAGIC LINK) -> envoie un email */
export async function signInWithEmailLink(email){
  setMsg("Envoi du lien…");

  try{
    const redirectTo = `${getAppBaseUrl()}/dashboard.html`; // ou login.html si tu préfères
    const { data, error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: redirectTo }
    });
    if (error) throw error;

    setMsg("Email envoyé ✅ Vérifie ta boîte mail (spam inclus).");
    return data;
  } catch(e){
    setMsg("❌ " + humanizeAuthError(e));
    throw e;
  }
}

export async function signOut() {
  setMsg("Déconnexion…");
  try{
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
    setMsg("Déconnecté.");
  } catch(e){
    setMsg("❌ " + humanizeAuthError(e));
    throw e;
  }
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

// Init
renderAuthState();
