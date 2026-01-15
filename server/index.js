// server/index.js
// MTB Points — API GPX/OSM (Render)
// - POST /api/analyze-gpx        => GPX + OSM (hybrid) avec timeout + fallback
// - POST /api/analyze-gpx-lite   => GPX-only (debug/backup)
// - Validation stricte: altitude obligatoire + distance mini 3 km

import express from "express";
import cors from "cors";

import { parseGpxToPoints } from "./lib/parseGpx.js";
import { computeStatsFromPoints } from "./lib/stats.js";
import { inferDiscipline } from "./lib/discipline.js";
import { computeSurfaceEstimateFromOsmSamples } from "./lib/surfaceEstimate.js";

import { computeScoreTechV2 } from "./scoretech_v2_osm.js";

const app = express();

/* ----------------------------- helpers ----------------------------- */

function withTimeout(promise, ms, label = "timeout") {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`${label} after ${ms}ms`)), ms);
    promise.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      }
    );
  });
}

function isNetworkishError(msg) {
  return /overpass|timeout|fetch|network|socket|ECONNRESET|ETIMEDOUT|ENOTFOUND|EAI_AGAIN/i.test(
    String(msg || "")
  );
}

function validateGpx(points, stats) {
  // --- critères MTB Points (stricts) ---
  const MIN_DISTANCE_KM = 3.0;      // ✅ demandé
  const MIN_POINTS = 30;
  const MIN_ELE_RATIO = 0.80;       // 80% des points doivent avoir <ele>
  const MIN_PTS_PER_KM = 5;         // densité minimale
  const MIN_DPLUS_M = 10;           // optionnel mais utile contre "plat"

  if (!points || points.length < 2) {
    return { ok: false, status: 400, error: "Aucun point <trkpt> exploitable." };
  }

  if (!stats?.hasElevation) {
    return {
      ok: false,
      status: 400,
      error:
        "GPX sans altitude (<ele>) : refusé. Exporte un GPX avec élévation (baro/GPS), pas un tracé 'dessiné'.",
    };
  }

  const totalPts = points.length;
  const elePts = points.reduce((n, p) => (Number.isFinite(Number(p?.ele)) ? n + 1 : n), 0);
  const eleRatio = totalPts ? elePts / totalPts : 0;

  if (eleRatio < MIN_ELE_RATIO) {
    return {
      ok: false,
      status: 400,
      error: `Altitude insuffisante: ${Math.round(eleRatio * 100)}% de points avec <ele> (min ${Math.round(
        MIN_ELE_RATIO * 100
      )}%).`,
    };
  }

  if (totalPts < MIN_POINTS) {
    return {
      ok: false,
      status: 400,
      error: `GPX trop court/peu précis: ${totalPts} points (min ${MIN_POINTS}).`,
    };
  }

  const distKm = Number(stats?.distanceKm ?? 0);
  if (!Number.isFinite(distKm) || distKm < MIN_DISTANCE_KM) {
    return {
      ok: false,
      status: 400,
      error: `Distance trop faible: ${distKm.toFixed(2)} km (min ${MIN_DISTANCE_KM.toFixed(1)} km).`,
    };
  }

  // Densité de points (anti 10 km / 12 points)
  const density = distKm > 0 ? totalPts / distKm : totalPts;
  if (density < MIN_PTS_PER_KM) {
    return {
      ok: false,
      status: 400,
      error: `GPX trop peu échantillonné: ${density.toFixed(1)} pts/km (min ${MIN_PTS_PER_KM} pts/km).`,
    };
  }

  // Optionnel mais recommandé: refuse les GPX "plats" suspects
  const dplus = Number(stats?.dplusM ?? 0);
  if (!Number.isFinite(dplus) || dplus < MIN_DPLUS_M) {
    return {
      ok: false,
      status: 400,
      error: `D+ trop faible: ${Math.round(dplus)} m (min ${MIN_DPLUS_M} m).`,
    };
  }

  return { ok: true };
}

/* ------------------------------ CORS ------------------------------ */

const ALLOWED_ORIGINS = new Set([
  "https://davidpoyade-netizen.github.io",
  "https://www.davidpoyade-netizen.github.io",
  "http://localhost:5500",
  "http://127.0.0.1:5500",
  "http://localhost:5173",
  "http://127.0.0.1:5173",
]);

app.use(
  cors({
    origin: (origin, cb) => {
      if (!origin) return cb(null, true);
      if (ALLOWED_ORIGINS.has(origin)) return cb(null, true);
      return cb(new Error(`CORS blocked for origin: ${origin}`));
    },
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: false,
    maxAge: 86400,
  })
);

app.options("*", cors());

/* --------------------------- Body parser --------------------------- */

app.use(
  express.text({
    type: ["application/gpx+xml", "application/xml", "text/xml", "text/plain"],
    limit: "10mb",
  })
);

/* ----------------------------- Health ----------------------------- */

app.get("/", (_, res) => res.status(200).send("MTB Points API OK"));
app.get("/api/health", (_, res) => res.json({ ok: true }));
app.get("/health", (_, res) => res.json({ ok: true }));

/* ------------------------- Friendly GET --------------------------- */

