const express = require('express');
const rateLimit = require('express-rate-limit');
const router = express.Router();
const AuthService = require('../services/AuthService');
const ResidenceService = require('../services/ResidenceService');
const requireAdmin = require('../middleware/requireAdmin');
const SmartSearchService = require('../services/SmartSearchService');

// Limiter les tentatives de connexion (anti force brute)
const loginLimiter = rateLimit({
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

module.exports = router;
