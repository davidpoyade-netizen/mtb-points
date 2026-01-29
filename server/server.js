const express = require('express');
const cors = require('cors');
const togeojson = require('@mapbox/togeojson');
const DOMParser = require('xmldom').DOMParser;

const app = express();
const PORT = process.env.PORT || 3000;

// ===== CONFIGURATION CORS =====
const corsOptions = {
  origin: [
    'https://davidpoyade-netizen.github.io',
    'http://localhost:3000',
    'http://127.0.0.1:3000'
  ],
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Accept'],
  credentials: true,
  optionsSuccessStatus: 200
};

app.use(cors(corsOptions));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Middleware de logging
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  console.log('Origin:', req.headers.origin);
  next();
});

// ===== ROUTES =====

// Route racine
app.get('/', (req, res) => {
  res.json({ 
    ok: true,
    service: 'MTB Points API',
    version: '2.0.0',
    timestamp: new Date().toISOString()
  });
});

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    ok: true,
    status: 'healthy', 
    uptime: process.uptime() 
  });
});

// Analyse GPX
app.post('/api/analyze-gpx', async (req, res) => {
  try {
    console.log('📥 Requête d\'analyse GPX reçue');
    console.log('Body keys:', Object.keys(req.body));
    
    const { gpxContent } = req.body;
    
    // Validation du contenu
    if (!gpxContent) {
      console.warn('⚠️ GPX manquant');
      return res.status(400).json({ 
        ok: false,
        error: 'Contenu GPX manquant',
        details: 'Le champ gpxContent est requis'
      });
    }

    if (typeof gpxContent !== 'string') {
      console.warn('⚠️ GPX pas une string:', typeof gpxContent);
      return res.status(400).json({ 
        ok: false,
        error: 'Format GPX invalide',
        details: 'gpxContent doit être une chaîne de caractères XML'
      });
    }

    if (gpxContent.length < 50) {
      console.warn('⚠️ GPX trop court:', gpxContent.length, 'caractères');
      return res.status(400).json({ 
        ok: false,
        error: 'GPX trop court',
        details: `Le fichier GPX est trop court (${gpxContent.length} caractères)`
      });
    }

    console.log('📊 Parsing du GPX... (', gpxContent.length, 'caractères)');
    
    // Parser le XML
    const gpxDoc = new DOMParser().parseFromString(gpxContent, 'text/xml');
    
    // Vérifier les erreurs de parsing
    const parserError = gpxDoc.getElementsByTagName('parsererror');
    if (parserError.length > 0) {
      console.error('❌ Erreur de parsing XML');
      return res.status(400).json({ 
        ok: false,
        error: 'XML invalide',
        details: 'Le fichier GPX contient des erreurs XML'
      });
    }
    
    // Convertir en GeoJSON
    const geojson = togeojson.gpx(gpxDoc);
    
    if (!geojson || !geojson.features || geojson.features.length === 0) {
      console.error('❌ Aucune feature dans le GeoJSON');
      return res.status(400).json({ 
        ok: false,
        error: 'GPX vide',
        details: 'Aucune trace trouvée dans le fichier GPX'
      });
    }

    console.log('✅ GeoJSON créé:', geojson.features.length, 'features');

    // Extraire les coordonnées
    const feature = geojson.features[0];
    let coordinates = [];

    if (feature.geometry.type === 'LineString') {
      coordinates = feature.geometry.coordinates;
    } else if (feature.geometry.type === 'MultiLineString') {
      coordinates = feature.geometry.coordinates.flat();
    } else {
      console.error('❌ Type de géométrie non supporté:', feature.geometry.type);
      return res.status(400).json({ 
        ok: false,
        error: 'Type de trace non supporté',
        details: `Type de géométrie: ${feature.geometry.type}`
      });
    }

    if (coordinates.length === 0) {
      console.error('❌ Aucune coordonnée');
      return res.status(400).json({ 
        ok: false,
        error: 'GPX vide',
        details: 'Aucun point de trace trouvé'
      });
    }

    console.log('📈 Calcul des statistiques...', coordinates.length, 'points');
    
    // Calculer les statistiques
    const stats = calculateStats(coordinates);
    
    console.log('✅ Statistiques:', stats);

    res.json({
      ok: true,
      success: true,
      data: {
        geojson,
        stats
      }
    });

  } catch (error) {
    console.error('❌ Erreur serveur:', error);
    res.status(500).json({ 
      ok: false,
      error: 'Erreur serveur',
      details: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

// ===== CALCUL DES STATISTIQUES =====
function calculateStats(coordinates) {
  if (!coordinates || coordinates.length === 0) {
    return null;
  }

  let totalDistance = 0;
  let totalElevationGain = 0;
  let totalElevationLoss = 0;
  let minElevation = Infinity;
  let maxElevation = -Infinity;

  for (let i = 0; i < coordinates.length - 1; i++) {
    const [lon1, lat1, ele1] = coordinates[i];
    const [lon2, lat2, ele2] = coordinates[i + 1];

    // Distance (Haversine)
    const R = 6371000;
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
    distance: Math.round(totalDistance),
    elevationGain: Math.round(totalElevationGain),
    elevationLoss: Math.round(totalElevationLoss),
    minElevation: minElevation === Infinity ? 0 : Math.round(minElevation),
    maxElevation: maxElevation === -Infinity ? 0 : Math.round(maxElevation),
    pointsCount: coordinates.length
  };
}

// 404
app.use((req, res) => {
  res.status(404).json({ 
    ok: false,
    error: 'Route non trouvée',
    path: req.path 
  });
});

// Démarrage
app.listen(PORT, () => {
  console.log('🚀 MTB Points API démarré');
  console.log(`📡 Port: ${PORT}`);
  console.log(`🌍 Environnement: ${process.env.NODE_ENV || 'development'}`);
  console.log(`✅ CORS: ${corsOptions.origin.join(', ')}`);
});

process.on('SIGTERM', () => {
  console.log('👋 Arrêt du serveur...');
  process.exit(0);
});
