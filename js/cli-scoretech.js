// cli-scoretech.js
// Usage: node cli-scoretech.js path/to/trace.gpx
// Nécessite que ./gpx.js expose une fonction parseGPX(filePath) -> points [{lat,lon,ele,time?}]

import fs from "node:fs";
import { computeScoreTechFromPoints } from "./scoretech-osm.js";

// Adapter minimal : essaye d'importer ton gpx.js
let parseGPX = null;
try {
  const mod = await import("./gpx.js");
  parseGPX = mod.parseGPX || mod.default?.parseGPX || mod.default;
} catch {
  // si gpx.js pas importable, on ne bloque pas : tu peux fournir un JSON de points
}

async function main() {
  const input = process.argv[2];
  if (!input) {
    console.error("Usage: node cli-scoretech.js <trace.gpx | points.json>");
    process.exit(1);
  }

  let points;

  if (input.endsWith(".json")) {
    points = JSON.parse(fs.readFileSync(input, "utf8"));
  } else if (input.endsWith(".gpx")) {
    if (!parseGPX) {
      console.error("Erreur: gpx.js introuvable ou parseGPX non exporté. Fournis un points.json ou expose parseGPX().");
      process.exit(1);
    }
    points = await parseGPX(input);
  } else {
    console.error("Entrée non reconnue. Utilise .gpx ou .json");
    process.exit(1);
  }

  // Normalise champs attendus
  points = points.map(p => ({
    lat: Number(p.lat),
    lon: Number(p.lon),
    ele: p.ele == null ? 0 : Number(p.ele),
    time: p.time ?? null,
  })).filter(p => Number.isFinite(p.lat) && Number.isFinite(p.lon));

  const out = await computeScoreTechFromPoints(points, {
    cacheDir: ".cache/osm",
    segmentMeters: 300,
    sampleEveryMeters: 200,
    overpassRadiusMeters: 20,
  });

  console.log(JSON.stringify(out, null, 2));
  console.log(`\nScoreTech = ${out.scoreTech} / 100 (TechCoeff_P75=${out.techCoeffP75})`);
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
