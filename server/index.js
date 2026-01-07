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

// moteur officiel
import { computeScoreTechV2 } from "./scoretech_v2_osm.js";

const app = express();

/* ------------------------------------------------------------------ */
/* CORS                                                               */
/* ------------------------------------------------------------------ */
/**
 * IMPORTANT:
 * - Front GitHub Pages: https://davidpoyade-netizen.github.io
 * - API Render: https://mtb-points.onrender.com
 * Le navigateur envoie un preflight OPTIONS (à cause du Content-Type),
 * donc il faut gérer OPTIONS + renvoyer Access-Control-Allow-Origin.
 */
const ALLOWED_ORIGINS = new Set([
  "https://davidpoyade-netizen.github.io",
  // dev local si besoin
  "http://localhost:5500",
  "http://127.0.0.1:5500",
  "http://localhost:5173",
  "http://127.0.0.1:5173"
]);

app.use(
  cors({
    origin: (origin, cb) => {
      // origin peut être undefined (curl / server-to-server)
      if (!origin) return cb(null, true);
      if (ALLOWED_ORIGINS.has(origin)) return cb(null, true);
      return cb(new Error("Not allowed by CORS: " + origin), false);
    },
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: false,
    maxAge: 86400
  })
);

// Réponse explicite aux preflights
app.options("*", cors());

/* ------------------------------------------------------------------ */
/* Body parser                                                        */
/* ------------------------------------------------------------------ */
/**
 * Le front envoie du texte brut en application/gpx+xml
 * Donc il faut express.text(), pas express.json()
 */
app.use(
  express.text({
    type: ["application/gpx+xml", "application/xml", "text/xml"],
    limit: "8mb"
  })
);

/* ------------------------------------------------------------------ */
/* Routes                                                             */
/* ------------------------------------------------------------------ */
app.get("/health", (_, res) => res.json({ ok: true }));
app.get("/api/health", (_, res) => res.json({ ok: true }));

app.post("/api/analyze-gpx", async (req, res) => {
  const t0 = Date.now();

  try {
    const gpxText = typeof req.body === "string" ? req.body : "";

    if (!gpxText || gpxText.length < 50) {
      return res.status(400).json({ ok: false, error: "GPX vide ou invalide." });
    }

    // 1) Parse GPX (points lat/lon/ele)
    const points = parseGpxToPoints(gpxText);
    if (points.length < 2) {
      return res.status(400).json({ ok: false, error: "Aucun point <trkpt> exploitable." });
    }

    // 2) Stats (distance/d+/pentes)
    const stats = computeStatsFromPoints(points);

    // 3) ScoreTech V2 Hybrid officiel (OSM + bonus GPX capé)
    const tech = await computeScoreTechV2(points, {
      // options possibles si tu veux ajuster plus tard :
      // osmSampleEveryM: 120,
      // overpassRadiusM: 20,
      // minCoverage: 0.30,
      // cacheDir: ".cache/osm"
    });

    // 4) Estimation surface (Route/Piste/Single) depuis samples OSM
    const surfaceEstimate = computeSurfaceEstimateFromOsmSamples(tech?.details?.osmSamples || []);

    // 5) Discipline hint (heuristique)
    const discipline = inferDiscipline({
      distanceKm: stats.distanceKm,
      dplusM: stats.dplusM,
      hasElevation: stats.hasElevation,
      steep: stats.steep,
      techScoreV2: tech?.techScoreV2 ?? null
    });

    // 6) Réponse compatible front
    return res.json({
      ok: true,
      tech: {
        ...tech,
        surfaceEstimate
      },
      discipline,
      meta: {
        ms: Date.now() - t0,
        points: points.length,
        stats: {
          distanceKm: stats.distanceKm,
          dplusM: stats.dplusM,
          hasElevation: stats.hasElevation,
          steep: stats.steep
        }
      }
    });
  } catch (e) {
    const msg = e?.message ? String(e.message) : "Erreur serveur.";
    const status = /overpass|timeout|fetch|network/i.test(msg) ? 502 : 500;
    return res.status(status).json({ ok: false, error: msg });
  }
});

/* ------------------------------------------------------------------ */
/* Listen (Render)                                                    */
/* ------------------------------------------------------------------ */
// ✅ UN SEUL listen (pas 2 !)
const PORT = Number(process.env.PORT || 10000);
app.listen(PORT, "0.0.0.0", () => {
  console.log(`[mtb-points] API server listening on 0.0.0.0:${PORT}`);
  console.log(`[mtb-points] POST /api/analyze-gpx (Content-Type: application/gpx+xml)`);
});
