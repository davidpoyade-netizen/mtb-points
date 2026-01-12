// scoretech_v2_osm.js
// MTB Points — ScoreTech V2 OFFICIEL (Hybrid obligatoire)
// Node 18+ (fetch natif)
//
// TechScore = OSM socle + bonus GPX capé
// - TerrainScore_OSM : 0..1 (P75 pondéré par distance échantillonnée)
// - GPXTech : 0..1 (P75 pondéré par longueur segment), calculé depuis GPX:
//      slopeTech (p10/p16/gP90) + turnNorm + sinuNorm (anti-bruit)
// - ScoreTech (0..100):
//      tech01 = clamp(W_OSM*TerrainScore_OSM + min(W_GPX*GPXTech, BONUS_CAP), 0, 1)
//      ScoreTech = round(100*tech01)
//
// Si couverture OSM insuffisante => techScoreV2 = null (à valider)
//
// Cache OSM sur disque: .cache/osm

import fs from "node:fs";
import path from "node:path";

function clamp(n, a, b) { return Math.max(a, Math.min(b, n)); }
function toRad(deg) { return (deg * Math.PI) / 180; }

function safeReadJson(fp) {
  try { return JSON.parse(fs.readFileSync(fp, "utf8")); } catch { return null; }
}
function safeWriteJson(fp, obj) {
  try { fs.writeFileSync(fp, JSON.stringify(obj, null, 2), "utf8"); } catch { /* ignore */ }
}
function ensureDir(dir) { fs.mkdirSync(dir, { recursive: true }); }

function cacheKey(lat, lon, r) {
  // précision suffisante pour cache + éviter explosion fichiers
  return `${lat.toFixed(5)}_${lon.toFixed(5)}_r${r}`;
}

// Haversine distance (meters)
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

// Bearing degrees 0..360
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
  if (total <= 0) return null;
  const target = total * p;
  let cum = 0;
  for (const it of items) {
    cum += it.w;
    if (cum >= target) return it.v;
  }
  return items.length ? items[items.length - 1].v : null;
}

// -------------------------------
// Defaults (OFFICIEL HYBRID)
// -------------------------------
const DEFAULTS = {
  // OSM sampling along track
  osmSampleEveryM: 300,         // ✅ moins agressif que 120
  overpassRadiusM: 20,
  osmPercentile: 0.75,
  minCoverage: 0.20,            // ✅ plus tolérant (tu peux remonter ensuite)

  // Overpass perf
  overpassTimeoutSec: 12,       // ✅ [timeout:12]
  fetchTimeoutMs: 12000,        // ✅ AbortController
  overpassConcurrency: 5,       // ✅ parallélisation limitée

  // GPX segmentation for bonus
  gpxSegmentLenM: 200,
  gpxPercentile: 0.75,

  // Bonus cap (absolute, in 0..1 space)
  BONUS_CAP: 0.15,

  // Hybrid weights
  W_OSM: 0.80,
  W_GPX: 0.20,

  // GPXTech internal weights (0..1)
  gpxW_slope: 0.45,
  gpxW_turn: 0.35,
  gpxW_sinu: 0.20,

  // Anti-bruit thresholds (GPX)
  minStepM: 3,
  maxStepM: 80,
  maxDeltaEleM: 25,
  maxAbsGrade: 0.45,

  // Cache / UA
  cacheDir: ".cache/osm",
  userAgent: "MTBPoints/1.0 (ScoreTechV2-Hybrid-Official)",
};

// -------------------------------
// OSM (Overpass)
// -------------------------------
async function overpassFetch(query, opts) {
  const url = "https://overpass-api.de/api/interpreter";

  // Timeout réseau (AbortController)
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), opts.fetchTimeoutMs);

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded;charset=UTF-8",
        "user-agent": opts.userAgent,
      },
      body: `data=${encodeURIComponent(query)}`,
      signal: ctrl.signal,
    });

    if (!res.ok) throw new Error(`Overpass HTTP ${res.status}`);
    return await res.json();
  } catch (e) {
    if (e?.name === "AbortError") throw new Error(`Overpass fetch timeout (${opts.fetchTimeoutMs}ms)`);
    throw e;
  } finally {
    clearTimeout(t);
  }
}

function pickBestTags(osmJson) {
  const els = osmJson?.elements ?? [];
  for (const el of els) {
    if (el.type !== "way") continue;
    const t = el.tags || {};
    // highway est quasi obligatoire ici ; on garde aussi surface/smoothness/tracktype/mtb:scale
    if (t.highway || t.surface || t.smoothness || t.tracktype || t["mtb:scale"] || t.sac_scale) return t;
  }
  return null;
}

