const express = require('express');
const rateLimit = require('express-rate-limit');
const { cleLimite } = require('../middleware/clientIp');
const router = express.Router();
const AuthService = require('../services/AuthService');
const ResidenceService = require('../services/ResidenceService');
const requireAdmin = require('../middleware/requireAdmin');
const SmartSearchService = require('../services/SmartSearchService');
const StatsService = require('../services/StatsService');
const acompte = require('../services/paiement/acompte');
const PiSpi = require('../services/paiement/PiSpiClient');
const Settings = require('../services/SettingsService');

// Limiter les tentatives de connexion (anti force brute)
const loginLimiter = rateLimit({
  keyGenerator: cleLimite, // IP réelle du visiteur (voir middleware/clientIp.js)
  skip: () => process.env.NODE_ENV === 'test', // pas de limite pendant les tests
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { success: false, message: 'Trop de tentatives de connexion, réessayez dans 15 minutes.' },
});

// Transforme les erreurs de validation en 400, le reste en 500
const gererErreur = (res, error, contexte) => {
  if (error instanceof ResidenceService.ErreurValidation) {
    return res.status(400).json({ success: false, message: error.message });
  }
  console.error(`Erreur ${contexte}:`, error);
  return res.status(500).json({ success: false, message: `Erreur ${contexte}` });
};

/**
 * @route   POST /api/admin/login
 * @desc    Connexion administrateur, retourne un jeton
 * @access  Public
 */
router.post('/login', loginLimiter, async (req, res) => {
  if (!AuthService.estConfigure()) {
    return res.status(503).json({
      success: false,
      message: 'Accès admin non configuré (ADMIN_USERNAME / ADMIN_PASSWORD manquants)',
    });
  }

  const { username, password } = req.body || {};
  if (!AuthService.verifierIdentifiants(username, password)) {
    return res.status(401).json({ success: false, message: 'Identifiants incorrects' });
  }

  res.json({ success: true, data: { token: AuthService.creerJeton(username) } });
});

// Toutes les routes suivantes exigent un jeton admin
router.use(requireAdmin);

/**
 * @route   GET /api/admin/residences
 * @desc    Toutes les résidences, y compris inactives
 */
router.get('/residences', async (req, res) => {
  try {
    const residences = await ResidenceService.getAllResidencesAdmin();
    res.json({ success: true, data: residences, total: residences.length });
  } catch (error) {
    gererErreur(res, error, 'lors de la récupération des résidences');
  }
});

/**
 * @route   POST /api/admin/residences
 * @desc    Ajouter une résidence
 */
router.post('/residences', async (req, res) => {
  try {
    const residence = await ResidenceService.createResidence(req.body || {});
    SmartSearchService.synchroniserEnFond(); // met à jour la recherche intelligente
    res.status(201).json({ success: true, data: residence });
  } catch (error) {
    gererErreur(res, error, 'lors de la création de la résidence');
  }
});

/**
 * @route   PUT /api/admin/residences/:id
 * @desc    Modifier une résidence
 */
router.put('/residences/:id', async (req, res) => {
  try {
    const residence = await ResidenceService.updateResidence(req.params.id, req.body || {});
    SmartSearchService.synchroniserEnFond(); // met à jour la recherche intelligente
    if (!residence) return res.status(404).json({ success: false, message: 'Résidence non trouvée' });
    res.json({ success: true, data: residence });
  } catch (error) {
    gererErreur(res, error, 'lors de la modification de la résidence');
  }
});

/**
 * @route   PUT /api/admin/residences/:id/status
 * @desc    Changer le statut (disponible, occupé, réservé, maintenance)
 * @body    { statut, details: { occupant, arrivee, depart, prochaineDisponibilite } }
 */
router.put('/residences/:id/status', async (req, res) => {
  try {
    const { statut, details } = req.body || {};
    const residence = await ResidenceService.updateStatut(req.params.id, statut, details || {});
    if (!residence) return res.status(404).json({ success: false, message: 'Résidence non trouvée' });
    res.json({ success: true, data: residence });
  } catch (error) {
    gererErreur(res, error, 'lors du changement de statut');
  }
});

/**
 * @route   DELETE /api/admin/residences/:id
 * @desc    Supprimer une résidence
 */
router.delete('/residences/:id', async (req, res) => {
  try {
    if (!(await ResidenceService.deleteResidence(req.params.id))) {
      return res.status(404).json({ success: false, message: 'Résidence non trouvée' });
    }
    SmartSearchService.synchroniserEnFond();
    res.json({ success: true, message: 'Résidence supprimée' });
  } catch (error) {
    gererErreur(res, error, 'lors de la suppression de la résidence');
  }
});

/**
 * @route   GET /api/admin/paiements/config
 * @desc    Mode de paiement, pourcentage d'acompte, réglages PI-SPI manquants, URL du webhook
 */
router.get('/paiements/config', (req, res) => {
  res.json({
    success: true,
    data: {
      mode: acompte.mode(),
      pourcentage: acompte.pourcentage(),
      problemes: PiSpi.problemesConfiguration(),
      webhookSecretDefini: Boolean((process.env.PISPI_WEBHOOK_SECRET || '').trim()),
      webhookUrl: `${req.protocol}://${req.get('host')}/api/paiements/pispi/webhook`,
    },
  });
});

/**
 * @route   GET / PUT /api/admin/parametres
 * @desc    Paramètres de l'acompte : acomptePourcentage, remboursementPourcentage,
 *          remboursableApresPaiementJours, nonRemboursableAvantArriveeJours
 */
router.get('/parametres', (req, res) => {
  res.json({ success: true, data: Settings.tous() });
});

router.put('/parametres', async (req, res) => {
  try {
    res.json({ success: true, data: await Settings.modifier(req.body || {}) });
  } catch (error) {
    if (error instanceof Settings.ErreurParametre) return res.status(400).json({ success: false, message: error.message });
    gererErreur(res, error, 'lors de l\'enregistrement des paramètres');
  }
});

/**
 * @route   GET /api/admin/statistiques?annee=2026
 * @desc    Revenus par mois, cumul, réservations, occupation, classement des résidences
 */
router.get('/statistiques', async (req, res) => {
  try {
    const annee = req.query.annee ? parseInt(req.query.annee, 10) : new Date().getUTCFullYear();
    if (!Number.isInteger(annee) || annee < 2000 || annee > 2100) {
      return res.status(400).json({ success: false, message: 'Année invalide' });
    }
    res.json({ success: true, data: await StatsService.calculer(annee) });
  } catch (error) {
    gererErreur(res, error, 'lors du calcul des statistiques');
  }
});

/**
 * @route   GET /api/admin/export/reservations.csv?annee=2026
 * @desc    Export des réservations (CSV pour Excel). Sans année : toutes.
 */
router.get('/export/reservations.csv', async (req, res) => {
  try {
    const annee = req.query.annee ? parseInt(req.query.annee, 10) : null;
    if (annee !== null && (!Number.isInteger(annee) || annee < 2000 || annee > 2100)) {
      return res.status(400).json({ success: false, message: 'Année invalide' });
    }
    const csv = await StatsService.exporterCsv(annee);
    const nom = `reservations-sankofart${annee ? `-${annee}` : ''}.csv`;
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${nom}"`);
    res.send(csv);
  } catch (error) {
    gererErreur(res, error, 'lors de l\'export');
  }
});

module.exports = router;
