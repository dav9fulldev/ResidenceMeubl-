const express = require('express');
const router = express.Router();
const ReservationService = require('../services/ReservationService');
const rateLimit = require('express-rate-limit');

// Limiter les réservations pour éviter le spam
const reservationLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 3, // max 3 réservations par IP
  message: { 
    success: false,
    message: 'Trop de réservations envoyées, veuillez réessayer plus tard.' 
  }
});

/**
 * @route   POST /api/reservations
 * @desc    Créer une nouvelle réservation
 * @access  Public
 */
router.post('/', reservationLimiter, async (req, res) => {
  try {
    const {
      residenceId,
      nom,
      prenom,
      email,
      telephone,
      dateArrivee,
      dateDepart,
      nombrePersonnes,
      pieceIdentite,
      notes
    } = req.body;

    // Validation des champs obligatoires
    if (!residenceId || !nom || !prenom || !email || !telephone || !dateArrivee || !dateDepart || !nombrePersonnes) {
      return res.status(400).json({
        success: false,
        message: 'Tous les champs obligatoires doivent être remplis'
      });
    }

    // Créer la réservation
    const resultat = await ReservationService.createReservation({
      residenceId: parseInt(residenceId),
      nom: nom.trim(),
      prenom: prenom.trim(),
      email: email.trim().toLowerCase(),
      telephone: telephone.trim(),
      dateArrivee,
      dateDepart,
      nombrePersonnes: parseInt(nombrePersonnes),
      pieceIdentite,
      notes: notes ? notes.trim() : ''
    });

    if (resultat.success) {
      res.status(201).json({
        success: true,
        message: 'Réservation créée avec succès',
        data: {
          id: resultat.reservation.id,
          reference: resultat.reservation.id,
          statut: resultat.reservation.statut
        }
      });
    } else {
      res.status(400).json({
        success: false,
        message: resultat.error
      });
    }

  } catch (error) {
    console.error('Erreur lors de la création de la réservation:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la création de la réservation'
    });
  }
});

/**
 * @route   GET /api/reservations
 * @desc    Obtenir toutes les réservations (pour l'admin)
 * @access  Public (à sécuriser plus tard)
 */
router.get('/', (req, res) => {
  try {
    const reservations = ReservationService.getAllReservations();
    res.json({
      success: true,
      data: reservations,
      total: reservations.length
    });
  } catch (error) {
    console.error('Erreur lors de la récupération des réservations:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la récupération des réservations'
    });
  }
});

/**
 * @route   GET /api/reservations/stats
 * @desc    Obtenir les statistiques des réservations
 * @access  Public (à sécuriser plus tard)
 */
router.get('/stats', (req, res) => {
  try {
    const stats = ReservationService.getReservationStats();
    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    console.error('Erreur lors de la récupération des statistiques:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la récupération des statistiques'
    });
  }
});

/**
 * @route   GET /api/reservations/:id
 * @desc    Obtenir une réservation par ID
 * @access  Public
 */
router.get('/:id', (req, res) => {
  try {
    const { id } = req.params;
    const reservation = ReservationService.getReservationById(id);
    
    if (!reservation) {
      return res.status(404).json({
        success: false,
        message: 'Réservation non trouvée'
      });
    }

    res.json({
      success: true,
      data: {
        id: reservation.id,
        residence: reservation.residenceInfo,
        client: reservation.client,
        dates: reservation.dates,
        details: reservation.details,
        statut: reservation.statut,
        dateCreation: reservation.dateCreation,
        prixTotal: reservation.prixTotal
      }
    });
  } catch (error) {
    console.error('Erreur lors de la récupération de la réservation:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la récupération de la réservation'
    });
  }
});

/**
 * @route   PUT /api/reservations/:id/status
 * @desc    Mettre à jour le statut d'une réservation
 * @access  Public (à sécuriser plus tard)
 */
router.put('/:id/status', (req, res) => {
  try {
    const { id } = req.params;
    const { statut } = req.body;

    if (!statut) {
      return res.status(400).json({
        success: false,
        message: 'Le statut est requis'
      });
    }

    const reservation = ReservationService.updateReservationStatus(id, statut);
    
    res.json({
      success: true,
      message: 'Statut mis à jour avec succès',
      data: {
        id: reservation.id,
        statut: reservation.statut
      }
    });
  } catch (error) {
    console.error('Erreur lors de la mise à jour du statut:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Erreur lors de la mise à jour du statut'
    });
  }
});

/**
 * @route   GET /api/reservations/stats
 * @desc    Obtenir les statistiques des réservations
 * @access  Public (à sécuriser plus tard)
 */
router.get('/stats', (req, res) => {
  try {
    const stats = ReservationService.getReservationStats();
    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    console.error('Erreur lors de la récupération des statistiques:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la récupération des statistiques'
    });
  }
});

/**
 * @route   POST /api/reservations/check-disponibilite
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

    const disponible = ReservationService.checkDisponibilite(
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
