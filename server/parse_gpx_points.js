// server/parse_gpx_points.js
// MTB Points — GPX -> points[{lat, lon, ele, time?}]
// Node 18+ (pas d'OCR, pas de lib externe)
//
// Usage:
//   import { parseGpxPointsFromString, parseGpxPointsFromFile } from "./parse_gpx_points.js";
//
// Notes:
// - Supporte <trkpt> (et <rtept> en fallback)
// - ele est null si absent / invalide
// - time est null si absent / invalide (ISO string conservée)
// - Filtre les points invalides, supprime les doublons consécutifs (lat/lon identiques)
// - Ne calcule pas la distance ici (fait ailleurs)

import fs from "node:fs/promises";

const MAX_FILE_BYTES = 25 * 1024 * 1024;

function toNumberOrNull(x) {
  const n = Number(x);
  return Number.isFinite(n) ? n : null;
}

function getTagText(block, tagName) {
  // match non-greedy sur le contenu du tag
  const re = new RegExp(`<${tagName}[^>]*>([\\s\\S]*?)<\\/${tagName}>`, "i");
  const m = block.match(re);
  if (!m) return null;
  const txt = String(m[1]).trim();
  return txt.length ? txt : null;
}

function extractPointsFromTag(gpxText, tagName) {
  // capture <trkpt ...> ... </trkpt> ou <rtept ...> ... </rtept>
  const re = new RegExp(`<${tagName}\\b([^>]*)>([\\s\\S]*?)<\\/${tagName}>`, "gi");

  const points = [];
  let m;
  while ((m = re.exec(gpxText)) !== null) {
    const attrs = m[1] || "";
    const inner = m[2] || "";

    const latM = attrs.match(/\blat="([^"]+)"/i);
    const lonM = attrs.match(/\blon="([^"]+)"/i);

    const lat = toNumberOrNull(latM ? latM[1] : null);
    const lon = toNumberOrNull(lonM ? lonM[1] : null);

    if (lat == null || lon == null) continue;

    const eleTxt = getTagText(inner, "ele");
    const timeTxt = getTagText(inner, "time");

    const ele = eleTxt == null ? null : toNumberOrNull(eleTxt);
    const time = timeTxt == null ? null : (Number.isNaN(Date.parse(timeTxt)) ? null : timeTxt);

    points.push({ lat, lon, ele, time });
  }
  return points;
}

function dedupeConsecutive(points) {
  if (points.length < 2) return points;
  const out = [points[0]];
  for (let i = 1; i < points.length; i++) {
    const a = out[out.length - 1];
    const b = points[i];
    // même lat/lon (exact) => doublon
    if (a.lat === b.lat && a.lon === b.lon) continue;
    out.push(b);
  }
  return out;
}

function sanitizePoints(points) {
  // filtre lat/lon range + harmonise ele/time
  const out = [];
  for (const p of points) {
    if (!Number.isFinite(p.lat) || !Number.isFinite(p.lon)) continue;
    if (p.lat < -90 || p.lat > 90 || p.lon < -180 || p.lon > 180) continue;

    out.push({
      lat: p.lat,
      lon: p.lon,
      ele: Number.isFinite(p.ele) ? p.ele : null,
      time: typeof p.time === "string" ? p.time : null,
    });
  }
  return out;
}

export function parseGpxPointsFromString(gpxText) {
  if (typeof gpxText !== "string" || !gpxText.trim()) {
    throw new Error("GPX vide ou invalide (texte manquant).");
  }

  // 1) priorité: trkpt
  let points = extractPointsFromTag(gpxText, "trkpt");

  // 2) fallback: rtept
  if (!points.length) points = extractPointsFromTag(gpxText, "rtept");

  if (points.length < 2) {
    throw new Error("GPX invalide: aucun point <trkpt> (ou <rtept>) exploitable.");
  }

  points = sanitizePoints(points);
  points = dedupeConsecutive(points);

  if (points.length < 2) {
    throw new Error("GPX invalide: pas assez de points valides après nettoyage.");
  }

  return points;
}

export async function parseGpxPointsFromFile(filePath) {
  const stat = await fs.stat(filePath);
  if (stat.size > MAX_FILE_BYTES) {
    throw new Error(`Fichier GPX trop volumineux (> ${Math.round(MAX_FILE_BYTES / (1024 * 1024))} Mo).`);
  }

  const txt = await fs.readFile(filePath, "utf8");
  return parseGpxPointsFromString(txt);
}
