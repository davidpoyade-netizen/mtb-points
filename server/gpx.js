// js/gpx.js - CORRIGÉ
// ✅ Récupère les points GPX depuis l'API
// ✅ Gestion d'erreurs améliorée
// ✅ Support pour keepPoints
// ✅ FIX: Envoi en JSON (pas en application/gpx+xml)

(function () {
  const DEFAULT_API_BASE = "https://mtb-points.onrender.com";

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

  // ✅ CORRIGÉ: Meilleure extraction des points
  function extractPoints(json) {
    // Les points peuvent être dans différents endroits de la réponse
    if (Array.isArray(json?.points)) return json.points;
    if (Array.isArray(json?.meta?.points)) return json.meta.points;
    if (Array.isArray(json?.data?.points)) return json.data.points;
    
    // ✅ NOUVEAU: Support pour le format GeoJSON
    if (json?.data?.geojson?.features?.[0]?.geometry?.coordinates) {
      const coords = json.data.geojson.features[0].geometry.coordinates;
      // Convertir [lon, lat, ele] en {lat, lon, ele}
      return coords.map(([lon, lat, ele]) => ({ lat, lon, ele: ele || 0 }));
    }
    
    return null;
  }

  async function analyzeGPX(file, opts = {}) {
    const apiBase = String(opts.apiBase || DEFAULT_API_BASE).replace(/\/+$/, "");
    const timeoutMs = Number.isFinite(opts.timeoutMs) ? Number(opts.timeoutMs) : 45000;
    const keepPoints = opts.keepPoints !== false; // par défaut true maintenant

    if (!file) throw new Error("Aucun fichier GPX.");

    emitStatus("gpx", "Lecture du GPX…", 0.05);
    const gpxText = await readFileText(file);
    if (!gpxText || gpxText.length < 50) throw new Error("GPX vide ou invalide.");

    emitStatus("gpx", "Envoi au serveur (analyse GPX)…", 0.15);

    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);

    let resp;
    try {
      // ✅ FIX: Envoi en JSON au lieu de application/gpx+xml
      resp = await fetch(`${apiBase}/api/analyze-gpx`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },  // ✅ Changé ici
        body: JSON.stringify({ gpxContent: gpxText }),    // ✅ Changé ici
        signal: ctrl.signal,
      });
    } catch (e) {
      clearTimeout(t);
      emitStatus("error", "Erreur réseau vers l'API d'analyse.", undefined);
      
      // Message d'erreur plus détaillé
      const errMsg = e.name === 'AbortError' 
        ? "Timeout: l'API met trop de temps à répondre (>45s)"
        : "Erreur réseau (API analyse GPX). Vérifie que Render est bien démarré et que CORS est configuré.";
      
      throw new Error(errMsg);
    }
    clearTimeout(t);

    emitStatus("osm", "Analyse terrain OSM…", 0.65);

    let json;
    try {
      json = await resp.json();
    } catch (_) {
      throw new Error(`Réponse API invalide (JSON). Status: ${resp.status}`);
    }

    if (!resp.ok || !json || json.ok === false) {
      const err = json?.error || `HTTP ${resp.status}`;
      emitStatus("error", String(err), undefined);
      throw new Error(String(err));
    }

    // ✅ Support des deux formats de réponse
    const stats = json?.meta?.stats || json?.data?.stats || {};
    const tech = json?.tech || {};
    const discipline = json?.discipline || null;

    // ✅ CORRIGÉ: Construction de la réponse avec points
    const out = {
      fileName: file.name,
      distanceKm: stats.distanceKm ?? (stats.distance ? stats.distance / 1000 : null),
      dplusM: stats.dplusM ?? stats.elevationGain ?? null,
      hasElevation: stats.hasElevation ?? null,
      steep: stats.steep ?? null,
      discipline: discipline,
      techV2: {
        techScoreV2: tech.techScoreV2 ?? null,
        tech01: tech.tech01 ?? null,
        details: tech.details ?? null,
        surfaceEstimate: tech.surfaceEstimate ?? null,
        osmOk: tech.osmOk ?? false,
      },
      phys: json?.phys ?? { score: null, effort: null, ipbOverall: null },
      mrs: (typeof json?.mrs === "number") ? json.mrs : null,
    };

    // ✅ CORRIGÉ: Extraction et inclusion des points
    if (keepPoints) {
      const points = extractPoints(json);
      if (points && Array.isArray(points) && points.length > 0) {
        out.points = points;
        console.log(`✅ ${points.length} points GPX récupérés`);
      } else {
        console.warn("⚠️  Aucun point dans la réponse API");
        out.points = null;
      }
    }

    emitStatus("done", "Analyse terminée.", 1);
    return out;
  }

  // Export global
  window.analyzeGPX = analyzeGPX;

  console.log("✅ gpx.js chargé (version corrigée avec format JSON)");
})();
