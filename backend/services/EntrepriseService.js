const crypto = require('crypto');
const db = require('../db');
const Tenant = require('./Tenant');

/**
 * Entreprises (gestionnaires de résidences) et leurs comptes.
 *
 * Collections :
 *  - entreprises  { _id, nom, statut, telephone, creeLe, valideeLe?, motif? }
 *  - utilisateurs { _id, entrepriseId, email, prenom, nom, telephone, motDePasse (scrypt), role, creeLe }
 *
 * Statuts : en_attente (inscrite, pas encore visible sur le site), validee, suspendue.
 * L'entreprise principale (Tenant.PRINCIPALE) est la plateforme elle-même ; son administrateur
 * se connecte avec ADMIN_USERNAME / ADMIN_PASSWORD et valide les autres entreprises.
 */
const STATUTS = ['en_attente', 'validee', 'suspendue'];
const EMAIL = /^[^\s@<>]+@[^\s@<>.]+(?:\.[^\s@<>.]+)*\.[^\s@<>.]{2,}$/;
const TEL = /^[+0-9 ().-]{8,30}$/;
const MOT_DE_PASSE_MIN = 10;

class ErreurEntreprise extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

// ---------- Mots de passe (scrypt, sel aléatoire) ----------
const PARAMS = { N: 16384, r: 8, p: 1 };
const LONGUEUR = 64;

function hacher(motDePasse) {
  const sel = crypto.randomBytes(16);
  const hash = crypto.scryptSync(String(motDePasse), sel, LONGUEUR, PARAMS);
  return `scrypt$${sel.toString('base64')}$${hash.toString('base64')}`;
}

function verifierHash(motDePasse, stocke) {
  const [algo, sel, hash] = String(stocke || '').split('$');
  if (algo !== 'scrypt' || !sel || !hash) return false;
  const attendu = Buffer.from(hash, 'base64');
  const calcule = crypto.scryptSync(String(motDePasse), Buffer.from(sel, 'base64'), attendu.length, PARAMS);
  return crypto.timingSafeEqual(attendu, calcule);
}

// Hash factice : même durée de calcul quand l'email n'existe pas (ne révèle pas les comptes)
const HASH_FACTICE = hacher(crypto.randomBytes(16).toString('hex'));

const DUREE_REINITIALISATION_MS = 60 * 60 * 1000;
const empreinte = (jeton) => crypto.createHash('sha256').update(String(jeton)).digest('hex');

const texte = (v, max) => String(v ?? '').trim().slice(0, max);

const nouvelId = () => `ent_${crypto.randomBytes(6).toString('hex')}`;

class EntrepriseService {
  constructor() {
    this.cache = new Map(); // id → { nom, statut }
  }

  get entreprises() { return db.collection('entreprises'); }

  get utilisateurs() { return db.collection('utilisateurs'); }

  /** Crée l'entreprise principale et rattache les données existantes (migration douce). */
  async initialiser() {
    await this.entreprises.updateOne(
      { _id: Tenant.PRINCIPALE },
      { $setOnInsert: { nom: 'BABI RESIDENCE', statut: 'validee', principale: true, creeLe: new Date() } },
      { upsert: true }
    );
    await Promise.all([
      db.collection('residences').updateMany({ entrepriseId: { $exists: false } }, { $set: { entrepriseId: Tenant.PRINCIPALE } }),
      db.collection('reservations').updateMany({ entrepriseId: { $exists: false } }, { $set: { entrepriseId: Tenant.PRINCIPALE } }),
    ]);
    await this.recharger();
  }

  async recharger() {
    const docs = await this.entreprises.find({}, { projection: { nom: 1, statut: 1, interne: 1 } }).toArray();
    this.cache = new Map(docs.map(d => [d._id, { nom: d.nom, statut: d.statut, interne: Boolean(d.interne) }]));
  }

  /** Entreprises dont les résidences sont visibles sur le site public. */
  validees() {
    return [...this.cache].filter(([, e]) => e.statut === 'validee').map(([id]) => id);
  }

