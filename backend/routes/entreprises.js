const express = require('express');
const rateLimit = require('express-rate-limit');
const { cleLimite } = require('../middleware/clientIp');
const AuthService = require('../services/AuthService');
const EntrepriseService = require('../services/EntrepriseService');
const ReservationService = require('../services/ReservationService');

const router = express.Router();

// Inscriptions : 5 par heure et par visiteur (anti création de comptes en masse)
const inscriptionLimiter = rateLimit({
  keyGenerator: cleLimite,
  skip: () => process.env.NODE_ENV === 'test',
  windowMs: 60 * 60 * 1000,
  max: 5,
  message: { success: false, message: 'Trop d\'inscriptions depuis cette connexion, réessayez dans une heure.' },
});

/**
 * @route   POST /api/entreprises/inscription
 * @desc    Un gestionnaire crée le compte de son entreprise (validée ensuite par la plateforme)
 * @body    { entreprise, prenom, nom, email, telephone, motDePasse }
 * @access  Public
 */
router.post('/inscription', inscriptionLimiter, async (req, res) => {
  try {
    const { entreprise, utilisateur } = await EntrepriseService.inscrire(req.body || {});
    const emails = ReservationService.emailService;
    Promise.allSettled([
      emails.sendBienvenueEntreprise(entreprise, utilisateur),
      emails.sendNouvelleEntrepriseAdmin(entreprise, utilisateur),
    ]).then(r => r.filter(x => x.status === 'rejected').forEach(x => console.error('⚠️ Email d\'inscription non envoyé :', x.reason?.message)));

    const token = AuthService.creerJeton(utilisateur.email, { entrepriseId: entreprise._id, utilisateurId: utilisateur.id, superAdmin: false });
    res.status(201).json({
      success: true,
      data: { token, entreprise: { id: entreprise._id, nom: entreprise.nom, statut: entreprise.statut }, utilisateur },
    });
  } catch (error) {
    if (error instanceof EntrepriseService.ErreurEntreprise) return res.status(error.status).json({ success: false, message: error.message });
    console.error('Erreur lors de l\'inscription :', error);
    res.status(500).json({ success: false, message: 'Erreur lors de l\'inscription' });
  }
});

module.exports = router;