function normalizeSurfaceBucket(tags) {
  // Pour un petit "surfaceEstimate" (road/track/single)
  const hw = tags?.highway ? String(tags.highway).toLowerCase() : "";
  const surface = tags?.surface ? String(tags.surface).toLowerCase() : "";
  const tracktype = tags?.tracktype ? String(tags.tracktype).toLowerCase() : "";

  const roadish = ["motorway","trunk","primary","secondary","tertiary","unclassified","residential","service","living_street","cycleway"];
  if (roadish.includes(hw) || surface === "asphalt" || surface === "paved") return "road";

  if (hw === "track") return "track";
  if (["path","footway","bridleway","singletrack"].includes(hw)) return "single";

  // fallback via tracktype
  if (tracktype && hw === "track") return "track";

  return null;
}

function terrainScoreFromTags(tags) {
  if (!tags) return null;

  // 1) mtb:scale
  const mtb = tags["mtb:scale"];
  if (mtb != null && mtb !== "") {
    const v = Number(String(mtb).split(";")[0]);
    if (Number.isFinite(v)) return clamp(v / 5, 0, 1);
  }

  // 2) smoothness
  const sm = tags.smoothness ? String(tags.smoothness).toLowerCase() : "";
  if (sm) {
    if (sm === "excellent") return 0.20;
    if (sm === "good") return 0.30;
    if (sm === "intermediate") return 0.50;
    if (sm === "bad") return 0.70;
    if (["very_bad", "horrible", "very_horrible", "impassable"].includes(sm)) return 0.90;
  }

  // 3) highway / surface / tracktype / sac_scale
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

  if (sac) {
    if (["demanding_mountain_hiking","alpine_hiking"].includes(sac)) return 0.80;
    if (["difficult_alpine_hiking"].includes(sac)) return 0.90;
  }

  if (["gravel","fine_gravel","compacted"].includes(surface)) return 0.25;
  if (["ground","dirt","earth","grass"].includes(surface)) return 0.45;
  if (["rock","stone","boulders","scree"].includes(surface)) return 0.85;

  return null;
}

async function terrainScoreAtPoint(lat, lon, opts) {
  ensureDir(opts.cacheDir);
  const key = cacheKey(lat, lon, opts.overpassRadiusM);
  const fp = path.join(opts.cacheDir, `${key}.json`);

  const cached = fs.existsSync(fp) ? safeReadJson(fp) : null;
  if (cached && Object.prototype.hasOwnProperty.call(cached, "terrainScore")) {
    return {
      terrainScore: cached.terrainScore ?? null,
      tags: cached.tags ?? null,
      surfaceBucket: cached.surfaceBucket ?? null,
      cached: true,
    };
  }

  const q = `
[out:json][timeout:${opts.overpassTimeoutSec}];
(
  way(around:${opts.overpassRadiusM},${lat},${lon})["highway"];
);
out tags 10;
`;

  try {
    const json = await overpassFetch(q, opts);
    const tags = pickBestTags(json);
    const terrainScore = terrainScoreFromTags(tags);
    const surfaceBucket = tags ? normalizeSurfaceBucket(tags) : null;

    safeWriteJson(fp, { terrainScore, tags, surfaceBucket });
    return { terrainScore, tags, surfaceBucket, cached: false };
  } catch (e) {
    safeWriteJson(fp, { terrainScore: null, error: String(e?.message || e) });
    return { terrainScore: null, tags: null, surfaceBucket: null, cached: false };
  }
}

// -------------------------------
// OSM sampling along polyline
// -------------------------------
function samplePointsEveryMeters(points, stepM) {
  const sampled = [];
  if (!points.length) return sampled;
  sampled.push({ ...points[0], _w: 0 });

  let acc = 0;
  for (let i = 1; i < points.length; i++) {
    const d = haversine(points[i - 1].lat, points[i - 1].lon, points[i].lat, points[i].lon);
    if (!Number.isFinite(d) || d <= 0) continue;
    acc += d;
    if (acc >= stepM) {
      sampled.push({ ...points[i], _w: acc });
      acc = 0;
    }
  }

  const last = points[points.length - 1];
  const prev = sampled[sampled.length - 1];
  if (!prev || prev.lat !== last.lat || prev.lon !== last.lon) {
    sampled.push({ ...last, _w: Math.max(1, acc) });
  }

  if (sampled.length) sampled[0]._w = stepM / 2;
  return sampled;
}

