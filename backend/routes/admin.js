const express = require('express');
const rateLimit = require('express-rate-limit');
const { cleLimite } = require('../middleware/clientIp');
const router = express.Router();
const AuthService = require('../services/AuthService');
const ResidenceService = require('../services/ResidenceService');
const requireAdmin = require('../middleware/requireAdmin');
const { superAdmin } = requireAdmin;
const SmartSearchService = require('../services/SmartSearchService');
const StatsService = require('../services/StatsService');
const acompte = require('../services/paiement/acompte');
const PiSpi = require('../services/paiement/PiSpiClient');
const Settings = require('../services/SettingsService');
const Moyens = require('../services/paiement/fournisseurs');
const Cles = require('../services/paiement/Cles');
const Tenant = require('../services/Tenant');
const EntrepriseService = require('../services/EntrepriseService');
const ReservationService = require('../services/ReservationService');
const Verification = require('../services/VerificationService');

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
  if (error instanceof EntrepriseService.ErreurEntreprise) return res.status(error.status).json({ success: false, message: error.message });
  console.error(`Erreur ${contexte}:`, error);
  return res.status(500).json({ success: false, message: `Erreur ${contexte}` });
};

/**
 * @route   POST /api/admin/login
 * @desc    Connexion administrateur, retourne un jeton
 * @access  Public
 */
router.post('/login', loginLimiter, async (req, res) => {
  // Identifiant : email du gestionnaire, ou nom d'utilisateur de l'administrateur de la plateforme
  const { username, email, password } = req.body || {};
  const identifiant = String(email || username || '').trim();
  if (!identifiant || typeof password !== 'string' || !password) {
    return res.status(400).json({ success: false, message: 'Identifiant et mot de passe requis' });
  }

  try {
    // Administrateur de la plateforme (variables ADMIN_USERNAME / ADMIN_PASSWORD)
    if (AuthService.estConfigure() && AuthService.verifierIdentifiants(identifiant, password)) {
      return res.json({ success: true, data: { token: AuthService.creerJeton(identifiant) } });
    }

    // Gestionnaire d'une entreprise
    const u = identifiant.includes('@') ? await EntrepriseService.verifierConnexion(identifiant, password) : null;
    if (!u) return res.status(401).json({ success: false, message: 'Identifiants incorrects' });
    // Email pas encore confirmé : un nouveau code est envoyé, la connexion attend ce code
    if (EntrepriseService.emailAVerifier(u)) {
      await require('./entreprises').envoyerCode(u.email);
      return res.status(403).json({ success: false, code: 'EMAIL_NON_VERIFIE', email: u.email, message: 'Confirmez d\'abord votre adresse email avec le code reçu par email.' });
    }
    if (EntrepriseService.statut(u.entrepriseId) === 'suspendue') {
      return res.status(403).json({ success: false, message: 'Le compte de votre entreprise est suspendu. Contactez BABI RESIDENCE.' });
    }
    const token = AuthService.creerJeton(u.email, { entrepriseId: u.entrepriseId, utilisateurId: u._id, superAdmin: false });
    res.json({ success: true, data: { token } });
  } catch (error) {
    gererErreur(res, error, 'lors de la connexion');
  }
});

// Toutes les routes suivantes exigent un jeton admin
router.use(requireAdmin);

/**
 * @route   GET /api/admin/moi
 * @desc    Compte connecté et son entreprise (statut de validation, rôle)
 */
router.get('/moi', async (req, res) => {
  try {
    const entreprise = await EntrepriseService.trouver(req.admin.ent);
    const utilisateur = req.admin.uid ? EntrepriseService.publicUtilisateur(await EntrepriseService.utilisateur(req.admin.uid)) : null;
    res.json({
      success: true,
      data: {
        superAdmin: Boolean(req.admin.sa),
        utilisateur: utilisateur || { prenom: 'Administrateur', nom: '', email: null, role: 'super_admin' },
        entreprise: { id: entreprise._id, nom: entreprise.nom, statut: entreprise.statut, principale: Boolean(entreprise.principale), interne: Boolean(entreprise.interne), motif: entreprise.motif || null },
      },
    });
  } catch (error) {
    gererErreur(res, error, 'lors de la lecture du compte');
  }
});

/**
 * @route   PUT /api/admin/moi/preferences   { resumeHebdo }   emails reçus par ce compte
 */
router.put('/moi/preferences', async (req, res) => {
  if (!req.admin.uid) return res.status(409).json({ success: false, message: 'Réservé aux comptes des partenaires' });
  try {
    res.json({ success: true, data: await EntrepriseService.changerPreferences(req.admin.uid, req.body || {}) });
  } catch (error) { gererErreur(res, error, 'lors de l\'enregistrement des préférences'); }
});

