// server.js — MTB Points API v4.0
// ✅ ESM + tout intégré (pas de lib/ séparée)
// ✅ CORS correct pour GitHub Pages
// ✅ ScorePhys + IPB (méthodologie officielle)
// ✅ ScoreTech V2 Hybrid (OSM 80% + GPX 20% capé)
// ✅ MRS = 0.55×ScorePhys + 0.45×ScoreTech
// ✅ Barres de surface

import express from "express";
import cors from "cors";

const app = express();
const PORT = process.env.PORT || 3000;

const ALLOWED_ORIGINS = [
  "https://davidpoyade-netizen.github.io",
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  "http://localhost:5500",
  "http://127.0.0.1:5500",
  "http://localhost:5173",
];

app.use(cors({
  origin: (origin, cb) => {
    if (!origin || ALLOWED_ORIGINS.includes(origin)) return cb(null, true);
    console.warn("CORS bloque:", origin);
    return cb(null, false);
  },
  methods: ["GET", "POST", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  credentials: false,
}));
app.options("*", cors());

app.use(express.text({
  type: ["application/gpx+xml", "application/xml", "text/xml", "text/plain"],
  limit: "10mb",
}));
app.use(express.json({ limit: "10mb" }));

app.use((req, _res, next) => {
  console.log(`${req.method} ${req.path} — ${req.headers.origin || "no-origin"}`);
  next();
});

// === UTILS MATH ===
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
const toRad = (d) => (d * Math.PI) / 180;

function haversine(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat/2)**2 + Math.cos(toRad(lat1))*Math.cos(toRad(lat2))*Math.sin(dLon/2)**2;
  return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function bearing(a, b) {
  const y = Math.sin(toRad(b.lon - a.lon)) * Math.cos(toRad(b.lat));
  const x = Math.cos(toRad(a.lat)) * Math.sin(toRad(b.lat)) - Math.sin(toRad(a.lat))*Math.cos(toRad(b.lat))*Math.cos(toRad(b.lon - a.lon));
  let br = Math.atan2(y, x) * 180 / Math.PI;
  if (br < 0) br += 360;
  return br;
}

function weightedPercentile(values, weights, p) {
  const items = values.map((v, i) => ({ v, w: weights[i] ?? 0 })).sort((a, b) => a.v - b.v);
  const total = items.reduce((s, x) => s + x.w, 0);
  if (total <= 0) return null;
  const target = total * p;
  let cum = 0;
  for (const it of items) { cum += it.w; if (cum >= target) return it.v; }
  return items[items.length - 1]?.v ?? null;
}

// === PARSING GPX ===
function parseGpxToPoints(gpxText) {
  const re = /<trkpt\b([^>]*)>([\s\S]*?)<\/trkpt>/gi;
  const points = [];
  let m;
  while ((m = re.exec(gpxText)) !== null) {
    const latM = m[1].match(/\blat="([^"]+)"/i);
    const lonM = m[1].match(/\blon="([^"]+)"/i);
    const eleM = m[2].match(/<ele[^>]*>([\s\S]*?)<\/ele>/i);
    const lat = Number(latM?.[1]);
    const lon = Number(lonM?.[1]);
    const ele = eleM ? Number(eleM[1].trim()) : null;
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    points.push({ lat, lon, ele: Number.isFinite(ele) ? ele : null });
  }
  return points;
}

// === STATS ===
function computeStats(points) {
  let distM = 0, dplus = 0;
  let hasEle = false;
  for (let i = 1; i < points.length; i++) {
    const a = points[i-1], b = points[i];
    const d = haversine(a.lat, a.lon, b.lat, b.lon);
    if (!Number.isFinite(d) || d <= 0) continue;
    distM += d;
    if (a.ele != null && b.ele != null) {
      hasEle = true;
      const de = b.ele - a.ele;
      if (de > 0) dplus += de;
    }
  }
  return { distanceKm: Math.round((distM/1000)*100)/100, dplusM: Math.round(dplus), hasElevation: hasEle };
}

// === SCORE PHYSIQUE (méthodologie officielle) ===
function computeIPB(points) {
  let distTotal = 0, ipbSum = 0;
  for (let i = 1; i < points.length; i++) {
    const a = points[i-1], b = points[i];
    const d = haversine(a.lat, a.lon, b.lat, b.lon);
    if (!Number.isFinite(d) || d < 3 || d > 80) continue;
    distTotal += d;
    const e1 = a.ele == null ? null : Number(a.ele);
    const e2 = b.ele == null ? null : Number(b.ele);
    if (!Number.isFinite(e1) || !Number.isFinite(e2)) continue;
    const de = e2 - e1;
    if (Math.abs(de) > 25) continue;
    const grade = de / d;
    if (!Number.isFinite(grade) || Math.abs(grade) > 0.45) continue;
    const gPct = Math.abs(grade) * 100;
    if (gPct >= 10) ipbSum += d * Math.pow(gPct - 10, 2);
  }
  return distTotal > 0 ? ipbSum / distTotal : 0;
}

