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

// ⚠️ ton moteur officiel (inchangé)
import { computeScoreTechV2 } from "./scoretech_v2_osm.js";

const app = express();

// Si tu sers le front depuis le même domaine, CORS n'est pas indispensable.
// Je le laisse ouvert en dev.
app.use(cors());

// IMPORTANT: ton front envoie du texte brut en application/gpx+xml :contentReference[oaicite:3]{index=3}
app.use(
  express.text({
    type: ["application/gpx+xml", "application/xml", "text/xml", "*/*"],
    limit: "8mb"
  })
);

app.get("/health", (_, res) => res.json({ ok: true }));

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

    // 2) Stats (distance/d+/pentes) pour discipline hint
    const stats = computeStatsFromPoints(points);

    // 3) ScoreTech V2 Hybrid officiel (OSM + bonus GPX capé) :contentReference[oaicite:4]{index=4}
    const tech = await computeScoreTechV2(points, {
      // tu peux ajuster ici si tu veux
      // osmSampleEveryM: 120,
      // overpassRadiusM: 20,
      // minCoverage: 0.30,
      // cacheDir: ".cache/osm"
    });

    // 4) Estimation "surface" (Route/Piste/Single) depuis les samples OSM déjà calculés
    // (basé sur terrainScore des samples: on convertit en 3 classes)
    const surfaceEstimate = computeSurfaceEstimateFromOsmSamples(tech?.details?.osmSamples || []);

    // 5) Discipline hint (heuristique simple)
    const discipline = inferDiscipline({
      distanceKm: stats.distanceKm,
      dplusM: stats.dplusM,
      hasElevation: stats.hasElevation,
      steep: stats.steep,
      techScoreV2: tech?.techScoreV2 ?? null
    });

    // 6) Réponse compatible front
    // Le front utilise "server.tech" et "server.discipline" :contentReference[oaicite:5]{index=5}
    return res.json({
      ok: true,
      tech: {
        ...tech,
        // champ utile côté UI (event-detail.js affiche surfaceEstimate) :contentReference[oaicite:6]{index=6}
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
    const msg = (e && e.message) ? String(e.message) : "Erreur serveur.";
    const status = /overpass|timeout|fetch|network/i.test(msg) ? 502 : 500;
    return res.status(status).json({ ok: false, error: msg });
  }
});

const PORT = process.env.PORT ? Number(process.env.PORT) : 8787;
app.listen(PORT, () => {
  console.log(`[mtb-points] API server listening on http://localhost:${PORT}`);
  console.log(`[mtb-points] POST /api/analyze-gpx (Content-Type: application/gpx+xml)`);
});
app.listen(PORT, "0.0.0.0", () => {
  console.log(`[mtb-points] API server listening on http://0.0.0.0:${PORT}`);
});
