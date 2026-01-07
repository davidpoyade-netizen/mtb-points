// server/lib/discipline.js
function clamp(n, a, b) { return Math.max(a, Math.min(b, n)); }

export function inferDiscipline({ distanceKm, dplusM, hasElevation, steep, techScoreV2 }) {
  const D = Number(distanceKm || 0);
  const H = Number(dplusM || 0);

  // Heuristiques simples (tu peux durcir par catégorie plus tard)
  let hint = "VTT";
  let confidence = 0.45;

  if (D > 0 && D <= 12) {
    hint = "XCO (format court)";
    confidence = 0.60;
  }
  if (D > 12 && D <= 25) {
    hint = "XCO / XCM court";
    confidence = 0.55;
  }
  if (D > 25 && D <= 60) {
    hint = "XCM (marathon)";
    confidence = 0.60;
  }
  if (D > 60) {
    hint = "XCM long / Ultra";
    confidence = 0.65;
  }

  // Ajustements selon D+ / pente / technique
  if (hasElevation && D > 0) {
    const vm = H / Math.max(D, 0.01); // m/km
    if (vm >= 35) confidence += 0.08;
    if ((steep?.p15 || 0) >= 0.08) confidence += 0.06;
  }

  if (Number.isFinite(techScoreV2)) {
    if (techScoreV2 >= 75) confidence += 0.06;
    if (techScoreV2 <= 30) confidence -= 0.04;
  }

  confidence = clamp(confidence, 0.35, 0.85);

  return {
    hint,
    confidence: Math.round(confidence * 1000) / 1000
  };
}
