// discipline-calculator.js
// Calcul automatique de la discipline VTT selon distance et D+
// Basé sur les standards UCI/FFC

/**
 * Calcule la discipline VTT selon la distance et le dénivelé positif
 * @param {number} distanceKm - Distance en kilomètres
 * @param {number} dplusM - Dénivelé positif en mètres
 * @returns {object} {code, name, description, confidence}
 */
export function calculateDiscipline(distanceKm, dplusM) {
  const dist = Number(distanceKm);
  const dplus = Number(dplusM);
  
  // Validation
  if (!Number.isFinite(dist) || !Number.isFinite(dplus) || dist <= 0 || dplus < 0) {
    return {
      code: null,
      name: "Indéterminé",
      description: "Données insuffisantes",
      confidence: 0
    };
  }

  // XCC - Short Track (< 10 km et < 300 m D+)
  if (dist < 10 && dplus < 300) {
    return {
      code: "XCC",
      name: "XCC (Short Track)",
      description: "Format court et explosif",
      confidence: 1.0
    };
  }

  // XCM Ultra (≥ 100 km et ≥ 3000 m D+)
  if (dist >= 100 && dplus >= 3000) {
    return {
      code: "XCM Ultra",
      name: "XCM Ultra",
      description: "Ultra-distance, très longue durée",
      confidence: 1.0
    };
  }

  // XCM - Marathon (≥ 60 km et ≥ 1500 m D+)
  if (dist >= 60 && dplus >= 1500) {
    return {
      code: "XCM",
      name: "XCM (Marathon)",
      description: "Longue distance, endurance",
      confidence: 1.0
    };
  }

  // XCR - XC Race / XC longue distance (30-55 km et 800-1800 m D+)
  if (dist >= 30 && dist <= 55 && dplus >= 800 && dplus <= 1800) {
    return {
      code: "XCR",
      name: "XCR (XC Race / Longue distance)",
      description: "XC longue distance",
      confidence: 1.0
    };
  }

  // XCO - Olympique (20-35 km et 600-1200 m D+)
  if (dist >= 20 && dist <= 35 && dplus >= 600 && dplus <= 1200) {
    return {
      code: "XCO",
      name: "XCO (Olympique)",
      description: "Format olympique standard",
      confidence: 1.0
    };
  }

  // Cas limites avec confiance réduite

  // Proche de XCO mais hors limites
  if (dist >= 18 && dist <= 40 && dplus >= 500 && dplus <= 1400) {
    return {
      code: "XCO",
      name: "XCO (Olympique)",
      description: "Format olympique (approximatif)",
      confidence: 0.7
    };
  }

  // Proche de XCR mais hors limites
  if (dist >= 25 && dist < 60 && dplus >= 700 && dplus < 2000) {
    return {
      code: "XCR",
      name: "XCR (XC Race / Longue distance)",
      description: "XC longue distance (approximatif)",
      confidence: 0.6
    };
  }

  // Proche de XCM mais hors limites
  if (dist >= 50 && dist < 100 && dplus >= 1200) {
    return {
      code: "XCM",
      name: "XCM (Marathon)",
      description: "Marathon (approximatif)",
      confidence: 0.7
    };
  }

  // Trop court pour XCO
  if (dist < 20) {
    return {
      code: "XCC",
      name: "XCC (Short Track)",
      description: "Format court (approximatif)",
      confidence: 0.5
    };
  }

  // Indéterminé
  return {
    code: null,
    name: "XC (Cross-Country)",
    description: "Format non standard",
    confidence: 0.3
  };
}

/**
 * Obtient toutes les catégories de disciplines avec leurs règles
 * @returns {array} Liste des disciplines avec leurs critères
 */
export function getDisciplineRules() {
  return [
    {
      code: "XCC",
      name: "XCC (Short Track)",
      description: "Format court et explosif",
      distanceRange: "< 10 km",
      dplusRange: "< 300 m",
      duration: "20-30 min",
      characteristics: "Circuit court, nombreux tours, très intense"
    },
    {
      code: "XCO",
      name: "XCO (Olympique)",
      description: "Format olympique standard",
      distanceRange: "20-35 km",
      dplusRange: "600-1 200 m",
      duration: "1h15-1h45",
      characteristics: "Circuit de 4-6 km, plusieurs tours, rythme soutenu"
    },
    {
      code: "XCR",
      name: "XCR (XC Race / Longue distance)",
      description: "XC longue distance",
      distanceRange: "30-55 km",
      dplusRange: "800-1 800 m",
      duration: "1h45-3h",
      characteristics: "Circuit plus long, endurance et technique"
    },
    {
      code: "XCM",
      name: "XCM (Marathon)",
      description: "Longue distance, endurance",
      distanceRange: "≥ 60 km",
      dplusRange: "≥ 1 500 m",
      duration: "3h-6h",
      characteristics: "Très longue distance, gestion de l'effort cruciale"
    },
    {
      code: "XCM_ULTRA",
      name: "XCM Ultra",
      description: "Ultra-distance",
      distanceRange: "≥ 100 km",
      dplusRange: "≥ 3 000 m",
      duration: "> 6h",
      characteristics: "Ultra-endurance, défi physique et mental extrême"
    }
  ];
}

/**
 * Formate l'affichage de la discipline
 * @param {object} discipline - Résultat de calculateDiscipline
 * @returns {string} Texte formaté
 */
export function formatDiscipline(discipline) {
  if (!discipline || !discipline.code) {
    return "Discipline indéterminée";
  }
  
  const confidence = discipline.confidence || 1;
  const suffix = confidence < 1 ? " (estimation)" : "";
  
  return `${discipline.name}${suffix}`;
}
