// server/index.js - CORRIGÉ
// MTB Points — API GPX/OSM avec POINTS dans la réponse
// ✅ CORS fixé
// ✅ Points GPX renvoyés dans la réponse JSON
// ✅ Gestion d'erreurs améliorée

import express from "express";
import cors from "cors";

import { parseGpxToPoints } from "./lib/parseGpx.js";
import { computeStatsFromPoints } from "./lib/stats.js";
import { inferDiscipline } from "./lib/discipline.js";
import { computeSurfaceEstimateFromOsmSamples } from "./lib/surfaceEstimate.js";

import { computeScoreTechV2 } from "./scoretech_v2_osm.js";

const app = express();

// ============================================================================
// CONFIGURATION CORS - SIMPLIFIÉE ET FONCTIONNELLE
// ============================================================================

const ALLOWED_ORIGINS = [
  "https://davidpoyade-netizen.github.io",
  "https://www.davidpoyade-netizen.github.io",
  "http://localhost:5500",
  "http://127.0.0.1:5500",
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "http://localhost:3000",
  "http://127.0.0.1:3000",
];

// Configuration CORS simple et robuste
app.use(
  cors({
    origin: (origin, callback) => {
      // Pas d'origin = requête same-origin, Postman, curl → accepter
      if (!origin) return callback(null, true);
      
      // Vérifier si l'origin est dans la liste
      if (ALLOWED_ORIGINS.includes(origin)) {
        console.log(`✅ CORS OK: ${origin}`);
        return callback(null, true);
      }
      
      // Origin non autorisée
      console.warn(`❌ CORS bloqué: ${origin}`);
      return callback(null, false);
    },
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: false,
    maxAge: 86400,
  })
);

// Gérer explicitement les requêtes OPTIONS (preflight)
app.options("*", cors());

// ============================================================================
// BODY PARSER
// ============================================================================

app.use(
  express.text({
    type: ["application/gpx+xml", "application/xml", "text/xml", "text/plain"],
    limit: "10mb",
  })
);

app.use(express.json({ limit: "10mb" }));

// ============================================================================
// HEALTHCHECK
// ============================================================================

app.get(["/", "/health", "/_health"], (_req, res) => {
  res.status(200).json({ 
    ok: true, 
    service: "MTB Points API",
    version: "2.0.0",
    timestamp: new Date().toISOString()
  });
});

app.get("/api/health", (_, res) => {
  res.json({ ok: true, timestamp: new Date().toISOString() });
});

// ============================================================================
// HELPERS
// ============================================================================

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
  const MIN_DISTANCE_KM = 3.0;
  const MIN_POINTS = 30;
  const MIN_ELE_RATIO = 0.80;
  const MIN_PTS_PER_KM = 5;
  const MIN_DPLUS_M = 10;

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

  const density = distKm > 0 ? totalPts / distKm : totalPts;
  if (density < MIN_PTS_PER_KM) {
    return {
      ok: false,
      status: 400,
      error: `GPX trop peu échantillonné: ${density.toFixed(1)} pts/km (min ${MIN_PTS_PER_KM} pts/km).`,
    };
  }

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

// ============================================================================
// ENDPOINT: GET (info)
// ============================================================================

for (const p of ["/api/analyze-gpx", "/api/analyze-gpx-lite"]) {
  app.get(p, (_, res) => {
    res.status(405).json({
      ok: false,
      error: "Utilise POST avec un GPX en body (Content-Type: application/gpx+xml).",
    });
  });
}

// ============================================================================
// ENDPOINT: /api/analyze-gpx-lite (GPX only, pas d'OSM)
// ============================================================================

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

    // ✅ CORRECTION : Renvoyer les points GPX
    return res.json({
      ok: true,
      points: points, // ✅ AJOUTÉ
      tech: {
        techScoreV2: null,
        osmOk: false,
        surfaceEstimate: null,
        details: { note: "lite: no OSM/Overpass" },
      },
      discipline,
      meta: {
        ms: Date.now() - t0,
        pointsCount: points.length, // renommé pour clarté
        stats: {
          distanceKm: stats.distanceKm,
          dplusM: stats.dplusM,
          hasElevation: stats.hasElevation,
          steep: stats.steep,
        },
      },
    });
  } catch (e) {
    console.error("❌ Erreur /api/analyze-gpx-lite:", e);
    const msg = e?.message ? String(e.message) : "Erreur serveur.";
    return res.status(500).json({ ok: false, error: msg });
  }
});