  nom(id) {
    return this.cache.get(id)?.nom || null;
  }

  statut(id) {
    return this.cache.get(id)?.statut || null;
  }

  /**
   * Entreprise de la plateforme elle-même (la principale, ou « BABI RESIDENCE Gestion » qui gère
   * ses résidences) : pas de commission, revenus propres, résidences vérifiées d'office.
   */
  estInterne(id) {
    return id === Tenant.PRINCIPALE || Boolean(this.cache.get(id)?.interne);
  }

  async trouver(id) {
    return this.entreprises.findOne({ _id: { $eq: String(id) } });
  }

  // ---------- Inscription et connexion ----------

  /**
   * Un gestionnaire crée le compte de son entreprise (statut « en attente »).
   * @returns {{ entreprise, utilisateur }}
   */
  async inscrire(donnees = {}) {
    const entreprise = texte(donnees.entreprise, 80);
    const prenom = texte(donnees.prenom, 60);
    const nom = texte(donnees.nom, 60);
    const email = texte(donnees.email, 254).toLowerCase();
    const telephone = texte(donnees.telephone, 30);
    const motDePasse = String(donnees.motDePasse ?? '');

    if (entreprise.length < 2) throw new ErreurEntreprise('Indiquez le nom de votre entreprise');
    if (prenom.length < 2 || nom.length < 2) throw new ErreurEntreprise('Indiquez votre prénom et votre nom');
    if (!EMAIL.test(email)) throw new ErreurEntreprise('Adresse email invalide');
    if (!TEL.test(telephone)) throw new ErreurEntreprise('Numéro de téléphone invalide');
    if (motDePasse.length < MOT_DE_PASSE_MIN || motDePasse.length > 200) {
      throw new ErreurEntreprise(`Le mot de passe doit contenir au moins ${MOT_DE_PASSE_MIN} caractères`);
    }
    if (await this.utilisateurs.findOne({ email: { $eq: email } })) {
      throw new ErreurEntreprise('Un compte existe déjà avec cette adresse email', 409);
    }

    const id = nouvelId();
    const maintenant = new Date();
    await this.entreprises.insertOne({ _id: id, nom: entreprise, statut: 'en_attente', telephone, creeLe: maintenant });
    const utilisateur = { _id: crypto.randomUUID(), entrepriseId: id, email, prenom, nom, telephone, role: 'proprietaire', motDePasse: hacher(motDePasse), creeLe: maintenant };
    try {
      await this.utilisateurs.insertOne(utilisateur);
    } catch (error) {
      await this.entreprises.deleteOne({ _id: id });
      if (error.code === 11000) throw new ErreurEntreprise('Un compte existe déjà avec cette adresse email', 409);
      throw error;
    }
    await this.recharger();

    // Identité affichée dans ses emails et son back-office
    const Settings = require('./SettingsService');
    await Tenant.run(id, () => Settings.modifierEtablissement({ nom: entreprise, email, telephone, emailNotifications: email, slogan: '', adresse: 'Abidjan, Côte d\'Ivoire' }));

    return { entreprise: await this.trouver(id), utilisateur: this.publicUtilisateur(utilisateur) };
  }

  /** Vérifie email + mot de passe. Retourne l'utilisateur ou null (même durée dans tous les cas). */
  async verifierConnexion(email, motDePasse) {
    const u = await this.utilisateurs.findOne({ email: { $eq: texte(email, 254).toLowerCase() } });
    const ok = verifierHash(String(motDePasse ?? ''), u?.motDePasse || HASH_FACTICE);
    return u && ok ? u : null;
  }

  async utilisateur(id) {
    return this.utilisateurs.findOne({ _id: { $eq: String(id) } });
  }

