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

/** ---------- Adresse (OSM/Nominatim) ---------- **/

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

function shortAddress(addr) {
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
    `&addressdetails=1&limit=6`;

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

function escapeHtml(str) {
  return String(str || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
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
      const small = it?.address ? shortAddress(it.address) : "";
      return `
        <div class="item" data-idx="${idx}">
          <div>${escapeHtml(title)}</div>
          ${small ? `<div style="opacity:.75; font-size:12px; margin-top:4px;">${escapeHtml(small)}</div>` : ""}
        </div>
      `;
    })
    .join("");

  box.style.display = "block";

  box.onclick = (e) => {
    const item = e.target.closest(".item");
    if (!item) return;
    const idx = Number(item.dataset.idx);
    const it = items[idx];
    if (!it) return;

    suppressSuggest = true;

    const lat = Number(it.lat);
    const lon = Number(it.lon);

    if ($("mLat")) $("mLat").value = isFinite(lat) ? lat.toFixed(6) : "";
    if ($("mLng")) $("mLng").value = isFinite(lon) ? lon.toFixed(6) : "";

    const addr = it.address ? shortAddress(it.address) : (it.display_name || "");
    if ($("mLocation")) $("mLocation").value = addr;

    box.style.display = "none";
    box.innerHTML = "";
    lastResults = [];

    setTimeout(() => (suppressSuggest = false), 0);
  };
}

const runAutocomplete = debounce(async () => {
  const input = $("mLocation");
  if (!input || suppressSuggest) return;

  const q = input.value.trim();
  if (q.length < 3) {
    renderSuggestions([]);
    return;
  }
  if (q === lastQuery) return;
  lastQuery = q;

  try {
    const results = await nominatimSearch(q);
    lastResults = results || [];
    renderSuggestions(lastResults);
  } catch (e) {
    console.warn("[meeting-create] autocomplete error:", e);
    renderSuggestions([]);
  }
}, 400);

function hideSuggestionsLater() {
  setTimeout(() => renderSuggestions([]), 150);
}

/** ---------- Supabase insert robuste ---------- **/

function getRawFormData() {
  const name = $("mName")?.value?.trim() || "";
  const date = $("mDate")?.value || "";
  const end_date = $("mEndDate")?.value || null;

  const location = $("mLocation")?.value?.trim() || "";
  const country = $("mCountry")?.value?.trim() || null;

  const external_url = $("mUrl")?.value?.trim() || null;

  const comment = $("mComment")?.value?.trim() || null;
  const is_published = !!$("mPublished")?.checked;

  if (!name) throw new Error("Nom de l'événement obligatoire.");
  if (!date) throw new Error("Date de début obligatoire.");
  if (!location) throw new Error("Point de rendez-vous (localisation) obligatoire.");

  return { name, date, end_date, location, country, external_url, comment, is_published };
}

function normalizeUrl(u) {
  if (!u) return null;
  // autorise https://… ou http://…
  if (/^https?:\/\//i.test(u)) return u;
  // si l'utilisateur met "www.xxx.com" => on préfixe
  if (/^www\./i.test(u)) return "https://" + u;
  return u; // laisse tel quel si autre format
}

async function insertMeetingWithFallback(row) {
  // On tente d’insérer avec country + external_url.
  // Si la DB n’a pas ces colonnes, PostgREST renvoie “Could not find the 'X' column…”.
  // => On enlève ces champs et on retente 1 fois.

  const attempt = async (payload) => supabase.from("meetings").insert([payload]);

  let payload = { ...row };

  // normalise URL
  payload.external_url = normalizeUrl(payload.external_url);

  let res = await attempt(payload);
  if (!res.error) return res;

  const msg = res.error.message || "";

  // fallback si colonnes absentes
  const missingCountry = msg.includes("Could not find the 'country' column");
  const missingUrl = msg.includes("Could not find the 'external_url' column");

  if (missingCountry || missingUrl) {
    if (missingCountry) delete payload.country;
    if (missingUrl) delete payload.external_url;

    // Re-tentative
    res = await attempt(payload);
    return res;
  }

  return res;
}

async function createMeeting({ goToRaceCreate = false } = {}) {
  try {
    showMsg("Enregistrement en cours…", "info");

    const user = await requireUser();
    const form = getRawFormData();
    const id = genId("meeting_");

    const row = {
      id,
      organizer_id: user.id,
      name: form.name,
      date: form.date,
      end_date: form.end_date,
      location: form.location,
      country: form.country,         // peut être ignoré si colonne absente
      external_url: form.external_url, // peut être ignoré si colonne absente
      comment: form.comment,
      is_published: form.is_published
    };

    const { error } = await insertMeetingWithFallback(row);
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

  if (btnCreate) btnCreate.addEventListener("click", () => createMeeting({ goToRaceCreate: false }));
  if (btnCreateAndRace) btnCreateAndRace.addEventListener("click", () => createMeeting({ goToRaceCreate: true }));

  if (btnReset) {
    btnReset.addEventListener("click", () => {
      ["mName","mDate","mEndDate","mLocation","mLat","mLng","mCountry","mUrl","mComment"].forEach(id => {
        const el = $(id);
        if (el) el.value = "";
      });
      const pub = $("mPublished");
      if (pub) pub.checked = true;
      renderSuggestions([]);
      showMsg("Réinitialisé.", "info");
    });
  }

  // Autocomplete
  if (locInput) {
    locInput.addEventListener("input", runAutocomplete);
    locInput.addEventListener("blur", hideSuggestionsLater);
    locInput.addEventListener("focus", () => {
      if (lastResults.length > 0) renderSuggestions(lastResults);
    });
  }

  // Geo + reverse
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
            const addr = rev?.address ? shortAddress(rev.address) : (rev?.display_name || "");
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

  // Click outside: close suggestions
  document.addEventListener("click", (e) => {
    const box = $("addrSuggest");
    if (!box) return;
    if (e.target === box || box.contains(e.target) || e.target === locInput) return;
    renderSuggestions([]);
  });
}

document.addEventListener("DOMContentLoaded", bindUI);
