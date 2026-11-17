require('dotenv').config();
const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');

// Import des routes
const residencesRoutes = require('./routes/residences');
const reservationsRoutes = require('./routes/reservations');
const adminRoutes = require('./routes/admin');

const app = express();

// ✅ Logger toutes les requêtes
if (process.env.NODE_ENV !== 'test') {
  app.use(morgan('combined'));
}

// ✅ Configuration CORS
const allowedOrigins = [
  // FRONTEND_URL peut contenir plusieurs adresses séparées par des virgules
  ...(process.env.FRONTEND_URL || 'https://sankofart-residence.vercel.app')
    .split(',').map(url => url.trim().replace(/\/$/, '')).filter(Boolean),
  'http://localhost:3000', // Pour le développement
  'http://localhost:3001', // Développement (3000 parfois occupé)
  'http://localhost:5173'  // Pour Vite
];

app.use(cors({
  origin: function (origin, callback) {
    // Permettre les requêtes sans origine (comme les apps mobiles)
    if (!origin) return callback(null, true);
    
    if (allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      console.log('🚫 Origine bloquée par CORS:', origin);
      callback(new Error('Non autorisé par CORS'));
    }
  },
  credentials: true
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// ✅ Limiter les requêtes globales pour protéger contre le spam
const globalLimiter = rateLimit({
  skip: () => process.env.NODE_ENV === 'test', // pas de limite pendant les tests
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // max 100 requêtes par IP
  message: { 
    success: false,
    message: 'Trop de requêtes, veuillez réessayer plus tard.' 
  }
});

app.use('/api/', globalLimiter);

// ✅ Routes de l'API
app.use('/api/residences', residencesRoutes);
app.use('/api/reservations', reservationsRoutes);
app.use('/api/admin', adminRoutes);

// ✅ Route de santé
app.get('/health', (req, res) => {
  res.json({
    success: true,
    message: 'Sankofart Résidence API - Opérationnel',
    timestamp: new Date().toISOString(),
    version: '1.0.0'
  });
});

// ✅ Route racine
app.get('/', (req, res) => {
  res.json({
    success: true,
    message: 'Bienvenue sur l\'API Sankofart Résidence',
    endpoints: {
      residences: '/api/residences',
      reservations: '/api/reservations',
      admin: '/api/admin',
      health: '/health'
    },
    documentation: 'Consultez la documentation pour plus d\'informations'
  });
});

// ✅ Gestion des erreurs 404
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    message: 'Route non trouvée',
    path: req.originalUrl
  });
});

// ✅ Gestion globale des erreurs
app.use((error, req, res, next) => {
  console.error('❌ Erreur globale:', error);
  
  if (error.message === 'Non autorisé par CORS') {
    return res.status(403).json({
      success: false,
      message: 'Origine non autorisée'
    });
  }

  res.status(500).json({
    success: false,
    message: 'Erreur interne du serveur',
    error: process.env.NODE_ENV === 'development' ? error.message : 'Une erreur est survenue'
  });
});

// ✅ Port dynamique
const PORT = process.env.PORT || 5001;

// ✅ Démarrer le serveur (sauf quand le fichier est importé par les tests)
if (require.main === module) {
  const db = require('./db');
  db.connect()
    .then(() => {
      console.log('🗄️  Connecté à MongoDB');
      const AIService = require('./services/AIService');
      if (AIService.estActive()) {
        console.log(`🧠 Recherche intelligente : Voyage AI (${AIService.model})`);
        require('./services/SmartSearchService').synchroniserEnFond();
      } else {
        console.log('🔎 Recherche intelligente : mode mots-clés (VOYAGE_API_KEY non définie)');
      }
      app.listen(PORT, () => {
        console.log('🏠 Sankofart Résidence API');
        console.log(`🚀 Serveur démarré sur http://localhost:${PORT}`);
        console.log(`📧 Email configuré: ${process.env.EMAIL_USER ? '✅' : '❌'}`);
        console.log(`🌐 CORS autorisé pour: ${allowedOrigins.join(', ')}`);
        console.log(`⏰ ${new Date().toLocaleString('fr-FR')}`);
      });
    })
    .catch((error) => {
      console.error('❌ Impossible de se connecter à MongoDB :', error.message);
      process.exit(1);
    });
}

module.exports = app;