  async changerMotDePasse(utilisateurId, actuel, nouveau) {
    const u = await this.utilisateur(utilisateurId);
    if (!u || !verifierHash(String(actuel ?? ''), u.motDePasse)) throw new ErreurEntreprise('Mot de passe actuel incorrect', 403);
    if (String(nouveau ?? '').length < MOT_DE_PASSE_MIN || String(nouveau).length > 200) {
      throw new ErreurEntreprise(`Le nouveau mot de passe doit contenir au moins ${MOT_DE_PASSE_MIN} caractères`);
    }
    await this.utilisateurs.updateOne({ _id: u._id }, { $set: { motDePasse: hacher(nouveau), motDePasseLe: new Date() } });
  }

  // ---------- Mot de passe oublié ----------
  // Lien envoyé par email, valable 1 heure et utilisable une seule fois. Seule l'empreinte
  // SHA-256 du jeton est enregistrée : une fuite de la base ne permet pas de s'en servir.

  /**
   * Prépare une réinitialisation. Retourne { utilisateur, jeton } ou null si l'email est inconnu
   * (la route répond la même chose dans les deux cas : on ne révèle pas quels comptes existent).
   */
  async demanderReinitialisation(email) {
    const u = await this.utilisateurs.findOne({ email: { $eq: texte(email, 254).toLowerCase() } });
    if (!u) return null;
    const jeton = crypto.randomBytes(32).toString('base64url');
    await this.utilisateurs.updateOne({ _id: u._id }, {
      $set: { reinitialisation: { empreinte: empreinte(jeton), expireLe: new Date(Date.now() + DUREE_REINITIALISATION_MS) } },
    });
    return { utilisateur: u, jeton };
  }

  /** Change le mot de passe avec le jeton reçu par email, puis ferme toutes les sessions ouvertes. */
  async reinitialiserMotDePasse(jeton, nouveau) {
    const j = String(jeton ?? '');
    if (String(nouveau ?? '').length < MOT_DE_PASSE_MIN || String(nouveau).length > 200) {
      throw new ErreurEntreprise(`Le mot de passe doit contenir au moins ${MOT_DE_PASSE_MIN} caractères`);
    }
    const invalide = new ErreurEntreprise('Ce lien n\'est plus valable. Demandez-en un nouveau.', 400);
    if (!/^[\w-]{20,100}$/.test(j)) throw invalide;
    const maintenant = new Date();
    // Usage unique : le jeton est retiré dans la même opération que le changement de mot de passe
    const r = await this.utilisateurs.findOneAndUpdate(
      { 'reinitialisation.empreinte': { $eq: empreinte(j) }, 'reinitialisation.expireLe': { $gt: maintenant } },
      { $set: { motDePasse: hacher(nouveau), motDePasseLe: maintenant, sessionsInvalideesLe: maintenant }, $unset: { reinitialisation: '' } },
      { returnDocument: 'after' }
    );
    if (!r) throw invalide;
    return r;
  }

  publicUtilisateur(u) {
    return u ? { id: u._id, prenom: u.prenom, nom: u.nom, email: u.email, telephone: u.telephone, role: u.role } : null;
  }

  // ---------- Administration de la plateforme ----------

  /** Toutes les entreprises avec leurs chiffres (super-admin). */
  async lister() {
    const [entreprises, residences, reservations, gestionnaires] = await Promise.all([
      this.entreprises.find({}).sort({ creeLe: -1 }).toArray(),
      db.collection('residences').aggregate([{ $group: { _id: '$entrepriseId', total: { $sum: 1 } } }]).toArray(),
      db.collection('reservations').aggregate([{ $group: { _id: '$entrepriseId', total: { $sum: 1 } } }]).toArray(),
      this.utilisateurs.find({}, { projection: { motDePasse: 0, reinitialisation: 0 } }).toArray(),
    ]);
    const compte = (liste, id) => liste.find(x => x._id === id)?.total || 0;
    return entreprises.map(e => ({
      id: e._id,
      nom: e.nom,
      statut: e.statut,
      principale: Boolean(e.principale),
      interne: Boolean(e.interne),
      telephone: e.telephone || null,
      creeLe: e.creeLe,
      valideeLe: e.valideeLe || null,
      motif: e.motif || null,
      residences: compte(residences, e._id),
      reservations: compte(reservations, e._id),
      gestionnaires: gestionnaires.filter(u => u.entrepriseId === e._id).map(u => this.publicUtilisateur(u)),
    }));
  }

