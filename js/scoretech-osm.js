// scoretech_v2_osm.js
// MTB Points — ScoreTech V2 (Tech-sensitive)
// Node 18+ (fetch natif).
//
// Calcule ScoreTech à partir d'une trace de points [{lat, lon, ele}] en combinant :
// - TerrainScore (OSM tags via Overpass) 0..1
// - SlopeTech (pente technique issue du GPX) 0..1
// - SinuNorm (sinuosité) 0..1
// - TurnNorm (pilotage/épingles via bearings) 0..1
//
// Sortie : { techScoreV2 (0..100), techCoeffP75V2, segments[], meta{} }
//
// Notes :
// - Segmentation 200 m (tech-sensitive) + P75 pondéré (poids = longueur segment)
// - OSM sampling 120 m + cache disque (évite de spammer Overpass)
// - Fallback si OSM indispo : TerrainScore = 0.40

import fs from "node:fs";
import path from "node:path";

function clamp(n, a, b) { return Math.max(a, Math.min(b, n)); }
function toRad(deg) { return (deg * Math.PI) / 180; }

// Haversine distance (meters) — conforme à ton gpx.js
function haversine(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// Bearing (degrees 0..360) — conforme à ton gpx.js
function bearing(a, b) {
  const y = Math.sin(toRad(b.lon - a.lon)) * Math.cos(toRad(b.lat));
  const x =
    Math.cos(toRad(a.lat)) * Math.sin(toRad(b.lat)) -
    Math.sin(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.cos(toRad(b.lon - a.lon));
  let br = Math.atan2(y, x) * 180 / Math.PI;
  if (br < 0) br += 360;
  return br;
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

function weightedPercentile(values, weights, p) {
  const items = values.map((v, i) => ({ v, w: weights[i] ?? 0 }));
  items.sort((a, b) => a.v - b.v);
  const total = items.reduce((s, x) => s + x.w, 0);
  const target = total * p;
  let cum = 0;
  for (const it of items) {
    cum += it.w;
    if (cum >= target) return it.v;
  }
  return items.length ? items[items.length - 1].v : 0;
}

// -------------------------------
// Defaults (Tech-sensitive preset)
// -------------------------------
const DEFAULTS = {
  segmentLenM: 200,
  sampleEveryM: 120,
  overpassRadiusM: 20,
  terrainFallback: 0.40,

  // TechCoeff bounds
  techMin: 0.80,
  techMax: 1.80,

  // Tech-sensitive weights
  wTerrain: 0.22,
  wTurn: 0.16,
  wSinu: 0.14,
  wSlope: 0.18,

  // Cache / UA
  cacheDir: ".cache/osm",
  userAgent: "MTBPoints/1.0 (ScoreTechV2-TechSensitive)",
};

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function cacheKey(lat, lon, r) {
  // arrondi pour limiter la cardinalité
  return `${lat.toFixed(5)}_${lon.toFixed(5)}_r${r}`;
}

// -------------------------------
// OSM (Overpass) helpers
// -------------------------------
async function overpassFetch(query, opts) {
  const url = "https://overpass-api.de/api/interpreter";
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded;charset=UTF-8",
      "user-agent": opts.userAgent,
    },
    body: `data=${encodeURIComponent(query)}`,
  });
  if (!res.ok) throw new Error(`Overpass HTTP ${res.status}`);
  return res.json();
}

function pickBestTags(osmJson) {
  const els = osmJson?.elements ?? [];
  for (const el of els) {
    if (el.type !== "way") continue;
    const t = el.tags || {};
    if (t.highway || t.surface || t.smoothness || t.tracktype || t["mtb:scale"] || t.sac_scale) {
      return t;
    }
  }
  return null;
}

