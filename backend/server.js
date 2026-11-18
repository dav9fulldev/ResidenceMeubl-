require('dotenv').config();
const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const { clientIp, cleLimite } = require('./middleware/clientIp');

// Import des routes
const residencesRoutes = require('./routes/residences');
const reservationsRoutes = require('./routes/reservations');
const adminRoutes = require('./routes/admin');
const clientRoutes = require('./routes/client');

const app = express();

// Render (et la plupart des hébergeurs) placent un relais devant le serveur :
// sans ce réglage, tous les visiteurs auraient la même IP et partageraient
// les mêmes limites (ex. 3 réservations / 15 min pour tout le site).
if (process.env.NODE_ENV === 'production' || process.env.TRUST_PROXY) {
  app.set('trust proxy', Number(process.env.TRUST_PROXY) || 1);
}

// ✅ Logger toutes les requêtes
if (process.env.NODE_ENV !== 'test') {
  // Format « combined » avec l'IP réelle du visiteur
  morgan.token('client-ip', (req) => clientIp(req));
  app.use(morgan(':client-ip - :remote-user [:date[clf]] ":method :url HTTP/:http-version" :status :res[content-length] ":referrer" ":user-agent"'));
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
      // Refus normal (ex. aperçus automatiques Vercel) : le navigateur bloque la réponse.
      // Une seule ligne d'information, pas d'erreur avec trace.
      if (process.env.NODE_ENV !== 'test') console.log('🚫 Origine non autorisée (CORS) :', origin);
      callback(null, false);
    }
  },
  credentials: true
}));

// Webhook PI-SPI : corps brut indispensable pour vérifier la signature X-Signature
const PaymentService = require('./services/paiement/PaymentService');
app.post('/api/paiements/pispi/webhook', express.raw({ type: '*/*', limit: '1mb' }), (req, res) => {
  const corpsBrut = Buffer.isBuffer(req.body) ? req.body : Buffer.from('');
  if (!PaymentService.signatureValide(corpsBrut, req.get('X-Signature'))) {
    return res.status(401).json({ success: false, message: 'Signature invalide' });
  }
  let corps;
  try {
    corps = JSON.parse(corpsBrut.toString('utf8'));
  } catch {
    return res.status(400).json({ success: false, message: 'JSON invalide' });
  }
  res.status(204).end(); // répondre en moins de 5 s, traiter ensuite
  PaymentService.traiterEvenements(corps).catch(e => console.error('⚠️ Webhook PI-SPI :', e.message));
});

// Webhook GeniusPay : signature X-Webhook-Signature = HMAC-SHA256(timestamp + "." + corps)
app.post('/api/paiements/geniuspay/webhook', express.raw({ type: '*/*', limit: '1mb' }), (req, res) => {
  const GeniusPay = require('./services/paiement/GeniusPayClient');
  const corpsBrut = Buffer.isBuffer(req.body) ? req.body : Buffer.from('');
  if (!GeniusPay.signatureValide(corpsBrut, req.get('X-Webhook-Signature'), req.get('X-Webhook-Timestamp'))) {
    return res.status(401).json({ success: false, message: 'Signature invalide' });
  }
  let corps;
  try {
    corps = JSON.parse(corpsBrut.toString('utf8'));
  } catch {
    return res.status(400).json({ success: false, message: 'JSON invalide' });
  }
  res.status(200).json({ success: true }); // répondre vite, traiter ensuite
  PaymentService.traiterEvenementGeniusPay(corps).catch(e => console.error('⚠️ Webhook GeniusPay :', e.message));
});

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// ✅ Limiter les requêtes globales pour protéger contre le spam
const globalLimiter = rateLimit({
  keyGenerator: cleLimite, // IP réelle du visiteur (voir middleware/clientIp.js)
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
// Identité publique de l'établissement (coordonnées, réseaux) pour le site
app.get('/api/etablissement', (req, res) => {
  const Settings = require('./services/SettingsService');
  res.json({
    success: true,
    data: {
      ...Settings.etablissement({ publique: true }),
      // Moyens de paiement proposés aux clients
      moyensPaiement: require('./services/paiement/fournisseurs').actifs().map(m => ({ id: m.id, nom: m.nom, modes: m.modes })),
      // Règles publiques de l'acompte (affichées avant la réservation)
      acompte: {
        pourcentage: Settings.get('acomptePourcentage'),
        remboursementPourcentage: Settings.get('remboursementPourcentage'),
        integralJours: Settings.get('remboursableApresPaiementJours'),
        avantArriveeJours: Settings.get('nonRemboursableAvantArriveeJours'),
      },
    },
  });
});
app.use('/api/residences', residencesRoutes);
app.use('/api/reservations', reservationsRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/client', clientRoutes);

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
      require('./services/SettingsService').charger()
        .catch(e => console.error('⚠️ Paramètres :', e.message))
        .then(() => {
          const acompte = require('./services/paiement/acompte');
          const moyens = acompte.moyensDisponibles();
          const GeniusPay = require('./services/paiement/GeniusPayClient');
          console.log(`💳 Paiement de l'acompte : ${moyens.length ? moyens.map(m => (m === 'pispi' ? `PI-SPI (${acompte.mode()})` : `GeniusPay (${GeniusPay.environnement})`)).join(', ') : 'désactivé'}`);
          if (moyens.length) PaymentService.demarrerVerificationPeriodique();
        });
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
        console.log(process.env.BREVO_API_KEY
          ? `📧 Emails : API Brevo (expéditeur ${process.env.EMAIL_FROM || process.env.EMAIL_USER || '❌ non défini'})`
          : `📧 Emails : SMTP Gmail ${process.env.EMAIL_USER ? '✅' : '❌'} (bloqué sur Render gratuit : utiliser BREVO_API_KEY)`);
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
