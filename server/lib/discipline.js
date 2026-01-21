// lib/discipline.js
export function inferDiscipline({ distanceKm, dplusM, hasElevation, steep, techScoreV2 }) {
  const d = Number(distanceKm || 0);
  const dp = Number(dplusM || 0);

  // Heuristiques simples et stables (auto-XC)
  // ✅ XCC : très court
  if (d > 0 && d <= 12) return "XCC";

  // ✅ XCO : format XC classique (souvent 15–35 km selon GPX / laps)
  if (d > 12 && d <= 35) return "XCO";

  // ✅ XCR : relai -> impossible à déduire sûrement d’un GPX seul
  // -> on le met en XCO par défaut si intermédiaire, et l’orga peut corriger en XCR
  // (si tu veux une règle: laps>=4 etc, mais l’API ne reçoit pas laps)
  // return "XCR"; // <-- pas recommandé en auto

  // ✅ XCM : marathon / raid
  if (d > 35) return "XCM";

  // fallback
  return "XCO";
}