/**
 * @route   PUT /api/admin/moi/mot-de-passe   { actuel, nouveau }
 */
router.put('/moi/mot-de-passe', async (req, res) => {
  if (!req.admin.uid) return res.status(409).json({ success: false, message: 'Le mot de passe de l\'administrateur de la plateforme se change dans les variables du serveur' });
  try {
    await EntrepriseService.changerMotDePasse(req.admin.uid, req.body?.actuel, req.body?.nouveau);
    res.json({ success: true, message: 'Mot de passe modifié' });
  } catch (error) {
    if (error instanceof EntrepriseService.ErreurEntreprise) return res.status(error.status).json({ success: false, message: error.message });
    gererErreur(res, error, 'lors du changement de mot de passe');
  }
});

/**
 * @route   GET /api/admin/plateforme/entreprises
 * @route   PUT /api/admin/plateforme/entreprises/:id/statut   { statut, motif? }
 * @desc    Administrateur de la plateforme : validation et suspension des entreprises
 */
/**
 * @route   GET /api/admin/plateforme/apercu
 * @desc    Vue d'ensemble de la plateforme : entreprises, résidences, vérifications, réservations, finances
 */
router.get('/plateforme/apercu', superAdmin, async (req, res) => {
  try {
    const db = require('../db');
    const Finance = require('../services/finance');
    const debutMois = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1));
    const [entreprises, residences, compteurs, reservations, reservationsMois, residencesPlateforme, finances, mois] = await Promise.all([
      EntrepriseService.lister(),
      db.collection('residences').aggregate([{ $group: { _id: '$statutVerification', n: { $sum: 1 } } }]).toArray(),
      Verification.compteurs(),
      db.collection('reservations').countDocuments({}),
      db.collection('reservations').countDocuments({ dateCreation: { $gte: debutMois } }),
      db.collection('residences').countDocuments({ entrepriseId: Tenant.PRINCIPALE }),
      Finance.apercu(),
      Finance.apercu({ du: debutMois.toISOString().slice(0, 10) }),
    ]);
    const statuts = (s) => entreprises.filter(e => !e.principale && e.statut === s).length;
    res.json({
      success: true,
      data: {
        entreprises: { validees: statuts('validee'), aValider: statuts('en_attente'), suspendues: statuts('suspendue') },
        residences: Object.fromEntries(residences.map(r => [r._id || 'brouillon', r.n])),
        verifications: compteurs,
        reservations: { total: reservations, ceMois: reservationsMois },
        finances: { encaisseMois: mois.encaisse, commissionsMois: mois.commissions, versable: finances.versable, reversementsEnAttente: finances.reversementsEnAttente, balanceEquilibree: finances.balanceEquilibree },
        // Résidences encore rattachées au compte de la plateforme : à confier à une entreprise interne
        residencesPlateforme,
        transfertFait: entreprises.some(e => e.interne),
      },
    });
  } catch (error) {
    gererErreur(res, error, 'lors du calcul de la vue d\'ensemble');
  }
});

/**
 * @route   POST /api/admin/plateforme/transfert
 * @desc    Confie les résidences et réservations de la plateforme à « BABI RESIDENCE Gestion »
 * @body    { prenom, nom, email, telephone, motDePasse }  (compte du responsable)
 */
router.post('/plateforme/transfert', superAdmin, async (req, res) => {
  try {
    const r = await EntrepriseService.transfererPlateforme(req.body || {});
    await require('../services/finance').journaliser(`plateforme:${req.admin.sub}`, 'TRANSFERT_RESIDENCES_PLATEFORME', r);
    res.status(201).json({ success: true, data: r });
  } catch (error) {
    if (error instanceof EntrepriseService.ErreurEntreprise) return res.status(error.status).json({ success: false, message: error.message });
    gererErreur(res, error, 'lors du transfert');
  }
});

router.get('/plateforme/entreprises', superAdmin, async (req, res) => {
  try {
    // Avec la note de chaque partenaire (moyenne des avis sur ses résidences)
    const [liste, notes] = await Promise.all([EntrepriseService.lister(), require('../services/AvisService').parEntreprise()]);
    res.json({ success: true, data: liste.map(e => ({ ...e, notation: notes.get(e.id) || null })) });
  } catch (error) {
    gererErreur(res, error, 'lors de la récupération des entreprises');
  }
});

