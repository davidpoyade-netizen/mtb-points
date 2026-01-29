const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs').promises;
const togeojson = require('@mapbox/togeojson');
const DOMParser = require('xmldom').DOMParser;

const app = express();
const PORT = process.env.PORT || 3000;

// ===== CONFIGURATION CORS CORRIGÉE =====
const corsOptions = {
  origin: [
    'https://davidpoyade-netizen.github.io',  // Ton frontend GitHub Pages
    'http://localhost:3000',                   // Pour tests en local
    'http://127.0.0.1:3000'
  ],
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Accept'],
  credentials: true,
  optionsSuccessStatus: 200
};

app.use(cors(corsOptions));

// Middleware pour logger les requêtes
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  console.log('Origin:', req.headers.origin);
  next();
});

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// ===== ROUTE DE TEST =====
app.get('/', (req, res) => {
  res.json({ 
    status: 'OK', 
    message: 'MTB Points API est en ligne',
    timestamp: new Date().toISOString()
  });
});

// ===== ROUTE HEALTH CHECK =====
app.get('/health', (req, res) => {
  res.json({ status: 'healthy', uptime: process.uptime() });
});

// ===== ROUTE ANALYSE GPX =====
app.post('/api/analyze-gpx', async (req, res) => {
  try {
    console.log('📥 Requête d\'analyse GPX reçue');
    
    const { gpxContent } = req.body;
    
    if (!gpxContent) {
      return res.status(400).json({ 
        error: 'Contenu GPX manquant',
        details: 'Le champ gpxContent est requis'
      });
    }

    console.log('📊 Parsing du GPX...');
    
    // Parser le GPX
    const gpxDoc = new DOMParser().parseFromString(gpxContent, 'text/xml');
    const geojson = togeojson.gpx(gpxDoc);
    
    if (!geojson || !geojson.features || geojson.features.length === 0) {
      return res.status(400).json({ 
        error: 'GPX invalide',
        details: 'Aucune donnée de trace trouvée dans le fichier'
      });
    }

    console.log('✅ GPX parsé avec succès');

    // Extraire les coordonnées
    const coordinates = geojson.features[0].geometry.coordinates;
    
    // Calculer les statistiques
    const stats = calculateStats(coordinates);
    
    console.log('📈 Statistiques calculées:', stats);

    res.json({
      success: true,
      data: {
        geojson,
        stats
      }
    });

  } catch (error) {
    console.error('❌ Erreur lors de l\'analyse GPX:', error);
    res.status(500).json({ 
      error: 'Erreur serveur',
      details: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

// ===== FONCTION DE CALCUL DES STATS =====
function calculateStats(coordinates) {
  if (!coordinates || coordinates.length === 0) {
    return null;
  }

  let totalDistance = 0;
  let totalElevationGain = 0;
  let totalElevationLoss = 0;
  let minElevation = Infinity;
  let maxElevation = -Infinity;

  // Calculer distance et dénivelé
  for (let i = 0; i < coordinates.length - 1; i++) {
    const [lon1, lat1, ele1] = coordinates[i];
    const [lon2, lat2, ele2] = coordinates[i + 1];

    // Distance (formule de Haversine)
    const R = 6371000; // Rayon de la Terre en mètres
    const φ1 = lat1 * Math.PI / 180;
    const φ2 = lat2 * Math.PI / 180;
    const Δφ = (lat2 - lat1) * Math.PI / 180;
    const Δλ = (lon2 - lon1) * Math.PI / 180;

    const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
              Math.cos(φ1) * Math.cos(φ2) *
              Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const distance = R * c;

    totalDistance += distance;

    // Dénivelé
    if (ele1 !== undefined && ele2 !== undefined) {
      const elevDiff = ele2 - ele1;
      if (elevDiff > 0) {
        totalElevationGain += elevDiff;
      } else {
        totalElevationLoss += Math.abs(elevDiff);
      }

      minElevation = Math.min(minElevation, ele1, ele2);
      maxElevation = Math.max(maxElevation, ele1, ele2);
    }
  }

  return {
    distance: Math.round(totalDistance), // en mètres
    elevationGain: Math.round(totalElevationGain), // en mètres
    elevationLoss: Math.round(totalElevationLoss), // en mètres
    minElevation: Math.round(minElevation),
    maxElevation: Math.round(maxElevation),
    pointsCount: coordinates.length
  };
}

// ===== GESTION DES ERREURS 404 =====
app.use((req, res) => {
  res.status(404).json({ 
    error: 'Route non trouvée',
    path: req.path 
  });
});

// ===== DÉMARRAGE DU SERVEUR =====
app.listen(PORT, () => {
  console.log('🚀 Serveur MTB Points démarré');
  console.log(`📡 Port: ${PORT}`);
  console.log(`🌍 Environnement: ${process.env.NODE_ENV || 'development'}`);
  console.log(`✅ CORS configuré pour: ${corsOptions.origin.join(', ')}`);
});

// Gestion propre de l'arrêt
process.on('SIGTERM', () => {
  console.log('👋 SIGTERM reçu, arrêt du serveur...');
  process.exit(0);
});
