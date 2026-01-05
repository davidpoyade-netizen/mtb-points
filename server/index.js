// server/index.js
// MTB Points — API (ScoreTech V2 Hybrid officiel + Discipline Hint)
// Node 18+
// Démarrage: node server/index.js
//
// Endpoints:
//  - GET  /api/health
//  - POST /api/analyze  { points: [{lat, lon, ele?}, ...] }  -> { tech, discipline }

import express from "express";
import cors from "cors";

import { computeScoreTechV2 } from "./scoretech_v2_osm.js";
import { computeDisciplineHint } from "./discipline_hint.js";

const app = express();

// --------------------
// Middlewares
// --------------------
app.use(cors());
app.use(express.json({ limit: "25mb" }));

// --------------------
// Helpers
// --------------------
function isFiniteNumber(x) {
  return typeof x === "number" && Number.isFinite(x);
}

function normalizePoints(raw) {
  if (!Array.isArray(raw)) return [];

  // On garde ele si présent, sinon null
  return raw
    .map((p) => ({
      lat: Number(p?.lat),
      lon: Number(p?.lon),
      ele: p?.ele == null ? null : Number(p.ele),
    }))
    .filter((p) => isFiniteNumber(p.lat) && isFiniteNumber(p.lon));
}

// --------------------
// Routes
// --------------------
app.get("/api/health", (req, res) => {
  res.json({
    ok: true,
    service: "mtb-points-api",
    endpoints: ["/api/health", "/api/analyze"],
  });
});

app.post("/api/analyze", async (req, res) => {
  try {
    const points = normalizePoints(req.body?.points);

    if (points.length < 2) {
      return res.status(400).json({
        ok: false,
        error: "points invalides (il faut au moins 2 points lat/lon)",
      });
    }

    // 1) ScoreTech V2 officiel (Hybrid obligatoire)
    const tech = await computeScoreTechV2(points);

    // 2) Discipline hint (XC / Enduro / DH / Trail)
    const discipline = computeDisciplineHint(points);

    return res.json({
      ok: true,
      tech,
      discipline,
    });
  } catch (err) {
    return res.status(500).json({
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    });
  }
});

// --------------------
// Server start
// --------------------
const PORT = Number(process.env.PORT || 3000);
app.listen(PORT, () => {
  console.log(`[MTB Points API] listening on http://localhost:${PORT}`);
});
