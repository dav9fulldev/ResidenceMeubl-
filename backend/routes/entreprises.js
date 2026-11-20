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

// Mot de passe oublié : 5 demandes par 15 minutes et par visiteur (anti envoi d'emails en masse)
const motDePasseLimiter = rateLimit({
  keyGenerator: cleLimite,
  skip: () => process.env.NODE_ENV === 'test',
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: { success: false, message: 'Trop de demandes, réessayez dans 15 minutes.' },
});

/**
 * @route   POST /api/entreprises/mot-de-passe/oubli   { email }
 * @desc    Envoie un lien de réinitialisation (réponse identique que le compte existe ou non)
 * @access  Public
 */
router.post('/mot-de-passe/oubli', motDePasseLimiter, async (req, res) => {
  try {
    const demande = await EntrepriseService.demanderReinitialisation(req.body?.email);
    if (demande) {
      ReservationService.emailService.sendReinitialisationMotDePasse(demande.utilisateur, demande.jeton)
        .catch(e => console.error('⚠️ Email de réinitialisation non envoyé :', String(e?.message).replace(/\n|\r/g, '')));
    }
    res.json({ success: true, message: 'Si un compte partenaire existe avec cet email, un lien de réinitialisation vient d\'y être envoyé.' });
  } catch (error) {
    console.error('Erreur lors de la demande de réinitialisation :', error);
    res.status(500).json({ success: false, message: 'Erreur lors de la demande' });
  }
});

/**
 * @route   POST /api/entreprises/mot-de-passe/reinitialisation   { jeton, motDePasse }
 * @desc    Enregistre le nouveau mot de passe (lien valable 1 h, une seule fois)
 * @access  Public (jeton reçu par email)
 */
router.post('/mot-de-passe/reinitialisation', motDePasseLimiter, async (req, res) => {
  try {
    await EntrepriseService.reinitialiserMotDePasse(req.body?.jeton, req.body?.motDePasse);
    res.json({ success: true, message: 'Mot de passe modifié. Vous pouvez vous connecter.' });
  } catch (error) {
    if (error instanceof EntrepriseService.ErreurEntreprise) return res.status(error.status).json({ success: false, message: error.message });
    console.error('Erreur lors de la réinitialisation :', error);
    res.status(500).json({ success: false, message: 'Erreur lors de la réinitialisation' });
  }
});

module.exports = router;
