// js/gpx.js - VERSION CLIENT-SIDE
// ✅ Analyse GPX directement dans le navigateur
// ✅ Pas de serveur nécessaire
// ✅ Zéro problème CORS
// ✅ Compatible avec le code existant

(function () {
  
  function emitStatus(phase, message, progress) {
    try {
      window.dispatchEvent(
        new CustomEvent("mtb:status", {
          detail: {
            phase: phase || "—",
            message: message || "—",
            progress: typeof progress === "number" ? progress : undefined,
          },
        })
      );
    } catch (_) {}
  }

  async function readFileText(file) {
    if (!file) return "";
    if (typeof file.text === "function") return await file.text();
    return await new Promise((resolve, reject) => {
      const fr = new FileReader();
      fr.onerror = () => reject(fr.error || new Error("FileReader error"));
      fr.onload = () => resolve(String(fr.result || ""));
      fr.readAsText(file);
    });
  }

  // ===== ANALYSE GPX CLIENT-SIDE =====
  
  function parseGPX(gpxText) {
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(gpxText, 'text/xml');
    
    // Vérifier erreurs de parsing
    const parserError = xmlDoc.querySelector('parsererror');
    if (parserError) {
      throw new Error('GPX XML invalide');
    }
    
    // Extraire tous les points de trace
    const points = [];
    const trkpts = xmlDoc.querySelectorAll('trkpt');
    
    trkpts.forEach(trkpt => {
      const lat = parseFloat(trkpt.getAttribute('lat'));
      const lon = parseFloat(trkpt.getAttribute('lon'));
      
      const eleNode = trkpt.querySelector('ele');
      const ele = eleNode ? parseFloat(eleNode.textContent) : 0;
      
      if (!isNaN(lat) && !isNaN(lon)) {
        points.push({ lat, lon, ele });
      }
    });
    
    return points;
  }
  
  function calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371000; // Rayon Terre en mètres
    const φ1 = lat1 * Math.PI / 180;
    const φ2 = lat2 * Math.PI / 180;
    const Δφ = (lat2 - lat1) * Math.PI / 180;
    const Δλ = (lon2 - lon1) * Math.PI / 180;
    
    const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
              Math.cos(φ1) * Math.cos(φ2) *
              Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    
    return R * c;
  }
  
  function calculateStats(points) {
    if (!points || points.length === 0) {
      return {
        distanceKm: 0,
        dplusM: 0,
        hasElevation: false
      };
    }
    
    let totalDistance = 0;
    let elevationGain = 0;
    let elevationLoss = 0;
    let minElevation = Infinity;
    let maxElevation = -Infinity;
    
    for (let i = 0; i < points.length - 1; i++) {
      const p1 = points[i];
      const p2 = points[i + 1];
      
      // Distance
      const distance = calculateDistance(p1.lat, p1.lon, p2.lat, p2.lon);
      totalDistance += distance;
      
      // Dénivelé
      const elevDiff = p2.ele - p1.ele;
      if (elevDiff > 0) {
        elevationGain += elevDiff;
      } else {
        elevationLoss += Math.abs(elevDiff);
      }
      
      minElevation = Math.min(minElevation, p1.ele, p2.ele);
      maxElevation = Math.max(maxElevation, p1.ele, p2.ele);
    }
    
    return {
      distanceKm: totalDistance / 1000,
      dplusM: Math.round(elevationGain),
      dminusM: Math.round(elevationLoss),
      minElevation: Math.round(minElevation),
      maxElevation: Math.round(maxElevation),
      hasElevation: maxElevation > 0,
      pointsCount: points.length
    };
  }

  async function analyzeGPX(file, opts = {}) {
    const keepPoints = opts.keepPoints !== false;

    if (!file) throw new Error("Aucun fichier GPX.");

    try {
      emitStatus("gpx", "Lecture du GPX…", 0.1);
      const gpxText = await readFileText(file);
      
      if (!gpxText || gpxText.length < 50) {
        throw new Error("GPX vide ou invalide.");
      }

      emitStatus("gpx", "Analyse du parcours…", 0.3);
      const points = parseGPX(gpxText);
      
      if (points.length === 0) {
        throw new Error("Aucun point de trace trouvé dans le GPX.");
      }
      
      console.log(`📍 ${points.length} points extraits`);

      emitStatus("gpx", "Calcul des statistiques…", 0.6);
      const stats = calculateStats(points);
      
      console.log("📊 Stats calculées:", stats);

      // Détection de discipline basique
      let discipline = null;
      if (stats.distanceKm > 50) {
        discipline = "enduro";
      } else if (stats.dplusM / stats.distanceKm > 50) {
        discipline = "enduro";
      } else {
        discipline = "xc";
      }

      const out = {
        fileName: file.name,
        distanceKm: stats.distanceKm,
        dplusM: stats.dplusM,
        hasElevation: stats.hasElevation,
        steep: stats.dplusM / stats.distanceKm > 40, // Basique
        discipline: discipline,
        techV2: {
          techScoreV2: null,
          tech01: null,
          details: "Analyse terrain non disponible (mode client-side)",
          surfaceEstimate: null,
          osmOk: false,
        },
        phys: { 
          score: null, 
          effort: null, 
          ipbOverall: null 
        },
        mrs: null,
      };

      if (keepPoints) {
        out.points = points;
        console.log(`✅ ${points.length} points inclus dans la réponse`);
      }

      emitStatus("done", "Analyse terminée.", 1);
      return out;
      
    } catch (error) {
      emitStatus("error", error.message, undefined);
      throw error;
    }
  }

  // Export global
  window.analyzeGPX = analyzeGPX;

  console.log("✅ gpx.js chargé (MODE CLIENT-SIDE - Sans serveur)");
  console.log("ℹ️  L'analyse GPX se fait directement dans le navigateur");
})();
