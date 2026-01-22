import { supabase } from "./supabaseClient.js";

const $ = (id) => document.getElementById(id);

function showMsg(text, type = "info") {
  const el = $("msg");
  if (!el) return;
  el.style.display = "block";
  el.textContent = text;

  el.style.marginTop = "12px";
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

function genId(prefix = "meeting_") {
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

/**
 * Autocomplete + reverse geocoding via Nominatim (OSM).
 * ⚠️ Gratuit mais quota limité — on debouce et on limite les résultats.
 */

let acTimer = null;
let lastQuery = "";
let lastResults = [];
let suppressSuggest = false;

function debounce(fn, delay = 350) {
  return (...args) => {
    clearTimeout(acTimer);
    acTimer = setTimeout(() => fn(...args), delay);
  };
}

function shortAddressFromNominatimAddress(addr) {
  // Choix: ville + CP + pays (propre pour un événement)
  const city =
    addr.city || addr.town || addr.village || addr.municipality || addr.county || "";
  const postcode = addr.postcode || "";
  const country = addr.country || "";
  return [city, postcode, country].filter(Boolean).join(" ");
}

async function nominatimSearch(query) {
  const url =
    `https://nominatim.openstreetmap.org/search?format=jsonv2` +
    `&q=${encodeURIComponent(query)}` +
    `&addressdetails=1&limit=6&countrycodes=fr,it,mc,es,be,ch,de,gb`; // adapte si tu veux

  const res = await fetch(url, { headers: { "Accept": "application/json" } });
  if (!res.ok) throw new Error("Search Nominatim impossible (" + res.status + ")");
  return await res.json();
}

async function nominatimReverse(lat, lng) {
  const url =
    `https://nominatim.openstreetmap.org/reverse?format=jsonv2` +
    `&lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lng)}` +
    `&zoom=16&addressdetails=1`;

  const res = await fetch(url, { headers: { "Accept": "application/json" } });
  if (!res.ok) throw new Error("Reverse Nominatim impossible (" + res.status + ")");
  return await res.json();
}

function renderSuggestions(items) {
  const box = $("addrSuggest");
  if (!box) return;

  if (!items || items.length === 0) {
    box.style.display = "none";
    box.innerHTML = "";
    return;
  }

  box.innerHTML = items
    .map((it, idx) => {
      const title = it.display_name || "Adresse";
      const small = it?.address ? shortAddressFromNominatimAddress(it.address) : "";
      return `
        <div class="item" data-idx="${idx}">
          <div>${escapeHtml(title)}</div>
          ${small ? `<div style="opacity:.75; font-size:12px; margin-top:4px;">${escapeHtml(small)}</div>` : ""}
        </div>
      `;
    })
    .join("");

  box.style.display = "block";

  // Click handler (delegation)
  box.onclick = (e) => {
    const item = e.target.closest(".item");
    if (!item) return;
    const idx = Number(item.dataset.idx);
    const it = items[idx];
    if (!it) return;

    suppressSuggest = true;

    // Remplit
    const lat = Number(it.lat);
    const lon = Number(it.lon);

    if ($("mLat")) $("mLat").value = isFinite(lat) ? lat.toFixed(6) : "";
    if ($("mLng")) $("mLng").value = isFinite(lon) ? lon.toFixed(6) : "";

    // Adresse courte dans le champ
    const shortAddr = it.address ? shortAddressFromNominatimAddress(it.address) : (it.display_name || "");
    if ($("mLocation")) $("mLocation").value = shortAddr;

    // cache
    box.style.display = "none";
    box.innerHTML = "";
    lastResults = [];

    // réautoriser la saisie
    setTimeout(() => (suppressSuggest = false), 0);
  };
}

function escapeHtml(str) {
  return String(str || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

const runAutocomplete = debounce(async () => {
  const input = $("mLocation");
  if (!input) return;

  const q = input.value.trim();
  if (suppressSuggest) return;

  // seuil minimal
  if (q.length < 3) {
    renderSuggestions([]);
    return;
  }

  // pas de spam
  if (q === lastQuery) return;
  lastQuery = q;

  try {
    const results = await nominatimSearch(q);
    lastResults = results || [];
    renderSuggestions(lastResults);
  } catch (e) {
    // silencieux côté UI pour ne pas gêner la saisie
    console.warn("[meeting-create] autocomplete error:", e);
    renderSuggestions([]);
  }
}, 400);

function hideSuggestionsLater() {
  setTimeout(() => {
    const box = $("addrSuggest");
    if (box) {
      box.style.display = "none";
      box.innerHTML = "";
    }
  }, 150);
}

function getPayload() {
  const name = $("mName")?.value?.trim() || "";
  const date = $("mDate")?.value || "";
  const end_date = $("mEndDate")?.value || null;

  const location = $("mLocation")?.value?.trim() || "";
  const country = $("mCountry")?.value?.trim() || null;
  const comment = $("mComment")?.value?.trim() || null;
  const is_published = !!$("mPublished")?.checked;

  const lat = $("mLat")?.value ? Number($("mLat").value) : null;
  const lng = $("mLng")?.value ? Number($("mLng").value) : null;

  if (!name) throw new Error("Nom de l'événement obligatoire.");
  if (!date) throw new Error("Date de début obligatoire.");
  if (!location) throw new Error("Point de rendez-vous (localisation) obligatoire.");

  // Schema meetings (Supabase.sql): date / end_date / location / country / comment / is_published
  // lat/lng ne sont pas dans la table => on ne les insère pas (à moins d'ajouter des colonnes)
  return { name, date, end_date, location, country, comment, is_published };
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
    }]);

    if (error) throw error;

    showMsg("✅ Événement créé avec succès.", "ok");

    if (goToRaceCreate) {
      window.location.href = `course-create.html?meeting_id=${encodeURIComponent(id)}`;
    } else {
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
  const locInput = $("mLocation");

  if (!btnCreate || !btnCreateAndRace) {
    console.error("❌ Boutons introuvables (btnCreate / btnCreateAndRace)");
    showMsg("❌ UI invalide : boutons introuvables", "err");
    return;
  }

  btnCreate.addEventListener("click", () => createMeeting({ goToRaceCreate: false }));
  btnCreateAndRace.addEventListener("click", () => createMeeting({ goToRaceCreate: true }));

  if (btnReset) {
    btnReset.addEventListener("click", () => {
      ["mName","mDate","mEndDate","mLocation","mLat","mLng","mCountry","mComment"].forEach(id => {
        const el = $(id);
        if (el) el.value = "";
      });
      const pub = $("mPublished");
      if (pub) pub.checked = true;
      renderSuggestions([]);
      showMsg("Réinitialisé.", "info");
    });
  }

  // Autocomplétion
  if (locInput) {
    locInput.addEventListener("input", runAutocomplete);
    locInput.addEventListener("blur", hideSuggestionsLater);
    locInput.addEventListener("focus", () => {
      if (lastResults.length > 0) renderSuggestions(lastResults);
    });
  }

  // Géolocalisation + reverse
  if (btnGeo) {
    btnGeo.addEventListener("click", () => {
      if (!navigator.geolocation) {
        showMsg("❌ Géolocalisation non supportée.", "err");
        return;
      }
      showMsg("Géolocalisation en cours…", "info");

      navigator.geolocation.getCurrentPosition(
        async (pos) => {
          try {
            const { latitude, longitude } = pos.coords;

            if ($("mLat")) $("mLat").value = latitude.toFixed(6);
            if ($("mLng")) $("mLng").value = longitude.toFixed(6);

            showMsg("Position trouvée… recherche de l’adresse…", "info");

            const rev = await nominatimReverse(latitude, longitude);

            // adresse courte
            const addr = rev?.address ? shortAddressFromNominatimAddress(rev.address) : (rev?.display_name || "");
            if ($("mLocation")) $("mLocation").value = addr;

            showMsg("✅ Adresse remplie automatiquement.", "ok");
          } catch (e) {
            console.error(e);
            showMsg("⚠️ Position OK, mais adresse introuvable automatiquement.", "err");
          }
        },
        (err) => {
          console.warn(err);
          showMsg("❌ Géolocalisation refusée ou indisponible.", "err");
        },
        { enableHighAccuracy: true, timeout: 8000 }
      );
    });
  }

  // Ferme les suggestions si on clique ailleurs
  document.addEventListener("click", (e) => {
    const box = $("addrSuggest");
    if (!box) return;
    if (e.target === box || box.contains(e.target) || e.target === locInput) return;
    box.style.display = "none";
    box.innerHTML = "";
  });
}

document.addEventListener("DOMContentLoaded", bindUI);
