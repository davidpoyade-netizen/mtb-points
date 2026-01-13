// js/gpx.js
// MTB Points — analyse GPX/OSM via API Render (POST /api/analyze-gpx)
// Expose: window.analyzeGPX(file, opts)
// opts:
//   - keepPoints: boolean (default false) -> conserve un échantillon de points si l'API en renvoie
//   - apiBase: string (default https://mtb-points.onrender.com)
//   - timeoutMs: number (default 45000)
//
// Emits CustomEvent: "mtb:status" { phase, message, progress }

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
    } catch (_) {
      // ignore
    }
  }

  async function readFileText(file) {
    if (!file) return "";
    if (typeof file.text === "function") return await file.text();
    // fallback FileReader
    return await new Promise((resolve, reject) => {
      const fr = new FileReader();
      fr.onerror = () => reject(fr.error || new Error("FileReader error"));
      fr.onload = () => resolve(String(fr.result || ""));
      fr.readAsText(file);
    });
  }

  async function analyzeGPX(file, opts = {}) {
    const apiBase = String(opts.apiBase || DEFAULT_API_BASE).replace(/\/+$/, "");
    const timeoutMs = Number.isFinite(opts.timeoutMs) ? Number(opts.timeoutMs) : 45000;

    if (!file) throw new Error("Aucun fichier GPX.");

    emitStatus("gpx", "Lecture du GPX…", 0.05);
    const gpxText = await readFileText(file);
    if (!gpxText || gpxText.length < 50) throw new Error("GPX vide ou invalide.");

    emitStatus("gpx", "Envoi au serveur (analyse GPX)…", 0.15);

    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);

    let resp;
    try {
      resp = await fetch(`${apiBase}/api/analyze-gpx`, {
        method: "POST",
        headers: {
          "Content-Type": "application/gpx+xml",
        },
        body: gpxText,
        signal: ctrl.signal,
      });
    } catch (e) {
      clearTimeout(t);
      emitStatus("error", "Erreur réseau vers l'API d'analyse.", undefined);
      throw new Error("Erreur réseau (API analyse GPX). Vérifie Render/CORS.");
    }
    clearTimeout(t);

    emitStatus("osm", "Analyse terrain OSM…", 0.65);

    let json;
    try {
      json = await resp.json();
    } catch (_) {
      throw new Error("Réponse API invalide (JSON)." );
    }

    if (!resp.ok || !json || json.ok === false) {
      const err = json?.error || `HTTP ${resp.status}`;
      emitStatus("error", String(err), undefined);
      throw new Error(String(err));
    }

    const stats = json?.meta?.stats || {};
    const tech = json?.tech || {};

    const out = {
      fileName: file.name,
      distanceKm: stats.distanceKm ?? null,
      dplusM: stats.dplusM ?? null,
      hasElevation: stats.hasElevation ?? null,
      steep: stats.steep ?? null,
      discipline: json?.discipline ?? null,

      // TechScore V2 officiel (hybride)
      techV2: {
        techScoreV2: tech.techScoreV2 ?? null,
        tech01: tech.tech01 ?? null,
        details: tech.details ?? null,
        surfaceEstimate: tech.surfaceEstimate ?? null,
      },

      // petit socle "phys" local, si besoin dans le futur
      phys: {
        score: null,
        effort: null,
        ipbOverall: null,
      },

      // score global (si tu le calcules ailleurs, tu peux le remplacer)
      mrs: null,
    };

    emitStatus("done", "Analyse terminée.", 1);
    return out;
  }

  window.analyzeGPX = analyzeGPX;
})();
