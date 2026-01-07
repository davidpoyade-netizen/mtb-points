// server/lib/stats.js

function toRad(deg) { return (deg * Math.PI) / 180; }
function haversine(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export function computeStatsFromPoints(points) {
  let distM = 0;
  let dplus = 0;

  let hasElevation = false;
  let elevAllZero = true;

  let distSlope10 = 0;
  let distSlope15 = 0;

  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];

    const segDist = haversine(a.lat, a.lon, b.lat, b.lon);
    if (!Number.isFinite(segDist) || segDist <= 0) continue;
    distM += segDist;

    if (a.ele != null && b.ele != null) {
      hasElevation = true;
      if (a.ele !== 0 || b.ele !== 0) elevAllZero = false;

      const delta = b.ele - a.ele;
      if (delta > 0) dplus += delta;

      const slopePct = (delta / segDist) * 100;
      if (slopePct > 10) distSlope10 += segDist;
      if (slopePct > 15) distSlope15 += segDist;
    }
  }

  if (hasElevation && elevAllZero) {
    hasElevation = false;
    dplus = 0;
    distSlope10 = 0;
    distSlope15 = 0;
  }

  const distanceKm = Math.round((distM / 1000) * 100) / 100;
  const dplusM = Math.round(dplus);

  const steep = {
    p10: distM > 0 ? Math.round((distSlope10 / distM) * 1000) / 1000 : 0,
    p15: distM > 0 ? Math.round((distSlope15 / distM) * 1000) / 1000 : 0
  };

  return { distanceKm, dplusM, hasElevation, steep };
}