  async changerStatut(id, statut, motif = '') {
    if (!STATUTS.includes(statut)) throw new ErreurEntreprise('Statut invalide');
    const e = await this.trouver(id);
    if (!e) throw new ErreurEntreprise('Entreprise introuvable', 404);
    if (e.principale || e.interne) throw new ErreurEntreprise('Les entreprises de la plateforme ne changent pas de statut', 409);
    const maj = { statut, motif: texte(motif, 500) || null, statutLe: new Date() };
    if (statut === 'validee') maj.valideeLe = new Date();
    await this.entreprises.updateOne({ _id: e._id }, { $set: maj });
    await this.recharger();
    return { ...e, ...maj };
  }

  /**
   * L'administrateur de la plateforme ne gère plus de résidences : celles de la plateforme (et leurs
   * réservations, dossiers, paramètres d'acompte et coordonnées) sont confiées à une entreprise interne
   * « BABI RESIDENCE Gestion », avec un compte responsable. Idempotent : une seule entreprise interne.
   */
  async transfererPlateforme(donnees = {}) {
    const prenom = texte(donnees.prenom, 60);
    const nom = texte(donnees.nom, 60);
    const email = texte(donnees.email, 254).toLowerCase();
    const telephone = texte(donnees.telephone, 30);
    const motDePasse = String(donnees.motDePasse ?? '');
    if (prenom.length < 2 || nom.length < 2) throw new ErreurEntreprise('Indiquez le prénom et le nom du responsable');
    if (!EMAIL.test(email)) throw new ErreurEntreprise('Adresse email invalide');
    if (!TEL.test(telephone)) throw new ErreurEntreprise('Numéro de téléphone invalide');
    if (motDePasse.length < MOT_DE_PASSE_MIN || motDePasse.length > 200) throw new ErreurEntreprise(`Le mot de passe doit contenir au moins ${MOT_DE_PASSE_MIN} caractères`);
    if (await this.utilisateurs.findOne({ email: { $eq: email } })) throw new ErreurEntreprise('Un compte existe déjà avec cette adresse email', 409);
    if (await this.entreprises.findOne({ interne: true })) throw new ErreurEntreprise('Les résidences de la plateforme ont déjà été transférées', 409);

    const id = 'ent_babi_gestion';
    const maintenant = new Date();
    await this.entreprises.insertOne({ _id: id, nom: 'BABI RESIDENCE Gestion', statut: 'validee', interne: true, telephone, creeLe: maintenant, valideeLe: maintenant });
    await this.utilisateurs.insertOne({ _id: crypto.randomUUID(), entrepriseId: id, email, prenom, nom, telephone, role: 'proprietaire', motDePasse: hacher(motDePasse), creeLe: maintenant });
    const filtre = { entrepriseId: Tenant.PRINCIPALE };
    const [residences, reservations] = await Promise.all([
      db.collection('residences').updateMany(filtre, { $set: { entrepriseId: id, statutVerification: 'verifiee' } }),
      db.collection('reservations').updateMany(filtre, { $set: { entrepriseId: id } }),
      db.collection('verifications').updateMany(filtre, { $set: { entrepriseId: id } }),
      db.collection('signalements').updateMany(filtre, { $set: { entrepriseId: id } }),
    ]);
    // Mêmes règles d'acompte et mêmes coordonnées pour les clients (valeurs en vigueur, y compris
    // celles par défaut) : les emails aux clients restent « BABI RESIDENCE »
    const Settings = require('./SettingsService');
    const [regles, etab] = Tenant.run(Tenant.PRINCIPALE, () => [Settings.tous(), Settings.etablissement()]);
    const parametres = db.collection('parametres');
    await parametres.updateOne({ _id: `acompte:${id}` }, { $set: { ...regles, modifieLe: maintenant } }, { upsert: true });
    await parametres.updateOne({ _id: `etablissement:${id}` }, {
      $set: {
        nom: etab.nom || 'BABI RESIDENCE', telephone: etab.telephone || '', whatsapp: etab.whatsapp || '', email: etab.email || '', adresse: etab.adresse || '',
        emailNotifications: etab.emailNotifications || process.env.ADMIN_EMAIL || process.env.EMAIL_USER || email, modifieLe: maintenant,
      },
    }, { upsert: true });
    await this.recharger();
    await require('./SettingsService').charger();
    require('./SmartSearchService').synchroniserEnFond();
    return { entrepriseId: id, residences: residences.modifiedCount, reservations: reservations.modifiedCount };
  }