function computeScorePhys(points, stats) {
  if (!stats.hasElevation) return { scorePhys: null, ipb: null };
  const D = stats.distanceKm;
  const Hplus = stats.dplusM;
  const ipb = computeIPB(points);
  const effortBase = Math.sqrt(D) + (Hplus / 1000);
  const effortNorm = clamp(effortBase / 10, 0, 1);
  const ipbNorm = clamp(ipb / 120, 0, 1);
  const scorePhys = Math.round(100 * clamp(0.70 * effortNorm + 0.30 * ipbNorm, 0, 1));
  console.log(`  ScorePhys=${scorePhys} D=${D}km H+=${Hplus}m IPB=${ipb.toFixed(1)}`);
  return { scorePhys, ipb: Number(ipb.toFixed(2)), effortBase, effortNorm, ipbNorm };
}

// === GPXTECH (bonus GPX, méthodologie officielle) ===
function computeGPXTech(points) {
  const SEG = 200;
  const segs = [];
  let buf = [points[0]], acc = 0;
  for (let i = 1; i < points.length; i++) {
    const d = haversine(points[i-1].lat, points[i-1].lon, points[i].lat, points[i].lon);
    buf.push(points[i]);
    acc += d;
    if (acc >= SEG || i === points.length - 1) {
      segs.push({ pts: buf, len: acc });
      buf = [points[i]]; acc = 0;
    }
  }

  const vals = [], wts = [];
  for (const { pts, len } of segs) {
    if (pts.length < 3 || len < 50) continue;

    // SlopeTech
    const grades = [];
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i-1], b = pts[i];
      const d = haversine(a.lat, a.lon, b.lat, b.lon);
      if (d < 3 || d > 80) continue;
      if (a.ele == null || b.ele == null) continue;
      const de = b.ele - a.ele;
      if (Math.abs(de) > 25) continue;
      const g = Math.abs(de / d);
      if (g > 0.45) continue;
      grades.push(g);
    }
    let slopeTech = 0;
    if (grades.length > 0) {
      grades.sort((a, b) => a - b);
      const p10 = grades.filter(g => g >= 0.10).length / grades.length;
      const p16 = grades.filter(g => g >= 0.16).length / grades.length;
      const gP90 = grades[Math.min(Math.floor(grades.length * 0.90), grades.length - 1)];
      slopeTech = clamp(0.55*p10 + 0.45*p16 + 0.55*clamp((gP90 - 0.08)/0.22, 0, 1), 0, 1);
    }

    // TurnNorm
    let turnSum = 0;
    for (let i = 2; i < pts.length; i++) {
      const p0 = pts[i-2], p1 = pts[i-1], p2 = pts[i];
      const d01 = haversine(p0.lat, p0.lon, p1.lat, p1.lon);
      const d12 = haversine(p1.lat, p1.lon, p2.lat, p2.lon);
      if (d01 < 3 || d01 > 80 || d12 < 3 || d12 > 80) continue;
      let diff = Math.abs(bearing(p0, p1) - bearing(p1, p2));
      if (diff > 180) diff = 360 - diff;
      turnSum += diff;
    }
    const turnNorm = clamp((len > 0 ? turnSum/(len/1000) : 0 - 120) / 500, 0, 1);

    // SinuNorm
    let realD = 0;
    for (let i = 1; i < pts.length; i++) realD += haversine(pts[i-1].lat, pts[i-1].lon, pts[i].lat, pts[i].lon);
    const directD = haversine(pts[0].lat, pts[0].lon, pts[pts.length-1].lat, pts[pts.length-1].lon);
    const sinuNorm = clamp((realD / Math.max(directD, 1) - 1.0) / 0.30, 0, 1);

    vals.push(clamp(0.45*slopeTech + 0.35*turnNorm + 0.20*sinuNorm, 0, 1));
    wts.push(len);
  }

  if (vals.length === 0) return 0;
  return Number((weightedPercentile(vals, wts, 0.75) ?? 0).toFixed(4));
}

