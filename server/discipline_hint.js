// discipline_hint.js
// MTB Points — Discipline Hint (XC / Enduro / DH / Trail/Other)
// Node / JS module (ESM)
//
// Entrée : points [{lat, lon, ele}] (ele recommandé)
// Sortie : { hint, confidence, scores, metrics }
//
// Logique:
// - calcule pente (anti-bruit), parts montée/descente, runs de descente continue,
//   alternance (montée/descente), et "packs" de descente technique (pente+virages).
// - applique des règles robustes pour proposer XC / Enduro / DH.
// - sinon Trail/Other.
//
// Important : si ele absent => confiance baisse (et certains signaux deviennent faibles).

function clamp(n, a, b) { return Math.max(a, Math.min(b, n)); }
function toRad(deg) { return (deg * Math.PI) / 180; }

function haversine(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function bearing(a, b) {
  const y = Math.sin(toRad(b.lon - a.lon)) * Math.cos(toRad(b.lat));
  const x =
    Math.cos(toRad(a.lat)) * Math.sin(toRad(b.lat)) -
    Math.sin(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.cos(toRad(b.lon - a.lon));
  let br = Math.atan2(y, x) * 180 / Math.PI;
  if (br < 0) br += 360;
  return br;
}

function percentile(arr, p) {
  if (!arr.length) return 0;
  const a = arr.slice().sort((x, y) => x - y);
  const idx = (a.length - 1) * p;
  const lo = Math.floor(idx), hi = Math.ceil(idx);
  if (lo === hi) return a[lo];
  const w = idx - lo;
  return a[lo] * (1 - w) + a[hi] * w;
}

function buildSegments(points, segmentLenM) {
  const ranges = [];
  let start = 0;
  let acc = 0;
  for (let i = 1; i < points.length; i++) {
    const d = haversine(points[i - 1].lat, points[i - 1].lon, points[i].lat, points[i].lon);
    if (!Number.isFinite(d) || d <= 0) continue;
    acc += d;
    if (acc >= segmentLenM) {
      ranges.push([start, i]);
      start = i;
      acc = 0;
    }
  }
  if (start < points.length - 1) ranges.push([start, points.length - 1]);
  return ranges;
}

function computeTurnPerKm(segPts, distReal, opts) {
  if (segPts.length < 3 || distReal < 30) return { turnPerKm: 0, used: 0 };

  let turn = 0;
  let used = 0;
  for (let i = 2; i < segPts.length; i++) {
    const p0 = segPts[i - 2], p1 = segPts[i - 1], p2 = segPts[i];
    const d01 = haversine(p0.lat, p0.lon, p1.lat, p1.lon);
    const d12 = haversine(p1.lat, p1.lon, p2.lat, p2.lon);
    if (d01 < opts.minStepM || d01 > opts.maxStepM) continue;
    if (d12 < opts.minStepM || d12 > opts.maxStepM) continue;

    const br1 = bearing(p0, p1);
    const br2 = bearing(p1, p2);
    let diff = Math.abs(br2 - br1);
    if (diff > 180) diff = 360 - diff;
    turn += diff;
    used++;
  }
  const km = distReal / 1000;
  return { turnPerKm: km > 0 ? (turn / km) : 0, used };
}

function computeSinuNorm(segPts) {
  let distReal = 0;
  for (let i = 1; i < segPts.length; i++) {
    const d = haversine(segPts[i - 1].lat, segPts[i - 1].lon, segPts[i].lat, segPts[i].lon);
    if (d > 0) distReal += d;
  }
  const direct = haversine(segPts[0].lat, segPts[0].lon, segPts[segPts.length - 1].lat, segPts[segPts.length - 1].lon);
  const sinuosity = distReal / Math.max(direct, 1);
  const sinuNorm = clamp((sinuosity - 1.0) / 0.30, 0, 1);
  return { distReal, sinuosity, sinuNorm };
}

function computeSlopeStatsAll(points, opts) {
  // Retourne des métriques globales robustes:
  // - distTotal, dPlus, dMinus
  // - upShare/downShare autour d'un seuil
  // - distribution des grades pour alternance/variabilité
  let distTotal = 0;
  let dPlus = 0;
  let dMinus = 0;

  let upDist = 0;
  let downDist = 0;

  const grades = []; // abs or signed? -> signed for alternance
  const absGrades = [];

  let hasEle = false;
  let validSteps = 0;

  // Descente run tracking (sur pas filtrés)
  let curDownRunDist = 0;
  let curDownRunDrop = 0;
  let maxDownRunDist = 0;
  let maxDownRunDrop = 0;

  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], b = points[i];

    const d = haversine(a.lat, a.lon, b.lat, b.lon);
    if (!Number.isFinite(d) || d < opts.minStepM || d > opts.maxStepM) continue;

    distTotal += d;

    const e1 = a.ele == null ? null : Number(a.ele);
    const e2 = b.ele == null ? null : Number(b.ele);
    if (!Number.isFinite(e1) || !Number.isFinite(e2)) {
      // sans ele, on ne calcule pas grade
      // mais on stoppe les runs
      curDownRunDist = 0;
      curDownRunDrop = 0;
      continue;
    }
    hasEle = true;

    const de = e2 - e1;
    if (Math.abs(de) > opts.maxDeltaEleM) {
      curDownRunDist = 0;
      curDownRunDrop = 0;
      continue;
    }

    const grade = de / d; // fraction
    if (!Number.isFinite(grade) || Math.abs(grade) > opts.maxAbsGrade) {
      curDownRunDist = 0;
      curDownRunDrop = 0;
      continue;
    }

    validSteps++;

    if (de > 0) dPlus += de;
    if (de < 0) dMinus += (-de);

    grades.push(grade);
    absGrades.push(Math.abs(grade));

    if (grade >= opts.upGradeThr) upDist += d;
    if (grade <= -opts.downGradeThr) downDist += d;

    // runs de descente continue (grade <= downRunThr)
    if (grade <= -opts.downRunThr) {
      curDownRunDist += d;
      curDownRunDrop += (-de);
      if (curDownRunDist > maxDownRunDist) maxDownRunDist = curDownRunDist;
      if (curDownRunDrop > maxDownRunDrop) maxDownRunDrop = curDownRunDrop;
    } else {
      curDownRunDist = 0;
      curDownRunDrop = 0;
    }
  }

  const upShare = distTotal > 0 ? upDist / distTotal : 0;
  const downShare = distTotal > 0 ? downDist / distTotal : 0;

  // alternance : nombre de changements de signe (sur grades) / km
  let signChanges = 0;
  for (let i = 1; i < grades.length; i++) {
    const s1 = Math.sign(grades[i - 1]);
    const s2 = Math.sign(grades[i]);
    if (s1 !== 0 && s2 !== 0 && s1 !== s2) signChanges++;
  }
  const distKm = distTotal / 1000;
  const signChangesPerKm = distKm > 0 ? signChanges / distKm : 0;

  // Variabilité de pente (robuste)
  const gP90 = absGrades.length ? percentile(absGrades, 0.90) : 0;

  return {
    hasEle,
    validSteps,
    distTotalM: distTotal,
    distKm: Number(distKm.toFixed(3)),
    dPlusM: Math.round(dPlus),
    dMinusM: Math.round(dMinus),
    vamLike_mPerKm: distKm > 0 ? Number((dPlus / distKm).toFixed(1)) : 0, // D+/km
    upShare: Number(upShare.toFixed(3)),
    downShare: Number(downShare.toFixed(3)),
    maxDownRunKm: Number((maxDownRunDist / 1000).toFixed(3)),
    maxDownRunDropM: Math.round(maxDownRunDrop),
    signChangesPerKm: Number(signChangesPerKm.toFixed(3)),
    gP90_absGrade: Number(gP90.toFixed(3)),
  };
}