/**
 * @route   GET /api/admin/avis
 * @route   PUT /api/admin/avis/:id/reponse    { texte }            partenaire : réponse publique
 * @route   PUT /api/admin/avis/:id/masquage   { masque, motif }    plateforme : avis abusif
 * @desc    Service de notation (back-office)
 */
const erreurAvis = (res, error, contexte) => {
  const Avis = require('../services/AvisService');
  if (error instanceof Avis.ErreurAvis) return res.status(error.status).json({ success: false, message: error.message });
  return gererErreur(res, error, contexte);
};
const auteurAdmin = (req) => (req.admin.uid ? `utilisateur:${req.admin.uid}` : `plateforme:${req.admin.sub}`);

router.get('/avis', async (req, res) => {
  try {
    res.json({ success: true, data: await require('../services/AvisService').listerAdmin({ superAdmin: Boolean(req.admin.sa) }) });
  } catch (error) { erreurAvis(res, error, 'lors de la lecture des avis'); }
});

router.get('/avis/partenaires', superAdmin, async (req, res) => {
  try {
    res.json({ success: true, data: await require('../services/AvisService').classementPartenaires() });
  } catch (error) { erreurAvis(res, error, 'lors du classement des partenaires'); }
});

router.put('/avis/:id/reponse', async (req, res) => {
  if (req.admin.sa) return res.status(403).json({ success: false, message: 'La réponse appartient au partenaire qui gère la résidence' });
  try {
    if (req.body?.texte !== undefined && typeof req.body.texte !== 'string') return res.status(400).json({ success: false, message: 'Réponse invalide' });
    await require('../services/AvisService').repondre(req.params.id, req.body?.texte, auteurAdmin(req));
    res.json({ success: true });
  } catch (error) { erreurAvis(res, error, 'lors de la réponse'); }
});

router.put('/avis/:id/masquage', superAdmin, async (req, res) => {
  try {
    await require('../services/AvisService').masquer(req.params.id, { masque: Boolean(req.body?.masque), motif: req.body?.motif }, auteurAdmin(req));
    res.json({ success: true });
  } catch (error) { erreurAvis(res, error, 'lors du masquage'); }
});

/**
 * Booster de visibilité (paiement hors plateforme, activation manuelle par la plateforme)
 * @route   GET    /api/admin/boosters                      partenaire : réglages, ses résidences (avec moyennes), ses boosters et leurs résultats
 * @route   POST   /api/admin/boosters                      { residenceId, objectif, audience, budgetJour, duree }   campagne
 * @route   DELETE /api/admin/boosters/:id                  annuler une demande en attente
 * @route   GET    /api/admin/plateforme/boosters           plateforme : toutes les demandes, réglages
 * @route   PUT    /api/admin/plateforme/boosters/reglages  { budgetMin, budgetMax }   budget par jour
 * @route   PUT    /api/admin/plateforme/boosters/:id       { action: activer|refuser|arreter, moyen, reference, motif }
 */
const erreurBooster = (res, error, contexte) => {
  const Booster = require('../services/BoosterService');
  if (error instanceof Booster.ErreurBooster) return res.status(error.status).json({ success: false, message: error.message });
  return gererErreur(res, error, contexte);
};
const auteur = (req) => (req.admin.uid ? `utilisateur:${req.admin.uid}` : `plateforme:${req.admin.sub}`);

router.get('/boosters', async (req, res) => {
  if (req.admin.sa) return res.status(403).json({ success: false, message: 'Réservé aux partenaires' });
  try {
    const Booster = require('../services/BoosterService');
    // Résidences publiées, avec de quoi afficher l'aperçu de l'annonce
    const publiees = (await ResidenceService.getAllResidencesAdmin()).filter(r => r.statutVerification === 'verifiee' && r.actif !== false);
    const moyennes = await Booster.moyennes(publiees.map(r => r.id));
    const residences = publiees.map(r => ({
      id: r.id, nom: r.nom, photo: r.photos?.[0] || null, ville: r.ville || '', quartier: r.quartier || '',
      localisation: [r.quartier, r.ville].filter(Boolean).join(', ') || r.localisation, prix: r.prix, capacite: r.capacite, nombreChambres: r.nombreChambres,
      affichagesJour: moyennes.get(r.id)?.affichagesJour ?? null, tauxVisite: moyennes.get(r.id)?.tauxVisite ?? null,
    }));
    const enLigne = require('../services/paiement/GeniusPayClient').estConfigure();
    res.json({ success: true, data: {
      reglages: await Booster.reglages(), objectifs: Booster.OBJECTIFS, audiences: Booster.AUDIENCES,
      residences, paiementEnLigne: enLigne, boosters: await Booster.listerEntreprise(Tenant.courante()),
    } });
  } catch (error) { erreurBooster(res, error, 'lors de la lecture des boosters'); }
});

