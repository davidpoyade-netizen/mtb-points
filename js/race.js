// js/race.js
// Page publique: race.html?id=...
// - Essaie Supabase d'abord (public si published, ou tout si connecté)
// - Fallback localStorage "mtb.races.v1"
// - Remplit les IDs si présents, sinon ne casse pas la page

(function () {
  const $ = (id) => document.getElementById(id);

  const KEY_RACES = "mtb.races.v1";
  const KEY_MEETINGS = "mtb.meetings.v1";

  function esc(s) {
    return String(s ?? "").replace(/[&<>"']/g, (m) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
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

  function setStatus(ok, text) {
    setText("statusText", text || "");
    const dot = $("statusDot");
    if (dot) dot.style.background = ok ? "#16a34a" : "#dc2626";
  }

  function findRaceByIdLocal(id) {
    const races = loadJSON(KEY_RACES, []);
    if (!Array.isArray(races)) return null;
    return races.find((r) => r && r.id === id) || null;
  }

  function findMeetingByIdLocal(id) {
    const meetings = loadJSON(KEY_MEETINGS, []);
    if (!Array.isArray(meetings)) return null;
    return meetings.find((m) => m && m.id === id) || null;
  }

  function difficultyLabel(globalScore) {
    const g = num(globalScore);
    if (g == null) return { label: "—", hint: "Score global indisponible" };
    if (g < 25) return { label: "Facile", hint: "Accessible" };
    if (g < 50) return { label: "Modéré", hint: "Exigeant" };
    if (g < 75) return { label: "Difficile", hint: "Très exigeant" };
    return { label: "Extrême", hint: "Réservé aux très entraînés" };
  }

  function extractAnalysis(race) {
    return race?.analysis || race?.analysis_json || race?.gpxAnalysis || null;
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

  function normalizeRaceFromDb(row) {
    if (!row) return null;
    return {
      id: row.id,
      meetingId: row.meeting_id,
      name: row.name,
      date: row.date,
      disc: row.discipline,
      level: row.level,
      ebike: row.ebike,

      distanceKm: row.distance_km,
      dplusM: row.dplus_m,

      physScore: row.score_phys,
      techScoreV2: row.score_tech,
      globalScore: row.score_global,

      analysis: row.analysis_json,
      isPublished: row.is_published
    };
  }

  async function getSupabase() {
    try {
      const mod = await import("./supabaseClient.js"); // doit être dans /js/
      return mod?.supabase || null;
    } catch (e) {
      console.warn("[race] supabaseClient import failed:", e);
      return null;
    }
  }

  async function fetchRaceSupabase(id) {
    const supabase = await getSupabase();
    if (!supabase) return { race: null, mode: "none" };

    // Si connecté -> on autorise la preview même si pas publié
    let isAuthed = false;
    try {
      const { data: sess } = await supabase.auth.getSession();
      isAuthed = !!sess?.session;
    } catch (_) {}

    try {
      let q = supabase
        .from("races")
        .select("*")
        .eq("id", id);

      if (!isAuthed) q = q.eq("is_published", true);

      const { data, error } = await q.maybeSingle();
      if (error) {
        console.warn("[race] supabase fetch error:", error);
        return { race: null, mode: isAuthed ? "authed" : "public" };
      }
      return { race: normalizeRaceFromDb(data), mode: isAuthed ? "authed" : "public" };
    } catch (e) {
      console.warn("[race] supabase fetch exception:", e);
      return { race: null, mode: isAuthed ? "authed" : "public" };
    }
  }

  function renderBasic(race) {
    setText("raceName", race?.name || "Épreuve");
    setText("raceDate", race?.date || "—");
    setText("raceDisc", race?.disc || "—");
    setText("raceLevel", race?.level || "—");

    const analysis = extractAnalysis(race);
    const dist = num(race?.distanceKm ?? analysis?.distanceKm);
    const dplus = num(race?.dplusM ?? analysis?.dplusM);

    setText("raceDistance", dist == null ? "—" : `${dist.toFixed(2)} km`);
    setText("raceDistanceHint", dist == null ? "—" : "Distance depuis analyse GPX");
    setText("raceDplus", dplus == null ? "—" : `${Math.round(dplus)} m`);

    const hasElevation = analysis?.hasElevation;
    setText("raceElevInfo", hasElevation === true ? "Altitude ✅" : (hasElevation === false ? "Altitude absente" : "—"));

    // Meeting button (si présent)
    if (race?.meetingId) {
      const m = findMeetingByIdLocal(race.meetingId);
      const btn = document.getElementById("btnOpenMeeting");
      if (btn && m) {
        btn.href = `meeting.html?id=${encodeURIComponent(m.id)}`;
        btn.style.display = "inline-flex";
      }
    }
  }

  function renderScores(race) {
    const analysis = extractAnalysis(race);

    const phys = num(race?.physScore ?? analysis?.physScore ?? analysis?.phys?.score);
    const tech = num(race?.techScoreV2 ?? analysis?.techScoreV2 ?? analysis?.techScore ?? analysis?.techV2?.techScoreV2);
    const global = num(race?.globalScore ?? analysis?.globalScore ?? analysis?.mrs);

    setText("scorePhysVal", phys == null ? "—" : Math.round(phys));
    setText("scorePhysVal2", phys == null ? "—" : Math.round(phys));

    setText("scoreTechVal", tech == null ? "—" : Math.round(tech));
    setText("scoreTechVal2", tech == null ? "—" : Math.round(tech));

    setText("scoreGlobalVal", global == null ? "—" : Math.round(global));
    setText("scoreGlobalVal2", global == null ? "—" : Math.round(global));

    // message OSM
    const osmErr =
      analysis?.techV2?.details?.error ||
      analysis?.raw?.tech?.details?.error ||
      analysis?.rawServer?.tech?.details?.error ||
      null;

    if (tech == null) {
      setText("techInfo", osmErr ? `Tech indisponible (OSM): ${osmErr}` : "Tech indisponible (OSM/Overpass)");
    } else {
      setText("techInfo", "TechScoreV2 (OSM hybrid) ✅");
    }

    // difficulté
    const d = difficultyLabel(global);
    setText("diffLabel", d.label);
    setText("diffHint", d.hint);

    // résumé
    const dist = num(race?.distanceKm ?? analysis?.distanceKm);
    const dplus = num(race?.dplusM ?? analysis?.dplusM);
    setText("autoSummary",
      (dist != null && dplus != null)
        ? `${dist.toFixed(1)} km • D+ ${Math.round(dplus)} m • ${d.label}`
        : "—"
    );

    // surface bar (si présent)
    const surf =
      analysis?.surfaceEstimate ||
      analysis?.techV2?.surfaceEstimate ||
      analysis?.raw?.tech?.surfaceEstimate ||
      analysis?.rawServer?.tech?.surfaceEstimate ||
      null;

    setText("surfaceText", surf ? JSON.stringify(surf) : "—");

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

    // infos phys détaillées (si ids existent)
    if ($("physInfo") && analysis?.phys) {
      setText("physInfo", `Effort: ${analysis.phys.effort ?? "—"} • IPB: ${analysis.phys.ipbOverall ?? "—"}`);
    }
  }

  function renderMapAndProfile(race) {
    const analysis = extractAnalysis(race);
    const pts = extractPoints(analysis);
    if (!pts || pts.length < 2) return;

    // Carte Leaflet
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

    // Profil (simple)
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
      const W = canvas.width, H = canvas.height;

      ctx.clearRect(0, 0, W, H);

      const pad = 18;
      const w = W - pad * 2;
      const h = H - pad * 2;
      const span = Math.max(1, maxE - minE);

      ctx.beginPath();
      ctx.moveTo(pad, pad);
      ctx.lineTo(pad, pad + h);
      ctx.lineTo(pad + w, pad + h);
      ctx.stroke();

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

  async function main() {
    const id = getParam("id");
    if (!id) {
      setStatus(false, "ID manquant");
      setHTML("raceName", "Épreuve introuvable");
      return;
    }

    // 1) Supabase
    const { race: supaRace, mode } = await fetchRaceSupabase(id);
    if (supaRace) {
      setStatus(true, mode === "authed" ? "OK (preview)" : "OK");
      renderBasic(supaRace);
      renderScores(supaRace);
      renderMapAndProfile(supaRace);
      return;
    }

    // 2) Fallback localStorage
    const localRace = findRaceByIdLocal(id);
    if (!localRace) {
      setStatus(false, "Épreuve introuvable");
      setHTML("raceName", "Épreuve introuvable");
      return;
    }

    setStatus(true, "OK (local)");
    renderBasic(localRace);
    renderScores(localRace);
    renderMapAndProfile(localRace);
  }

  main();
})();