function terrainScoreFromTags(tags) {
  if (!tags) return null;

  // 1) mtb:scale (0..6) -> 0..1
  const mtb = tags["mtb:scale"];
  if (mtb != null && mtb !== "") {
    const v = Number(String(mtb).split(";")[0]);
    if (Number.isFinite(v)) return clamp(v / 5, 0, 1);
  }

  // 2) smoothness -> 0..1
  const sm = tags.smoothness ? String(tags.smoothness).toLowerCase() : "";
  if (sm) {
    if (sm === "excellent") return 0.20;
    if (sm === "good") return 0.30;
    if (sm === "intermediate") return 0.50;
    if (sm === "bad") return 0.70;
    if (["very_bad", "horrible", "very_horrible", "impassable"].includes(sm)) return 0.90;
  }

  // 3) highway / surface / tracktype
  const hw = tags.highway ? String(tags.highway).toLowerCase() : "";
  const surface = tags.surface ? String(tags.surface).toLowerCase() : "";
  const tracktype = tags.tracktype ? String(tags.tracktype).toLowerCase() : "";
  const sac = tags.sac_scale ? String(tags.sac_scale).toLowerCase() : "";

  const roadish = ["motorway","trunk","primary","secondary","tertiary","unclassified","residential","service","living_street"];
  if (hw === "cycleway" || roadish.includes(hw) || surface === "asphalt" || surface === "paved") return 0.0;

  if (hw === "track") {
    if (tracktype === "grade1") return 0.20;
    if (tracktype === "grade2") return 0.35;
    if (tracktype === "grade3") return 0.50;
    if (tracktype === "grade4") return 0.60;
    if (tracktype === "grade5") return 0.70;
    return 0.45;
  }

  if (["path","footway","bridleway"].includes(hw)) {
    let base = 0.60;
    if (["rock","stone","boulders","scree","ground_rock"].includes(surface)) base += 0.20;
    return clamp(base, 0, 1);
  }

  // sac_scale can indicate alpine terrain
  if (sac) {
    if (["demanding_mountain_hiking","alpine_hiking"].includes(sac)) return 0.80;
    if (["difficult_alpine_hiking"].includes(sac)) return 0.90;
  }

  // surface heuristics
  if (["gravel","fine_gravel","compacted"].includes(surface)) return 0.25;
  if (["ground","dirt","earth","grass"].includes(surface)) return 0.45;
  if (["rock","stone","boulders","scree"].includes(surface)) return 0.85;

  return null;
}

async function terrainScoreAtPoint(lat, lon, opts) {
  ensureDir(opts.cacheDir);
  const key = cacheKey(lat, lon, opts.overpassRadiusM);
  const fp = path.join(opts.cacheDir, `${key}.json`);

  // Cache hit
  if (fs.existsSync(fp)) {
    try {
      const c = JSON.parse(fs.readFileSync(fp, "utf8"));
      return c?.terrainScore ?? null;
    } catch {
      // ignore corrupted cache
    }
  }

  const q = `
  [out:json][timeout:25];
  (
    way(around:${opts.overpassRadiusM},${lat},${lon})["highway"];
  );
  out tags 10;
  `;

  try {
    const json = await overpassFetch(q, opts);
    const tags = pickBestTags(json);
    const ts = terrainScoreFromTags(tags);
    fs.writeFileSync(fp, JSON.stringify({ terrainScore: ts, tags }, null, 2), "utf8");
    return ts;
  } catch (e) {
    fs.writeFileSync(fp, JSON.stringify({ terrainScore: null, error: String(e) }, null, 2), "utf8");
    return null;
  }
}

// -------------------------------
// Trace processing
// -------------------------------
function buildSegments(points, segmentLenM) {
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
  return segRanges;
}

function samplePointsEvery(points, stepM) {
  const out = [];
  if (!points.length) return out;
  out.push(points[0]);

  let acc = 0;
  for (let i = 1; i < points.length; i++) {
    const d = haversine(points[i - 1].lat, points[i - 1].lon, points[i].lat, points[i].lon);
    if (!Number.isFinite(d) || d <= 0) continue;
    acc += d;
    if (acc >= stepM) {
      out.push(points[i]);
      acc = 0;
    }
  }

  const last = points[points.length - 1];
  if (out[out.length - 1] !== last) out.push(last);
  return out;
}