router.post('/boosters', async (req, res) => {
  if (req.admin.sa) return res.status(403).json({ success: false, message: 'Réservé aux partenaires' });
  try {
    const Booster = require('../services/BoosterService');
    const b = await Booster.demander(Tenant.courante(), {
      residenceId: req.body?.residenceId, objectif: String(req.body?.objectif || 'visites'), audience: String(req.body?.audience || 'tout'),
      budgetJour: req.body?.budgetJour, duree: req.body?.duree,
    }, auteur(req));
    ReservationService.emailService.sendAlerteFinance(
      `Demande de booster : ${EntrepriseService.nom(b.entrepriseId)}`,
      `${EntrepriseService.nom(b.entrepriseId)} crée un booster de ${b.duree} jours pour « ${b.residenceNom} » (${b.budgetJour.toLocaleString('fr-FR')} FCFA par jour, total ${b.montant.toLocaleString('fr-FR')} FCFA, référence ${b.reference}). Payé en ligne, il s'active seul ; sinon activez-le après réception du paiement.`
    ).catch(e => console.error('⚠️ Alerte booster non envoyée :', String(e?.message).replace(/\n|\r/g, '')));
    res.status(201).json({ success: true, message: `Demande enregistrée (référence ${b.reference}). Le booster démarre dès que BABI RESIDENCE a reçu le paiement.`, data: Booster.vue(b) });
  } catch (error) { erreurBooster(res, error, 'lors de la demande de booster'); }
});

// Paiement en ligne (GeniusPay) d'une demande : création de la page de paiement, puis vérification au retour
router.post('/boosters/:id/paiement', async (req, res) => {
  if (req.admin.sa) return res.status(403).json({ success: false, message: 'Réservé aux partenaires' });
  try {
    const u = req.admin.uid ? await EntrepriseService.utilisateur(req.admin.uid) : null;
    const payeur = u ? { nom: `${u.prenom} ${u.nom}`.trim(), email: u.email, telephone: u.telephone } : {};
    res.json({ success: true, data: await require('../services/BoosterService').payerEnLigne(Tenant.courante(), req.params.id, payeur) });
  } catch (error) { erreurBooster(res, error, 'lors de la création du paiement'); }
});

router.get('/boosters/:id/paiement', async (req, res) => {
  if (req.admin.sa) return res.status(403).json({ success: false, message: 'Réservé aux partenaires' });
  try {
    const Booster = require('../services/BoosterService');
    await Booster.trouver(req.params.id, { entrepriseId: Tenant.courante() }); // le sien uniquement
    res.json({ success: true, data: await Booster.verifierPaiement(req.params.id) });
  } catch (error) { erreurBooster(res, error, 'lors de la vérification du paiement'); }
});

router.delete('/boosters/:id', async (req, res) => {
  if (req.admin.sa) return res.status(403).json({ success: false, message: 'Réservé aux partenaires' });
  try {
    res.json({ success: true, data: await require('../services/BoosterService').annuler(Tenant.courante(), req.params.id, auteur(req)) });
  } catch (error) { erreurBooster(res, error, 'lors de l\'annulation'); }
});

router.get('/plateforme/boosters', superAdmin, async (req, res) => {
  try {
    const Booster = require('../services/BoosterService');
    res.json({ success: true, data: { reglages: await Booster.reglages(), objectifs: Booster.OBJECTIFS, audiences: Booster.AUDIENCES, moyens: Booster.MOYENS, boosters: await Booster.listerPlateforme() } });
  } catch (error) { erreurBooster(res, error, 'lors de la lecture des boosters'); }
});

router.put('/plateforme/boosters/reglages', superAdmin, async (req, res) => {
  try {
    res.json({ success: true, data: await require('../services/BoosterService').changerReglages(req.body || {}, auteur(req)) });
  } catch (error) { erreurBooster(res, error, 'lors du changement des réglages'); }
});

router.put('/plateforme/boosters/:id', superAdmin, async (req, res) => {
  try {
    const b = req.body || {};
    const action = typeof b.action === 'string' ? b.action : '';
    res.json({ success: true, data: await require('../services/BoosterService').agir(req.params.id, { action, moyen: b.moyen, reference: typeof b.reference === 'string' ? b.reference : '', motif: typeof b.motif === 'string' ? b.motif : '' }, auteur(req)) });
  } catch (error) { erreurBooster(res, error, 'lors du traitement du booster'); }
});

