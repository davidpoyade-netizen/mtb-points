// js/race.js
// Page publique: race.html?id=...
// Source actuelle: localStorage "mtb.races.v1" (fallback)
// Plus tard: on branchera Supabase.

(function () {
  const $ = (id) => document.getElementById(id);

  const KEY_RACES = "mtb.races.v1";
  const KEY_MEETINGS = "mtb.meetings.v1";

  function esc(s) {
    return String(s ?? "").replace(/[&<>"']/g, (m) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    }[m]));
  }

  function num(x) {
    const n = Number(x);
    return Number.isFinite(n) ? n : null;
  }

  function setText(id, value) {
    const el = $(id);
    if (!el) return;
    el.textContent = (value == null || value === "") ? "—" : String(value);
  }

  function setHTML(id, html) {
    const el = $(id);
    if (!el) return;
    el.innerHTML = html ?? "";
  }

  function loadJSON(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      const v = raw ? JSON.parse(raw) : fallback;
      return v ?? fallback;
    } catch (_) {
      return fallback;
    }
  }

  function getParam(name) {
    return new URLSearchParams(location.search).get(name);
  }

  function findRaceById(id) {
    const races = loadJSON(KEY_RACES, []);
    if (!Array.isArray(races)) return null;
    return races.find((r) => r && r.id === id) || null;
  }

  function findMeetingById(id) {
    const meetings = loadJSON(KEY_MEETINGS, []);
    if (!Array.isArray(meetings)) return null;
    return meetings.find((m) => m && m.id === id) || null;
  }

  function difficultyLabel(globalScore) {
    const g = num(globalScore);
    if (g == null) return { label: "—", hint: "Score global indisponible", level: "na" };
    if (g < 25) return { label: "Facile", hint: "Accessible", level: "easy" };
    if (g < 50) return { label: "Modéré", hint: "Exigeant", level: "mid" };
    if (g < 75) return { label: "Difficile", hint: "Très exigeant", level: "hard" };
    return { label: "Extrême", hint: "Réservé aux très entraînés", level: "extreme" };
  }

  function extractAnalysis(race) {
    // Tu as plusieurs formats possibles selon tes versions.
    // On prend le plus riche dispo.
    return (
      race?.analysis ||
      race?.analysis_json ||
      race?.gpxAnalysis ||
      null
    );
  }

  function extractPoints(analysis) {
    const pts =
      analysis?.points ||
      analysis?.raw?.points ||
      analysis?.rawServer?.points ||
      analysis?.rawServer?.meta?.points ||
      null;
    return Array.isArray(pts) ? pts : null;
  }

  function renderBasic(race) {
    setText("raceName", race?.name || "Épreuve");
    setText("raceDate", race?.date || "—");
    setText("raceDisc", race?.disc || race?.discipline || "—");
    setText("raceLevel", race?.level || "—");

    const dist = num(race?.distanceKm ?? extractAnalysis(race)?.distanceKm);
    const dplus = num(race?.dplusM ?? extractAnalysis(race)?.dplusM);

    setText("raceDistance", dist == null ? "—" : `${dist.toFixed(2)} km`);
    setText("raceDplus", dplus == null ? "—" : `${Math.round(dplus)} m`);

    // si tu as un meetingId
    const m = race?.meetingId ? findMeetingById(race.meetingId) : null;
    if (m) {
      // si tu as un bouton "btnOpenMeeting" par ex
      const btn = document.getElementById("btnOpenMeeting");
      if (btn) {
        btn.href = `meeting.html?id=${encodeURIComponent(m.id)}`;
        btn.style.display = "inline-flex";
      }
    }
  }

  function renderScores(race) {
    const analysis = extractAnalysis(race);

    const phys = num(
      race?.physScore ??
      analysis?.physScore ??
      analysis?.phys?.score ??
      null
    );

    const tech = num(
      race?.techScoreV2 ??
      race?.techScore ??
      analysis?.techScoreV2 ??
      analysis?.techScore ??
      analysis?.raw?.tech?.techScoreV2 ??
      analysis?.raw?.tech?.techScore ??
      analysis?.rawServer?.tech?.techScoreV2 ??
      null
    );

    const global = num(
      race?.globalScore ??
      analysis?.globalScore ??
      analysis?.mrs ??
      analysis?.raw?.mrs ??
      analysis?.rawServer?.mrs ??
      null
    );

    setText("scorePhysVal", phys == null ? "—" : Math.round(phys));
    setText("scorePhysVal2", phys == null ? "—" : Math.round(phys));

    setText("scoreTechVal", tech == null ? "—" : Math.round(tech));
    setText("scoreTechVal2", tech == null ? "—" : Math.round(tech));

    setText("scoreGlobalVal", global == null ? "—" : Math.round(global));
    setText("scoreGlobalVal2", global == null ? "—" : Math.round(global));

    // Détails OSM
    const osmOk = analysis?.raw?.tech?.osmOk ?? analysis?.rawServer?.tech?.osmOk ?? null;
    const osmErr = analysis?.raw?.tech?.details?.error ?? analysis?.rawServer?.tech?.details?.error ?? null;

    if (tech == null) {
      setText("techInfo", osmErr ? `Tech indisponible (OSM): ${osmErr}` : "Tech indisponible (OSM/Overpass)");
    } else {
      setText("techInfo", "OSM + bonus GPX capé (ScoreTech V2 Hybrid)");
    }

    // indicateurs optionnels
    setText("techP75", analysis?.raw?.tech?.terrainScoreP75 ?? analysis?.rawServer?.tech?.terrainScoreP75 ?? "—");
    setText("techP75Info", osmOk === false ? "OSM timeout / indisponible" : "—");

    // difficulté
    const d = difficultyLabel(global);
    setText("diffLabel", d.label);
    setText("diffHint", d.hint);

    // résumé auto
    const dist = num(race?.distanceKm ?? analysis?.distanceKm);
    const dplus = num(race?.dplusM ?? analysis?.dplusM);
    const summary =
      (dist != null && dplus != null)
        ? `${dist.toFixed(1)} km • D+ ${Math.round(dplus)} m • ${d.label}`
        : `—`;
    setText("autoSummary", summary);

    // surface estimate (si présent)
    const surf = analysis?.surfaceEstimate ?? analysis?.raw?.tech?.surfaceEstimate ?? analysis?.rawServer?.tech?.surfaceEstimate ?? null;
    setText("surfaceText", surf ? JSON.stringify(surf) : "—");

    // bar route/piste/single (si tu as des ids barRoad/barTrack/barSingle)
    if (surf && typeof surf === "object") {
      const road = num(surf.road ?? surf.route ?? 0) ?? 0;
      const track = num(surf.track ?? surf.wideTrack ?? 0) ?? 0;
      const single = num(surf.single ?? surf.singletrack ?? 0) ?? 0;
      const sum = Math.max(0.0001, road + track + single);
      const wRoad = Math.round((road / sum) * 100);
      const wTrack = Math.round((track / sum) * 100);
      const wSingle = Math.max(0, 100 - wRoad - wTrack);

      const br = $("barRoad"), bt = $("barTrack"), bs = $("barSingle");
      if (br) br.style.width = `${wRoad}%`;
      if (bt) bt.style.width = `${wTrack}%`;
      if (bs) bs.style.width = `${wSingle}%`;
    }
  }

  // Carte + profil (si ids existent)
  function renderMapAndProfile(race) {
    const analysis = extractAnalysis(race);
    const pts = extractPoints(analysis);
    if (!pts || pts.length < 2) return;

    // carte si #map existe + Leaflet chargé
    const mapEl = $("map");
    if (mapEl && window.L) {
      const latlngs = pts
        .map(p => [Number(p.lat), Number(p.lon)])
        .filter(a => Number.isFinite(a[0]) && Number.isFinite(a[1]));

      if (latlngs.length >= 2) {
        const map = L.map(mapEl, { scrollWheelZoom: false });
        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
          maxZoom: 18,
          attribution: "&copy; OpenStreetMap"
        }).addTo(map);

        const poly = L.polyline(latlngs, { weight: 4 }).addTo(map);
        map.fitBounds(poly.getBounds(), { padding: [18, 18] });

        try {
          L.marker(latlngs[0]).addTo(map).bindPopup("Départ");
          L.marker(latlngs[latlngs.length - 1]).addTo(map).bindPopup("Arrivée");
        } catch (_) {}
      }
    }

    // profil si canvas existe
    const canvas = $("profileCanvas");
    if (canvas) {
      const ctx = canvas.getContext("2d");
      const eles = pts.map(p => Number(p.ele)).filter(e => Number.isFinite(e));
      if (eles.length < 5) {
        setText("profileInfo", "Profil indisponible (altitude insuffisante).");
        return;
      }

      const minE = Math.min(...eles);
      const maxE = Math.max(...eles);
      const W = canvas.width;
      const H = canvas.height;

      ctx.clearRect(0, 0, W, H);

      const pad = 18;
      const w = W - pad * 2;
      const h = H - pad * 2;
      const span = Math.max(1, maxE - minE);

      // axes
      ctx.beginPath();
      ctx.moveTo(pad, pad);
      ctx.lineTo(pad, pad + h);
      ctx.lineTo(pad + w, pad + h);
      ctx.stroke();

      // courbe
      ctx.beginPath();
      for (let i = 0; i < eles.length; i++) {
        const x = pad + (i / (eles.length - 1)) * w;
        const y = pad + (1 - (eles[i] - minE) / span) * h;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();

      setText("profileInfo", `Altitude: ${Math.round(minE)}–${Math.round(maxE)} m`);
    }
  }

  function setStatus(ok, text) {
    // optionnel: si tu as statusDot/statusText dans ta race.html
    setText("statusText", text || "");
    const dot = $("statusDot");
    if (dot) dot.style.background = ok ? "#16a34a" : "#dc2626";
  }

  function main() {
    const id = getParam("id");
    if (!id) {
      setStatus(false, "ID manquant");
      alert("ID manquant dans l’URL (race.html?id=...)");
      return;
    }

    const race = findRaceById(id);
    if (!race) {
      setStatus(false, "Épreuve introuvable");
      // Message utile (public)
      setHTML("raceName", "Épreuve introuvable");
      return;
    }

    setStatus(true, "OK");

    renderBasic(race);
    renderScores(race);
    renderMapAndProfile(race);
  }

  main();
})();
