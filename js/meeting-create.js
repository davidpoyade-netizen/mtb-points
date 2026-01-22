import { supabase } from "./supabaseClient.js";

const $ = (id) => document.getElementById(id);

function showMsg(text, type = "info") {
  const el = $("msg");
  if (!el) return;
  el.style.display = "block";
  el.textContent = text;

  // mini style (sans casser ton thème)
  el.style.marginTop = "10px";
  el.style.padding = "10px 12px";
  el.style.borderRadius = "14px";
  el.style.border = "1px solid rgba(40,60,40,.18)";
  el.style.background =
    type === "ok" ? "rgba(22,163,74,.12)"
    : type === "err" ? "rgba(220,38,38,.10)"
    : "rgba(2,132,199,.08)";
  el.style.color =
    type === "ok" ? "#166534"
    : type === "err" ? "#991b1b"
    : "#0c4a6e";
}

function genId(prefix = "m_") {
  try {
    if (crypto?.randomUUID) return prefix + crypto.randomUUID();
  } catch {}
  return prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}

async function requireUser() {
  const { data, error } = await supabase.auth.getUser();
  if (error) throw error;
  if (!data?.user) throw new Error("Utilisateur non connecté");
  return data.user;
}

function getPayload() {
  const name = $("mName")?.value?.trim() || "";
  const date = $("mDate")?.value || "";
  const end_date = $("mEndDate")?.value || null;
  const location = $("mLocation")?.value?.trim() || null;
  const comment = $("mComment")?.value?.trim() || null;
  const is_published = !!$("mPublished")?.checked;

  // Champs obligatoires (selon ton UI : Nom + date début)
  if (!name) throw new Error("Nom de l'événement obligatoire.");
  if (!date) throw new Error("Date de début obligatoire.");

  // Optionnel : si end_date vide => null (OK avec la contrainte SQL)
  return { name, date, end_date, location, comment, is_published };
}

async function createMeeting({ goToRaceCreate = false } = {}) {
  try {
    showMsg("Enregistrement en cours…", "info");

    const user = await requireUser();
    const payload = getPayload();
    const id = genId("meeting_");

    const { error } = await supabase.from("meetings").insert([{
      id,
      organizer_id: user.id,
      ...payload
      // ⚠️ IMPORTANT : on N'INSÈRE PAS mUrl car ta table meetings n'a pas external_url
    }]);

    if (error) throw error;

    showMsg("✅ Événement créé avec succès.", "ok");

    // Redirections (adapte si tu veux)
    if (goToRaceCreate) {
      // course-create.html sait généralement lire meeting_id / meetingId
      window.location.href = `course-create.html?meeting_id=${encodeURIComponent(id)}`;
    } else {
      // page meeting (fiche événement)
      window.location.href = `meeting.html?id=${encodeURIComponent(id)}`;
    }

  } catch (e) {
    console.error("[meeting-create] error:", e);
    showMsg("❌ " + (e?.message || "Erreur inconnue"), "err");
  }
}

function bindUI() {
  const btnCreate = $("btnCreate");
  const btnCreateAndRace = $("btnCreateAndRace");
  const btnReset = $("btnReset");
  const btnGeo = $("btnGeo");

  if (!btnCreate || !btnCreateAndRace) {
    console.error("❌ Boutons introuvables (btnCreate / btnCreateAndRace)");
    showMsg("❌ UI invalide : boutons introuvables", "err");
    return;
  }

  btnCreate.addEventListener("click", () => createMeeting({ goToRaceCreate: false }));
  btnCreateAndRace.addEventListener("click", () => createMeeting({ goToRaceCreate: true }));

  if (btnReset) {
    btnReset.addEventListener("click", () => {
      ["mName","mDate","mEndDate","mLocation","mLat","mLng","mUrl","mComment"].forEach(id => {
        const el = $(id);
        if (el) el.value = "";
      });
      const pub = $("mPublished");
      if (pub) pub.checked = true;
      showMsg("Réinitialisé.", "info");
    });
  }

  if (btnGeo) {
    btnGeo.addEventListener("click", () => {
      if (!navigator.geolocation) {
        showMsg("❌ Géolocalisation non supportée par ce navigateur.", "err");
        return;
      }
      showMsg("Géolocalisation en cours…", "info");
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const { latitude, longitude } = pos.coords;
          const latEl = $("mLat");
          const lngEl = $("mLng");
          if (latEl) latEl.value = String(latitude.toFixed(6));
          if (lngEl) lngEl.value = String(longitude.toFixed(6));
          showMsg("✅ Coordonnées remplies.", "ok");
        },
        (err) => {
          console.warn("geolocation error", err);
          showMsg("❌ Géolocalisation refusée ou indisponible.", "err");
        },
        { enableHighAccuracy: true, timeout: 8000 }
      );
    });
  }
}

document.addEventListener("DOMContentLoaded", bindUI);
