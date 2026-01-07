// server/lib/surfaceEstimate.js
// Convertit les samples OSM (déjà calculés par scoretech_v2_osm.js) en 3 classes.
// On utilise terrainScore ~ 0 => route, ~0.2-0.6 => piste/chemin, ~>=0.6 => single/tech.

function pct(n) { return Math.round(n * 100); }
function clamp(n, a, b) { return Math.max(a, Math.min(b, n)); }

export function computeSurfaceEstimateFromOsmSamples(samples) {
  const arr = Array.isArray(samples) ? samples : [];
  if (!arr.length) return null;

  let sumW = 0;
  let wRoad = 0;
  let wTrack = 0;
  let wSingle = 0;

  for (const s of arr) {
    if (!s || s.terrainScore == null) continue;

    const ts = Number(s.terrainScore);
    if (!Number.isFinite(ts)) continue;

    const w = Math.max(1, Number(s.weightM || 1));
    sumW += w;

    if (ts <= 0.08) wRoad += w;
    else if (ts < 0.60) wTrack += w;
    else wSingle += w;
  }

  if (sumW <= 0) return null;

  const roadPct = pct(clamp(wRoad / sumW, 0, 1));
  const trackPct = pct(clamp(wTrack / sumW, 0, 1));
  const singlePct = pct(clamp(wSingle / sumW, 0, 1));

  // normalise pour faire 100 pile
  let total = roadPct + trackPct + singlePct;
  if (total !== 100) {
    // ajuste sur la catégorie majoritaire
    const maxKey = [
      { k: "roadPct", v: roadPct },
      { k: "trackPct", v: trackPct },
      { k: "singlePct", v: singlePct }
    ].sort((a, b) => b.v - a.v)[0]?.k;

    const delta = 100 - total;
    if (maxKey === "roadPct") return { roadPct: roadPct + delta, trackPct, singlePct };
    if (maxKey === "trackPct") return { roadPct, trackPct: trackPct + delta, singlePct };
    return { roadPct, trackPct, singlePct: singlePct + delta };
  }

  return { roadPct, trackPct, singlePct };
}