function computeTechPacks(points, opts) {
  // "packs" = grappes de segments candidats descente technique
  // Critère: pente descendante forte OU pente abs forte + virages élevés
  // On compte le nombre de blocs (contigus) et leur poids.
  const ranges = buildSegments(points, opts.segmentLenM);

  const segFlags = [];
  const segLens = [];

  for (const [aIdx, bIdx] of ranges) {
    const segPts = points.slice(aIdx, bIdx + 1);
    if (segPts.length < 2) { segFlags.push(false); segLens.push(0); continue; }

    const { distReal, sinuNorm } = computeSinuNorm(segPts);
    if (distReal < 50) { segFlags.push(false); segLens.push(distReal); continue; }

    // slope down intensity (approx) + turn
    const slopeDownSamples = [];
    let downStrongDist = 0;

    for (let i = 1; i < segPts.length; i++) {
      const a = segPts[i - 1], b = segPts[i];
      const d = haversine(a.lat, a.lon, b.lat, b.lon);
      if (d < opts.minStepM || d > opts.maxStepM) continue;

      const e1 = a.ele == null ? null : Number(a.ele);
      const e2 = b.ele == null ? null : Number(b.ele);
      if (!Number.isFinite(e1) || !Number.isFinite(e2)) continue;

      const de = e2 - e1;
      if (Math.abs(de) > opts.maxDeltaEleM) continue;

      const g = de / d;
      if (Math.abs(g) > opts.maxAbsGrade) continue;

      if (g <= -opts.packDownThr) downStrongDist += d;
      slopeDownSamples.push(g);
    }

    const downStrongShare = distReal > 0 ? downStrongDist / distReal : 0;

    const turn = computeTurnPerKm(segPts, distReal, opts);
    const turnNorm = clamp((turn.turnPerKm - 120) / 500, 0, 1);

    // candidat pack si : bonne part de descente forte OU gros pilotage + sinuosité
    const isPack = (downStrongShare >= 0.25) || (turnNorm >= 0.55 && sinuNorm >= 0.35);

    segFlags.push(isPack);
    segLens.push(distReal);
  }

  // compter blocs contigus
  let packs = 0;
  let inPack = false;
  let packLenM = 0;
  const packLens = [];

  for (let i = 0; i < segFlags.length; i++) {
    if (segFlags[i]) {
      if (!inPack) { inPack = true; packs++; packLenM = 0; }
      packLenM += segLens[i];
    } else {
      if (inPack) { inPack = false; packLens.push(packLenM); }
    }
  }
  if (inPack) packLens.push(packLenM);

  const maxPackKm = packLens.length ? Math.max(...packLens) / 1000 : 0;

  return {
    packs,
    maxPackKm: Number(maxPackKm.toFixed(3)),
  };
}

