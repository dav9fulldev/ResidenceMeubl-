const { ObjectId } = require('mongodb');
const db = require('../db');

/**
 * Booster de visibilité : un partenaire paie pour qu'une résidence soit mieux placée, en plus de sa note.
 *
 * Paiement hors plateforme, activation manuelle :
 *   1. le partenaire demande un booster (résidence publiée, durée 7, 15 ou 30 jours, prix de la plateforme) ;
 *   2. la plateforme est prévenue ; le partenaire règle ;
 *   3. le super-administrateur active en notant le moyen et la référence du paiement (ou refuse) ;
 *   4. le booster court du moment de l'activation jusqu'à sa fin ; il peut être arrêté.
 * Chaque action est inscrite au journal financier (financial_audit_logs).
 *
 * Effet : bonus limité ajouté au score de recommandation (ResidenceService), refusé à une résidence
 * mal notée ; mention « Sponsorisé » sur l'annonce.
 *
 * Collection boosters { _id, reference, entrepriseId, residenceId, residenceNom, duree, montant, statut,
 *   demandeLe, demandePar, debut?, fin?, activeLe?, activePar?, paiement?, motif?, arreteLe? }
 * Statuts : en_attente, actif (terminé une fois la fin passée), refuse, annule, arrete.
 */
const DUREES = [7, 15, 30];
const TARIFS_DEFAUT = { 7: 5000, 15: 9000, 30: 15000 };
const BONUS = 0.5;            // ajouté au score de recommandation (échelle de 1 à 5)
const NOTE_MINIMALE = 3;      // en dessous (score de la résidence), le booster ne donne pas de bonus
const MOYENS = ['mobile_money', 'virement', 'especes', 'autre'];
const texte = (v, max) => String(v ?? '').trim().slice(0, max);

class ErreurBooster extends Error {
  constructor(message, status = 400) { super(message); this.status = status; }
}