function computeSinu(pts) {
  let distReal = 0;
  for (let i = 1; i < pts.length; i++) {
    const d = haversine(pts[i - 1].lat, pts[i - 1].lon, pts[i].lat, pts[i].lon);
    if (d > 0) distReal += d;
  }
  const direct = haversine(pts[0].lat, pts[0].lon, pts[pts.length - 1].lat, pts[pts.length - 1].lon);
  const sinuosity = distReal / Math.max(direct, 1);
  const sinuNorm = clamp((sinuosity - 1.0) / 0.30, 0, 1);
  return { distReal, sinuosity, sinuNorm };
}

function computeSlopeTech(pts) {
  // Tech-sensitive slope metrics:
  // - p10: proportion(|grade| >= 10%)
  // - p16: proportion(|grade| >= 16%)
  // - gP90: percentile90(|grade|)
  // SlopeTech = clamp(0.55*p10 + 0.45*p16 + 0.55*clamp((gP90-0.08)/0.22), 0, 1)
  const absGrades = [];
  let n = 0, c10 = 0, c16 = 0;

  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i];
    const d = haversine(a.lat, a.lon, b.lat, b.lon);
    if (!Number.isFinite(d) || d < 2) continue;

    const e1 = a.ele == null ? null : Number(a.ele);
    const e2 = b.ele == null ? null : Number(b.ele);
    if (!Number.isFinite(e1) || !Number.isFinite(e2)) continue;

    const grade = (e2 - e1) / d; // fraction
    const ag = Math.abs(grade);

    // hard clamp to avoid insane spikes (bad elevation) — keeps stability
    if (ag > 0.60) continue; // 60%+

    absGrades.push(ag);
    if (ag >= 0.10) c10++;
    if (ag >= 0.16) c16++;
    n++;
  }

  if (n === 0) return { slopeTech: 0, p10: 0, p16: 0, gP90: 0 };

  const gP90 = percentile(absGrades, 0.90);
  const p10 = c10 / n;
  const p16 = c16 / n;

  const gMaxNorm = clamp((gP90 - 0.08) / 0.22, 0, 1);
  const slopeTech = clamp(0.55 * p10 + 0.45 * p16 + 0.55 * gMaxNorm, 0, 1);

  return {
    slopeTech: Math.round(slopeTech * 1000) / 1000,
    p10: Math.round(p10 * 1000) / 1000,
    p16: Math.round(p16 * 1000) / 1000,
    gP90: Math.round(gP90 * 1000) / 1000,
  };
}

function computeTurnTech(pts, distReal) {
  // TurnPerKm = sum(|Δbearing|)/km
  // TurnNorm = clamp((turnPerKm - 120) / 500, 0, 1)
  if (pts.length < 3 || distReal < 30) {
    return { turnPerKm: 0, turnNorm: 0 };
  }

  let turn = 0;
  for (let i = 2; i < pts.length; i++) {
    const br1 = bearing(pts[i - 2], pts[i - 1]);
    const br2 = bearing(pts[i - 1], pts[i]);
    let diff = Math.abs(br2 - br1);
    if (diff > 180) diff = 360 - diff;
    turn += diff;
  }

  const km = distReal / 1000;
  const turnPerKm = km > 0 ? (turn / km) : 0;

  const turnNorm = clamp((turnPerKm - 120) / 500, 0, 1);
  return {
    turnPerKm: Math.round(turnPerKm),
    turnNorm: Math.round(turnNorm * 1000) / 1000,
  };
}

