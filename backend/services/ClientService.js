const crypto = require('crypto');
const db = require('../db');
const AuthService = require('./AuthService');
const { hacher, verifierHash } = require('./EntrepriseService');

/**
 * Service client : comptes des voyageurs, créés en arrière-plan.
 *
 * Le voyageur ne s'inscrit jamais. Sa première réservation crée son compte, sans mot de passe
 * (statut « sans_mot_de_passe »). Le lien « Suivre ma réservation » de ses emails lui fait choisir
 * un mot de passe : le compte devient « actif ». Ensuite il se connecte avec email + mot de passe.
 *
 * Règles de sécurité :
 *  - le mot de passe ne se choisit que depuis un lien reçu par email (preuve que la boîte est à lui) ;
 *  - un lien ne sert plus dès que le mot de passe a changé (jeton signé portant sa date de création) ;
 *  - réserver avec l'email d'un compte ne connecte personne et ne modifie pas un compte actif ;
 *  - changer de mot de passe ferme toutes les sessions ouvertes avant.
 *
 * Collection clients { _id, email, prenom, nom, telephone, statut, motDePasse?, creeLe,
 *                      activeLe?, motDePasseLe?, sessionsInvalideesLe?, derniereConnexionLe? }
 * Les réservations restent rattachées par email (reservation.client.email) ; les nouvelles
 * portent aussi clientId.
 */
const STATUTS = { SANS_MOT_DE_PASSE: 'sans_mot_de_passe', ACTIF: 'actif' };
const MOT_DE_PASSE_MIN = 8;
const DUREE_LIEN_EMAIL_MS = 7 * 24 * 60 * 60 * 1000; // lien des emails de réservation
const DUREE_LIEN_OUBLI_MS = 60 * 60 * 1000;           // « mot de passe oublié »

const HASH_FACTICE = hacher(crypto.randomBytes(16).toString('hex'));
const texte = (v, max) => String(v ?? '').trim().slice(0, max);
const email = (v) => texte(v, 254).toLowerCase();
const urlSite = () => (process.env.FRONTEND_URL || '').split(',')[0].trim().replace(/\/$/, '');

class ErreurClient extends Error {
  constructor(message, status = 400) { super(message); this.status = status; }
}

