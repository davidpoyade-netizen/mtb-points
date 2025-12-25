// js/gpx.js
// Expose: window.analyzeGPX(file) -> Promise<GPXAnalysis>

(function () {
  // -------------------------
  // Utils
  // -------------------------
  function clamp(n, a, b) { return Math.max(a, Math.min(b, n)); }
  function toRad(deg) { return (deg * Math.PI) / 180; }

  // Haversine distance (meters)
  function haversine(lat1, lon1, lat2, lon2) {
    const R = 6371000;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  function bearing(a, b) {
    const y = Math.sin(toRad(b.lon - a.lon)) * Math.cos(toRad(b.lat));
    const x =
      Math.cos(toRad(a.lat)) * Math.sin(toRad(b.lat)) -
      Math.sin(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.cos(toRad(b.lon - a.lon));
    let br = Math.atan2(y, x) * 180 / Math.PI;
    if (br < 0) br += 360;
    return br;
  }

  function readFileAsText(file) {
    return new Promise((resolve, reject) => {
      const fr = new FileReader();
      fr.onerror = () => reject(new Error("Impossible de lire le fichier."));
      fr.onload = () => resolve(String(fr.result || ""));
      fr.readAsText(file);
    });
  }

  function stddev(arr) {
    if (!arr.length) return 0;
    const m = arr.reduce((s, x) => s + x, 0) / arr.length;
    const v = arr.reduce((s, x) => s + (x - m) * (x - m), 0) / arr.length;
    return Math.sqrt(v);
  }

  function percentile(arr, p) {
    if (!arr.length) return 0;
    const a = arr.slice().sort((x, y) => x - y);
    const idx = (a.length - 1) * p;
    const lo = Math.floor(idx), hi = Math.ceil(idx);
    if (lo === hi) return a[lo];
    const w = idx - lo;
    return a[lo] * (1 - w) + a[hi] * w;
  }

  // -------------------------
  // GPX parsing
  // -------------------------
  function parseGPXText(xmlText) {
    const parser = new DOMParser();
    const xml = parser.parseFromString(xmlText, "application/xml");
    if (xml.querySelector("parsererror")) throw new Error("GPX invalide (parsererror).");

    const trkpts = Array.from(xml.querySelectorAll("trkpt"));
    if (!trkpts.length) throw new Error("Aucun point <trkpt> trouvé dans le GPX.");

    const points = [];
    for (const p of trkpts) {
      const lat = Number(p.getAttribute("lat"));
      const lon = Number(p.getAttribute("lon"));
      const eleNode = p.querySelector("ele");
      const ele = eleNode ? Number(eleNode.textContent) : null;

      if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
      points.push({ lat, lon, ele: Number.isFinite(ele) ? ele : null });
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
      p10: distM > 0 ? Math.round((distSlope10 / distM) * 1000) / 1000 : 0, // 0..1
      p15: distM > 0 ? Math.round((distSlope15 / distM) * 1000) / 1000 : 0
    };

    return { distanceKm, dplusM, hasElevation, steep };
  }

  // -------------------------
  // Technique: segment analysis + P75 aggregation
  // TechCoeff_seg = clamp(0.80 + 0.004*IPB_seg + 0.20*terrain + 0.10*sinu_norm, 0.80, 1.60)
  // with IPB proxy per segment (if elevation).
  // -------------------------
  function computeTechCoeffFromGPX(points, opts = {}) {
    const segmentLenM = Number(opts.segmentLenM ?? 300);
    const minDirectM = 1;

    // build segments by length
    const segRanges = [];
    let segStartIdx = 0;
    let acc = 0;

    for (let i = 1; i < points.length; i++) {
      const d = haversine(points[i - 1].lat, points[i - 1].lon, points[i].lat, points[i].lon);
      if (!Number.isFinite(d) || d <= 0) continue;
      acc += d;
      if (acc >= segmentLenM) {
        segRanges.push([segStartIdx, i]);
        segStartIdx = i;
        acc = 0;
      }
    }
    if (segStartIdx < points.length - 1) segRanges.push([segStartIdx, points.length - 1]);

    const segments = [];
    const techValues = [];
    let sumW = 0;
    let sumTech = 0;

    for (const [aIdx, bIdx] of segRanges) {
      const pts = points.slice(aIdx, bIdx + 1);
      if (pts.length < 2) continue;

      // real distance, gain, slopes
      let distReal = 0;
      let gain = 0;
      let distSlope10 = 0;
      let distSlope15 = 0;

      const dEle = [];
      for (let i = 1; i < pts.length; i++) {
        const segD = haversine(pts[i - 1].lat, pts[i - 1].lon, pts[i].lat, pts[i].lon);
        if (!Number.isFinite(segD) || segD <= 0) continue;
        distReal += segD;

        const e1 = pts[i - 1].ele;
        const e2 = pts[i].ele;
        if (e1 != null && e2 != null) {
          const de = e2 - e1;
          dEle.push(de);
          if (de > 0) gain += de;

          const slope = (de / segD) * 100;
          if (slope > 10) distSlope10 += segD;
          if (slope > 15) distSlope15 += segD;
        }
      }
      if (distReal <= 10) continue;

      // sinuosité
      const direct = haversine(pts[0].lat, pts[0].lon, pts[pts.length - 1].lat, pts[pts.length - 1].lon);
      const sinu = distReal / Math.max(direct, minDirectM);
      const sinuNorm = clamp((sinu - 1.0) / 0.3, 0, 1);

      // terrain heuristic from vertical roughness
      const hasEle = dEle.length > 0;
      let terrain = 0;
      let ipb = 0;

      if (hasEle) {
        const absDE = dEle.map(x => Math.abs(x));
        const rough = stddev(absDE);
        const micro = absDE.reduce((s, x) => s + x, 0) / absDE.length;

        const roughN = clamp((rough - 0.2) / 1.8, 0, 1);
        const microN = clamp((micro - 0.15) / 1.2, 0, 1);
        terrain = clamp(0.6 * roughN + 0.4 * microN, 0, 1);

        const lenKm = distReal / 1000;
        const vm = gain / Math.max(lenKm, 0.01); // m/km
        const p10 = distSlope10 / distReal;
        const p15 = distSlope15 / distReal;

        // IPB proxy (0..120)
        ipb = clamp(0.06 * vm + 30 * p10 + 45 * p15, 0, 120);
      } else {
        terrain = 0;
        ipb = 0;
      }

      const ipbCoef = 0.004 * ipb;
      const techCoeff = clamp(0.80 + ipbCoef + 0.20 * terrain + 0.10 * sinuNorm, 0.80, 1.60);

// ---------- SCORES PAR SEGMENT (0–100)

// Technique : conversion du coeff (0.80 → 1.60) vers 0 → 100
const techSegScore = Math.round(
  100 * clamp((techCoeff - 0.80) / 0.80, 0, 1)
);

// Physique : effort + IPB segment
const segKm = distReal / 1000;
const effortSeg = Math.sqrt(Math.max(0, segKm)) + (gain / 1000);

// normalisation (valeurs ajustables)
const effortN = clamp(effortSeg / 3.0, 0, 1);
const ipbN = clamp(ipb / 120, 0, 1);

const physSegScore = Math.round(
  100 * clamp(0.70 * effortN + 0.30 * ipbN, 0, 1)
);

// Score global segment (pondération finale)
const globalSegScore = Math.round(
  0.55 * physSegScore + 0.45 * techSegScore
);


      // weighted mean (still computed, even if you use P75 later)
      sumW += distReal;
      sumTech += techCoeff * distReal;
      techValues.push(techCoeff);

      segments.push({
        from: aIdx,
        to: bIdx,
        lenM: Math.round(distReal),
        sinuosity: Math.round(sinu * 1000) / 1000,
        sinuNorm: Math.round(sinuNorm * 1000) / 1000,
        terrain: Math.round(terrain * 1000) / 1000,
        ipb: Math.round(ipb * 10) / 10,
        techCoeff: Math.round(techCoeff * 1000) / 1000
      });
    }

    const techCoeffTotal = sumW ? (sumTech / sumW) : 0.80;
    const techCoeffP75 = techValues.length ? percentile(techValues, 0.75) : techCoeffTotal;

    return {
      segmentLenM,
      techCoeffTotal: Math.round(techCoeffTotal * 1000) / 1000,
      techCoeffP75: Math.round(techCoeffP75 * 1000) / 1000,
      segments
    };
  }

  // -------------------------
  // Surface estimate: road/track/single from geometry (+ elevation roughness if available)
  // -------------------------
  function estimateSurfaceFromGPX(points, hasElevation) {
    const winM = 300;
    let start = 0;
    let acc = 0;

    let wRoad = 0, wTrack = 0, wSingle = 0;

    for (let i = 2; i < points.length; i++) {
      const d = haversine(points[i - 1].lat, points[i - 1].lon, points[i].lat, points[i].lon);
      if (!Number.isFinite(d) || d <= 0) continue;
      acc += d;

      if (acc >= winM || i === points.length - 1) {
        const a = points[start];
        const b = points[i];

        // real distance in window
        let distReal = 0;
        for (let k = start + 1; k <= i; k++) {
          const dd = haversine(points[k - 1].lat, points[k - 1].lon, points[k].lat, points[k].lon);
          if (dd > 0) distReal += dd;
        }
        if (distReal <= 10) { start = i; acc = 0; continue; }

        // sinuosity
        const direct = haversine(a.lat, a.lon, b.lat, b.lon);
        const sinu = distReal / Math.max(direct, 1);
        const sinuN = clamp((sinu - 1.0) / 0.3, 0, 1);

        // curvature proxy: sum of heading changes per km
        let turn = 0;
        for (let k = start + 2; k <= i; k++) {
          const br1 = bearing(points[k - 2], points[k - 1]);
          const br2 = bearing(points[k - 1], points[k]);
          let diff = Math.abs(br2 - br1);
          if (diff > 180) diff = 360 - diff;
          turn += diff;
        }
        const turnPerKm = turn / (distReal / 1000);
        const turnN = clamp((turnPerKm - 150) / 450, 0, 1);

        // vertical micro-roughness (if available)
        let roughN = 0;
        if (hasElevation) {
          let sumAbs = 0;
          let c = 0;
          for (let k = start + 1; k <= i; k++) {
            const e1 = points[k - 1].ele, e2 = points[k].ele;
            if (e1 != null && e2 != null) { sumAbs += Math.abs(e2 - e1); c++; }
          }
          const micro = c ? (sumAbs / c) : 0;
          roughN = clamp((micro - 0.15) / 1.2, 0, 1);
        }

        // scores
        const singleScore = clamp(0.45 * sinuN + 0.35 * turnN + 0.20 * roughN, 0, 1);
        const roadScore = clamp(1 - (0.60 * sinuN + 0.30 * turnN + 0.10 * roughN), 0, 1);
        const trackScore = clamp(1 - Math.abs(singleScore - 0.5) * 2, 0, 1);

        const sum = (singleScore + roadScore + trackScore) || 1;
        wRoad += distReal * (roadScore / sum);
        wTrack += distReal * (trackScore / sum);
        wSingle += distReal * (singleScore / sum);

        start = i;
        acc = 0;
      }
    }

    const total = (wRoad + wTrack + wSingle) || 1;
    let r = Math.round(100 * (wRoad / total));
    let t = Math.round(100 * (wTrack / total));
    let s = Math.round(100 * (wSingle / total));
    const diff = 100 - (r + t + s);

    if (diff !== 0) {
      if (r >= t && r >= s) r += diff;
      else if (t >= r && t >= s) t += diff;
      else s += diff;
    }

    return { roadPct: r, trackPct: t, singlePct: s };
  }

  // -------------------------
  // Main API
  // -------------------------
  async function analyzeGPX(file) {
    if (!file) throw new Error("Aucun fichier GPX.");
    const text = await readFileAsText(file);
    const points = parseGPXText(text);
    const stats = computeStats(points);

    // ---- Physical score (0..100): effort + IPB proxy global
    const D = Number(stats.distanceKm || 0);
    const H = Number(stats.dplusM || 0);
    const effort = Math.sqrt(Math.max(0, D)) + (H / 1000);

    let ipbOverall = 0;
    if (stats.hasElevation && D > 0) {
      const vm = H / Math.max(D, 0.01); // m/km
      const p10 = Number(stats.steep?.p10 || 0); // 0..1
      const p15 = Number(stats.steep?.p15 || 0); // 0..1
      ipbOverall = clamp(0.06 * vm + 30 * p10 + 45 * p15, 0, 120);
    }

    const effortN = clamp(effort / 12, 0, 1);
    const ipbN = clamp(ipbOverall / 120, 0, 1);
    const physScore = Math.round(100 * clamp(0.70 * effortN + 0.30 * ipbN, 0, 1));

    // ---- Technique (segments) + p75 score
    const techRaw = computeTechCoeffFromGPX(points, { segmentLenM: 300 });
    const techCoeffP75 = techRaw.techCoeffP75; // 0.80..1.60
    const techScore = Math.round(100 * clamp((techCoeffP75 - 0.80) / 0.80, 0, 1));

    // ---- Surface estimate (heuristic)
    const surfaceEstimate = estimateSurfaceFromGPX(points, stats.hasElevation);

    return {
      fileName: file.name,
      distanceKm: stats.distanceKm,
      dplusM: stats.dplusM,
      hasElevation: stats.hasElevation,
      points,
      steep: stats.steep,

      phys: {
        effort: Math.round(effort * 1000) / 1000,
        ipbOverall: Math.round(ipbOverall * 10) / 10,
        score: physScore
      },

      tech: {
        ...techRaw,
        techCoeffP75,
        techScore
      },

      surfaceEstimate
    };
  }

  window.analyzeGPX = analyzeGPX;
})();