export function computeDisciplineHint(points, options = {}) {
  const opts = {
    // segmentation & thresholds
    segmentLenM: 200,

    // anti-bruit
    minStepM: 3,
    maxStepM: 80,
    maxDeltaEleM: 25,
    maxAbsGrade: 0.45,

    // global shares thresholds (grade fraction)
    upGradeThr: 0.08,     // 8% for upShare
    downGradeThr: 0.08,   // 8% for downShare
    downRunThr: 0.05,     // 5% for continuous down runs
    packDownThr: 0.10,    // 10% for "strong down" inside packs

    ...options,
  };

  if (!Array.isArray(points) || points.length < 2) {
    return {
      hint: "Trail/Other",
      confidence: 0,
      scores: { xc: 0, enduro: 0, dh: 0, other: 1 },
      metrics: { error: "points invalides" }
    };
  }

  const pts = points
    .map(p => ({ lat: Number(p.lat), lon: Number(p.lon), ele: p.ele == null ? null : Number(p.ele) }))
    .filter(p => Number.isFinite(p.lat) && Number.isFinite(p.lon));

  const s = computeSlopeStatsAll(pts, opts);
  const packs = computeTechPacks(pts, opts);

  // Heuristiques de scoring (0..1)
  // DH: downShare élevé + D+/km faible + grosse descente continue
  const dh1 = clamp((s.downShare - 0.45) / 0.35, 0, 1);      // 0.45->0, 0.80->1
  const dh2 = clamp((12 - s.vamLike_mPerKm) / 12, 0, 1);     // <12 m/km => +DH
  const dh3 = clamp((s.maxDownRunDropM - 180) / 450, 0, 1);  // drop >180m -> +DH
  const dh = clamp(0.45*dh1 + 0.25*dh2 + 0.30*dh3, 0, 1);

  // Enduro: alternance montée/descente + plusieurs packs + downShare modéré/haut + upShare non négligeable
  const en1 = clamp((s.upShare - 0.18) / 0.25, 0, 1);        // upShare >= ~0.18
  const en2 = clamp((s.downShare - 0.25) / 0.35, 0, 1);      // downShare >= ~0.25
  const en3 = clamp((packs.packs - 2) / 4, 0, 1);            // >=3 packs => bon
  const en4 = clamp((s.signChangesPerKm - 0.8) / 1.4, 0, 1); // alternance
  const enduro = clamp(0.25*en1 + 0.25*en2 + 0.30*en3 + 0.20*en4, 0, 1);

  // XC: D+/km notable + alternance (mais moins “packs DH”) + downShare pas dominant
  const xc1 = clamp((s.vamLike_mPerKm - 15) / 25, 0, 1);     // >15 m/km
  const xc2 = clamp((s.signChangesPerKm - 0.7