const BoosterService = {
  DUREES, BONUS, NOTE_MINIMALE, MOYENS, ErreurBooster,

  get collection() { return db.collection('boosters'); },
  get parametres() { return db.collection('parametres'); },

  async tarifs() {
    const doc = await this.parametres.findOne({ _id: 'booster' });
    return { ...TARIFS_DEFAUT, ...(doc?.tarifs || {}) };
  },

  /** Plateforme : prix (FCFA entiers) de chaque durée */
  async changerTarifs(tarifs = {}, par) {
    const nouveaux = {};
    for (const d of DUREES) {
      const v = Number(tarifs[d]);
      if (!Number.isSafeInteger(v) || v < 0 || v > 10000000) throw new ErreurBooster(`Prix invalide pour ${d} jours : montant entier en FCFA attendu`);
      nouveaux[d] = v;
    }
    await this.parametres.updateOne({ _id: 'booster' }, { $set: { tarifs: nouveaux, modifieLe: new Date(), modifiePar: par } }, { upsert: true });
    await require('./finance').journaliser(par, 'BOOSTER_TARIFS', { tarifs: nouveaux });
    return nouveaux;
  },

  /** Statut affiché : un booster actif dont la fin est passée est « terminé ». */
  vue(b, maintenant = new Date()) {
    const statut = b.statut === 'actif' && b.fin && new Date(b.fin) <= maintenant ? 'termine' : b.statut;
    return {
      id: b._id.toString(), reference: b.reference, entrepriseId: b.entrepriseId, residenceId: b.residenceId, residenceNom: b.residenceNom,
      duree: b.duree, montant: b.montant, statut, demandeLe: b.demandeLe, debut: b.debut || null, fin: b.fin || null,
      paiement: b.paiement || null, motif: b.motif || null,
    };
  },

  /** Partenaire : demande un booster pour une de ses résidences publiées. */
  async demander(entrepriseId, { residenceId, duree } = {}, par) {
    const d = Number(duree);
    if (!DUREES.includes(d)) throw new ErreurBooster('Durée invalide : 7, 15 ou 30 jours');
    const residence = await db.collection('residences').findOne({ id: Number(residenceId), entrepriseId: { $eq: String(entrepriseId) } });
    if (!residence) throw new ErreurBooster('Résidence introuvable', 404);
    if (residence.statutVerification !== 'verifiee' || residence.actif === false) throw new ErreurBooster('Seule une résidence vérifiée et publiée peut être boostée', 409);
    const encours = await this.collection.findOne({ residenceId: residence.id, $or: [{ statut: 'en_attente' }, { statut: 'actif', fin: { $gt: new Date() } }] });
    if (encours) throw new ErreurBooster(encours.statut === 'actif' ? 'Cette résidence est déjà boostée' : 'Une demande est déjà en attente pour cette résidence', 409);
    const montant = (await this.tarifs())[d];
    const Ledger = require('./finance/Ledger');
    const doc = {
      reference: await Ledger.prochaineReference('BST'), entrepriseId: String(entrepriseId), residenceId: residence.id, residenceNom: residence.nom,
      duree: d, montant, statut: 'en_attente', demandeLe: new Date(), demandePar: par,
    };
    const { insertedId } = await this.collection.insertOne(doc);
    await require('./finance').journaliser(par, 'BOOSTER_DEMANDE', { booster: doc.reference, entrepriseId: doc.entrepriseId, residenceId: doc.residenceId, duree: d, montant });
    return { ...doc, _id: insertedId };
  },

  async listerEntreprise(entrepriseId) {
    const liste = await this.collection.find({ entrepriseId: { $eq: String(entrepriseId) } }).sort({ demandeLe: -1 }).limit(100).toArray();
    return liste.map(b => this.vue(b));
  },

  async listerPlateforme() {
    const liste = await this.collection.find({}).sort({ demandeLe: -1 }).limit(300).toArray();
    const EntrepriseService = require('./EntrepriseService');
    return liste.map(b => ({ ...this.vue(b), entreprise: EntrepriseService.nom(b.entrepriseId) }));
  },

  async trouver(id, filtre = {}) {
    if (!ObjectId.isValid(String(id))) throw new ErreurBooster('Booster introuvable', 404);
    const b = await this.collection.findOne({ _id: new ObjectId(String(id)), ...filtre });
    if (!b) throw new ErreurBooster('Booster introuvable', 404);
    return b;
  },

  /** Partenaire : annule sa demande tant qu'elle n'est pas activée. */
  async annuler(entrepriseId, id, par) {
    const b = await this.trouver(id, { entrepriseId: String(entrepriseId) });
    const r = await this.collection.updateOne({ _id: b._id, statut: 'en_attente' }, { $set: { statut: 'annule', annuleLe: new Date() } });
    if (!r.modifiedCount) throw new ErreurBooster('Seule une demande en attente peut être annulée', 409);
    await require('./finance').journaliser(par, 'BOOSTER_ANNULE', { booster: b.reference });
    return this.vue({ ...b, statut: 'annule' });
  },

  /**
   * Plateforme : activer (paiement reçu, moyen + référence), refuser (motif) ou arrêter un booster actif.
   */
  async agir(id, { action, moyen, reference, motif } = {}, par) {
    const b = await this.trouver(id);
    const maintenant = new Date();
    if (action === 'activer') {
      if (!MOYENS.includes(moyen)) throw new ErreurBooster('Indiquez le moyen de paiement reçu');
      const ref = texte(reference, 80);
      if (ref.length < 3) throw new ErreurBooster('Indiquez la référence du paiement reçu');
      const fin = new Date(maintenant.getTime() + b.duree * 86400000);
      const r = await this.collection.updateOne({ _id: b._id, statut: 'en_attente' }, { $set: {
        statut: 'actif', debut: maintenant, fin, activeLe: maintenant, activePar: par, paiement: { moyen, reference: ref, montant: b.montant },
      } });
      if (!r.modifiedCount) throw new ErreurBooster('Seule une demande en attente peut être activée', 409);
      await require('./finance').journaliser(par, 'BOOSTER_ACTIVE', { booster: b.reference, entrepriseId: b.entrepriseId, montant: b.montant, moyen, reference: ref, fin });
      return this.vue({ ...b, statut: 'actif', debut: maintenant, fin, paiement: { moyen, reference: ref, montant: b.montant } });
    }
    if (action === 'refuser' || action === 'arreter') {
      const m = texte(motif, 300);
      if (m.length < 3) throw new ErreurBooster('Indiquez le motif');
      const filtre = action === 'refuser' ? { statut: 'en_attente' } : { statut: 'actif', fin: { $gt: maintenant } };
      const maj = action === 'refuser' ? { statut: 'refuse', motif: m, refuseLe: maintenant } : { statut: 'arrete', motif: m, arreteLe: maintenant, fin: maintenant };
      const r = await this.collection.updateOne({ _id: b._id, ...filtre }, { $set: maj });
      if (!r.modifiedCount) throw new ErreurBooster(action === 'refuser' ? 'Seule une demande en attente peut être refusée' : 'Ce booster n\'est pas actif', 409);
      await require('./finance').journaliser(par, action === 'refuser' ? 'BOOSTER_REFUSE' : 'BOOSTER_ARRETE', { booster: b.reference, motif: m });
      return this.vue({ ...b, ...maj });
    }
    throw new ErreurBooster('Action inconnue');
  },

  /** Résidences boostées en ce moment : Set des identifiants */
  async actifs() {
    const maintenant = new Date();
    const liste = await this.collection.find({ statut: 'actif', debut: { $lte: maintenant }, fin: { $gt: maintenant } }, { projection: { residenceId: 1 } }).toArray();
    return new Set(liste.map(b => b.residenceId));
  },
};

module.exports = BoosterService;
