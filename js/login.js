// js/login.js
// MTB Points — Login Organisateur (Supabase)
// - Ne force PAS le role d’un compte existant
// - Crée le profil seulement s’il n’existe pas
// - Met à jour email/display_name sans toucher au role
// - Gère GitHub Pages emailRedirectTo
//
// Dépendance : ./supabaseClient.js (export supabase)

import { supabase } from "./supabaseClient.js";

const $ = (id) => document.getElementById(id);

function setMsg(text, type = "err") {
  const el = $("msg");
  if (!el) return;
  el.className = "msg " + (text ? type : "");
  el.style.display = text ? "block" : "none";
  el.textContent = text ? String(text) : "";
}

function setPill(connected) {
  const dot = $("dotState");
  const txt = $("pillText");
  if (!dot || !txt) return;
  dot.classList.remove("ok", "warn", "err");
  if (connected) {
    dot.classList.add("ok");
    txt.textContent = "Connecté";
  } else {
    dot.classList.add("warn");
    txt.textContent = "Non connecté";
  }
}

function redirectOrganizer() {
  window.location.href = "organizer-dashboard.html";
}

function githubPagesRedirectUrl() {
  // revient sur le dossier courant + login.html
  const base = location.origin + location.pathname.replace(/\/[^\/]*$/, "/");
  return base + "login.html";
}

function displayNameFromUser(user) {
  return (
    user?.user_metadata?.display_name ??
    (user?.email ? user.email.split("@")[0] : null)
  );
}

async function fetchProfile(userId) {
  const { data, error } = await supabase
    .from("profiles")
    .select("id, role")
    .eq("id", userId)
    .maybeSingle();

  if (error) throw error;
  return data || null;
}

/**
 * Crée le profil seulement si absent.
 * Si présent, met à jour email/display_name (sans toucher au role).
 */
async function ensureProfileNoRoleOverride(user, roleWanted = "organizer") {
  if (!user?.id) return;

  // 1) Lire profil
  const existing = await fetchProfile(user.id);

  // 2) Si absent => INSERT avec roleWanted
  if (!existing) {
    const payload = {
      id: user.id,
      email: user.email ?? null,
      role: roleWanted,
      display_name: displayNameFromUser(user),
    };

    const { error } = await supabase.from("profiles").insert(payload);
    if (error) throw error;
    return { role: roleWanted, created: true };
  }

  // 3) Si présent => UPDATE (sans role)
  const payload = {
    email: user.email ?? null,
    display_name: displayNameFromUser(user),
  };

  const { error: upErr } = await supabase
    .from("profiles")
    .update(payload)
    .eq("id", user.id);

  if (upErr) throw upErr;

  return { role: existing.role ?? null, created: false };
}

async function renderState() {
  const { data: { session }, error } = await supabase.auth.getSession();
  if (error) console.warn("[login] getSession error", error);

  const connected = !!session?.user;

  setPill(connected);

  const btnSignOut = $("btnSignOut");
  const btnSignIn = $("btnSignIn");
  const btnSignUp = $("btnSignUp");

  if (btnSignOut) btnSignOut.style.display = connected ? "inline-flex" : "none";
  if (btnSignIn) btnSignIn.disabled = connected;
  if (btnSignUp) btnSignUp.disabled = connected;

  // On tente d’assurer le profil (sans override role)
  if (connected) {
    try {
      await ensureProfileNoRoleOverride(session.user, "organizer");
    } catch (e) {
      // si RLS bloque encore, tu verras l’erreur mais la session reste OK
      console.warn("[login] ensureProfile failed", e);
    }
  }
}

async function signInOrganizer(email, password) {
  setMsg("Connexion…", "warn");

  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;

  // assure profil (sans override)
  const info = await ensureProfileNoRoleOverride(data.user, "organizer");

  // relis role (source de vérité DB)
  const p = await fetchProfile(data.user.id);
  const role = p?.role ?? info?.role ?? null;

  if (role !== "organizer" && role !== "admin") {
    // important : on ne “promeut” pas un compte existant
    throw new Error(`Ce compte n’est pas organisateur. (role=${role ?? "null"})`);
  }

  setMsg("Connecté ✅ Redirection…", "ok");
  redirectOrganizer();
}

async function signUpOrganizer(email, password) {
  setMsg("Création du compte organisateur…", "warn");

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      // NB: metadata utile mais non fiable => le role DB reste la vérité
      data: { role: "organizer" },
      emailRedirectTo: githubPagesRedirectUrl(),
    }
  });

  if (error) throw error;

  // Si confirmation email désactivée => session immédiate
  if (data?.user && data?.session) {
    await ensureProfileNoRoleOverride(data.user, "organizer");
    setMsg("Compte créé ✅ — Redirection…", "ok");
    redirectOrganizer();
    return;
  }

  setMsg("Compte créé ✅ Vérifie ton email pour confirmer, puis reviens te connecter.", "ok");
}

async function signOut() {
  setMsg("Déconnexion…", "warn");
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
  setMsg("Déconnecté ✅", "ok");
  await renderState();
}

function getEmailPassword() {
  const email = ($("email")?.value || "").trim();
  const password = $("password")?.value || "";
  return { email, password };
}

function lockButtons(locked) {
  const btnSignIn = $("btnSignIn");
  const btnSignUp = $("btnSignUp");
  if (btnSignIn) btnSignIn.disabled = !!locked;
  if (btnSignUp) btnSignUp.disabled = !!locked;
}

function bind() {
  const form = $("form");
  const btnSignUp = $("btnSignUp");
  const btnSignOut = $("btnSignOut");

  if (form) {
    form.addEventListener("submit", async (ev) => {
      ev.preventDefault();
      const { email, password } = getEmailPassword();

      if (!email || !password) {
        setMsg("Email et mot de passe requis.", "warn");
        return;
      }

      lockButtons(true);

      try {
        await signInOrganizer(email, password);
      } catch (e) {
        console.error("[login] signIn error", e);
        const msg = String(e?.message || "");
        if (msg.toLowerCase().includes("email not confirmed")) {
          setMsg("Email non confirmé. Vérifie ton email puis réessaie.", "warn");
        } else {
          setMsg(e?.message || "Erreur lors de la connexion.", "err");
        }
        await renderState();
      } finally {
        lockButtons(false);
      }
    });
  }

  if (btnSignUp) {
    btnSignUp.addEventListener("click", async () => {
      const { email, password } = getEmailPassword();

      if (!email || !password) {
        setMsg("Email et mot de passe requis (min 6 caractères).", "warn");
        return;
      }

      lockButtons(true);

      try {
        await signUpOrganizer(email, password);
        await renderState();
      } catch (e) {
        console.error("[login] signUp error", e);
        setMsg(e?.message || "Erreur lors de la création du compte.", "err");
        await renderState();
      } finally {
        lockButtons(false);
      }
    });
  }

  if (btnSignOut) {
    btnSignOut.addEventListener("click", async () => {
      try {
        await signOut();
      } catch (e) {
        console.error("[login] signOut error", e);
        setMsg(e?.message || "Erreur lors de la déconnexion.", "err");
      }
    });
  }
}

async function init() {
  bind();
  await renderState();
  supabase.auth.onAuthStateChange(async () => {
    await renderState();
  });
}

await init();
