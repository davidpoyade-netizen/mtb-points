// js/gpx.js
// MTB Points — Frontend GPX analyzer
// Expose: window.analyzeGPX(file, opts?) -> Promise<GPXAnalysis>

(function () {
  // -------------------------
  // Status helpers (UI)
  // -------------------------
  function emitStatus(detail) {
    try {
      window.dispatchEvent(new CustomEvent("mtb:status", { detail }));
    } catch (_) {}
  }

  function setPhase(phase, message, opts = {}) {
    emitStatus({
      phase, // "idle" | "gpx" | "osm" | "done" | "error"
      message,
      progress: typeof opts.progress === "number" ? opts.progress : null,
      spinning: opts.spinning !== false,
      ts: Date.now(),
    });
  }

  function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

  // -------------------------
  // Utils
  // -------------------------
  function clamp(n, a, b) { return Math.max(a, Math.min(b, n)); }
  function toRad(deg) { return (deg * Math.PI) / 180; }

  function haversine(lat1, lon1, lat2, lon2) {
    const R = 6371000;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const aa =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) ** 2;
    const c = 2 * Math.atan2(Math.sqrt(aa), Math.sqrt(1 - aa));
    return R * c;
  }

  function readFileAsText(file) {
    return new Promise((resolve, reject) => {
      const fr = new FileReader();
      fr.onerror = () => reject(new Error("Impossible de lire le fichier GPX."));
      fr.onload = () => resolve(String(fr.result || ""));
      fr.readAsText(file);
    });
  }

  // -------------------------
  // GPX parsing
  // -------------------------
  function parseGPXText(xmlText) {
    const parser = new DOMParser();
    const xml = parser.parseFromString(xmlText, "application/xml");
    if (xml.querySelector("parsererror")) throw new Error("GPX invalide (erreur XML).");

    const trkpts = Array.from(xml.querySelectorAll("trkpt"));
    if (!trkpts.length) throw new Error("Aucun point <trkpt> trouvé dans le GPX.");

    const points = [];
    for (const p of trkpts) {
      const lat = Number(p.getAttribute("lat"));
      const lon = Number(p.getAttribute("lon"));

      const eleNode = p.querySelector("ele");
      const ele = eleNode ? Number(eleNode.textContent) : null;

      const timeNode = p.querySelector("time");
      const time = timeNode ? String(timeNode.textContent || "").trim() : null;

      if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;

      points.push({
        lat,
        lon,
        ele: Number.isFinite(ele) ? ele : null,
        time: time && !Number.isNaN(Date.parse(time)) ? time : null,
      });
    }

    if (points.length < 2) throw new Error("GPX: pas assez de points valides.");
    return points;
  }

  // -------------------------
  // Base stats: distance, D+, steepness
  // -------------------------
  function computeStats(points) {
    let distM = 0;
    let dplus = 0;

    let hasElevation = false;
    let elevAllZero = true;

    let distSlope10 = 0;
    let distSlope15 = 0;

    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1];
      const b = points[i];

      const segDist = haversine(a.lat, a.lon, b.lat, b.lon);
      if (!Number.isFinite(segDist) || segDist <= 0) continue;
      distM += segDist;

      if (a.ele != null && b.ele != null) {
        hasElevation = true;
        if (a.ele !== 0 || b.ele !== 0) elevAllZero = false;

        const delta = b.ele - a.ele;
        if (delta > 0) dplus += delta;

        const slope = (delta / segDist) * 100;
        if (slope > 10) distSlope10 += segDist;
        if (slope > 15) distSlope15 += segDist;
      }
    }

    if (hasElevation && elevAllZero) {
      hasElevation = false;
      dplus = 0;
      distSlope10 = 0;
      distSlope15 = 0;
    }

    const distanceKm = Math.round((distM / 1000) * 100) / 100;
    const dplusM = Math.round(dplus);

    const steep = {
      p10: distM > 0 ? Math.round((distSlope10 / distM) * 1000) / 1000 : 0,
      p15: distM > 0 ? Math.round((distSlope15 / distM) * 1000) / 1000 : 0,
    };

    return { distanceKm, dplusM, hasElevation, steep };
  }

  // -------------------------
  // Server call (ScoreTech V2 Hybrid officiel + Discipline)
  // -------------------------
  async function fetchServerAnalysis(gpxText) {
    // GitHub Pages = statique => pas de /api
    const isStaticHost =
      location.hostname.endsWith("github.io") ||
      location.hostname.includes("netlify.app") ||
      location.hostname.includes("pages.dev");

    if (isStaticHost) {
      return {
        ok: true,
        tech: null,
        discipline: null,
        meta: { mode: "LOCAL_ONLY", reason: "Static host: no /api/analyze-gpx" },
      };
    }

    const res = await fetch("/api/analyze-gpx", {
      method: "POST",
      headers: { "Content-Type": "application/gpx+xml" },
      body: gpxText,
    });

    let data = null;
    try { data = await res.json(); } catch (_) { data = null; }

    if (!res.ok || !data?.ok) {
      throw new Error(data?.error || `Erreur serveur (${res.status}).`);
    }
    return data; // { ok:true, tech, discipline, meta }
  }

  // -------------------------
  // Friendly error mapper
  // -------------------------
  function friendlyErrorMessage(err) {
    const msg = (err && err.message) ? String(err.message) : String(err || "Erreur inconnue.");
    if (/Aucun point <trkpt>/i.test(msg)) return "Ce fichier GPX ne contient pas de trace exploitable (trkpt absent).";
    if (/GPX invalide/i.test(msg) || /erreur XML/i.test(msg)) return "GPX invalide : le fichier est corrompu ou mal formé.";
    if (/trop volumineux/i.test(msg)) return "GPX trop volumineux : essaye une trace plus légère.";
    if (/OSM coverage too low/i.test(msg)) return "Score technique non calculable automatiquement (données OSM insuffisantes).";
    if (/Failed to fetch|NetworkError|Load failed/i.test(msg)) return "Impossible de contacter le serveur (réseau/CORS).";
    return msg;
  }

  // -------------------------
  // Main API
  // -------------------------
  async function analyzeGPX(file, opts = {}) {
    const options = { keepPoints: true, ...opts };

    try {
      setPhase("gpx", "Analyse GPX en cours…", { spinning: true });

      if (!file) throw new Error("Aucun fichier GPX.");

      const gpxText = await readFileAsText(file);

      setPhase("gpx", "Lecture et parsing du GPX…", { progress: 0.35, spinning: true });
      await sleep(20);

      const points = parseGPXText(gpxText);

      setPhase("gpx", "Calcul des statistiques…", { progress: 0.65, spinning: true });
      await sleep(20);

      const stats = computeStats(points);

      // ---- ScorePhys local
      const D = Number(stats.distanceKm || 0);
      const H = Number(stats.dplusM || 0);
      const effort = Math.sqrt(Math.max(0, D)) + (H / 1000);

      let ipbOverall = 0;
      if (stats.hasElevation && D > 0) {
        const vm = H / Math.max(D, 0.01);
        const p10 = Number(stats.steep?.p10 || 0);
        const p15 = Number(stats.steep?.p15 || 0);
        ipbOverall = clamp(0.06 * vm + 30 * p10 + 45 * p15, 0, 120);
      }

      const effortN = clamp(effort / 12, 0, 1);
      const ipbN = clamp(ipbOverall / 120, 0, 1);
      const physScore = Math.round(100 * clamp(0.70 * effortN + 0.30 * ipbN, 0, 1));

      setPhase("gpx", "Analyse GPX terminée ✅", { progress: 1, spinning: false });
      await sleep(60);

      // ---- Server OSM (optionnel)
      setPhase("osm", "Analyse OSM en cours… (ScoreTech officiel)", { spinning: true });

      const server = await fetchServerAnalysis(gpxText);
      const tech = server.tech || null;
      const discipline = server.discipline || null;

      const mrs = (tech?.techScoreV2 == null)
        ? null
        : Math.round(0.55 * physScore + 0.45 * tech.techScoreV2);

      setPhase("done", server.meta?.mode === "LOCAL_ONLY"
        ? "Analyse terminée ✅ (ScoreTech serveur indisponible)"
        : "Analyse terminée ✅",
        { spinning: false }
      );

      return {
        fileName: file.name,

        distanceKm: stats.distanceKm,
        dplusM: stats.dplusM,
        hasElevation: stats.hasElevation,
        steep: stats.steep,

        points: options.keepPoints ? points : undefined,

        phys: {
          effort: Math.round(effort * 1000) / 1000,
          ipbOverall: Math.round(ipbOverall * 10) / 10,
          score: physScore,
        },

        techV2: tech,
        discipline,
        mrs,
        serverMeta: server.meta || null,
      };
    } catch (err) {
      const msg = friendlyErrorMessage(err);
      setPhase("error", msg, { spinning: false });
      throw new Error(msg);
    }
  }

  // -------------------------
  // Optional helper: spinner CSS
  // -------------------------
  function ensureMTBSpinnerCSS() {
    const id = "mtb-spinner-css";
    if (document.getElementById(id)) return;

    const css = `
.mtb-status{display:flex;align-items:center;gap:10px;padding:10px 12px;border:1px solid #e5e7eb;border-radius:12px;background:#fff}
.mtb-status .label{font-size:14px;color:#0f172a}
.mtb-status .sub{font-size:12px;color:#64748b;margin-top:2px}
.mtb-spinner{width:18px;height:18px;border-radius:999px;border:2px solid rgba(100,116,139,.35);border-top-color:rgba(37,99,235,.95);animation:mtbSpin .9s linear infinite}
@keyframes mtbSpin{to{transform:rotate(360deg)}}
.mtb-progress{height:6px;border-radius:999px;background:#e5e7eb;overflow:hidden}
.mtb-progress > div{height:100%;width:0%;background:rgba(37,99,235,.95);transition:width .2s ease}
.mtb-badge{font-size:12px;padding:2px 8px;border-radius:999px;border:1px solid #e5e7eb;color:#64748b}
.mtb-badge.ok{color:#16a34a;border-color:rgba(22,163,74,.35)}
.mtb-badge.warn{color:#ea580c;border-color:rgba(234,88,12,.35)}
.mtb-badge.err{color:#dc2626;border-color:rgba(220,38,38,.35)}
    `.trim();

    const style = document.createElement("style");
    style.id = id;
    style.textContent = css;
    document.head.appendChild(style);
  }

  window.analyzeGPX = analyzeGPX;
  window.ensureMTBSpinnerCSS = ensureMTBSpinnerCSS;
})();
