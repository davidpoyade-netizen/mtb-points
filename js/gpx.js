// js/gpx.js
// MTB Points — Frontend GPX analyzer
// Expose: window.analyzeGPX(file, opts?) -> Promise<GPXAnalysis>
(function () {
  function emitStatus(detail) {
    try { window.dispatchEvent(new CustomEvent("mtb:status", { detail })); } catch (_) {}
  }

  function setPhase(phase, message, opts = {}) {
    emitStatus({
      phase, // "idle" | "gpx" | "osm" | "done" | "error"
      message,
      progress: typeof opts.progress === "number" ? opts.progress : null,
      spinning: opts.spinning !== false,
      ts: Date.now()
    });
  }

  function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
  function clamp(n, a, b) { return Math.max(a, Math.min(b, n)); }
  function toRad(deg) { return (deg * Math.PI) / 180; }

  function haversine(lat1, lon1, lat2, lon2) {
    const R = 6371000;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  function readFileAsText(file) {
    return new Promise((resolve, reject) => {
      const fr = new FileReader();
      fr.onerror = () => reject(new Error("Impossible de lire le fichier GPX."));
      fr.onload = () => resolve(String(fr.result || ""));
      fr.readAsText(file);
    });
  }

  function parseGPXText(xmlText) {
    const parser = new DOMParser();
    const xml = parser.parseFromString(xmlText, "application/xml");
    if (xml.querySelector("parsererror")) throw new Error("GPX invalide (erreur XML).");

    const trkpts = Array.from(xml.querySelectorAll("trkpt"));
    if (!trkpts.length) throw new Error("Ce fichier GPX ne contient pas de trace exploitable (trkpt absent).");

    const pts = trkpts.map((n) => {
      const lat = Number(n.getAttribute("lat"));
      const lon = Number(n.getAttribute("lon"));
      const eleEl = n.querySelector("ele");
      const ele = eleEl ? Number(eleEl.textContent) : null;
      const timeEl = n.querySelector("time");
      const time = timeEl ? Date.parse(timeEl.textContent) : null;
      return {
        lat: Number.isFinite(lat) ? lat : null,
        lon: Number.isFinite(lon) ? lon : null,
        ele: Number.isFinite(ele) ? ele : null,
        time: Number.isFinite(time) ? time : null
      };
    }).filter(p => Number.isFinite(p.lat) && Number.isFinite(p.lon));

    if (pts.length < 2) throw new Error("GPX trop court (pas assez de points).");
    return pts;
  }

  function computeStats(points) {
    let distM = 0;
    let dplus = 0;

    let eleCount = 0;
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1];
      const b = points[i];
      distM += haversine(a.lat, a.lon, b.lat, b.lon);

      if (a.ele != null && b.ele != null) {
        eleCount++;
        const dz = b.ele - a.ele;
        if (dz > 0) dplus += dz;
      }
    }

    const distanceKm = Math.round((distM / 1000) * 100) / 100;
    const dplusM = Math.round(dplus);

    // altitude "obligatoire" = on exige que la majorité des segments ait une ele exploitable
    const hasElevation = eleCount >= Math.max(5, Math.floor((points.length - 1) * 0.6));

    // pente (simple) : p10/p15 = % du parcours au-dessus de 10% et 15% (approx)
    let p10 = 0, p15 = 0;
    if (hasElevation) {
      for (let i = 1; i < points.length; i++) {
        const a = points[i - 1], b = points[i];
        if (a.ele == null || b.ele == null) continue;
        const d = haversine(a.lat, a.lon, b.lat, b.lon);
        if (d <= 1) continue;
        const slope = (b.ele - a.ele) / d; // ratio
        const absPct = Math.abs(slope) * 100;
        if (absPct >= 10) p10 += d;
        if (absPct >= 15) p15 += d;
      }
      const total = distM || 1;
      p10 = Math.round((p10 / total) * 100) / 100;
      p15 = Math.round((p15 / total) * 100) / 100;
    }

    return { distanceKm, dplusM, hasElevation, steep: { p10, p15 } };
  }

  function computePhysScore(stats) {
    const D = Number(stats.distanceKm || 0);
    const H = Number(stats.dplusM || 0);

    // effort simple + pente (si altitude dispo)
    const effort = Math.sqrt(Math.max(0, D)) + (H / 1000);
    const vm = (stats.hasElevation && D > 0) ? (H / Math.max(D, 0.01)) : 0; // m/km
    const ipbOverall = stats.hasElevation ? Math.round(clamp(vm / 140, 0, 1) * 100) / 100 : 0;

    const effN = clamp(effort / 12, 0, 1);
    const steepN = stats.hasElevation ? clamp(0.7 * (stats.steep?.p10 || 0) + 1.3 * (stats.steep?.p15 || 0), 0, 1) : 0;

    const physScore = Math.round(100 * (0.78 * effN + 0.22 * steepN));
    return { score: physScore, effort: Math.round(effort * 100) / 100, ipbOverall };
  }

  async function callServerAnalyze(gpxText, { timeoutMs = 60000 } = {}) {
    const url = "https://mtb-points.onrender.com/api/analyze-gpx";

    const ctrl = (typeof AbortController !== "undefined") ? new AbortController() : null;
    const t = setTimeout(() => { try { ctrl?.abort(); } catch (_) {} }, timeoutMs);

    try {
      setPhase("osm", "Requête OSM / ScoreTech…", { progress: 0.75, spinning: true });

      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/gpx+xml" },
        body: gpxText,
        signal: ctrl?.signal
      });

      let data = null;
      try { data = await res.json(); } catch (_) { data = null; }

      if (!res.ok || !data?.ok) {
        const msg = data?.error || `Erreur serveur (${res.status}).`;
        throw new Error(msg);
      }
      return data; // { ok:true, tech, discipline, meta }
    } finally {
      clearTimeout(t);
    }
  }

  function friendlyErrorMessage(err) {
    const msg = (err && err.message) ? String(err.message) : String(err || "Erreur inconnue.");
    if (/trkpt absent/i.test(msg)) return "GPX invalide : il n’y a pas de trace (trkpt).";
    if (/erreur XML|GPX invalide/i.test(msg)) return "GPX invalide : fichier corrompu ou mal formé.";
    if (/Altitude obligatoire/i.test(msg)) return "Altitude obligatoire : exporte un GPX avec élévation (pas un tracé “dessiné”).";
    if (/Distance minimale/i.test(msg)) return "Distance minimale : le GPX doit faire au moins 3 km.";
    if (/Failed to fetch|NetworkError|Load failed/i.test(msg)) return "Impossible de contacter le serveur Render (réseau/CORS).";
    if (/abort|aborted|timeout/i.test(msg)) return "Timeout OSM : Overpass trop lent. Réessaie plus tard.";
    return msg;
  }

  async function analyzeGPX(file, opts = {}) {
    const options = { keepPoints: true, timeoutMs: 60000, ...opts };

    try {
      setPhase("gpx", "Lecture du GPX…", { progress: 0.15, spinning: true });
      if (!file) throw new Error("Aucun fichier GPX.");

      const gpxText = await readFileAsText(file);

      setPhase("gpx", "Parsing + stats…", { progress: 0.35, spinning: true });
      await sleep(10);

      const points = parseGPXText(gpxText);
      const stats = computeStats(points);

      // ✅ règles demandées
      if (!stats.hasElevation) throw new Error("Altitude obligatoire : GPX sans <ele> exploitable.");
      if (!(stats.distanceKm >= 3)) throw new Error("Distance minimale : GPX < 3 km.");

      setPhase("gpx", "Score physique…", { progress: 0.55, spinning: true });
      await sleep(10);

      const phys = computePhysScore(stats);

      // Serveur (OSM / ScoreTech)
      const server = await callServerAnalyze(gpxText, { timeoutMs: options.timeoutMs });

      // Normalisation Tech (selon formats possibles)
      const techScoreV2 =
        (typeof server?.tech?.techScoreV2 === "number") ? server.tech.techScoreV2 :
        (typeof server?.tech?.techScore === "number") ? server.tech.techScore :
        null;

      const tech = {
        techScoreV2,
        osmOk: (server?.tech?.osmOk === true) || (techScoreV2 != null),
        details: server?.tech?.details ?? null,
        surfaceEstimate: server?.tech?.surfaceEstimate ?? null
      };

      const mrs = (Number.isFinite(phys.score) && Number.isFinite(techScoreV2))
        ? Math.round(0.55 * phys.score + 0.45 * techScoreV2)
        : null;

      setPhase("done", "Analyse terminée ✅", { progress: 1, spinning: false });

      return {
        ok: true,
        fileName: file.name,
        distanceKm: stats.distanceKm,
        dplusM: stats.dplusM,
        hasElevation: stats.hasElevation,
        steep: stats.steep,
        phys,
        techV2: tech,
        mrs,
        discipline: server?.discipline ?? null,
        meta: server?.meta ?? null,
        points: options.keepPoints ? points : null
      };
    } catch (err) {
      setPhase("error", friendlyErrorMessage(err), { progress: null, spinning: false });
      throw new Error(friendlyErrorMessage(err));
    }
  }

  window.analyzeGPX = analyzeGPX;
})();