/**
 * Équipe de l'entreprise (plusieurs comptes par partenaire)
 * @route   GET    /api/admin/equipe
 * @route   POST   /api/admin/equipe/invitations          { prenom, nom, email, role }   propriétaire
 * @route   POST   /api/admin/equipe/:id/invitation       renvoyer le lien                 propriétaire
 * @route   PUT    /api/admin/equipe/:id/role             { role }                         propriétaire
 * @route   DELETE /api/admin/equipe/:id                  retirer / annuler l'invitation   propriétaire
 */
const { proprietaire } = requireAdmin;
const pasPlateforme = (req, res, next) => (req.admin.sa ? res.status(403).json({ success: false, message: 'Réservé aux partenaires' }) : next());
const envoyerInvitation = async (req, { utilisateur, jeton }) => {
  const entreprise = await EntrepriseService.trouver(utilisateur.entrepriseId);
  const inviteur = await EntrepriseService.utilisateur(req.admin.uid);
  ReservationService.emailService.sendInvitationEquipe(utilisateur, entreprise, inviteur, jeton)
    .catch(e => console.error('⚠️ Invitation non envoyée :', String(e?.message).replace(/\n|\r/g, '')));
};

router.get('/equipe', pasPlateforme, async (req, res) => {
  try {
    res.json({ success: true, data: { membres: await EntrepriseService.equipe(Tenant.courante()), moi: req.admin.uid, role: req.admin.role } });
  } catch (error) { gererErreur(res, error, 'lors de la lecture de l\'équipe'); }
});

router.post('/equipe/invitations', pasPlateforme, proprietaire, async (req, res) => {
  try {
    const invitation = await EntrepriseService.inviter(Tenant.courante(), req.body || {}, req.admin.uid);
    await envoyerInvitation(req, invitation);
    res.status(201).json({ success: true, message: `Invitation envoyée à ${invitation.utilisateur.email}.`, data: { membres: await EntrepriseService.equipe(Tenant.courante()) } });
  } catch (error) { gererErreur(res, error, 'lors de l\'invitation'); }
});

router.post('/equipe/:id/invitation', pasPlateforme, proprietaire, async (req, res) => {
  try {
    await envoyerInvitation(req, await EntrepriseService.renouvelerInvitation(Tenant.courante(), req.params.id));
    res.json({ success: true, message: 'Nouvelle invitation envoyée.', data: { membres: await EntrepriseService.equipe(Tenant.courante()) } });
  } catch (error) { gererErreur(res, error, 'lors du renvoi de l\'invitation'); }
});

router.put('/equipe/:id/role', pasPlateforme, proprietaire, async (req, res) => {
  try {
    await EntrepriseService.changerRole(Tenant.courante(), req.params.id, req.body?.role);
    res.json({ success: true, data: { membres: await EntrepriseService.equipe(Tenant.courante()) } });
  } catch (error) { gererErreur(res, error, 'lors du changement de rôle'); }
});

router.delete('/equipe/:id', pasPlateforme, proprietaire, async (req, res) => {
  try {
    const u = await EntrepriseService.retirerMembre(Tenant.courante(), req.params.id, req.admin.uid);
    res.json({ success: true, message: u.statut === 'invite' ? 'Invitation annulée.' : `${u.prenom} ${u.nom} n'a plus accès à l'espace.`, data: { membres: await EntrepriseService.equipe(Tenant.courante()) } });
  } catch (error) { gererErreur(res, error, 'lors du retrait du membre'); }
});

/**
 * @route   GET /api/admin/clients
 * @desc    Partenaire : ses clients (voyageurs qui ont réservé ses résidences)
 */
router.get('/clients', async (req, res) => {
  if (req.admin.sa) return res.status(403).json({ success: false, message: 'Réservé aux partenaires : la plateforme voit les utilisateurs' });
  try {
    res.json({ success: true, data: await require('../services/ClientService').clientsPartenaire(Tenant.courante()) });
  } catch (error) {
    gererErreur(res, error, 'lors de la récupération des clients');
  }
});

/**
 * @route   GET /api/admin/plateforme/utilisateurs?q=
 * @desc    Service client : comptes des voyageurs (créés en arrière-plan à la réservation)
 */
router.get('/plateforme/utilisateurs', superAdmin, async (req, res) => {
  try {
    const q = typeof req.query.q === 'string' ? req.query.q : '';
    res.json({ success: true, data: await require('../services/ClientService').lister({ recherche: q }) });
  } catch (error) {
    gererErreur(res, error, 'lors de la récupération des clients');
  }
});