// petit pool de promesses (concurrency limitée)
async function mapLimit(items, limit, mapper) {
  const results = new Array(items.length);
  let i = 0;

  const workers = new Array(Math.max(1, limit)).fill(0).map(async () => {
    while (i < items.length) {
      const idx = i++;
      results[idx] = await mapper(items[idx], idx);
    }
  });

  await Promise.all(workers);
  return results;
}

async function computeTerrainScoreOSM(points, opts) {
  const samples = samplePointsEveryMeters(points, opts.osmSampleEveryM);

  const vals = [];
  const weights = [];
  const debug = [];

  let matched = 0;

  // Parallélisation limitée (énorme gain vs await séquentiel)
  const out = await mapLimit(
    samples,
    opts.overpassConcurrency,
    async (s, idx) => {
      const r = await terrainScoreAtPoint(s.lat, s.lon, opts);
      const w = Math.max(1, s._w || opts.osmSampleEveryM);
      return { idx, s, w, ...r };
    }
  );

  // surface estimate simple
  const surfaceCounts = { road: 0, track: 0, single: 0 };
  let surfaceN = 0;

  for (const item of out) {
    const { idx, s, w, terrainScore, surfaceBucket } = item;

    const matchedBool = terrainScore != null;
    if (matchedBool) {
      matched++;
      vals.push(terrainScore);
      weights.push(w);
    }

    if (surfaceBucket && surfaceCounts[surfaceBucket] != null) {
      surfaceCounts[surfaceBucket] += 1;
      surfaceN += 1;
    }

    debug.push({
      idx,
      lat: Number(s.lat.toFixed(6)),
      lon: Number(s.lon.toFixed(6)),
      weightM: Math.round(w),
      terrainScore: terrainScore == null ? null : Number(terrainScore.toFixed(3)),
      matched: matchedBool,
      surface: surfaceBucket || null,
      cached: !!item.cached,
    });
  }

  const coverage = samples.length ? (matched / samples.length) : 0;

  let surfaceEstimate = null;
  if (surfaceN > 0) {
    surfaceEstimate = {
      road: Number((surfaceCounts.road / surfaceN).toFixed(3)),
      track: Number((surfaceCounts.track / surfaceN).toFixed(3)),
      single: Number((surfaceCounts.single / surfaceN).toFixed(3)),
      n: surfaceN,
    };
  }

  if (coverage < opts.minCoverage || vals.length < 3) {
    return {
      ok: false,
      coverage: Number(coverage.toFixed(3)),
      terrainScoreP: null,
      reason: "OSM coverage too low",
      samples: debug,
      surfaceEstimate,
    };
  }

  const p = weightedPercentile(vals, weights, opts.osmPercentile);
  const terrainScoreP = p == null ? null : clamp(p, 0, 1);

  return {
    ok: terrainScoreP != null,
    coverage: Number(coverage.toFixed(3)),
    terrainScoreP: terrainScoreP == null ? null : Number(terrainScoreP.toFixed(3)),
    reason: null,
    samples: debug,
    surfaceEstimate,
  };
}

// -------------------------------
// GPX bonus (anti-bruit)
// -------------------------------
function buildSegments(points, segmentLenM) {
  const ranges = [];
  let start = 0;
  let acc = 0;

  for (let i = 1; i < points.length; i++) {
    const d = haversine(points[i - 1].lat, points[i - 1].lon, points[i].lat, points[i].lon);
    if (!Number.isFinite(d) || d <= 0) continue;
    acc += d;
    if (acc >= segmentLenM) {
      ranges.push([start, i]);
      start = i;
      acc = 0;
    }
  }
  if (start < points.length - 1) ranges.push([start, points.length - 1]);
  return ranges;
}

function computeSinuNorm(segPts) {
  let distReal = 0;
  for (let i = 1; i < segPts.length; i++) {
    const d = haversine(segPts[i - 1].lat, segPts[i - 1].lon, segPts[i].lat, segPts[i].lon);
    if (d > 0) distReal += d;
  }
  const direct = haversine(segPts[0].lat, segPts[0].lon, segPts[segPts.length - 1].lat, segPts[segPts.length - 1].lon);
  const sinuosity = distReal / Math.max(direct, 1);
  const sinuNorm = clamp((sinuosity - 1.0) / 0.30, 0, 1);
  return { distReal, sinuosity, sinuNorm };
}