  /**
   * Supprime une entreprise en confiant ses résidences, réservations et dossiers à une autre entreprise
   * validée. Ses comptes responsables et ses paramètres sont supprimés ; le registre financier
   * (historique immuable) n'est pas modifié. Refusé s'il reste de l'argent dû ou un reversement en cours.
   */
  async supprimerEnTransferant(id, versId) {
    const source = await this.trouver(id);
    const cible = await this.trouver(versId);
    if (!source) throw new ErreurEntreprise('Entreprise introuvable', 404);
    if (source.principale) throw new ErreurEntreprise('Le compte de la plateforme ne peut pas être supprimé', 409);
    if (!cible || cible.principale || cible._id === source._id) throw new ErreurEntreprise('Choisissez une autre entreprise pour reprendre les résidences');
    if (cible.statut !== 'validee') throw new ErreurEntreprise('L\'entreprise qui reprend les résidences doit être validée', 409);
    const [reste] = await db.collection('owner_payables').aggregate([{ $match: { entrepriseId: source._id } }, { $group: { _id: null, reste: { $sum: { $subtract: ['$du', '$verse'] } } } }]).toArray();
    if (reste && reste.reste !== 0) throw new ErreurEntreprise('Cette entreprise a encore de l\'argent dû ou une commission à déduire : soldez-le d\'abord (Finances)', 409);
    if (await db.collection('payouts').findOne({ entrepriseId: source._id, statut: { $in: ['EN_ATTENTE_APPROBATION', 'APPROUVE', 'EXECUTE'] } })) {
      throw new ErreurEntreprise('Un reversement est en cours pour cette entreprise : terminez-le d\'abord', 409);
    }
    const filtre = { entrepriseId: source._id };
    const vers = { $set: { entrepriseId: cible._id } };
    const [residences, reservations] = await Promise.all([
      db.collection('residences').updateMany(filtre, vers),
      db.collection('reservations').updateMany(filtre, vers),
      db.collection('verifications').updateMany(filtre, vers),
      db.collection('signalements').updateMany(filtre, vers),
      db.collection('owner_payables').updateMany(filtre, vers),
      db.collection('commissions').updateMany(filtre, vers),
    ]);
    await Promise.all([
      this.utilisateurs.deleteMany(filtre),
      db.collection('parametres').deleteMany({ _id: { $in: ['acompte', 'etablissement', 'paiement'].map(t => `${t}:${source._id}`) } }),
      db.collection('owner_payout_methods').deleteOne({ _id: source._id }),
      this.entreprises.deleteOne({ _id: source._id }),
    ]);
    await this.recharger();
    await require('./SettingsService').charger();
    require('./SmartSearchService').synchroniserEnFond();
    return { supprimee: source.nom, vers: cible.nom, residences: residences.modifiedCount, reservations: reservations.modifiedCount };
  }

  async gestionnaires(entrepriseId) {
    return this.utilisateurs.find({ entrepriseId: { $eq: String(entrepriseId) } }, { projection: { motDePasse: 0, reinitialisation: 0 } }).toArray();
  }
}

const service = new EntrepriseService();
service.ErreurEntreprise = ErreurEntreprise;
service.STATUTS = STATUTS;
service.hacher = hacher;
service.verifierHash = verifierHash;
module.exports = service;
