const express = require('express');
const router = express.Router();
const ReservationService = require('../services/ReservationService');
const rateLimit = require('express-rate-limit');
const { cleLimite } = require('../middleware/clientIp');
const requireAdmin = require('../middleware/requireAdmin');

// Limiter les réservations pour éviter le spam
const reservationLimiter = rateLimit({
  keyGenerator: cleLimite, // IP réelle du visiteur (voir middleware/clientIp.js)
  skip: () => process.env.NODE_ENV === 'test', // pas de limite pendant les tests
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
          statut: resultat.reservation.statut,
          prixTotal: resultat.reservation.prixTotal,
          emailEnvoye: resultat.emailEnvoye
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
 * @access  Admin
 */
router.get('/', requireAdmin, async (req, res) => {
  try {
    const reservations = await ReservationService.getAllReservations();
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
 * @access  Admin
 */
router.get('/stats', requireAdmin, async (req, res) => {
  try {
    const stats = await ReservationService.getReservationStats();
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
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const reservation = await ReservationService.getReservationById(id);
    
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
 * @access  Admin
 */
router.put('/:id/status', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { statut } = req.body;

    if (!statut) {
      return res.status(400).json({
        success: false,
        message: 'Le statut est requis'
      });
    }

    const resultat = await ReservationService.updateReservationStatus(id, statut);
    if (!resultat) {
      return res.status(404).json({ success: false, message: 'Réservation non trouvée' });
    }
    
    res.json({
      success: true,
      message: 'Statut mis à jour avec succès',
      data: {
        id: resultat.reservation.id,
        statut: resultat.reservation.statut,
        emailEnvoye: resultat.emailEnvoye
      }
    });
  } catch (error) {
    if (error instanceof ReservationService.ErreurClient) {
      return res.status(error.status).json({ success: false, message: error.message });
    }
    console.error('Erreur lors de la mise à jour du statut:', error);
    res.status(error.message === 'Statut invalide' ? 400 : 500).json({
      success: false,
      message: error.message || 'Erreur lors de la mise à jour du statut'
    });
  }
});

/**
 * @route   PUT /api/reservations/:id/remboursement
 * @desc    Marquer l'acompte d'une réservation annulée comme remboursé : { reference? }
 * @access  Admin
 */
router.put('/:id/remboursement', requireAdmin, async (req, res) => {
  try {
    const r = await ReservationService.marquerRembourse(req.params.id, req.body?.reference);
    res.json({ success: true, data: { id: r.id, remboursement: r.acompte.remboursement } });
  } catch (error) {
    if (error instanceof ReservationService.ErreurClient) {
      return res.status(error.status).json({ success: false, message: error.message });
    }
    console.error('Erreur remboursement :', error);
    res.status(500).json({ success: false, message: 'Erreur lors de l\'enregistrement du remboursement' });
  }
});

/**
 * @route   PUT /api/reservations/:id/annulation
 * @desc    Accepter ou refuser la demande d'annulation d'un client
 * @body    { decision: 'accepter' | 'refuser', message? }
 * @access  Admin
 */
router.put('/:id/annulation', requireAdmin, async (req, res) => {
  try {
    const { decision, message } = req.body || {};
    const resultat = await ReservationService.traiterDemandeAnnulation(req.params.id, decision, message);
    if (!resultat) {
      return res.status(404).json({ success: false, message: 'Réservation non trouvée' });
    }
    res.json({
      success: true,
      data: {
        id: resultat.reservation.id,
        statut: resultat.reservation.statut,
        demandeAnnulation: resultat.reservation.demandeAnnulation,
        emailEnvoye: resultat.emailEnvoye,
      },
    });
  } catch (error) {
    if (error instanceof ReservationService.ErreurClient) {
      return res.status(error.status).json({ success: false, message: error.message });
    }
    console.error('Erreur lors du traitement de la demande d\'annulation:', error);
    res.status(500).json({ success: false, message: 'Erreur lors du traitement de la demande' });
  }
});

/**
 * @route   POST /api/reservations/check-disponibilite
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

module.exports = router;