// === OSM TERRAIN SCORE ===
function tagsToTerrainScore(tags) {
  if (tags["mtb:scale"] != null) {
    const s = Number(tags["mtb:scale"]);
    if (Number.isFinite(s)) return clamp(s / 5, 0, 1);
  }
  const sm = { excellent: 0.0, good: 0.05, intermediate: 0.15, bad: 0.35, very_bad: 0.50, horrible: 0.65, very_horrible: 0.80, impassable: 1.0 };
  if (tags.smoothness && sm[tags.smoothness] != null) return sm[tags.smoothness];
  const hw = tags.highway || "", tt = tags.tracktype || "", surf = tags.surface || "";
  let base = 0.3;
  if (["motorway","trunk","primary","secondary","tertiary","residential","service"].includes(hw)) base = 0.05;
  else if (surf === "asphalt" || surf === "concrete" || surf === "paved") base = 0.0;
  else if (hw === "track") {
    const tt_map = { grade1: 0.20, grade2: 0.35, grade3: 0.50, grade4: 0.65, grade5: 0.80 };
    base = tt_map[tt] ?? 0.35;
  } else if (["path","footway","bridleway"].includes(hw)) base = 0.60;
  if (["rock","stone","sett"].includes(surf)) base = clamp(base + 0.20, 0, 1);
  else if (["sand","mud"].includes(surf)) base = clamp(base + 0.15, 0, 1);
  else if (["grass","dirt","earth"].includes(surf)) base = clamp(base + 0.10, 0, 1);
  return clamp(base, 0, 1);
}

function samplePoints(points, everyM) {
  const s = [points[0]];
  let acc = 0;
  for (let i = 1; i < points.length; i++) {
    acc += haversine(points[i-1].lat, points[i-1].lon, points[i].lat, points[i].lon);
    if (acc >= everyM) { s.push(points[i]); acc = 0; }
  }
  if (s[s.length-1] !== points[points.length-1]) s.push(points[points.length-1]);
  return s;
}

async function fetchOsmTags(lat, lon, r, tSec) {
  const q = `[out:json][timeout:${tSec}];(way(around:${r},${lat},${lon}););out tags;`;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), tSec * 1000);
  try {
    const res = await fetch("https://overpass-api.de/api/interpreter", {
      method: "POST",
      body: `data=${encodeURIComponent(q)}`,
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      signal: ctrl.signal,
    });
    clearTimeout(t);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    return data.elements?.[0]?.tags ?? null;
  } catch (e) {
    clearTimeout(t);
    throw e;
  }
}

async function computeTerrainScoreOSM(points, opts) {
  const samples = samplePoints(points, opts.osmSampleEveryM);
  console.log(`  OSM: ${samples.length} points a interroger`);
  const CONC = opts.overpassConcurrency || 3;
  const results = [];
  for (let i = 0; i < samples.length; i += CONC) {
    const batch = samples.slice(i, i + CONC);
    const br = await Promise.all(batch.map(async pt => {
      try {
        const tags = await fetchOsmTags(pt.lat, pt.lon, opts.overpassRadiusM, opts.overpassTimeoutSec);
        return tags === null ? { ts: null } : { ts: tagsToTerrainScore(tags) };
      } catch { return { ts: null }; }
    }));
    results.push(...br);
    if (i + CONC < samples.length) await new Promise(r => setTimeout(r, 200));
  }
  const matched = results.filter(r => r.ts !== null);
  const coverage = matched.length / results.length;
  console.log(`  OSM coverage: ${(coverage*100).toFixed(0)}% (${matched.length}/${results.length})`);
  if (coverage < opts.minCoverage) return { terrainScore: null, coverage };
  const terrainScore = weightedPercentile(matched.map(r => r.ts), matched.map(() => 1), 0.75);
  return { terrainScore, coverage };
}

async function computeScoreTechV2(points, opts) {
  const gpxTech = computeGPXTech(points);
  console.log(`  GPXTech bonus: ${gpxTech.toFixed(3)}`);
  const osmResult = await computeTerrainScoreOSM(points, opts);
  if (osmResult.terrainScore === null) return { techScore: null, gpxTech, terrainScoreOSM: null, coverage: osmResult.coverage };
  const T = osmResult.terrainScore;
  const base  = 0.80 * T;
  const bonus = Math.min(0.20 * gpxTech, 0.15);
  const techScore = Math.round(100 * clamp(base + bonus, 0, 1));
  console.log(`  ScoreTech V2: ${techScore} (OSM=${(base*100).toFixed(1)}, bonus=${(bonus*100).toFixed(1)})`);
  return { techScore, gpxTech, terrainScoreOSM: T, coverage: osmResult.coverage, base, bonus };
}

function computeSurfaceEstimate(T) {
  if (T == null) return null;
  if (T <= 0.10) return { roadPct: 85, trackPct: 10, singlePct: 5 };
  if (T <= 0.25) return { roadPct: 40, trackPct: 50, singlePct: 10 };
  if (T <= 0.45) return { roadPct: 15, trackPct: 60, singlePct: 25 };
  if (T <= 0.65) return { roadPct: 5,  trackPct: 40, singlePct: 55 };
  return             { roadPct: 2,  trackPct: 20, singlePct: 78 };
}

