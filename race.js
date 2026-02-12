// js/race.js
// MTB Points — Fiche épreuve (publique)
// CORRECTION: localStorage en priorité, puis Supabase en fallback
(function () {
  const $ = (id) => document.getElementById(id);

  const KEY_RACES = "mtb.races.v1";
  const KEY_MEETINGS = "mtb.meetings.v1";

  const esc = (s) =>
    String(s ?? "").replace(/[&<>"']/g, (m) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    }[m]));

  const num = (x) => {
    const n = Number(x);
    return Number.isFinite(n) ? n : null;
  };

  const setText = (id, v) => {
    const el = $(id);
    if (!el) return;
    el.textContent = (v === null || v === undefined || v === "") ? "—" : String(v);
  };

  const setHTML = (id, html) => {
    const el = $(id);
    if (!el) return;
    el.innerHTML = html ?? "";
  };

  const loadJSON = (key, fallback) => {
    try {
      const raw = localStorage.getItem(key);
      const v = raw ? JSON.parse(raw) : fallback;
      return v ?? fallback;
    } catch {
      return fallback;
    }
  };

  const getParam = (name) => new URLSearchParams(location.search).get(name);

  function setStatus(ok, text) {
    setText("statusText", text || "");
    const dot = $("statusDot");
    if (dot) dot.style.background = ok ? "#16a34a" : "#dc2626";
  }

  function findRaceLocal(id) {
    const races = loadJSON(KEY_RACES, []);
    if (!Array.isArray(races)) return null;
    return races.find((r) => r && r.id === id) || null;
  }

  function findMeetingLocal(id) {
    const meetings = loadJSON(KEY_MEETINGS, []);
    if (!Array.isArray(meetings)) return null;
    return meetings.find((m) => m && m.id === id) || null;
  }

  function extractAnalysis(race) {
    return race?.analysis || race?.analysis_json || race?.raw || race?.gpx || null;
  }

  function extractPoints(race) {
    // ✅ PRIORITÉ 1 : Si race.gpx est déjà un array de points
    if (Array.isArray(race?.gpx)) {
      console.log('📍 Points trouvés directement dans race.gpx:', race.gpx.length);
      return race.gpx;
    }
    
    // ✅ PRIORITÉ 1.5 : Si race.gpx est un STRING JSON, le parser
    if (typeof race?.gpx === 'string' && race.gpx.length > 0) {
      try {
        const parsed = JSON.parse(race.gpx);
        
        // Si c'est directement un array
        if (Array.isArray(parsed)) {
          console.log('📍 Points parsés depuis string JSON (array direct):', parsed.length);
          return parsed;
        }
        
        // Si c'est un objet avec .points
        if (parsed && typeof parsed === 'object' && Array.isArray(parsed.points)) {
          console.log('📍 Points parsés depuis string JSON (objet.points):', parsed.points.length);
          return parsed.points;
        }
        
        console.warn('⚠️ String JSON parsé mais structure inconnue:', parsed);
      } catch (e) {
        console.warn('⚠️ Impossible de parser gpx string:', e.message);
      }
    }
    
    // ✅ PRIORITÉ 2 : Si race.gpx est un objet avec .points
    if (race?.gpx && typeof race.gpx === 'object' && Array.isArray(race.gpx.points)) {
      console.log('📍 Points trouvés dans race.gpx.points:', race.gpx.points.length);
      return race.gpx.points;
    }
    
    // ✅ PRIORITÉ 3 : Essayer race.points
    if (Array.isArray(race?.points)) {
      console.log('📍 Points trouvés dans race.points:', race.points.length);
      return race.points;
    }
    
    // Essayer plusieurs sources pour les points GPX (legacy)
    const analysis = extractAnalysis(race);
    
    const pts =
      race?.gpx?.points ||
      analysis?.points ||
      analysis?.raw?.points ||
      analysis?.rawServer?.points ||
      analysis?.meta?.points ||
      analysis?.rawServer?.meta?.points ||
      null;
    
    if (Array.isArray(pts)) {
      console.log('📍 Points trouvés dans analysis:', pts.length);
      return pts;
    }
    
    console.warn('⚠️ Aucun point GPS trouvé');
    return null;
  }

  function normalizeDbRow(row) {
    if (!row) return null;
    return {
      id: row.id,
      meetingId: row.meeting_id,
      name: row.name,
      date: row.date,
      time: row.time ?? null,

      disc: row.disc,  // ✅ Corrigé : colonne "disc" dans Supabase
      level: row.level,
      ebike: row.ebike,

      cutoffTime: row.cutoff_time ?? row.cutoffTime ?? null,
      wash: row.bike_wash ?? row.wash ?? null,
      mechanic: row.mech_assist ?? row.mechanic ?? null,
      feeds: row.feeds ?? null,
      sexAllowed: row.sex_allowed ?? row.sexAllowed ?? "all",
      comment: row.comment ?? null,

      distanceKm: row.distance_km,
      dplusM: row.dplus_m,

      physScore: row.score_phys,
      techScore: row.score_tech,
      globalScore: row.score_global,
      ipb: row.ipb ?? null,
      surfaceEstimate: row.surface_estimate ?? null, // ✅ Barres de surface

      lapsByCategorySex: row.laps_by_category_sex ?? row.lapsByCategorySex ?? null,

      analysis: row.analysis_json,
      gpx: row.gpx,
      isPublished: row.is_published
    };
  }

  async function getSupabase() {
    try {
      const mod = await import("./supabaseClient.js");
      return mod?.supabase || null;
    } catch (e) {
      console.warn("[race] supabase import failed:", e);
      return null;
    }
  }

  async function fetchRaceSupabase(id) {
    const supabase = await getSupabase();
    if (!supabase) return { race: null, mode: "none" };

    let isAuthed = false;
    try {
      const { data: sess } = await supabase.auth.getSession();
      isAuthed = !!sess?.session;
    } catch {}

    try {
      let q = supabase.from("races").select("*").eq("id", id);
      if (!isAuthed) q = q.eq("is_published", true);

      const { data, error } = await q.maybeSingle();
      if (error) {
        console.warn("[race] supabase select error:", error);
        return { race: null, mode: isAuthed ? "authed" : "public" };
      }
      return { race: normalizeDbRow(data), mode: isAuthed ? "authed" : "public" };
    } catch (e) {
      console.warn("[race] supabase select exception:", e);
      return { race: null, mode: isAuthed ? "authed" : "public" };
    }
  }

  // ✅ Calcul automatique du niveau de difficulté (5 niveaux)
  function difficultyLabel(globalScore) {
    const g = num(globalScore);
    if (g == null) return { label: "—", hint: "Score global indisponible", emoji: "" };
    
    if (g < 20) {
      // Niveau 1: Facile
      return { label: "🟢 Facile", hint: "Accessible aux débutants", emoji: "🟢" };
    } else if (g < 40) {
      // Niveau 2: Accessible
      return { label: "🔵 Accessible", hint: "Bon niveau physique requis", emoji: "🔵" };
    } else if (g < 60) {
      // Niveau 3: Intermédiaire
      return { label: "🟡 Intermédiaire", hint: "Exigeant physiquement et techniquement", emoji: "🟡" };
    } else if (g < 80) {
      // Niveau 4: Difficile
      return { label: "🟠 Difficile", hint: "Très exigeant, expérience requise", emoji: "🟠" };
    } else {
      // Niveau 5: Très difficile / Expert
      return { label: "🔴 Très difficile / Expert", hint: "Réservé aux très entraînés et expérimentés", emoji: "🔴" };
    }
  }

  function renderHeader(race, sourceLabel) {
    setText("raceName", race?.name || "Épreuve");
    setText("raceDate", race?.date || "—");
    setText("raceTime", race?.time || "—");
    setText("raceDisc", race?.disc || "—");
    setText("raceLevel", race?.level || "—");
    setText("raceEbike", race?.ebike === true || race?.ebike === 1 ? "E-bike" : "Musculaire");
    setText("raceCutoff", race?.cutoffTime || "—");
    setText("raceWash", race?.wash || race?.bikeWash || "—");
    setText("raceMechanic", race?.mechanic || race?.mechAssist || "—");
    setText("raceFeeds", race?.feeds || "—");
    setText("raceSexAllowed", race?.sexAllowed || "all");
    setText("raceComment", race?.comment || "—");
    setText("dataSource", sourceLabel || "—");

    // Boutons d'action
    const raceId = getParam("id");
    
    // Bouton vers meeting
    const btnMeeting = $("btnOpenMeeting");
    if (btnMeeting && race?.meetingId) {
      btnMeeting.href = `meeting.html?id=${encodeURIComponent(race.meetingId)}`;
      btnMeeting.style.display = "inline-flex";
    }

    // Bouton import résultats
    const btnImport = $("btnImportResults");
    if (btnImport && raceId) {
      btnImport.href = `import-results.html?raceId=${encodeURIComponent(raceId)}`;
      btnImport.style.display = "inline-flex";
    }

    // Bouton classement public
    const btnRanking = $("btnViewRanking");
    if (btnRanking && raceId) {
      btnRanking.href = `race-ranking.html?id=${encodeURIComponent(raceId)}`;
      btnRanking.style.display = "inline-flex";
    }

    // meetingName si local dispo
    const m = race?.meetingId ? findMeetingLocal(race.meetingId) : null;
    if (m) setText("meetingName", m.name || "—");
  }

  function renderMetrics(race) {
    const a = extractAnalysis(race);

    const dist = num(race?.distanceKm ?? a?.distanceKm ?? a?.stats?.distanceKm);
    const dplus = num(race?.dplusM ?? a?.dplusM ?? a?.stats?.dplusM);

    setText("raceDistance", dist == null ? "—" : `${dist.toFixed(2)} km`);
    setText("raceDplus", dplus == null ? "—" : `${Math.round(dplus)} m`);

    const phys = num(race?.physScore ?? a?.physScore ?? a?.phys?.score);
    const tech =
      num(race?.techScore ?? race?.techScoreV2 ?? a?.techScoreV2 ?? a?.techScore ?? a?.techV2?.techScoreV2);
    const glob = num(race?.globalScore ?? a?.globalScore ?? a?.mrs);

    setText("scorePhysVal", phys == null ? "—" : Math.round(phys));
    setText("scoreTechVal", tech == null ? "—" : Math.round(tech));
    setText("scoreGlobalVal", glob == null ? "—" : Math.round(glob));

    // doublons optionnels (si tu as 2 emplacements dans le HTML)
    setText("scorePhysVal2", phys == null ? "—" : Math.round(phys));
    setText("scoreTechVal2", tech == null ? "—" : Math.round(tech));
    setText("scoreGlobalVal2", glob == null ? "—" : Math.round(glob));

    const d = difficultyLabel(glob);
    setText("diffLabel", d.label);
    setText("diffHint", d.hint);

    // info OSM
    const osmErr =
      a?.techV2?.details?.error ||
      a?.rawServer?.tech?.details?.error ||
      a?.tech?.details?.error ||
      null;

    if (tech == null && race?.gpx?.localAnalysis) {
      setText("techInfo", "Analyse locale (pas de score technique)");
    } else if (tech == null) {
      setText("techInfo", osmErr ? `Tech indisponible (OSM): ${osmErr}` : "Tech indisponible (OSM/Overpass)");
    } else {
      setText("techInfo", "TechScore V2 (OSM hybrid) ✅");
    }

    // ✅ Surfaces : lire depuis race.surfaceEstimate (Supabase) en priorité
    const surf =
      race?.surfaceEstimate ||
      a?.surfaceEstimate ||
      a?.techV2?.surfaceEstimate ||
      a?.rawServer?.tech?.surfaceEstimate ||
      null;

    setText("surfaceText", surf ? JSON.stringify(surf) : "—");

    if (surf && typeof surf === "object") {
      // ✅ Support des deux formats : {roadPct, trackPct, singlePct} et {road, track, single}
      const road   = num(surf.roadPct   ?? surf.road   ?? surf.route    ?? 0) ?? 0;
      const track  = num(surf.trackPct  ?? surf.track  ?? surf.wideTrack ?? 0) ?? 0;
      const single = num(surf.singlePct ?? surf.single ?? surf.singletrack ?? 0) ?? 0;
      const sum = Math.max(0.0001, road + track + single);

      // Si les valeurs sont déjà des pourcentages (roadPct = 30), pas besoin de normaliser
      const isPct = (surf.roadPct !== undefined);
      const wRoad   = isPct ? Math.round(road)  : Math.round((road / sum) * 100);
      const wTrack  = isPct ? Math.round(track) : Math.round((track / sum) * 100);
      const wSingle = Math.max(0, 100 - wRoad - wTrack);

      if ($("barRoad"))   $("barRoad").style.width   = `${wRoad}%`;
      if ($("barTrack"))  $("barTrack").style.width  = `${wTrack}%`;
      if ($("barSingle")) $("barSingle").style.width = `${wSingle}%`;
    }
  }

  function renderMultiLaps(race) {
    const laps = race?.lapsByCategorySex;
    const box = $("multiLapsBox");
    const target = $("multiLapsTable");
    if (!box && !target) return;

    if (!laps || typeof laps !== "object" || !Object.keys(laps).length) {
      if (box) box.style.display = "none";
      return;
    }
    if (box) box.style.display = "block";

    const rows = Object.entries(laps).map(([cat, v]) => {
      const m = v?.M ?? "—";
      const f = v?.F ?? "—";
      return `<tr><td><b>${esc(cat)}</b></td><td>${esc(m)}</td><td>${esc(f)}</td></tr>`;
    }).join("");

    if (target) target.innerHTML = rows;
  }

  function renderMapAndProfile(race) {
    const pts = extractPoints(race);
    console.log("Points GPX trouvés:", pts ? pts.length : 0);
    
    if (!pts || pts.length < 2) {
      console.warn("Pas assez de points pour afficher la carte et le profil");
      return;
    }

    // Carte Leaflet si présente
    const mapEl = $("map");
    if (mapEl && window.L) {
      const latlngs = pts
        .map(p => [Number(p.lat), Number(p.lon)])
        .filter(([la, lo]) => Number.isFinite(la) && Number.isFinite(lo));

      console.log("Points valides pour la carte:", latlngs.length);

      if (latlngs.length >= 2) {
        const map = L.map(mapEl, { scrollWheelZoom: false });
        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
          maxZoom: 18,
          attribution: "&copy; OpenStreetMap"
        }).addTo(map);

        const poly = L.polyline(latlngs, { color: '#2563eb', weight: 4 }).addTo(map);
        map.fitBounds(poly.getBounds(), { padding: [18, 18] });

        try {
          L.marker(latlngs[0]).addTo(map).bindPopup("Départ");
          L.marker(latlngs[latlngs.length - 1]).addTo(map).bindPopup("Arrivée");
        } catch(e) {
          console.warn("Erreur ajout markers:", e);
        }
      }
    }

    // Profil simple si canvas présent
    const canvas = $("profileCanvas");
    if (canvas) {
      const ctx = canvas.getContext("2d");
      const eles = pts.map(p => Number(p.ele)).filter(e => Number.isFinite(e));
      
      console.log("Points avec altitude:", eles.length);
      
      if (eles.length < 5) {
        setText("profileInfo", "Pas assez de données d'altitude pour le profil");
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

      // Axes
      ctx.strokeStyle = "#94a3b8";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(pad, pad);
      ctx.lineTo(pad, pad + h);
      ctx.lineTo(pad + w, pad + h);
      ctx.stroke();

      // Profil
      ctx.strokeStyle = "#2563eb";
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (let i = 0; i < eles.length; i++) {
        const x = pad + (i / (eles.length - 1)) * w;
        const y = pad + (1 - (eles[i] - minE) / span) * h;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();

      setText("profileInfo", `Altitude: ${Math.round(minE)}—${Math.round(maxE)} m`);
    }
  }

  async function main() {
    const id = getParam("id");
    if (!id) {
      setStatus(false, "ID manquant");
      setHTML("raceName", "Épreuve introuvable");
      return;
    }

    console.log("Chargement épreuve:", id);

    // 1) PRIORITÉ: localStorage (pour les épreuves créées localement)
    const local = findRaceLocal(id);
    if (local) {
      console.log("Épreuve trouvée dans localStorage:", local);
      setStatus(true, "OK (local)");
      renderHeader(local, "localStorage");
      renderMetrics(local);
      renderMultiLaps(local);
      renderMapAndProfile(local);
      return;
    }

    console.log("Épreuve non trouvée dans localStorage, essai Supabase...");

    // 2) Supabase fallback (pour les épreuves en base)
    const { race: supaRace, mode } = await fetchRaceSupabase(id);
    if (supaRace) {
      console.log("Épreuve trouvée dans Supabase:", supaRace);
      setStatus(true, mode === "authed" ? "OK (preview)" : "OK");
      renderHeader(supaRace, mode === "authed" ? "Supabase (connecté)" : "Supabase (public)");
      renderMetrics(supaRace);
      renderMultiLaps(supaRace);
      renderMapAndProfile(supaRace);
      return;
    }

    // 3) Rien trouvé
    console.error("Épreuve introuvable dans localStorage et Supabase");
    setStatus(false, "Épreuve introuvable");
    setHTML("raceName", "Épreuve introuvable");
  }

  main();
})();