// ============================================================================
// ENDPOINT: /api/analyze-gpx (FULL avec OSM)
// ============================================================================

app.post("/api/analyze-gpx", async (req, res) => {
  const t0 = Date.now();

  try {
    const gpxText = typeof req.body === "string" ? req.body : "";
    if (!gpxText || gpxText.length < 50) {
      return res.status(400).json({ ok: false, error: "GPX vide ou invalide." });
    }

    console.log(`📍 Parsing GPX (${gpxText.length} bytes)...`);
    const points = parseGpxToPoints(gpxText);
    if (!points || points.length < 2) {
      return res.status(400).json({ ok: false, error: "Aucun point <trkpt> exploitable." });
    }

    console.log(`✅ ${points.length} points extraits`);

    const stats = computeStatsFromPoints(points);

    // Validation stricte
    const v = validateGpx(points, stats);
    if (!v.ok) return res.status(v.status).json({ ok: false, error: v.error });

    console.log(`📊 Stats: ${stats.distanceKm.toFixed(2)} km, D+ ${stats.dplusM.toFixed(0)} m`);

    // Overpass/OSM optimisé
    const OSM_TIMEOUT_MS = 25000;

    let tech = null;
    let osmOk = true;

    try {
      console.log(`🌍 Lancement analyse OSM...`);
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
      console.log(`✅ OSM OK - TechScore: ${tech?.techScoreV2 ?? 'null'}`);
    } catch (e) {
      console.error(`⚠️  OSM échoué:`, e.message);
      osmOk = false;
      tech = { techScoreV2: null, details: { error: String(e?.message || e) } };
    }

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

    // ✅ CORRECTION MAJEURE : Renvoyer les points GPX dans la réponse
    const response = {
      ok: true,
      points: points, // ✅ AJOUTÉ - LES POINTS GPX SONT MAINTENANT RENVOYÉS
      tech: {
        ...tech,
        osmOk: osmOk && tech?.techScoreV2 != null,
        surfaceEstimate,
      },
      discipline,
      meta: {
        ms: Date.now() - t0,
        pointsCount: points.length, // renommé pour clarté
        stats: {
          distanceKm: stats.distanceKm,
          dplusM: stats.dplusM,
          hasElevation: stats.hasElevation,
          steep: stats.steep,
        },
      },
    };

    console.log(`✅ Réponse complète (${points.length} points inclus)`);
    return res.json(response);

  } catch (e) {
    console.error("❌ Erreur /api/analyze-gpx:", e);
    const msg = e?.message ? String(e.message) : "Erreur serveur.";
    const status = isNetworkishError(msg) ? 502 : 500;
    return res.status(status).json({ ok: false, error: msg });
  }
});

// ============================================================================
// LISTEN
// ============================================================================

const PORT = process.env.PORT ? Number(process.env.PORT) : 8787;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`
╔═══════════════════════════════════════════════════════════════╗
║                    MTB POINTS API v2.0                        ║
╟───────────────────────────────────────────────────────────────╢
║  🚀 Server: http://0.0.0.0:${PORT}                               ║
║  ✅ CORS origins: ${ALLOWED_ORIGINS.length} autorisées                      ║
║  📍 Endpoints:                                                ║
║     GET  /health                                              ║
║     POST /api/analyze-gpx         (avec OSM + points)         ║
║     POST /api/analyze-gpx-lite    (sans OSM + points)         ║
╚═══════════════════════════════════════════════════════════════╝
  `);
  console.log("CORS origins autorisées:");
  ALLOWED_ORIGINS.forEach(o => console.log(`  - ${o}`));
  console.log("");
});