function computeSlopeTech(segPts, opts) {
  const absGrades = [];
  let n = 0, c10 = 0, c16 = 0;

  for (let i = 1; i < segPts.length; i++) {
    const a = segPts[i - 1], b = segPts[i];

    const d = haversine(a.lat, a.lon, b.lat, b.lon);
    if (!Number.isFinite(d) || d < opts.minStepM || d > opts.maxStepM) continue;

    const e1 = a.ele == null ? null : Number(a.ele);
    const e2 = b.ele == null ? null : Number(b.ele);
    if (!Number.isFinite(e1) || !Number.isFinite(e2)) continue;

    const de = e2 - e1;
    if (Math.abs(de) > opts.maxDeltaEleM) continue;

    const grade = de / d;
    const ag = Math.abs(grade);
    if (ag > opts.maxAbsGrade) continue;

    absGrades.push(ag);
    if (ag >= 0.10) c10++;
    if (ag >= 0.16) c16++;
    n++;
  }

  if (n === 0) return { slopeTech: 0, p10: 0, p16: 0, gP90: 0, used: 0 };

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
    used: n,
  };
}

function computeTurnNorm(segPts, distReal, opts) {
  if (segPts.length < 3 || distReal < 30) return { turnPerKm: 0, turnNorm: 0, used: 0 };

  let turn = 0;
  let used = 0;

  for (let i = 2; i < segPts.length; i++) {
    const p0 = segPts[i - 2], p1 = segPts[i - 1], p2 = segPts[i];

    const d01 = haversine(p0.lat, p0.lon, p1.lat, p1.lon);
    const d12 = haversine(p1.lat, p1.lon, p2.lat, p2.lon);

    if (!Number.isFinite(d01) || !Number.isFinite(d12)) continue;
    if (d01 < opts.minStepM || d01 > opts.maxStepM) continue;
    if (d12 < opts.minStepM || d12 > opts.maxStepM) continue;

    const br1 = bearing(p0, p1);
    const br2 = bearing(p1, p2);
    let diff = Math.abs(br2 - br1);
    if (diff > 180) diff = 360 - diff;

    turn += diff;
    used++;
  }

  const km = distReal / 1000;
  const turnPerKm = km > 0 ? (turn / km) : 0;

  const turnNorm = clamp((turnPerKm - 120) / 500, 0, 1);

  return {
    turnPerKm: Math.round(turnPerKm),
    turnNorm: Math.round(turnNorm * 1000) / 1000,
    used,
  };
}

function computeGPXBonus(points, opts) {
  const ranges = buildSegments(points, opts.gpxSegmentLenM);

  const vals = [];
  const weights = [];
  const debug = [];

  for (let i = 0; i < ranges.length; i++) {
    const [aIdx, bIdx] = ranges[i];
    const segPts = points.slice(aIdx, bIdx + 1);
    if (segPts.length < 2) continue;

    const { distReal, sinuosity, sinuNorm } = computeSinuNorm(segPts);
    if (distReal <= 10) continue;

    const slope = computeSlopeTech(segPts, opts);
    const turn = computeTurnNorm(segPts, distReal, opts);

    const gpxTechSeg = clamp(
      opts.gpxW_slope * slope.slopeTech +
      opts.gpxW_turn * turn.turnNorm +
      opts.gpxW_sinu * sinuNorm,
      0, 1
    );

    vals.push(gpxTechSeg);
    weights.push(distReal);

    debug.push({
      from: aIdx,
      to: bIdx,
      lenM: Math.round(distReal),
      sinuosity: Math.round(sinuosity * 1000) / 1000,
      sinuNorm: Math.round(sinuNorm * 1000) / 1000,
      slopeTech: slope.slopeTech,
      p10: slope.p10,
      p16: slope.p16,
      gP90: slope.gP90,
      slopeUsedSteps: slope.used,
      turnPerKm: turn.turnPerKm,
      turnNorm: turn.turnNorm,
      turnUsedTriples: turn.used,
      gpxTechSeg: Math.round(gpxTechSeg * 1000) / 1000,
    });
  }

  const p = vals.length ? weightedPercentile(vals, weights, opts.gpxPercentile) : null;
  const gpxTechP = p == null ? 0 : clamp(p, 0, 1);

  return {
    gpxTechP: Number(gpxTechP.toFixed(3)),
    segments: debug,
  };
}

