// js/gpx-hybrid.js
// Solution hybride : Backend en priorité, client-side en fallback
// Remplace js/gpx.js par ce fichier pour activer le mode hybride

(function () {
  "use strict";

  const DEFAULT_API_BASE = "https://mtb-points.onrender.com";
  const BACKEND_TIMEOUT = 60000; // 60 secondes (pour laisser le temps au serveur de se réveiller)

  function emitStatus(phase, message, progress) {
    try {
      window.dispatchEvent(
        new CustomEvent("mtb:status", {
          detail: {
            phase: phase || "—",
            message: message || "—",
            progress: typeof progress === "number" ? progress : undefined,
          },
        })
      );
    } catch (_) {}
  }

  async function readFileText(file) {
    if (!file) return "";
    if (typeof file.text === "function") return await file.text();
    return await new Promise((resolve, reject) => {
      const fr = new FileReader();
      fr.onerror = () => reject(fr.error || new Error("FileReader error"));
      fr.onload = () => resolve(String(fr.result || ""));
      fr.readAsText(file);
    });
  }

  // ========== BACKEND ANALYSIS ==========
  async function analyzeGPXBackend(file, opts = {}) {
    const apiBase = String(opts.apiBase || DEFAULT_API_BASE).replace(/\/+$/, "");
    const timeoutMs = Number.isFinite(opts.timeoutMs) ? Number(opts.timeoutMs) : BACKEND_TIMEOUT;

    if (!file) throw new Error("Aucun fichier GPX.");

    emitStatus("gpx", "📡 Connexion au serveur d'analyse...", 0.05);
    const gpxText = await readFileText(file);
    if (!gpxText || gpxText.length < 50) throw new Error("GPX vide ou invalide.");

    emitStatus("gpx", "⏳ Envoi au serveur (peut prendre 30-60s si le serveur se réveille)...", 0.15);

    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);

    let resp;
    try {
      resp = await fetch(`${apiBase}/api/analyze-gpx`, {
        method: "POST",
        headers: { "Content-Type": "application/gpx+xml" },
        body: gpxText,
        signal: ctrl.signal,
      });
    } catch (e) {
      clearTimeout(t);
      throw new Error(`Serveur injoignable: ${e.message}`);
    }
    clearTimeout(t);

    emitStatus("osm", "🗺️ Analyse terrain OSM...", 0.65);

    let json;
    try {
      json = await resp.json();
    } catch (_) {
      throw new Error("Réponse serveur invalide (JSON).");
    }

    if (!resp.ok || !json || json.ok === false) {
      const err = json?.error || `HTTP ${resp.status}`;
      throw new Error(String(err));
    }

    const stats = json?.meta?.stats || {};
    const tech = json?.tech || {};

    const out = {
      source: "backend",
      fileName: file.name,
      distanceKm: stats.distanceKm ?? null,
      dplusM: stats.dplusM ?? null,
      hasElevation: stats.hasElevation ?? null,
      discipline: json?.discipline ?? null,
      techV2: {
        techScoreV2: tech.techScoreV2 ?? null,
        tech01: tech.tech01 ?? null,
        details: tech.details ?? null,
        surfaceEstimate: tech.surfaceEstimate ?? null,
      },
      phys: json?.phys ?? { score: null, effort: null, ipbOverall: null },
      mrs: (typeof json?.mrs === "number") ? json.mrs : null,
    };

    if (opts.keepPoints) {
      const pts = json?.points || json?.meta?.points || null;
      out.points = Array.isArray(pts) ? pts : null;
    }

    emitStatus("done", "✅ Analyse terminée (serveur)", 1);
    return out;
  }

  // ========== CLIENT-SIDE ANALYSIS ==========
  function parseGPXPoints(xmlText) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(xmlText, "text/xml");
    
    const parseError = doc.querySelector("parsererror");
    if (parseError) throw new Error("Fichier GPX invalide");

    const points = [];
    const trkpts = doc.querySelectorAll("trkpt");
    
    if (trkpts.length === 0) throw new Error("Aucun trackpoint trouvé");

    trkpts.forEach((pt, idx) => {
      const lat = parseFloat(pt.getAttribute("lat"));
      const lon = parseFloat(pt.getAttribute("lon"));
      const eleNode = pt.querySelector("ele");
      const ele = eleNode ? parseFloat(eleNode.textContent) : null;
      
      if (!isNaN(lat) && !isNaN(lon)) {
        points.push({ lat, lon, ele, idx });
      }
    });

    return points;
  }

  function haversineDistance(lat1, lon1, lat2, lon2) {
    const R = 6371;
    const toRad = (deg) => (deg * Math.PI) / 180;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a = Math.sin(dLat / 2) ** 2 +
              Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
              Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  function calculateDistance(points) {
    let total = 0;
    for (let i = 1; i < points.length; i++) {
      total += haversineDistance(
        points[i - 1].lat, points[i - 1].lon,
        points[i].lat, points[i].lon
      );
    }
    return total;
  }

  function smoothElevation(elevations) {
    const smoothed = [];
    for (let i = 0; i < elevations.length; i++) {
      if (i === 0 || i === elevations.length - 1) {
        smoothed.push(elevations[i]);
      } else {
        smoothed.push((elevations[i - 1] + elevations[i] + elevations[i + 1]) / 3);
      }
    }
    return smoothed;
  }

  function calculateElevation(points) {
    const elevations = points.map(p => p.ele).filter(e => e !== null && !isNaN(e));
    
    if (elevations.length === 0) {
      return { dplusM: 0, dminusM: 0, hasElevation: false };
    }

    const smoothed = smoothElevation(elevations);
    let gain = 0, loss = 0;
    const threshold = 1;
    
    for (let i = 1; i < smoothed.length; i++) {
      const diff = smoothed[i] - smoothed[i - 1];
      if (diff > threshold) gain += diff;
      else if (diff < -threshold) loss += Math.abs(diff);
    }

    return { dplusM: gain, dminusM: loss, hasElevation: true };
  }

  function calculateBearing(p1, p2) {
    const toRad = (deg) => (deg * Math.PI) / 180;
    const toDeg = (rad) => (rad * 180) / Math.PI;
    const lat1 = toRad(p1.lat);
    const lat2 = toRad(p2.lat);
    const dLon = toRad(p2.lon - p1.lon);
    const y = Math.sin(dLon) * Math.cos(lat2);
    const x = Math.cos(lat1) * Math.sin(lat2) -
              Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
    return (toDeg(Math.atan2(y, x)) + 360) % 360;
  }

  function calculateTurns(points) {
    let count = 0;
    for (let i = 1; i < points.length - 1; i++) {
      const b1 = calculateBearing(points[i - 1], points[i]);
      const b2 = calculateBearing(points[i], points[i + 1]);
      let diff = Math.abs(b2 - b1);
      if (diff > 180) diff = 360 - diff;
      if (diff > 45) count++;
    }
    return count;
  }

  function inferDiscipline(distanceKm, tech01) {
    if (tech01 <= 0.18) return "Gravel";
    if (distanceKm < 6) return "DH";
    if (distanceKm < 12) return "XCC";
    if (distanceKm < 40) return "XCO";
    if (distanceKm < 100) return "XCM_marathon";
    return "XCM_ultra";
  }

  async function analyzeGPXClientSide(file, opts = {}) {
    if (!file) throw new Error("Aucun fichier GPX");

    emitStatus("gpx", "💻 Analyse locale (client-side)...", 0.1);
    const gpxText = await readFileText(file);
    if (!gpxText || gpxText.length < 50) throw new Error("GPX vide");

    emitStatus("parsing", "📊 Extraction des points GPS...", 0.3);
    const points = parseGPXPoints(gpxText);
    if (points.length < 2) throw new Error("Pas assez de points GPS");

    emitStatus("calculating", "📏 Calcul distance & dénivelé...", 0.5);
    const distanceKm = calculateDistance(points);
    const elevation = calculateElevation(points);
    const turns = calculateTurns(points);

    emitStatus("scoring", "🎯 Calcul des scores...", 0.8);
    
    // Simplified tech score
    const turnDensity = turns / (distanceKm || 1);
    const techScoreV2 = Math.min(100, turnDensity * 30 + (elevation.dplusM / distanceKm) * 0.8);
    const tech01 = Math.min(1, techScoreV2 / 100);

    // Physical score
    const physScore = Math.min(100, distanceKm * 1.2 + elevation.dplusM / 30);
    
    // MRS
    const mrs = physScore * 0.6 + techScoreV2 * 0.4;
    
    const discipline = inferDiscipline(distanceKm, tech01);

    emitStatus("done", "✅ Analyse terminée (local)", 1);

    const result = {
      source: "client-side",
      fileName: file.name,
      distanceKm: Math.round(distanceKm * 10) / 10,
      dplusM: Math.round(elevation.dplusM),
      hasElevation: elevation.hasElevation,
      discipline: discipline,
      techV2: {
        techScoreV2: Math.round(techScoreV2 * 10) / 10,
        tech01: Math.round(tech01 * 1000) / 1000,
        details: { turns, turnDensity: Math.round(turnDensity * 100) / 100 },
        surfaceEstimate: "mixed (estimation locale)"
      },
      phys: {
        score: Math.round(physScore * 10) / 10,
        effort: null,
        ipbOverall: null
      },
      mrs: Math.round(mrs * 10) / 10
    };

    if (opts.keepPoints) {
      result.points = points.map(p => ({
        lat: Math.round(p.lat * 1e6) / 1e6,
        lon: Math.round(p.lon * 1e6) / 1e6,
        ele: p.ele ? Math.round(p.ele * 10) / 10 : null
      }));
    }

    return result;
  }

  // ========== HYBRID ANALYSIS ==========
  async function analyzeGPX(file, opts = {}) {
    const forceLocal = opts.forceClientSide === true;

    if (forceLocal) {
      console.log("🔧 Mode client-side forcé");
      return await analyzeGPXClientSide(file, opts);
    }

    // Tentative backend d'abord
    try {
      console.log("📡 Tentative analyse serveur...");
      const result = await analyzeGPXBackend(file, opts);
      console.log("✅ Serveur OK");
      return result;
    } catch (backendError) {
      console.warn("⚠️ Serveur échoué:", backendError.message);
      console.log("💻 Fallback sur analyse locale...");
      
      emitStatus("fallback", "⚠️ Serveur indisponible, analyse locale en cours...", 0.2);
      
      try {
        const result = await analyzeGPXClientSide(file, opts);
        console.log("✅ Analyse locale réussie");
        return result;
      } catch (clientError) {
        console.error("❌ Analyse locale échouée:", clientError.message);
        throw new Error(`Échec complet: Backend (${backendError.message}) et Client (${clientError.message})`);
      }
    }
  }

  // Export
  window.analyzeGPX = analyzeGPX;
  window.analyzeGPXBackend = analyzeGPXBackend; // Export pour tests
  window.analyzeGPXClientSide = analyzeGPXClientSide; // Export pour tests
  
  console.log("✅ GPX Hybrid Analysis Module loaded (Backend + Client-side fallback)");
})();