/**
 * @route   POST /api/admin/plateforme/entreprises/:id/suppression   { vers }
 * @desc    Supprime une entreprise ; ses résidences et réservations passent à l'entreprise « vers »
 */
router.post('/plateforme/entreprises/:id/suppression', superAdmin, async (req, res) => {
  try {
    const r = await EntrepriseService.supprimerEnTransferant(String(req.params.id), String(req.body?.vers || ''));
    await require('../services/finance').journaliser(`plateforme:${req.admin.sub}`, 'ENTREPRISE_SUPPRIMEE', r);
    res.json({ success: true, data: r });
  } catch (error) {
    if (error instanceof EntrepriseService.ErreurEntreprise) return res.status(error.status).json({ success: false, message: error.message });
    gererErreur(res, error, 'lors de la suppression de l\'entreprise');
  }
});

router.put('/plateforme/entreprises/:id/statut', superAdmin, async (req, res) => {
  try {
    const avant = EntrepriseService.statut(req.params.id);
    const entreprise = await EntrepriseService.changerStatut(req.params.id, req.body?.statut, req.body?.motif);
    if (avant !== entreprise.statut) {
      EntrepriseService.gestionnaires(entreprise._id)
        .then(g => ReservationService.emailService.sendStatutEntreprise(entreprise, g))
        .catch(e => console.error('⚠️ Email de statut d\'entreprise non envoyé :', e.message));
    }
    require('../services/SmartSearchService').synchroniserEnFond();
    res.json({ success: true, data: { id: entreprise._id, nom: entreprise.nom, statut: entreprise.statut } });
  } catch (error) {
    if (error instanceof EntrepriseService.ErreurEntreprise) return res.status(error.status).json({ success: false, message: error.message });
    gererErreur(res, error, 'lors du changement de statut de l\'entreprise');
  }
});

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

// ---------- Vérification des résidences (gestionnaire : limité à son entreprise) ----------

const erreurVerif = (res, error, contexte) => {
  if (error instanceof Verification.ErreurVerification) return res.status(error.status).json({ success: false, message: error.message });
  return gererErreur(res, error, contexte);
};
const urlApi = (req) => `${req.protocol}://${req.get('host')}`;

/**
 * Dossier de vérification d'une résidence
 * @route GET    /api/admin/residences/:id/verification
 * @route PUT    /api/admin/residences/:id/verification/gps          { lat, lng }
 * @route POST   /api/admin/residences/:id/verification/documents    { type, nom, contenu (base64) }
 * @route POST   /api/admin/residences/:id/verification/preuves      { type, contenu (base64), gps }
 * @route DELETE /api/admin/residences/:id/verification/fichiers/:fichier
 * @route GET    /api/admin/residences/:id/verification/fichiers/:fichier   (téléchargement privé)
 * @route POST   /api/admin/residences/:id/verification/soumettre
 */
router.get('/residences/:id/verification', async (req, res) => {
  try { res.json({ success: true, data: await Verification.dossier(req.params.id) }); } catch (e) { erreurVerif(res, e, 'lors de la lecture du dossier'); }
});
router.put('/residences/:id/verification/gps', async (req, res) => {
  try { res.json({ success: true, data: await Verification.enregistrerGps(req.params.id, req.body || {}) }); } catch (e) { erreurVerif(res, e, 'lors de l\'enregistrement de la position'); }
});
router.post('/residences/:id/verification/documents', async (req, res) => {
  try { res.status(201).json({ success: true, data: await Verification.ajouterDocument(req.params.id, req.body || {}) }); } catch (e) { erreurVerif(res, e, 'lors de l\'envoi du document'); }
});
router.post('/residences/:id/verification/preuves', async (req, res) => {
  try { res.status(201).json({ success: true, data: await Verification.ajouterPreuve(req.params.id, req.body || {}) }); } catch (e) { erreurVerif(res, e, 'lors de l\'envoi de la photo'); }
});
router.delete('/residences/:id/verification/fichiers/:fichier', async (req, res) => {
  try { res.json({ success: true, data: await Verification.retirerFichier(req.params.id, req.params.fichier) }); } catch (e) { erreurVerif(res, e, 'lors de la suppression'); }
});
const envoyerFichier = async (res, lecture) => {
  const { flux, mime, nom } = await lecture;
  res.set({
    'Content-Type': mime,
    'Content-Disposition': `attachment; filename="${String(nom).replace(/[^\w.\- ]/g, '_')}"`,
    'Cache-Control': 'private, no-store',
  });
  flux.on('error', () => res.destroy()).pipe(res);
};
router.get('/residences/:id/verification/fichiers/:fichier', async (req, res) => {
  try { await envoyerFichier(res, Verification.lireFichier(req.params.id, req.params.fichier)); } catch (e) { erreurVerif(res, e, 'lors du téléchargement'); }
});
router.post('/residences/:id/verification/soumettre', async (req, res) => {
  try { res.json({ success: true, data: await Verification.soumettre(req.params.id) }); } catch (e) { erreurVerif(res, e, 'lors de l\'envoi du dossier'); }
});