async function terrainScoreForSegment(segPts, opts) {
  const samples = samplePointsEvery(segPts, opts.sampleEveryM);
  const scores = [];

  for (const p of samples) {
    const ts = await terrainScoreAtPoint(p.lat, p.lon, opts);
    if (ts != null) scores.push(ts);
  }

  if (!scores.length) {
    return { terrainScore: opts.terrainFallback, osmConfidence: "low" };
  }

  // robust aggregation: median
  scores.sort((a, b) => a - b);
  const med = scores[Math.floor(scores.length / 2)];
  return { terrainScore: med, osmConfidence: scores.length >= 2 ? "med" : "low" };
}

// -------------------------------
// Public API
// -------------------------------
export async function computeScoreTechV2(points, options = {}) {
  const opts = { ...DEFAULTS, ...options };

  if (!Array.isArray(points) || points.length < 2) {
    throw new Error("computeScoreTechV2: points invalides");
  }

  // normalize & filter
  const pts = points
    .map(p => ({
      lat: Number(p.lat),
      lon: Number(p.lon),
      ele: p.ele == null ? null : Number(p.ele),
    }))
    .filter(p => Number.isFinite(p.lat) && Number.isFinite(p.lon));

  if (pts.length < 2) throw new Error("computeScoreTechV2: pas assez de points valides");

  const ranges = buildSegments(pts, opts.segmentLenM);

  const techVals = [];
  const weights = [];
  const segments = [];

  // For each segment, compute OSM terrain score (cached) + slope + sinu + turns
  for (let i = 0; i < ranges.length; i++) {
    const [aIdx, bIdx] = ranges[i];
    const segPts = pts.slice(aIdx, bIdx + 1);
    if (segPts.length < 2) continue;

    const { distReal, sinuosity, sinuNorm } = computeSinu(segPts);
    if (distReal <= 10) continue;

    const { slopeTech, p10, p16, gP90 } = computeSlopeTech(segPts);
    const { turnPerKm, turnNorm } = computeTurnTech(segPts, distReal);

    const { terrainScore, osmConfidence } = await terrainScoreForSegment(segPts, opts);

    // Tech-sensitive coeff
    const techCoeffV2 = clamp(
      opts.techMin
      + opts.wTerrain * terrainScore
      + opts.wTurn * turnNorm
      + opts.wSinu * sinuNorm
      + opts.wSlope * slopeTech,
      opts.techMin,
      opts.techMax
    );

    techVals.push(techCoeffV2);
    weights.push(distReal);

    segments.push({
      from: aIdx,
      to: bIdx,
      lenM: Math.round(distReal),

      sinuosity: Math.round(sinuosity * 1000) / 1000,
      sinuNorm: Math.round(sinuNorm * 1000) / 1000,

      slopeTech,
      p10,
      p16,
      gP90,

      turnPerKm,
      turnNorm,

      terrainScore: Math.round(terrainScore * 1000) / 1000,
      osmConfidence,

      techCoeffV2: Math.round(techCoeffV2 * 1000) / 1000,
    });
  }

  const techCoeffP75V2 = techVals.length
    ? weightedPercentile(techVals, weights, 0.75)
    : opts.techMin;

  // Convert 0.80..1.80 -> 0..100
  const techScoreV2 = Math.round(100 * clamp((techCoeffP75V2 - opts.techMin) / (opts.techMax - opts.techMin), 0, 1));

  return {
    segmentLenM: opts.segmentLenM,
    techCoeffP75V2: Math.round(techCoeffP75V2 * 1000) / 1000,
    techScoreV2,
    segments,
    meta: {
      preset: "tech-sensitive",
      sampleEveryM: opts.sampleEveryM,
      overpassRadiusM: opts.overpassRadiusM,
      terrainFallback: opts.terrainFallback,
      cacheDir: opts.cacheDir,
      weights: {
        wTerrain: opts.wTerrain,
        wTurn: opts.wTurn,
        wSinu: opts.wSinu,
        wSlope: opts.wSlope,
      },
      clamps: { min: opts.techMin, max: opts.techMax },
    },
  };
}

