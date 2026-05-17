const express = require('express');
const router = express.Router();
const ResidenceService = require('../services/ResidenceService');

/**
 * @route   GET /api/residences
 * @desc    Obtenir toutes les résidences
 * @access  Public
 */
router.get('/', (req, res) => {
  try {
    const residences = ResidenceService.getAllResidences();
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
 * @route   GET /api/residences/:id
 * @desc    Obtenir une résidence par ID
 * @access  Public
 */
router.get('/:id', (req, res) => {
  try {
    const { id } = req.params;
    const residence = ResidenceService.getResidenceById(parseInt(id));
    
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

/**
 * @route   POST /api/residences/search
 * @desc    Rechercher des résidences avec filtres
 * @access  Public
 */
router.post('/search', (req, res) => {
  try {
    const criteres = req.body;
    const resultats = ResidenceService.searchResidences(criteres);
    
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
router.get('/types', (req, res) => {
  try {
    const types = ResidenceService.getTypesAppartements();
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
router.get('/villes', (req, res) => {
  try {
    const villes = ResidenceService.getVilles();
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
router.get('/quartiers/:ville', (req, res) => {
  try {
    const { ville } = req.params;
    const quartiers = ResidenceService.getQuartiersByVille(ville);
    
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
 * @route   POST /api/residences/check-disponibilite
 * @desc    Vérifier la disponibilité d'une résidence
 * @access  Public
 */
router.post('/check-disponibilite', (req, res) => {
  try {
    const { residenceId, dateArrivee, dateDepart } = req.body;
    
    if (!residenceId || !dateArrivee || !dateDepart) {
      return res.status(400).json({
        success: false,
        message: 'Tous les champs sont requis'
      });
    }

    const disponible = ResidenceService.checkDisponibilite(
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

module.exports = router;