const ClientService = {
  STATUTS,
  MOT_DE_PASSE_MIN,
  ErreurClient,

  get collection() { return db.collection('clients'); },

  async trouver(id) {
    return id ? this.collection.findOne({ _id: { $eq: String(id) } }) : null;
  },

  async trouverParEmail(adresse) {
    return this.collection.findOne({ email: { $eq: email(adresse) } });
  },

  /**
   * Compte du voyageur, créé s'il n'existe pas. Les coordonnées d'un compte sans mot de passe sont
   * mises à jour (dernière saisie) ; celles d'un compte actif ne changent jamais ainsi.
   */
  async assurerCompte({ email: adresse, prenom, nom, telephone }) {
    const e = email(adresse);
    if (!e) return null;
    const coordonnees = { prenom: texte(prenom, 80), nom: texte(nom, 80), telephone: texte(telephone, 30) };
    const existant = await this.trouverParEmail(e);
    if (existant) {
      if (existant.statut !== STATUTS.ACTIF) {
        const renseignees = Object.fromEntries(Object.entries(coordonnees).filter(([, v]) => v));
        if (Object.keys(renseignees).length) await this.collection.updateOne({ _id: existant._id }, { $set: renseignees });
        return { ...existant, ...renseignees };
      }
      return existant;
    }
    const client = { _id: crypto.randomUUID(), email: e, ...coordonnees, statut: STATUTS.SANS_MOT_DE_PASSE, creeLe: new Date() };
    try {
      await this.collection.insertOne(client);
      return client;
    } catch (error) {
      if (error.code === 11000) return this.trouverParEmail(e); // créé au même moment par une autre requête
      throw error;
    }
  },

  /**
   * Adresse du bouton « Suivre ma réservation » des emails : choix du mot de passe tant que le
   * compte n'en a pas, page de connexion ensuite.
   */
  async lienEspace(reservationClient) {
    const client = await this.assurerCompte(reservationClient || {});
    if (!client || client.statut === STATUTS.ACTIF) return `${urlSite()}/mes-reservations`;
    const jeton = AuthService.creerJetonMotDePasseClient(client, DUREE_LIEN_EMAIL_MS);
    return `${urlSite()}/mes-reservations?mdp=${encodeURIComponent(jeton)}`;
  },

  /**
   * « Première connexion ou mot de passe oublié ». Retourne { client, url } à envoyer par email,
   * ou null si l'adresse n'a ni compte ni réservation (la route répond pareil dans les deux cas).
   */
  async demanderLien(adresse) {
    const e = email(adresse);
    let client = await this.trouverParEmail(e);
    if (!client) {
      // Réservations faites avant le Service client : le compte est créé à partir de la plus récente
      const r = await db.collection('reservations').findOne({ 'client.email': { $eq: e } }, { sort: { dateCreation: -1 }, projection: { client: 1 } });
      if (!r) return null;
      client = await this.assurerCompte(r.client);
    }
    const jeton = AuthService.creerJetonMotDePasseClient(client, DUREE_LIEN_OUBLI_MS);
    return { client, url: `${urlSite()}/mes-reservations?mdp=${encodeURIComponent(jeton)}` };
  },

  /** Enregistre le mot de passe choisi depuis le lien reçu par email. Retourne le compte. */
  async definirMotDePasse(jeton, motDePasse) {
    const mdp = String(motDePasse ?? '');
    if (mdp.length < MOT_DE_PASSE_MIN || mdp.length > 200) {
      throw new ErreurClient(`Le mot de passe doit contenir au moins ${MOT_DE_PASSE_MIN} caractères`);
    }
    const invalide = new ErreurClient('Ce lien n\'est plus valable. Demandez-en un nouveau depuis « Mes réservations ».');
    const donnees = AuthService.verifierJeton(String(jeton ?? ''));
    if (!donnees || donnees.role !== 'mdp_client' || !donnees.cid) throw invalide;
    const maintenant = new Date();
    // Usage unique : le lien doit être plus récent que le dernier changement de mot de passe,
    // vérifié dans la même opération que l'écriture
    const client = await this.collection.findOneAndUpdate(
      {
        _id: { $eq: String(donnees.cid) },
        $or: [{ motDePasseLe: { $exists: false } }, { motDePasseLe: { $lt: new Date(Number(donnees.iat) || 0) } }],
      },
      {
        $set: { motDePasse: hacher(mdp), statut: STATUTS.ACTIF, motDePasseLe: maintenant, sessionsInvalideesLe: maintenant, derniereConnexionLe: maintenant },
        $min: { activeLe: maintenant },
      },
      { returnDocument: 'after' }
    );
    if (!client) throw invalide;
    return client;
  },

  /** Email + mot de passe. Retourne le compte ou null (même durée de calcul dans tous les cas). */
  async connexion(adresse, motDePasse) {
    const client = await this.trouverParEmail(adresse);
    const ok = verifierHash(String(motDePasse ?? ''), client?.motDePasse || HASH_FACTICE);
    if (!client || !ok || client.statut !== STATUTS.ACTIF) return null;
    await this.collection.updateOne({ _id: client._id }, { $set: { derniereConnexionLe: new Date() } });
    return client;
  },

  /** Compte d'une session (jeton déjà vérifié) ; null si le compte a disparu ou la session est fermée. */
  async depuisSession(donnees) {
    if (!donnees?.cid) return null;
    const client = await this.trouver(donnees.cid);
    if (!client) return null;
    if (client.sessionsInvalideesLe && (Number(donnees.iat) || 0) < new Date(client.sessionsInvalideesLe).getTime()) return null;
    return client;
  },

  public(c) {
    return c ? { id: c._id, prenom: c.prenom, nom: c.nom, email: c.email, telephone: c.telephone, actif: c.statut === STATUTS.ACTIF } : null;
  },

  // ---------- Plateforme ----------

  /** Clients pour le super-administrateur, avec leur nombre de réservations. */
  async lister({ recherche = '' } = {}) {
    const filtre = {};
    const q = texte(recherche, 80);
    if (q) {
      const motif = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      filtre.$or = [{ email: motif }, { nom: motif }, { prenom: motif }, { telephone: motif }];
    }
    const clients = await this.collection.find(filtre, { projection: { motDePasse: 0 } }).sort({ creeLe: -1 }).limit(500).toArray();
    const compteurs = await db.collection('reservations').aggregate([
      { $match: { 'client.email': { $in: clients.map(c => c.email) } } },
      { $group: { _id: '$client.email', total: { $sum: 1 }, derniere: { $max: '$dateCreation' } } },
    ]).toArray();
    const parEmail = new Map(compteurs.map(c => [c._id, c]));
    return clients.map(c => ({
      id: c._id, prenom: c.prenom, nom: c.nom, email: c.email, telephone: c.telephone, statut: c.statut,
      creeLe: c.creeLe, activeLe: c.activeLe || null, derniereConnexionLe: c.derniereConnexionLe || null,
      reservations: parEmail.get(c.email)?.total || 0, derniereReservationLe: parEmail.get(c.email)?.derniere || null,
    }));
  },
};

module.exports = ClientService;
