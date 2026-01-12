// server/index.js
// API: POST /api/analyze-gpx
// Body: raw GPX text (Content-Type: application/gpx+xml)
// Response: { ok:true, tech, discipline, meta } or { ok:false, error }

import express from "express";
import cors from "cors";

import { parseGpxToPoints } from "./lib/parseGpx.js";
import { computeStatsFromPoints } from "./lib/stats.js";
import { inferDiscipline } from "./lib/discipline.js";
import { computeSurfaceEstimateFromOsmSamples } from "./lib/surfaceEstimate.js";

// ScoreTech V2 Hybrid (OSM / Overpass)
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
      // appels sans Origin (curl, server-to-server)
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

// Preflight pour toutes les routes
app.options("*", cors());

/* --------------------------- Body parser --------------------------- */

// IMPORTANT: évite d'accepter "* / *" ici (ça déclenche des cas surprenants).
app.use(
  express.text({
    type: ["application/gpx+xml", "application/xml", "text/xml", "text/plain"],
    limit: "10mb",
  })
);

/* ----------------------------- Health ----------------------------- */

app.get("/", (_, res) => res.status(200).send("MTB Points API OK"));
app.get("/api/health", (_, res) => res.json({ ok: true }));

/* ------------------------- Friendly GET --------------------------- */

app.get("/api/analyze-gpx", (_, res) => {
  res.status(405).json({
    ok: false,
    error: "Utilise POST avec un GPX en body (Content-Type: application/gpx+xml).",
  });
});

app.get("/api/analyze-gpx-lite", (_, res) => {
  res.status(405).json({
    ok: false,
    error: "Utilise POST avec un GPX en body (Content-Type: application/gpx+xml).",
  });
});

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
        surfaceEstimate: { road: null, track: null, single: null },
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

    // 1) Parse GPX (points lat/lon/ele)
    const points = parseGpxToPoints(gpxText);
    if (!points || points.length < 2) {
      return res.status(400).json({ ok: false, error: "Aucun point <trkpt> exploitable." });
    }

    // 2) Stats (distance/d+/pentes)
    const stats = computeStatsFromPoints(points);

    // 3) OSM/Overpass : timeout + fallback
    const OSM_TIMEOUT_MS = 25000; // ajuste 20–30s
    let tech = null;
    let osmOk = true;

    try {
      tech = await withTimeout(
        computeScoreTechV2(points, {
          // osmSampleEveryM: 120,
          // overpassRadiusM: 20,
          // minCoverage: 0.30,
          // cacheDir: ".cache/osm"
        }),
        OSM_TIMEOUT_MS,
        "Overpass/OSM"
      );
    } catch (e) {
      osmOk = false;
      tech = {
        techScoreV2: null,
        details: { error: String(e?.message || e) },
      };
    }

    // 4) Estimation "surface" depuis samples OSM (si dispo)
    const surfaceEstimate = computeSurfaceEstimateFromOsmSamples(
      tech?.details?.osmSamples || []
    );

    // 5) Discipline hint (même si osmOk=false)
    const discipline = inferDiscipline({
      distanceKm: stats.distanceKm,
      dplusM: stats.dplusM,
      hasElevation: stats.hasElevation,
      steep: stats.steep,
      techScoreV2: tech?.techScoreV2 ?? null,
    });

    // 6) Réponse compatible front
    return res.json({
      ok: true,
      tech: {
        ...tech,
        osmOk,
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
