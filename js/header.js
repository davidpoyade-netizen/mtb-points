import { supabase } from "./supabaseClient.js";

const $ = (sel, root = document) => root.querySelector(sel);

function getCurrentPage() {
  const p = location.pathname.split("/").pop();
  return p || "index.html";
}

async function loadHeader() {
  const container = document.getElementById("app-header");
  if (!container) return;

  // Charge le header HTML (même dossier que la page)
  const res = await fetch("./header.html", { cache: "no-cache" });
  if (!res.ok) throw new Error("header.html introuvable (HTTP " + res.status + ")");
  container.innerHTML = await res.text();

  // Active link (page courante)
  const current = getCurrentPage();
  container.querySelectorAll(".nav a").forEach((a) => {
    const href = a.getAttribute("href");
    if (href === current) a.classList.add("active");
  });

  // Bind auth UI
  await refreshAuthUI(container);

  // Boutons
  const btnLogin = $("#btnLogin", container);
  const btnLogout = $("#btnLogout", container);

  if (btnLogin) {
    btnLogin.addEventListener("click", () => {
      // page de login
      location.href = "login.html";
    });
  }

  if (btnLogout) {
    btnLogout.addEventListener("click", async () => {
      try {
        btnLogout.disabled = true;
        await supabase.auth.signOut();
      } catch (e) {
        console.error("[header] signOut error:", e);
      } finally {
        btnLogout.disabled = false;
        await refreshAuthUI(container);
      }
    });
  }

  // Si l’état change (login/logout dans un autre onglet)
  supabase.auth.onAuthStateChange(() => {
    refreshAuthUI(container).catch(console.error);
  });
}

async function refreshAuthUI(container) {
  const btnLogin = $("#btnLogin", container);
  const btnLogout = $("#btnLogout", container);
  const linkAccount = $("#linkAccount", container);
  const linkOrganizer = $("#linkOrganizer", container);
  const linkAdmin = $("#linkAdmin", container);

  // Reset
  if (linkOrganizer) linkOrganizer.style.display = "none";
  if (linkAdmin) linkAdmin.style.display = "none";

  const { data, error } = await supabase.auth.getUser();
  if (error) console.warn("[header] getUser error:", error);

  const user = data?.user || null;

  if (!user) {
    // Pas connecté
    if (btnLogin) btnLogin.style.display = "inline-flex";
    if (btnLogout) btnLogout.style.display = "none";
    if (linkAccount) linkAccount.style.display = "none";
    return;
  }

  // Connecté
  if (btnLogin) btnLogin.style.display = "none";
  if (btnLogout) btnLogout.style.display = "inline-flex";
  if (linkAccount) linkAccount.style.display = "inline-flex";

  // Optionnel : essaye de lire profiles.role (si RLS autorise)
  try {
    const { data: prof, error: pe } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    if (!pe && prof?.role) {
      const role = String(prof.role).toLowerCase();

      if (role === "organizer" || role === "organisateur") {
        if (linkOrganizer) linkOrganizer.style.display = "inline-flex";
      }
      if (role === "admin") {
        if (linkOrganizer) linkOrganizer.style.display = "inline-flex";
        if (linkAdmin) linkAdmin.style.display = "inline-flex";
      }
    }
  } catch (e) {
    // Si profiles est protégé, on n’affiche juste pas les liens de rôle.
    console.warn("[header] profiles role not available:", e);
  }
}

document.addEventListener("DOMContentLoaded", () => {
  loadHeader().catch((e) => console.error("[header] load error:", e));
});