// -------------------------------
// Public API
// -------------------------------
export async function computeScoreTechV2(points, options = {}) {
  const opts = { ...DEFAULTS, ...options };

  if (!Array.isArray(points) || points.length < 2) {
    throw new Error("computeScoreTechV2(Hybrid): points invalides");
  }

  // normalize
  const pts = points
    .map(p => ({
      lat: Number(p.lat),
      lon: Number(p.lon),
      ele: p.ele == null ? null : Number(p.ele),
    }))
    .filter(p => Number.isFinite(p.lat) && Number.isFinite(p.lon));

  if (pts.length < 2) throw new Error("computeScoreTechV2(Hybrid): pas assez de points valides");

  // 1) OSM socle (obligatoire)
  const osm = await computeTerrainScoreOSM(pts, opts);
  if (!osm.ok) {
    return {
      techScoreV2: null,
      reason: osm.reason,
      coverage: osm.coverage,
      terrainScoreP75: null,
      gpxTechP75: null,
      bonusApplied: 0,
      tech01: null,
      details: {
        osmSamples: osm.samples,
        gpxSegments: [],
      },
      // surface estimate (si dispo)
      surfaceEstimate: osm.surfaceEstimate ?? null,
      meta: {
        mode: "HYBRID_OFFICIAL",
        osm: {
          sampleEveryM: opts.osmSampleEveryM,
          overpassRadiusM: opts.overpassRadiusM,
          percentile: opts.osmPercentile,
          minCoverage: opts.minCoverage,
          cacheDir: opts.cacheDir,
          overpassTimeoutSec: opts.overpassTimeoutSec,
          fetchTimeoutMs: opts.fetchTimeoutMs,
          concurrency: opts.overpassConcurrency,
        },
        gpxBonus: {
          segmentLenM: opts.gpxSegmentLenM,
          percentile: opts.gpxPercentile,
          filters: {
            minStepM: opts.minStepM,
            maxStepM: opts.maxStepM,
            maxDeltaEleM: opts.maxDeltaEleM,
            maxAbsGrade: opts.maxAbsGrade,
          },
        },
        hybrid: {
          W_OSM: opts.W_OSM,
          W_GPX: opts.W_GPX,
          BONUS_CAP: opts.BONUS_CAP,
        },
      },
    };
  }

  // 2) Bonus GPX (capé)
  const gpx = computeGPXBonus(pts, opts);

  const terrainScoreP75 = Number(osm.terrainScoreP.toFixed(3)); // 0..1
  const gpxTechP75 = Number(gpx.gpxTechP.toFixed(3));          // 0..1

  const base = opts.W_OSM * terrainScoreP75;           // 0..0.80
  const rawBonus = opts.W_GPX * gpxTechP75;            // 0..0.20
  const bonusApplied = Math.min(rawBonus, opts.BONUS_CAP);

  const tech01 = clamp(base + bonusApplied, 0, 1);
  const techScoreV2 = Math.round(100 * tech01);

  return {
    techScoreV2,
    reason: null,
    coverage: osm.coverage,
    terrainScoreP75,
    gpxTechP75,
    bonusApplied: Number(bonusApplied.toFixed(3)),
    tech01: Number(tech01.toFixed(3)),
    details: {
      osmSamples: osm.samples,
      gpxSegments: gpx.segments,
    },
    surfaceEstimate: osm.surfaceEstimate ?? null,
    meta: {
      mode: "HYBRID_OFFICIAL",
      osm: {
        sampleEveryM: opts.osmSampleEveryM,
        overpassRadiusM: opts.overpassRadiusM,
        percentile: opts.osmPercentile,
        minCoverage: opts.minCoverage,
        cacheDir: opts.cacheDir,
        overpassTimeoutSec: opts.overpassTimeoutSec,
        fetchTimeoutMs: opts.fetchTimeoutMs,
        concurrency: opts.overpassConcurrency,
      },
      gpxBonus: {
        segmentLenM: opts.gpxSegmentLenM,
        percentile: opts.gpxPercentile,
        weights: {
          slope: opts.gpxW_slope,
          turn: opts.gpxW_turn,
          sinu: opts.gpxW_sinu,
        },
        filters: {
          minStepM: opts.minStepM,
          maxStepM: opts.maxStepM,
          maxDeltaEleM: opts.maxDeltaEleM,
          maxAbsGrade: opts.maxAbsGrade,
        },
      },
      hybrid: {
        W_OSM: opts.W_OSM,
        W_GPX: opts.W_GPX,
        BONUS_CAP: opts.BONUS_CAP,
      },
    },
  };
}
