// js/elevation-profile.js
// MTB Points — Affichage du profil altimétrique
// Utilise Chart.js pour afficher un graphique du profil

// ============================================================================
// CONFIGURATION
// ============================================================================

// Charger Chart.js via CDN (à ajouter dans le HTML)
// <script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js"></script>

(function() {
  
  /**
   * Calcule la distance cumulée entre les points GPX
   * @param {Array} points - Points GPX [{lat, lon, ele}]
   * @returns {Array} - Distances cumulées en km
   */
  function calculateCumulativeDistance(points) {
    if (!points || points.length < 2) return [];
    
    const distances = [0];
    let cumulative = 0;
    
    for (let i = 1; i < points.length; i++) {
      const d = haversine(
        points[i-1].lat, points[i-1].lon,
        points[i].lat, points[i].lon
      );
      cumulative += d / 1000; // mètres → km
      distances.push(cumulative);
    }
    
    return distances;
  }

  /**
   * Distance Haversine entre deux points
   */
  function haversine(lat1, lon1, lat2, lon2) {
    const R = 6371000; // Rayon de la Terre en mètres
    const toRad = (deg) => (deg * Math.PI) / 180;
    
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    
    const a = 
      Math.sin(dLat / 2) ** 2 +
      Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
    
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  /**
   * Simplifie les points pour éviter trop de données sur le graphique
   * @param {Array} points - Points GPX
   * @param {number} maxPoints - Nombre max de points (défaut: 500)
   */
  function simplifyPoints(points, maxPoints = 500) {
    if (!points || points.length <= maxPoints) return points;
    
    const step = Math.ceil(points.length / maxPoints);
    const simplified = [];
    
    for (let i = 0; i < points.length; i += step) {
      simplified.push(points[i]);
    }
    
    // Toujours inclure le dernier point
    if (simplified[simplified.length - 1] !== points[points.length - 1]) {
      simplified.push(points[points.length - 1]);
    }
    
    return simplified;
  }

  /**
   * Crée le graphique du profil altimétrique
   * @param {string} canvasId - ID du canvas HTML
   * @param {Array} points - Points GPX [{lat, lon, ele}]
   * @param {Object} options - Options du graphique
   */
  function createElevationProfile(canvasId, points, options = {}) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) {
      console.error(`Canvas #${canvasId} non trouvé`);
      return null;
    }

    if (!points || points.length < 2) {
      console.error('Pas assez de points pour créer le profil');
      return null;
    }

    // Simplifier les points si trop nombreux
    const maxPoints = options.maxPoints || 500;
    const simplified = simplifyPoints(points, maxPoints);
    
    console.log(`📊 Profil: ${points.length} points → ${simplified.length} points (simplifié)`);

    // Calculer les distances
    const distances = calculateCumulativeDistance(simplified);
    const elevations = simplified.map(p => p.ele || 0);

    // Calculer stats
    const minEle = Math.min(...elevations);
    const maxEle = Math.max(...elevations);
    const totalDist = distances[distances.length - 1];

    // Créer le graphique
    const ctx = canvas.getContext('2d');
    
    const chart = new Chart(ctx, {
      type: 'line',
      data: {
        labels: distances.map(d => d.toFixed(2)),
        datasets: [{
          label: 'Altitude (m)',
          data: elevations,
          borderColor: options.lineColor || 'rgb(31, 122, 77)',
          backgroundColor: options.fillColor || 'rgba(31, 122, 77, 0.1)',
          borderWidth: 2,
          fill: true,
          tension: 0.1,
          pointRadius: 0, // Pas de points visibles
          pointHitRadius: 8, // Zone de survol
          pointHoverRadius: 4,
          pointHoverBackgroundColor: 'rgb(31, 122, 77)',
          pointHoverBorderColor: '#fff',
          pointHoverBorderWidth: 2
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: options.maintainAspectRatio !== false,
        interaction: {
          mode: 'index',
          intersect: false,
        },
        plugins: {
          legend: {
            display: false
          },
          title: {
            display: true,
            text: options.title || 'Profil altimétrique',
            font: {
              size: 16,
              weight: 'bold'
            }
          },
          tooltip: {
            callbacks: {
              title: function(context) {
                return `Distance: ${context[0].label} km`;
              },
              label: function(context) {
                return `Altitude: ${context.parsed.y.toFixed(0)} m`;
              }
            }
          }
        },
        scales: {
          x: {
            title: {
              display: true,
              text: 'Distance (km)',
              font: {
                weight: 'bold'
              }
            },
            grid: {
              display: false
            }
          },
          y: {
            title: {
              display: true,
              text: 'Altitude (m)',
              font: {
                weight: 'bold'
              }
            },
            suggestedMin: Math.floor(minEle - 20),
            suggestedMax: Math.ceil(maxEle + 20),
            ticks: {
              callback: function(value) {
                return value + ' m';
              }
            }
          }
        }
      }
    });

    // Afficher les stats
    console.log(`📊 Profil créé:`);
    console.log(`   Distance: ${totalDist.toFixed(2)} km`);
    console.log(`   Altitude min: ${minEle.toFixed(0)} m`);
    console.log(`   Altitude max: ${maxEle.toFixed(0)} m`);
    console.log(`   Dénivelé: ${(maxEle - minEle).toFixed(0)} m`);

    return chart;
  }

  /**
   * Charge et affiche le profil pour une épreuve
   * @param {string} eventId - ID de l'épreuve
   * @param {string} canvasId - ID du canvas
   */
  function loadAndDisplayProfile(eventId, canvasId) {
    // Récupérer l'épreuve depuis le storage
    let event = null;
    
    // Essayer avec la fonction window.findStoredEvent
    if (typeof window.findStoredEvent === 'function') {
      event = window.findStoredEvent(eventId);
    } else {
      // Fallback: chercher dans localStorage
      try {
        const events = JSON.parse(localStorage.getItem('vtt_events_v1') || '[]');
        event = events.find(e => e.id === eventId);
      } catch (e) {
        console.error('Erreur lecture storage:', e);
        return null;
      }
    }

    if (!event) {
      console.error(`Épreuve ${eventId} non trouvée`);
      return null;
    }

    // Récupérer les points GPX
    const points = event.gpx?.points;
    
    if (!points || !Array.isArray(points) || points.length < 2) {
      console.error('Aucun point GPX disponible pour cette épreuve');
      return null;
    }

    console.log(`✅ ${points.length} points GPX chargés pour ${event.name}`);

    // Créer le profil
    return createElevationProfile(canvasId, points, {
      title: `Profil: ${event.name}`,
      maxPoints: 500
    });
  }

  // Export des fonctions
  window.MTBElevation = {
    createElevationProfile,
    loadAndDisplayProfile,
    simplifyPoints,
    calculateCumulativeDistance
  };

  console.log('✅ elevation-profile.js chargé');

})();

// ============================================================================
// EXEMPLE D'UTILISATION
// ============================================================================

/*

HTML:
-----
<!-- Charger Chart.js -->
<script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js"></script>

<!-- Charger ce script -->
<script src="js/elevation-profile.js"></script>

<!-- Canvas pour le graphique -->
<div style="max-width: 900px; margin: 20px auto;">
  <canvas id="elevationChart"></canvas>
</div>


JavaScript (race.html):
-----------------------
// Méthode 1: Charger automatiquement depuis l'ID de l'épreuve
const eventId = new URLSearchParams(location.search).get('id');
window.MTBElevation.loadAndDisplayProfile(eventId, 'elevationChart');


// Méthode 2: Passer manuellement les points
const event = window.findStoredEvent(eventId);
if (event?.gpx?.points) {
  window.MTBElevation.createElevationProfile('elevationChart', event.gpx.points, {
    title: `Profil: ${event.name}`,
    lineColor: 'rgb(31, 122, 77)',
    fillColor: 'rgba(31, 122, 77, 0.1)',
    maxPoints: 500
  });
}


// Méthode 3: Simplifier les points avant sauvegarde (optionnel)
// Si vous avez des milliers de points et voulez réduire la taille
const simplified = window.MTBElevation.simplifyPoints(allPoints, 1000);
event.gpx.points = simplified;


Styles CSS:
-----------
#elevationChart {
  max-width: 100%;
  height: 400px;
  background: white;
  border-radius: 12px;
  padding: 15px;
  box-shadow: 0 2px 10px rgba(0,0,0,0.1);
}

@media (max-width: 768px) {
  #elevationChart {
    height: 300px;
  }
}

*/