for (const p of ["/api/analyze-gpx", "/api/analyze-gpx-lite"]) {
  app.get(p, (_, res) => {
    res.status(405).json({
      ok: false,
      error: "Utilise POST avec un GPX en body (Content-Type: application/gpx+xml).",
    });
  });
}

/* ----------------------- GPX-only (instant) ----------------------- */

app.post("/api/analyze-gpx-lite", (req, res) => {
  const t0 = Date.now();

  try {
    const gpxText = typeof req.body === "string" ? req.body : "";
    if (!gpxText || gpxText.length < 50) {
      return res.status(400).json({ ok: false, error: "GPX vide ou invalide." });
    }

    const points = parseGpxToPoints(gpxText);
    if (!points || points.length < 2) {
      return res.status(400).json({ ok: false, error: "Aucun point <trkpt> exploitable." });
    }

    const stats = computeStatsFromPoints(points);

    const v = validateGpx(points, stats);
    if (!v.ok) return res.status(v.status).json({ ok: false, error: v.error });

    const discipline = inferDiscipline({
      distanceKm: stats.distanceKm,
      dplusM: stats.dplusM,
      hasElevation: stats.hasElevation,
      steep: stats.steep,
      techScoreV2: null,
    });

    return res.json({
      ok: true,
      tech: {
        techScoreV2: null,
        osmOk: false,
        surfaceEstimate: null,
        details: { note: "lite: no OSM/Overpass" },
      },
      discipline,
      meta: {
        ms: Date.now() - t0,
        points: points.length,
        stats: {
          distanceKm: stats.distanceKm,
          dplusM: stats.dplusM,
          hasElevation: stats.hasElevation,
          steep: stats.steep,
        },
      },
    });
  } catch (e) {
    const msg = e?.message ? String(e.message) : "Erreur serveur.";
    return res.status(500).json({ ok: false, error: msg });
  }
});

/* --------------------- Full analyze (OSM + fallback) --------------------- */

app.post("/api/analyze-gpx", async (req, res) => {
  const t0 = Date.now();

  try {
    const gpxText = typeof req.body === "string" ? req.body : "";
    if (!gpxText || gpxText.length < 50) {
      return res.status(400).json({ ok: false, error: "GPX vide ou invalide." });
    }

    const points = parseGpxToPoints(gpxText);
    if (!points || points.length < 2) {
      return res.status(400).json({ ok: false, error: "Aucun point <trkpt> exploitable." });
    }

    const stats = computeStatsFromPoints(points);

    // ✅ Validation stricte (distance >= 3 km + altitude + qualité)
    const v = validateGpx(points, stats);
    if (!v.ok) return res.status(v.status).json({ ok: false, error: v.error });

    // ✅ Overpass/OSM optimisé (moins de requêtes + parallélisation + cache)
    const OSM_TIMEOUT_MS = 25000;

    let tech = null;
    let osmOk = true;

    try {
      tech = await withTimeout(
        computeScoreTechV2(points, {
          osmSampleEveryM: 300,
          overpassRadiusM: 20,
          minCoverage: 0.20,
          overpassTimeoutSec: 12,
          fetchTimeoutMs: 12000,
          overpassConcurrency: 5,
          cacheDir: ".cache/osm",
        }),
        OSM_TIMEOUT_MS,
        "Overpass/OSM"
      );
    } catch (e) {
      osmOk = false;
      tech = { techScoreV2: null, details: { error: String(e?.message || e) } };
    }

    // surfaceEstimate : préfère moteur (si présent), sinon fallback
    const surfaceEstimate =
      tech?.surfaceEstimate ??
      computeSurfaceEstimateFromOsmSamples(tech?.details?.osmSamples || []) ??
      null;

    const discipline = inferDiscipline({
      distanceKm: stats.distanceKm,
      dplusM: stats.dplusM,
      hasElevation: stats.hasElevation,
      steep: stats.steep,
      techScoreV2: tech?.techScoreV2 ?? null,
    });

    return res.json({
      ok: true,
      tech: {
        ...tech,
        // osmOk = vrai seulement si Overpass a répondu ET techScoreV2 a été produit
        osmOk: osmOk && tech?.techScoreV2 != null,
        surfaceEstimate,
      },
      discipline,
      meta: {
        ms: Date.now() - t0,
        points: points.length,
        stats: {
          distanceKm: stats.distanceKm,
          dplusM: stats.dplusM,
          hasElevation: stats.hasElevation,
          steep: stats.steep,
        },
      },
    });
  } catch (e) {
    const msg = e?.message ? String(e.message) : "Erreur serveur.";
    const status = isNetworkishError(msg) ? 502 : 500;
    return res.status(status).json({ ok: false, error: msg });
  }
});

/* ------------------------------ Listen ----------------------------- */

const PORT = process.env.PORT ? Number(process.env.PORT) : 8787;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`[mtb-points] API listening on 0.0.0.0:${PORT}`);
  console.log(`[mtb-points] GET  /api/health`);
  console.log(`[mtb-points] POST /api/analyze-gpx (Content-Type: application/gpx+xml)`);
  console.log(`[mtb-points] POST /api/analyze-gpx-lite (GPX only)`);
});