function validateGpx(points, stats) {
  if (!points || points.length < 2) return { ok: false, error: "Aucun point <trkpt> exploitable." };
  if (!stats.hasElevation) return { ok: false, error: "GPX sans altitude (<ele>)." };
  if (points.length < 30) return { ok: false, error: `Trop peu de points: ${points.length} (min 30).` };
  if (stats.distanceKm < 3.0) return { ok: false, error: `Distance trop faible: ${stats.distanceKm} km (min 3 km).` };
  return { ok: true };
}

// === ROUTES ===
app.get(["/", "/health", "/_health", "/api/health"], (_req, res) => {
  res.json({ ok: true, service: "MTB Points API", version: "4.0.0", timestamp: new Date().toISOString() });
});

app.get(["/api/analyze-gpx", "/api/analyze-gpx-lite"], (_req, res) => {
  res.status(405).json({ ok: false, error: "Utilise POST." });
});

app.post("/api/analyze-gpx-lite", (req, res) => {
  try {
    const gpxText = typeof req.body === "string" ? req.body : "";
    if (!gpxText || gpxText.length < 50) return res.status(400).json({ ok: false, error: "GPX vide." });
    const points = parseGpxToPoints(gpxText);
    const stats  = computeStats(points);
    const v = validateGpx(points, stats);
    if (!v.ok) return res.status(400).json({ ok: false, error: v.error });
    const phys = computeScorePhys(points, stats);
    return res.json({ ok: true, points, scores: { physScore: phys.scorePhys, techScore: null, globalScore: null, ipb: phys.ipb }, tech: { osmOk: false, surfaceEstimate: null }, meta: { pointsCount: points.length, stats } });
  } catch (e) { return res.status(500).json({ ok: false, error: e.message }); }
});

app.post("/api/analyze-gpx", async (req, res) => {
  const t0 = Date.now();
  try {
    const gpxText = typeof req.body === "string" ? req.body : "";
    if (!gpxText || gpxText.length < 50) return res.status(400).json({ ok: false, error: "GPX vide." });
    console.log(`\nAnalyse GPX ${gpxText.length} bytes...`);

    const points = parseGpxToPoints(gpxText);
    console.log(`${points.length} points`);
    const stats = computeStats(points);
    console.log(`${stats.distanceKm}km D+${stats.dplusM}m`);

    const v = validateGpx(points, stats);
    if (!v.ok) return res.status(400).json({ ok: false, error: v.error });

    const phys = computeScorePhys(points, stats);

    const OSM_OPTS = { osmSampleEveryM: 300, overpassRadiusM: 20, minCoverage: 0.20, overpassTimeoutSec: 12, overpassConcurrency: 3 };
    let techResult = { techScore: null, gpxTech: 0, terrainScoreOSM: null, coverage: 0 };
    let osmOk = false;
    try {
      techResult = await Promise.race([
        computeScoreTechV2(points, OSM_OPTS),
        new Promise((_, rej) => setTimeout(() => rej(new Error("OSM timeout 30s")), 30000)),
      ]);
      osmOk = techResult.techScore != null;
    } catch (e) {
      console.warn("OSM echoue:", e.message);
      techResult.gpxTech = computeGPXTech(points);
    }

    const globalScore = phys.scorePhys != null && techResult.techScore != null
      ? Math.round(0.55 * phys.scorePhys + 0.45 * techResult.techScore)
      : null;

    if (globalScore != null) console.log(`MRS=${globalScore} Phys=${phys.scorePhys} Tech=${techResult.techScore}`);

    return res.json({
      ok: true,
      points,
      scores: {
        physScore: phys.scorePhys,
        techScore: techResult.techScore,
        globalScore,
        ipb: phys.ipb,
        physDetails: { distanceKm: stats.distanceKm, dplusM: stats.dplusM, ipb: phys.ipb, effortBase: phys.effortBase, effortNorm: phys.effortNorm, ipbNorm: phys.ipbNorm },
        techDetails: { gpxTech: techResult.gpxTech, terrainScoreOSM: techResult.terrainScoreOSM, osmCoverage: techResult.coverage, base: techResult.base, bonus: techResult.bonus },
        formula: { scorePhys: "0.70xEffortNorm + 0.30xIPB_norm", scoreTech: "0.80xOSM + min(0.20xGPX, 0.15)", mrs: "0.55xScorePhys + 0.45xScoreTech" },
      },
      tech: { osmOk, surfaceEstimate: computeSurfaceEstimate(techResult.terrainScoreOSM) },
      meta: { ms: Date.now() - t0, pointsCount: points.length, stats },
    });
  } catch (e) {
    console.error("Erreur:", e.message);
    return res.status(500).json({ ok: false, error: e.message });
  }
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`MTB Points API v4.0 — port ${PORT}`);
  console.log("CORS autorise:", ALLOWED_ORIGINS.join(", "));
});
