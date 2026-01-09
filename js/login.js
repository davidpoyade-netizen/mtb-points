// js/login.js
import { supabase } from "./supabaseClient.js";

const $ = (id) => document.getElementById(id);

function showMsg(text, type = "err") {
  const el = $("msg");
  if (!el) return;
  el.style.display = text ? "block" : "none";
  el.textContent = text ? String(text) : "";
  el.className = text ? `msg ${type}` : "msg";
}

function redirectByRole(role) {
  // Adapte les pages si tu as d'autres routes
  if (role === "organizer") window.location.href = "dashboard.html";
  else if (role === "admin") window.location.href = "admin.html";
  else window.location.href = "index.html"; // rider -> accueil (ou rider.html)
}

async function ensureProfile(user, roleWanted = "rider") {
  if (!user) return;

  const payload = {
    id: user.id,
    email: user.email ?? null,
    role: roleWanted,
    display_name:
      user.user_metadata?.display_name ??
      (user.email ? user.email.split("@")[0] : null),
    updated_at: new Date().toISOString(),
  };

  // upsert: crée si absent, met à jour si existe
  const { error } = await supabase.from("profiles").upsert(payload, {
    onConflict: "id",
  });

  if (error) throw error;
}

async function fetchMyRole(userId) {
  const { data, error } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", userId)
    .maybeSingle();

  if (error) throw error;
  return data?.role ?? "rider";
}

async function onSubmit(roleWanted) {
  showMsg("");

  const email = ($("email")?.value || "").trim();
  const password = $("password")?.value || "";

  if (!email || !password) {
    showMsg("Email et mot de passe requis.", "warn");
    return;
  }

  $("btnRider") && ($("btnRider").disabled = true);
  $("btnOrganizer") && ($("btnOrganizer").disabled = true);

  try {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (error) throw error;

    // 1) crée la ligne profiles si besoin (sinon SELECT role peut renvoyer 0 ligne)
    await ensureProfile(data.user, roleWanted);

    // 2) relit le role (source de vérité DB)
    const role = await fetchMyRole(data.user.id);

    showMsg("Connexion réussie. Redirection…", "ok");
    redirectByRole(role);
  } catch (e) {
    console.error("[login]", e);
    showMsg(e?.message || "Erreur lors de la connexion.");
  } finally {
    $("btnRider") && ($("btnRider").disabled = false);
    $("btnOrganizer") && ($("btnOrganizer").disabled = false);
  }
}

async function init() {
  // Si déjà connecté => redirige
  const { data: { session } } = await supabase.auth.getSession();
  if (session?.user) {
    try {
      // s'assure que le profil existe (role par défaut rider si absent)
      await ensureProfile(session.user, "rider");
      const role = await fetchMyRole(session.user.id);
      redirectByRole(role);
      return;
    } catch (e) {
      console.warn("[login] session exists but profile error", e);
      // on laisse l'utilisateur sur la page login
    }
  }

  // Boutons
  $("btnRider")?.addEventListener("click", (ev) => {
    ev.preventDefault();
    onSubmit("rider");
  });

  $("btnOrganizer")?.addEventListener("click", (ev) => {
    ev.preventDefault();
    onSubmit("organizer");
  });
}

init();
