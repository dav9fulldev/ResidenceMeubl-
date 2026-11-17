const express = require('express');
const rateLimit = require('express-rate-limit');
const router = express.Router();
const AuthService = require('../services/AuthService');
const ReservationService = require('../services/ReservationService');
const requireClient = require('../middleware/requireClient');
const { cleLimite } = require('../middleware/clientIp');

/**
 * Espace client sans compte : « Mes réservations ».
 */

// Limite les essais (deviner une référence, spammer une boîte mail)
const accesLimiter = rateLimit({
  keyGenerator: cleLimite,
  skip: () => process.env.NODE_ENV === 'test',
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { success: false, message: 'Trop de tentatives, réessayez dans 15 minutes.' },
});

const emailValide = (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || '').trim());

const gererErreur = (res, error, contexte) => {
  if (error instanceof ReservationService.ErreurClient) {
    return res.status(error.status).json({ success: false, message: error.message });
  }
  console.error(`Erreur ${contexte}:`, error);
  return res.status(500).json({ success: false, message: `Erreur ${contexte}` });
};

/**
 * @route   POST /api/client/acces
 * @desc    Accès immédiat à une réservation avec email + référence
 */
router.post('/acces', accesLimiter, async (req, res) => {
  try {
    const { email, reference } = req.body || {};
    if (!emailValide(email) || !reference) {
      return res.status(400).json({ success: false, message: 'Indiquez votre email et la référence de réservation' });
    }
    const reservation = await ReservationService.trouverPourClient(reference, email);
    if (!reservation) {
      return res.status(404).json({ success: false, message: 'Aucune réservation ne correspond à cet email et cette référence' });
    }
    const token = AuthService.creerJetonClient(email, { reference: reservation.id });
    res.json({ success: true, data: { token } });
  } catch (error) {
    gererErreur(res, error, 'lors de l\'accès à la réservation');
  }
});

/**
 * @route   POST /api/client/lien
 * @desc    Envoie par email un lien vers tout l'historique.
 *          Réponse identique que l'email ait des réservations ou non (confidentialité).
 */
router.post('/lien', accesLimiter, async (req, res) => {
  const { email } = req.body || {};
  if (!emailValide(email)) {
    return res.status(400).json({ success: false, message: 'Adresse email invalide' });
  }
  try {
    if (await ReservationService.compterPourEmail(email) > 0) {
      await ReservationService.emailService.sendLienAcces(String(email).trim().toLowerCase());
    }
  } catch (error) {
    console.error('⚠️ Lien d\'accès client non envoyé:', error.message);
  }
  res.json({
    success: true,
    message: 'Si des réservations sont associées à cette adresse, vous allez recevoir un lien pour y accéder.',
  });
});

/**
 * @route   GET /api/client/reservations
 * @desc    Historique des réservations du client
 */
router.get('/reservations', requireClient, async (req, res) => {
  try {
    const reservations = await ReservationService.getReservationsClient(req.client);
    res.json({ success: true, data: reservations, email: req.client.email });
  } catch (error) {
    gererErreur(res, error, 'lors de la récupération des réservations');
  }
});

/**
 * @route   POST /api/client/reservations/:id/annulation
 * @desc    Demande d'annulation (traitée ensuite par l'admin)
 * @body    { motif? }
 */
router.post('/reservations/:id/annulation', requireClient, async (req, res) => {
  try {
    const resultat = await ReservationService.demanderAnnulation(req.params.id, req.client, req.body?.motif);
    res.json({
      success: true,
      message: 'Votre demande d\'annulation a été envoyée. Vous serez prévenu par email de la réponse.',
      data: resultat.reservation,
    });
  } catch (error) {
    gererErreur(res, error, 'lors de la demande d\'annulation');
  }
});

module.exports = router;
