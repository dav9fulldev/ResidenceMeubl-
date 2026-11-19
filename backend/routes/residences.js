const express = require('express');
const router = express.Router();
const ResidenceService = require('../services/ResidenceService');
const ReservationService = require('../services/ReservationService');
const SmartSearchService = require('../services/SmartSearchService');
const rateLimit = require('express-rate-limit');
const { cleLimite } = require('../middleware/clientIp');

// Protège le quota Voyage AI : 30 recherches IA par minute et par IP
const rechercheIaLimiter = rateLimit({
  keyGenerator: cleLimite, // IP réelle du visiteur (voir middleware/clientIp.js)
  skip: () => process.env.NODE_ENV === 'test',
  windowMs: 60 * 1000,
  max: 30,
  message: { success: false, message: 'Trop de recherches, réessayez dans une minute.' },
});

/**
 * @route   GET /api/residences
 * @desc    Obtenir toutes les résidences
 * @access  Public
 */
router.get('/', async (req, res) => {
  try {
    const residences = await ResidenceService.getAllResidences();
    res.json({
      success: true,
      data: residences,
      total: residences.length
    });
  } catch (error) {
    console.error('Erreur lors de la récupération des résidences:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la récupération des résidences'
    });
  }
});

/**
 * @route   POST /api/residences/search
 * @desc    Rechercher des résidences avec filtres
 * @access  Public
 */
router.post('/search', async (req, res) => {
  try {
    const criteres = req.body;
    const resultats = await ResidenceService.searchResidences(criteres);
    
    res.json({
      success: true,
      data: resultats,
      total: resultats.length,
      criteres: criteres
    });
  } catch (error) {
    console.error('Erreur lors de la recherche:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la recherche'
    });
  }
});

/**
 * @route   GET /api/residences/types
 * @desc    Obtenir tous les types d'appartements
 * @access  Public
 */
router.get('/types', async (req, res) => {
  try {
    const types = await ResidenceService.getTypesAppartements();
    res.json({
      success: true,
      data: types
    });
  } catch (error) {
    console.error('Erreur lors de la récupération des types:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la récupération des types'
    });
  }
});

/**
 * @route   GET /api/residences/villes
 * @desc    Obtenir toutes les villes
 * @access  Public
 */
router.get('/villes', async (req, res) => {
  try {
    const villes = await ResidenceService.getVilles();
    res.json({
      success: true,
      data: villes
    });
  } catch (error) {
    console.error('Erreur lors de la récupération des villes:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la récupération des villes'
    });
  }
});

/**
 * @route   GET /api/residences/quartiers/:ville
 * @desc    Obtenir les quartiers d'une ville
 * @access  Public
 */
router.get('/quartiers/:ville', async (req, res) => {
  try {
    const { ville } = req.params;
    const quartiers = await ResidenceService.getQuartiersByVille(ville);
    
    res.json({
      success: true,
      data: quartiers,
      ville: ville
    });
  } catch (error) {
    console.error('Erreur lors de la récupération des quartiers:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la récupération des quartiers'
    });
  }
});

/**
 * @route   GET /api/residences/disponibles?arrivee=AAAA-MM-JJ&depart=AAAA-MM-JJ
 * @desc    Résidences libres sur une période (recherche par dates de l'accueil)
 * @access  Public
 */
router.get('/disponibles', async (req, res) => {
  const { arrivee, depart } = req.query;
  const date = /^\d{4}-\d{2}-\d{2}$/;
  if (!date.test(String(arrivee || '')) || !date.test(String(depart || '')) || String(depart) <= String(arrivee)) {
    return res.status(400).json({ success: false, message: 'Dates invalides (arrivee et depart au format AAAA-MM-JJ, départ après l\'arrivée)' });
  }
  try {
    res.json({ success: true, data: { arrivee, depart, ids: await ReservationService.residencesLibres(arrivee, depart) } });
  } catch (error) {
    console.error('Erreur disponibilités :', error);
    res.status(500).json({ success: false, message: 'Erreur lors de la recherche des disponibilités' });
  }
});

/**
 * @route   POST /api/residences/check-disponibilite
 * @desc    Vérifier la disponibilité d'une résidence
 * @access  Public
 */
router.post('/check-disponibilite', async (req, res) => {
  try {
    const { residenceId, dateArrivee, dateDepart } = req.body;
    
    if (!residenceId || !dateArrivee || !dateDepart) {
      return res.status(400).json({
        success: false,
        message: 'Tous les champs sont requis'
      });
    }

    const disponible = await ReservationService.checkDisponibilite(
      parseInt(residenceId),
      dateArrivee,
      dateDepart
    );

    res.json({
      success: true,
      data: {
        residenceId: parseInt(residenceId),
        dateArrivee,
        dateDepart,
        disponible
      }
    });
  } catch (error) {
    console.error('Erreur lors de la vérification de disponibilité:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la vérification de disponibilité'
    });
  }
});

/**
 * @route   POST /api/residences/recherche-ia
 * @desc    Recherche en langage naturel (« un appart calme pour 5 avec piscine, moins de 60 000 »)
 * @body    { question }
 * @access  Public
 */
router.post('/recherche-ia', rechercheIaLimiter, async (req, res) => {
  try {
    const question = String(req.body?.question || '').trim();
    if (question.length < 3 || question.length > 300) {
      return res.status(400).json({ success: false, message: 'Décrivez votre recherche (3 à 300 caractères)' });
    }
    const resultat = await SmartSearchService.rechercher(question);
    res.json({ success: true, data: resultat });
  } catch (error) {
    console.error('Erreur lors de la recherche intelligente:', error);
    res.status(500).json({ success: false, message: 'Erreur lors de la recherche' });
  }
});

/**
 * @route   GET /api/residences/:id/similaires
 * @desc    Résidences les plus proches (« Vous aimerez aussi »)
 * @access  Public
 */
router.get('/:id/similaires', async (req, res) => {
  try {
    const similaires = await SmartSearchService.similaires(req.params.id);
    if (!similaires) {
      return res.status(404).json({ success: false, message: 'Résidence non trouvée' });
    }
    res.json({ success: true, data: similaires });
  } catch (error) {
    console.error('Erreur lors de la recherche de résidences similaires:', error);
    res.status(500).json({ success: false, message: 'Erreur lors de la recherche' });
  }
});

/**
 * @route   GET /api/residences/:id
 * @desc    Obtenir une résidence par ID
 * @access  Public
 */
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const residence = await ResidenceService.getResidencePublique(parseInt(id));
    
    if (!residence) {
      return res.status(404).json({
        success: false,
        message: 'Résidence non trouvée'
      });
    }

    res.json({
      success: true,
      data: residence
    });
  } catch (error) {
    console.error('Erreur lors de la récupération de la résidence:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la récupération de la résidence'
    });
  }
});

module.exports = router;
