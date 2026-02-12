// lib/scorePhys.js
// MTB Points — Score Physique OFFICIEL
// Calcul selon méthodologie : EffortBase + IPB
//
// ScorePhys = round(100 × clamp(0.70×EffortNorm + 0.30×IPB_norm, 0, 1))
//
// Entrée : points [{lat, lon, ele}]
// Sortie : { scorePhys, details: { effortBase, effortNorm, ipb, ipbNorm, distanceKm, dplusM } }

function clamp(n, a, b) { return Math.max(a, Math.min(b, n)); }
function toRad(deg) { return (deg * Math.PI) / 180; }

function haversine(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Calcule l'Indice de Pénibilité des Pentes (IPB)
 * Basé sur la distribution des pentes (longues pentes raides = plus pénible)
 */
function computeIPB(points, opts = {}) {
  const {
    minStepM = 3,
    maxStepM = 80,
    maxDeltaEleM = 25,
    maxAbsGrade = 0.45,
  } = opts;

  let distTotal = 0;
  const grades = [];

  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];

    const d = haversine(a.lat, a.lon, b.lat, b.lon);
    if (!Number.isFinite(d) || d < minStepM || d > maxStepM) continue;

    distTotal += d;

    const e1 = a.ele == null ? null : Number(a.ele);
    const e2 = b.ele == null ? null : Number(b.ele);
    if (!Number.isFinite(e1) || !Number.isFinite(e2)) continue;

    const de = e2 - e1;
    if (Math.abs(de) > maxDeltaEleM) continue;

    const grade = de / d; // fraction
    if (!Number.isFinite(grade) || Math.abs(grade) > maxAbsGrade) continue;

    grades.push({ grade: Math.abs(grade), dist: d });
  }

  if (grades.length === 0) return 0;

  // IPB = somme pondérée des pentes fortes
  // Plus la pente est forte et longue, plus elle contribue
  let ipbSum = 0;

  for (const { grade, dist } of grades) {
    // Poids exponentiel : pentes >10% comptent beaucoup plus
    const gradePercent = grade * 100;
    
    if (gradePercent >= 10) {
      // Contribution = distance × (grade - 10)²
      // Ex: 15% sur 100m → 100 × (15-10)² = 100 × 25 = 2500
      const contribution = dist * Math.pow(gradePercent - 10, 2);
      ipbSum += contribution;
    }
  }

  // Normalisation : IPB brut / distance totale
  const ipb = distTotal > 0 ? (ipbSum / distTotal) : 0;

  // Ramener à une échelle raisonnable (0-150 typiquement)
  // Pour un parcours normal : IPB ~ 20-60
  // Pour un parcours très raide : IPB ~ 80-120+
  return Number(ipb.toFixed(2));
}

/**
 * Calcule le Score Physique selon la méthodologie officielle
 * 
 * @param {Array} points - Points GPX [{lat, lon, ele}]
 * @returns {Object} { scorePhys, details }
 */
export function computeScorePhys(points) {
  if (!Array.isArray(points) || points.length < 2) {
    return { scorePhys: null, details: { error: "Points invalides" } };
  }

  // Calcul distance et D+
  let distM = 0;
  let dplus = 0;
  let hasEle = false;

  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];

    const d = haversine(a.lat, a.lon, b.lat, b.lon);
    if (!Number.isFinite(d) || d <= 0) continue;
    distM += d;

    const e1 = a.ele == null ? null : Number(a.ele);
    const e2 = b.ele == null ? null : Number(b.ele);
    if (!Number.isFinite(e1) || !Number.isFinite(e2)) continue;

    hasEle = true;
    const de = e2 - e1;
    if (de > 0) dplus += de;
  }

  if (!hasEle) {
    return { 
      scorePhys: null, 
      details: { error: "Aucune altitude disponible" } 
    };
  }

  const D = distM / 1000; // km
  const Hplus = dplus;    // m

  // Calcul IPB
  const ipb = computeIPB(points);

  // === MÉTHODOLOGIE OFFICIELLE ===
  // EffortBase = sqrt(D) + (H⁺ / 1000)
  const effortBase = Math.sqrt(D) + (Hplus / 1000);

  // EffortNorm = clamp(EffortBase / 10, 0, 1)
  const effortNorm = clamp(effortBase / 10, 0, 1);

  // IPB_norm = clamp(IPB / 120, 0, 1)
  const ipbNorm = clamp(ipb / 120, 0, 1);

  // ScorePhys = round(100 × clamp(0.70×EffortNorm + 0.30×IPB_norm, 0, 1))
  const scorePhys01 = clamp(0.70 * effortNorm + 0.30 * ipbNorm, 0, 1);
  const scorePhys = Math.round(100 * scorePhys01);

  return {
    scorePhys,
    details: {
      distanceKm: Number(D.toFixed(2)),
      dplusM: Math.round(Hplus),
      effortBase: Number(effortBase.toFixed(3)),
      effortNorm: Number(effortNorm.toFixed(3)),
      ipb: Number(ipb.toFixed(2)),
      ipbNorm: Number(ipbNorm.toFixed(3)),
      formula: "0.70×EffortNorm + 0.30×IPB_norm"
    }
  };
}
