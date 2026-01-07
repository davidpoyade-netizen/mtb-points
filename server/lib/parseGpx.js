// server/lib/parseGpx.js
import { XMLParser } from "fast-xml-parser";

function asArray(x) {
  if (!x) return [];
  return Array.isArray(x) ? x : [x];
}

export function parseGpxToPoints(gpxText) {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "@_",
    // GPX peut contenir des namespaces, on garde simple
    removeNSPrefix: true
  });

  let obj;
  try {
    obj = parser.parse(gpxText);
  } catch {
    throw new Error("GPX invalide (erreur XML).");
  }

  const gpx = obj?.gpx;
  const trk = asArray(gpx?.trk);
  const points = [];

  for (const t of trk) {
    const segs = asArray(t?.trkseg);
    for (const seg of segs) {
      const trkpts = asArray(seg?.trkpt);
      for (const p of trkpts) {
        const lat = Number(p?.["@_lat"]);
        const lon = Number(p?.["@_lon"]);
        const ele = p?.ele == null ? null : Number(p.ele);
        const time = p?.time == null ? null : String(p.time);

        if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;

        points.push({
          lat,
          lon,
          ele: Number.isFinite(ele) ? ele : null,
          time: time && !Number.isNaN(Date.parse(time)) ? time : null
        });
      }
    }
  }

  return points;
}