/**
 * Photos de l'annonce (téléversées, publiques une fois la résidence vérifiée)
 * @route POST   /api/admin/residences/:id/photos   { contenu (base64) }
 * @route DELETE /api/admin/residences/:id/photos   { url }
 */
router.post('/residences/:id/photos', async (req, res) => {
  try {
    const url = await Verification.ajouterPhoto(req.params.id, req.body?.contenu, urlApi(req));
    const residence = (await ResidenceService.getAllResidencesAdmin()).find(r => r.id === parseInt(req.params.id, 10));
    res.status(201).json({ success: true, data: { url, residence } });
  } catch (e) { erreurVerif(res, e, 'lors de l\'envoi de la photo'); }
});
router.delete('/residences/:id/photos', async (req, res) => {
  try {
    await Verification.retirerPhoto(req.params.id, String(req.body?.url || ''));
    const residence = (await ResidenceService.getAllResidencesAdmin()).find(r => r.id === parseInt(req.params.id, 10));
    res.json({ success: true, data: { residence } });
  } catch (e) { erreurVerif(res, e, 'lors de la suppression de la photo'); }
});

// ---------- Vérification des résidences (plateforme) ----------

/**
 * @route GET /api/admin/plateforme/verifications?statut=     file d'attente (par défaut : à traiter)
 * @route GET /api/admin/plateforme/verifications/compteurs
 * @route GET /api/admin/plateforme/verifications/:id
 * @route PUT /api/admin/plateforme/verifications/:id          { action, motif }
 * @route GET /api/admin/plateforme/verifications/:id/fichiers/:fichier
 * @route GET /api/admin/plateforme/signalements?tous=1
 * @route PUT /api/admin/plateforme/signalements/:id           (traité)
 */
router.get('/plateforme/verifications', superAdmin, async (req, res) => {
  try { res.json({ success: true, data: await Verification.lister({ statut: req.query.statut }) }); } catch (e) { erreurVerif(res, e, 'lors de la lecture des vérifications'); }
});
router.get('/plateforme/verifications/compteurs', superAdmin, async (req, res) => {
  try { res.json({ success: true, data: await Verification.compteurs() }); } catch (e) { erreurVerif(res, e, 'lors du comptage'); }
});
router.get('/plateforme/verifications/:id', superAdmin, async (req, res) => {
  try { res.json({ success: true, data: await Verification.dossier(req.params.id, { plateforme: true }) }); } catch (e) { erreurVerif(res, e, 'lors de la lecture du dossier'); }
});
router.put('/plateforme/verifications/:id', superAdmin, async (req, res) => {
  try { res.json({ success: true, data: await Verification.decider(req.params.id, req.body?.action, req.body?.motif) }); } catch (e) { erreurVerif(res, e, 'lors de la décision'); }
});
router.get('/plateforme/verifications/:id/fichiers/:fichier', superAdmin, async (req, res) => {
  try { await envoyerFichier(res, Verification.lireFichier(req.params.id, req.params.fichier, { plateforme: true })); } catch (e) { erreurVerif(res, e, 'lors du téléchargement'); }
});
router.get('/plateforme/signalements', superAdmin, async (req, res) => {
  try { res.json({ success: true, data: await Verification.signalements({ tous: req.query.tous === '1' }) }); } catch (e) { erreurVerif(res, e, 'lors de la lecture des signalements'); }
});
router.put('/plateforme/signalements/:id', superAdmin, async (req, res) => {
  try { await Verification.traiterSignalement(req.params.id); res.json({ success: true }); } catch (e) { erreurVerif(res, e, 'lors du traitement du signalement'); }
});

/**
 * @route   GET /api/admin/paiements/config
 * @desc    Mode de paiement, pourcentage d'acompte, réglages PI-SPI manquants, URL du webhook
 */
/**
 * @route   GET /api/admin/paiements/moyens
 * @desc    Moyens de paiement : intégrés, configurés sur le serveur, activés par l'admin
 * @route   PUT /api/admin/paiements/moyens/:id   { actif: true|false }
 */
