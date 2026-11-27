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
    // Pas encore de session : l'email doit d'abord être confirmé avec le code envoyé
    await envoyerCode(utilisateur.email);
    res.status(201).json({
      success: true,
      message: `Un code de vérification vient d'être envoyé à ${utilisateur.email}.`,
      data: { verificationRequise: true, email: utilisateur.email, entreprise: { id: entreprise._id, nom: entreprise.nom, statut: entreprise.statut } },
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

// ---------- Invitation dans l'équipe d'une entreprise ----------

/**
 * @route   POST /api/entreprises/invitation          { jeton }   ce qu'affiche la page d'invitation
 * @route   POST /api/entreprises/invitation/acceptation   { jeton, motDePasse, telephone?, prenom?, nom? }
 * @access  Public (lien reçu par email, 7 jours, usage unique)
 */
router.post('/invitation', motDePasseLimiter, async (req, res) => {
  try {
    res.json({ success: true, data: await EntrepriseService.lireInvitation(req.body?.jeton) });
  } catch (error) {
    if (error instanceof EntrepriseService.ErreurEntreprise) return res.status(error.status).json({ success: false, message: error.message });
    console.error('Erreur lors de la lecture de l\'invitation :', error);
    res.status(500).json({ success: false, message: 'Erreur lors de la lecture de l\'invitation' });
  }
});

router.post('/invitation/acceptation', motDePasseLimiter, async (req, res) => {
  try {
    const u = await EntrepriseService.accepterInvitation(req.body?.jeton, req.body || {});
    const entreprise = await EntrepriseService.trouver(u.entrepriseId);
    const token = AuthService.creerJeton(u.email, { entrepriseId: u.entrepriseId, utilisateurId: u._id, superAdmin: false });
    res.json({ success: true, data: { token, entreprise: { id: entreprise._id, nom: entreprise.nom }, utilisateur: EntrepriseService.publicUtilisateur(u) } });
  } catch (error) {
    if (error instanceof EntrepriseService.ErreurEntreprise) return res.status(error.status).json({ success: false, message: error.message });
    console.error('Erreur lors de l\'acceptation de l\'invitation :', error);
    res.status(500).json({ success: false, message: 'Erreur lors de l\'acceptation de l\'invitation' });
  }
});

// ---------- Vérification de l'email (code à 6 chiffres) ----------

/** Prépare et envoie un nouveau code au compte non vérifié de cet email (sans erreur si rien à faire). */
async function envoyerCode(email, { strict = false } = {}) {
  const u = await EntrepriseService.utilisateurs.findOne({ email: { $eq: String(email || '').trim().toLowerCase() } });
  if (!EntrepriseService.emailAVerifier(u)) return false;
  try {
    const code = await EntrepriseService.nouveauCodeVerification(u);
    ReservationService.emailService.sendCodeVerification(u, code)
      .catch(e => console.error('⚠️ Code de vérification non envoyé :', String(e?.message).replace(/\n|\r/g, '')));
    return true;
  } catch (error) {
    if (strict) throw error;
    return false; // délai de renvoi : le code précédent reste valable
  }
}

const verificationLimiter = rateLimit({
  keyGenerator: cleLimite,
  skip: () => process.env.NODE_ENV === 'test',
  windowMs: 15 * 60 * 1000,
  max: 15,
  message: { success: false, message: 'Trop de tentatives, réessayez dans 15 minutes.' },
});

/**
 * @route   POST /api/entreprises/verification-email   { email, code }
 * @desc    Confirme l'email avec le code reçu ; ouvre la session du gestionnaire
 * @access  Public (code reçu par email)
 */
router.post('/verification-email', verificationLimiter, async (req, res) => {
  try {
    const u = await EntrepriseService.verifierCodeEmail(req.body?.email, req.body?.code);
    const entreprise = await EntrepriseService.trouver(u.entrepriseId);
    // L'entreprise devient réellement candidate : bienvenue au gestionnaire, alerte à la plateforme
    const emails = ReservationService.emailService;
    const utilisateur = EntrepriseService.publicUtilisateur(u);
    Promise.allSettled([
      emails.sendBienvenueEntreprise(entreprise, utilisateur),
      emails.sendNouvelleEntrepriseAdmin(entreprise, utilisateur),
    ]).then(r => r.filter(x => x.status === 'rejected').forEach(x => console.error('⚠️ Email d\'inscription non envoyé :', x.reason?.message)));
    const token = AuthService.creerJeton(u.email, { entrepriseId: u.entrepriseId, utilisateurId: u._id, superAdmin: false });
    res.json({ success: true, data: { token, entreprise: { id: entreprise._id, nom: entreprise.nom, statut: entreprise.statut }, utilisateur } });
  } catch (error) {
    if (error instanceof EntrepriseService.ErreurEntreprise) return res.status(error.status).json({ success: false, message: error.message });
    console.error('Erreur lors de la vérification de l\'email :', error);
    res.status(500).json({ success: false, message: 'Erreur lors de la vérification' });
  }
});

/**
 * @route   POST /api/entreprises/verification-email/renvoi   { email }
 * @desc    Renvoie un code (réponse identique que le compte existe ou non)
 */
router.post('/verification-email/renvoi', verificationLimiter, async (req, res) => {
  try {
    await envoyerCode(req.body?.email, { strict: true });
    res.json({ success: true, message: 'Si un compte attend une vérification avec cet email, un nouveau code vient d\'y être envoyé.' });
  } catch (error) {
    if (error instanceof EntrepriseService.ErreurEntreprise && error.status === 429) return res.status(429).json({ success: false, message: error.message });
    console.error('Erreur lors du renvoi du code :', error);
    res.status(500).json({ success: false, message: 'Erreur lors de l\'envoi du code' });
  }
});

module.exports = router;
module.exports.envoyerCode = envoyerCode;