// Adresses des webhooks : propres à l'entreprise (la plateforme garde les adresses historiques)
// Encaissement centralisé : une seule adresse par prestataire (celle de la plateforme)
const urlWebhook = (req, fournisseur) => `${req.protocol}://${req.get('host')}/api/paiements/${fournisseur}/webhook`;

router.get('/paiements/moyens', (req, res) => {
  const principale = Tenant.estPrincipale();
  res.json({
    success: true,
    data: {
      mode: acompte.mode(),
      moyens: principale ? Moyens.liste() : Moyens.liste().map(({ variables, problemes, ...m }) => m),
      // Encaissement par la plateforme : les entreprises voient les moyens proposés, sans les régler
      encaissementPlateforme: !principale,
      webhookUrl: urlWebhook(req, 'pispi'),
      webhookSecretDefini: Boolean(Cles.lire('PISPI_WEBHOOK_SECRET').trim()),
      webhooks: { pispi: urlWebhook(req, 'pispi'), geniuspay: urlWebhook(req, 'geniuspay') },
    },
  });
});

/**
 * @route   PUT /api/admin/paiements/cles/:id   { NOM_DU_CHAMP: valeur, … }
 * @desc    Une entreprise enregistre ses propres clés (chiffrées) : l'argent arrive sur son compte
 */
router.put('/paiements/cles/:id', async (req, res) => {
  try {
    const cles = await Cles.enregistrer(req.params.id, req.body || {});
    const f = Moyens.parId(req.params.id);
    res.json({ success: true, data: { cles, moyen: f ? Moyens.etat(f) : null } });
  } catch (error) {
    if (error instanceof Cles.ErreurCles) return res.status(error.status).json({ success: false, message: error.message });
    gererErreur(res, error, 'lors de l\'enregistrement des clés');
  }
});

router.put('/paiements/moyens/:id', async (req, res) => {
  if (!req.admin.sa) return res.status(403).json({ success: false, message: 'Les moyens de paiement sont gérés par BABI RESIDENCE' });
  try {
    const moyen = await Moyens.activer(req.params.id, Boolean(req.body?.actif));
    res.json({ success: true, data: { moyen, mode: acompte.mode() } });
  } catch (error) {
    if (error instanceof Moyens.ErreurMoyen) return res.status(error.status).json({ success: false, message: error.message });
    gererErreur(res, error, 'lors de la modification du moyen de paiement');
  }
});

router.get('/paiements/config', (req, res) => {
  res.json({
    success: true,
    data: {
      mode: acompte.mode(),
      pourcentage: acompte.pourcentage(),
      problemes: PiSpi.problemesConfiguration(),
      webhookSecretDefini: Boolean(Cles.lire('PISPI_WEBHOOK_SECRET').trim()),
      webhookUrl: urlWebhook(req, 'pispi'),
    },
  });
});

/**
 * @route   GET / PUT /api/admin/etablissement
 * @desc    Identité de l'établissement : nom, coordonnées, réseaux sociaux, email des alertes
 */
// Une entreprise ne règle que ce qui sert à ses clients ; slogan et réseaux sociaux sont ceux du site (plateforme)
const CHAMPS_ENTREPRISE = ['nom', 'telephone', 'whatsapp', 'email', 'adresse', 'emailNotifications'];
const pourEntreprise = (etab) => Object.fromEntries(CHAMPS_ENTREPRISE.map(k => [k, etab[k]]));

router.get('/etablissement', (req, res) => {
  const etab = Settings.etablissement();
  res.json({ success: true, data: Tenant.estPrincipale() ? etab : pourEntreprise(etab) });
});

router.put('/etablissement', async (req, res) => {
  try {
    // Seuls les champs d'une liste fixe sont recopiés (jamais une clé choisie par la requête)
    const corps = req.body || {};
    const champs = Tenant.estPrincipale() ? Object.keys(Settings.TEXTES) : CHAMPS_ENTREPRISE;
    const valeurs = Object.fromEntries(champs.filter(k => Object.prototype.hasOwnProperty.call(corps, k)).map(k => [k, corps[k]]));
    const etab = await Settings.modifierEtablissement(valeurs);
    res.json({ success: true, data: Tenant.estPrincipale() ? etab : pourEntreprise(etab) });
  } catch (error) {
    if (error instanceof Settings.ErreurParametre) return res.status(400).json({ success: false, message: error.message });
    gererErreur(res, error, 'lors de l\'enregistrement de l\'établissement');
  }
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
    const nom = `reservations-babi${annee ? `-${annee}` : ''}.csv`;
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${nom}"`);
    res.send(csv);
  } catch (error) {
    gererErreur(res, error, 'lors de l\'export');
  }
});

module.exports = router;
