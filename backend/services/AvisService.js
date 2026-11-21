const { ObjectId } = require('mongodb');
const db = require('../db');
const Tenant = require('./Tenant');

/**
 * Service de notation : les voyageurs notent la résidence après leur séjour.
 *
 * Seul un séjour réel peut être noté : réservation confirmée, séjour terminé (départ passé),
 * au plus 90 jours après le départ, une seule fois par réservation. La personne doit accéder à
 * la réservation (compte du Service client ou accès par référence).
 *
 * Note globale de 1 à 5, quatre critères de 1 à 5, commentaire facultatif.
 * Le partenaire qui gère la résidence peut répondre une fois (réponse modifiable).
 * Le super-administrateur peut masquer un avis abusif (motif obligatoire) : il ne compte plus
 * dans la moyenne et n'est plus affiché, mais il reste en base.
 *
 * Collection avis { _id, reservationId (unique), residenceId, entrepriseId, clientEmail, clientId,
 *                   auteur, note, criteres, commentaire, creeLe, reponse?, masque? }
 */
const CRITERES = {
  proprete: 'Propreté',
  conformite: 'Conformité à l\'annonce',
  accueil: 'Accueil et communication',
  qualitePrix: 'Rapport qualité-prix',
};
const DELAI_JOURS = 90;
const aujourdhui = () => new Date().toISOString().slice(0, 10);
const ilYa = (jours) => new Date(Date.now() - jours * 86400000).toISOString().slice(0, 10);
const noteValide = (n) => Number.isInteger(n) && n >= 1 && n <= 5;
const arrondi = (n) => Math.round(n * 10) / 10;
const texte = (v, max) => String(v ?? '').trim().slice(0, max);

class ErreurAvis extends Error {
  constructor(message, status = 400) { super(message); this.status = status; }
}

/** « Mariam T. » : prénom et initiale du nom, jamais le nom complet ni l'email */
const auteurPublic = (client = {}) => {
  const prenom = texte(client.prenom, 40) || 'Voyageur';
  const initiale = texte(client.nom, 40).charAt(0).toUpperCase();
  return initiale ? `${prenom} ${initiale}.` : prenom;
};

/** Une réservation peut-elle être notée (hors « déjà notée ») ? */
const notable = (r) => r?.statut === 'confirmee' && r.dates?.depart <= aujourdhui() && r.dates.depart >= ilYa(DELAI_JOURS);

const AvisService = {
  CRITERES,
  DELAI_JOURS,
  ErreurAvis,
  notable,

  get collection() { return db.collection('avis'); },

  /** Dépôt d'un avis par le voyageur. acces = req.client { email, ref? }. */
  async deposer(reservationId, acces, donnees = {}) {
    // Accès limité à une réservation (référence) : seulement celle-là
    if (acces.ref && String(acces.ref) !== String(reservationId)) throw new ErreurAvis('Réservation introuvable', 404);
    const r = await db.collection('reservations').findOne(
      { id: { $eq: String(reservationId) }, 'client.email': { $eq: String(acces.email) } },
      { projection: { _id: 0 } }
    );
    if (!r) throw new ErreurAvis('Réservation introuvable', 404);
    if (r.statut !== 'confirmee') throw new ErreurAvis('Seul un séjour confirmé peut être noté', 409);
    if (r.dates.depart > aujourdhui()) throw new ErreurAvis('Vous pourrez noter votre séjour après votre départ', 409);
    if (r.dates.depart < ilYa(DELAI_JOURS)) throw new ErreurAvis(`Un séjour se note dans les ${DELAI_JOURS} jours qui suivent le départ`, 409);

    const note = Number(donnees.note);
    if (!noteValide(note)) throw new ErreurAvis('Donnez une note de 1 à 5 étoiles');
    const criteres = {};
    for (const k of Object.keys(CRITERES)) {
      const v = Number(donnees.criteres?.[k]);
      if (!noteValide(v)) throw new ErreurAvis(`Notez aussi : ${CRITERES[k].toLowerCase()}`);
      criteres[k] = v;
    }
    if (donnees.commentaire !== undefined && donnees.commentaire !== null && typeof donnees.commentaire !== 'string') throw new ErreurAvis('Commentaire invalide');
    if (String(donnees.commentaire || '').trim().length > 1000) throw new ErreurAvis('Commentaire : 1000 caractères maximum');

    const avis = {
      reservationId: r.id, residenceId: r.residenceId, entrepriseId: r.entrepriseId || Tenant.PRINCIPALE,
      clientEmail: r.client.email, clientId: r.clientId || null, auteur: auteurPublic(r.client),
      note, criteres, commentaire: texte(donnees.commentaire, 1000), creeLe: new Date(), reponse: null, masque: null,
    };
    try {
      const { insertedId } = await this.collection.insertOne(avis);
      return { ...avis, _id: insertedId };
    } catch (error) {
      if (error.code === 11000) throw new ErreurAvis('Vous avez déjà noté ce séjour', 409);
      throw error;
    }
  },

  /** Avis déjà déposés pour ces réservations : Map reservationId → note */
  async pourReservations(ids) {
    if (!ids.length) return new Map();
    const liste = await this.collection.find({ reservationId: { $in: ids.map(String) } }, { projection: { reservationId: 1, note: 1 } }).toArray();
    return new Map(liste.map(a => [a.reservationId, a.note]));
  },

  /** Moyennes par résidence (avis visibles) : Map residenceId → { moyenne, nombre, criteres } */
  async resumes(residenceIds = null) {
    const lignes = await this.collection.aggregate([
      { $match: { masque: null, ...(residenceIds ? { residenceId: { $in: residenceIds } } : {}) } },
      {
        $group: {
          _id: '$residenceId', nombre: { $sum: 1 }, moyenne: { $avg: '$note' },
          ...Object.fromEntries(Object.keys(CRITERES).map(k => [k, { $avg: `$criteres.${k}` }])),
        },
      },
    ]).toArray();
    return new Map(lignes.map(l => [l._id, {
      moyenne: arrondi(l.moyenne), nombre: l.nombre,
      criteres: Object.fromEntries(Object.keys(CRITERES).map(k => [k, arrondi(l[k])])),
    }]));
  },

  /**
   * Note de chaque partenaire : moyenne de tous les avis visibles sur ses résidences.
   * Map entrepriseId → { moyenne, nombre, residences, criteres }
   */
  async parEntreprise() {
    const lignes = await this.collection.aggregate([
      { $match: { masque: null } },
      {
        $group: {
          _id: '$entrepriseId', nombre: { $sum: 1 }, moyenne: { $avg: '$note' }, residences: { $addToSet: '$residenceId' },
          ...Object.fromEntries(Object.keys(CRITERES).map(k => [k, { $avg: `$criteres.${k}` }])),
        },
      },
    ]).toArray();
    return new Map(lignes.map(l => [l._id, {
      moyenne: arrondi(l.moyenne), nombre: l.nombre, residences: l.residences.length,
      criteres: Object.fromEntries(Object.keys(CRITERES).map(k => [k, arrondi(l[k])])),
    }]));
  },

  /**
   * Plateforme : classement des partenaires par note moyenne (les mieux notés d'abord,
   * à égalité celui qui a le plus d'avis), puis les partenaires sans avis.
   */
  async classementPartenaires() {
    const EntrepriseService = require('./EntrepriseService');
    const [entreprises, notes] = await Promise.all([EntrepriseService.lister(), this.parEntreprise()]);
    return entreprises
      .filter(e => !e.principale)
      .map(e => ({ id: e.id, nom: e.nom, statut: e.statut, interne: e.interne, residencesPubliees: e.residences ?? null, notation: notes.get(e.id) || null }))
      .sort((a, b) => (b.notation?.moyenne ?? -1) - (a.notation?.moyenne ?? -1) || (b.notation?.nombre ?? 0) - (a.notation?.nombre ?? 0) || a.nom.localeCompare(b.nom, 'fr'));
  },

  /** Fiche publique : moyenne, critères et derniers avis visibles */
  async publics(residenceId, limite = 20) {
    const id = Number(residenceId);
    const [resume, liste] = await Promise.all([
      this.resumes([id]).then(m => m.get(id) || { moyenne: null, nombre: 0, criteres: null }),
      this.collection.find({ residenceId: id, masque: null }).sort({ creeLe: -1 }).limit(limite).toArray(),
    ]);
    return {
      ...resume,
      libellesCriteres: CRITERES,
      avis: liste.map(a => ({
        id: a._id.toString(), auteur: a.auteur, note: a.note, criteres: a.criteres, commentaire: a.commentaire,
        creeLe: a.creeLe, reponse: a.reponse ? { texte: a.reponse.texte, le: a.reponse.le } : null,
      })),
    };
  },

  // ---------- Back-office ----------

  /** Partenaire : avis de ses résidences ; super-admin : tous (y compris masqués). */
  async listerAdmin({ superAdmin = false } = {}) {
    const filtre = superAdmin ? {} : { entrepriseId: Tenant.courante() };
    const liste = await this.collection.find(filtre).sort({ creeLe: -1 }).limit(300).toArray();
    const residences = new Map((await db.collection('residences').find({ id: { $in: [...new Set(liste.map(a => a.residenceId))] } }, { projection: { id: 1, nom: 1 } }).toArray()).map(r => [r.id, r.nom]));
    const EntrepriseService = require('./EntrepriseService');
    return liste.map(a => ({
      id: a._id.toString(), reservationId: a.reservationId, residenceId: a.residenceId, residence: residences.get(a.residenceId) || `Résidence ${a.residenceId}`,
      entreprise: superAdmin ? EntrepriseService.nom(a.entrepriseId) : undefined,
      entrepriseId: superAdmin ? a.entrepriseId : undefined,
      auteur: a.auteur, note: a.note, criteres: a.criteres, commentaire: a.commentaire, creeLe: a.creeLe,
      reponse: a.reponse ? { texte: a.reponse.texte, le: a.reponse.le } : null,
      masque: a.masque ? { motif: a.masque.motif, le: a.masque.le } : null,
    }));
  },

  /** Réponse publique du partenaire qui gère la résidence (modifiable, vide = retirée) */
  async repondre(id, texteReponse, par) {
    if (!ObjectId.isValid(String(id))) throw new ErreurAvis('Avis introuvable', 404);
    const t = texte(texteReponse, 1000);
    const r = await this.collection.findOneAndUpdate(
      { _id: new ObjectId(String(id)), entrepriseId: Tenant.courante() },
      { $set: { reponse: t ? { texte: t, le: new Date(), par } : null } },
      { returnDocument: 'after' }
    );
    if (!r) throw new ErreurAvis('Avis introuvable', 404);
    return r;
  },

  /** Super-admin : masquer (motif obligatoire) ou réafficher un avis */
  async masquer(id, { masque, motif }, par) {
    if (!ObjectId.isValid(String(id))) throw new ErreurAvis('Avis introuvable', 404);
    const m = texte(motif, 300);
    if (masque && m.length < 5) throw new ErreurAvis('Indiquez le motif du masquage');
    const r = await this.collection.findOneAndUpdate(
      { _id: new ObjectId(String(id)) },
      { $set: { masque: masque ? { motif: m, le: new Date(), par } : null } },
      { returnDocument: 'after' }
    );
    if (!r) throw new ErreurAvis('Avis introuvable', 404);
    return r;
  },

  // ---------- Invitation à noter ----------

  /** Après le départ (jusqu'à 7 jours), un email invite le voyageur à noter son séjour. Une seule fois. */
  async envoyerInvitations(emailService) {
    if (!emailService) return 0;
    const candidates = await db.collection('reservations').find({
      statut: 'confirmee',
      'dates.depart': { $lte: aujourdhui(), $gte: ilYa(7) },
      avisInviteLe: { $exists: false },
    }, { projection: { _id: 0 } }).toArray();
    const dejaNotees = await this.pourReservations(candidates.map(r => r.id));
    let envoyes = 0;
    for (const r of candidates) {
      if (dejaNotees.has(r.id)) continue;
      // Réserver l'envoi avant d'écrire (pas de double invitation si deux minuteries tournent)
      const pris = await db.collection('reservations').updateOne({ id: r.id, avisInviteLe: { $exists: false } }, { $set: { avisInviteLe: new Date() } });
      if (pris.modifiedCount !== 1) continue;
      try {
        await Tenant.pour(r, () => emailService.sendInvitationAvis(r));
        envoyes += 1;
      } catch (error) {
        console.error('⚠️ Invitation à noter non envoyée (%s) :', String(r.id), error.message);
        await db.collection('reservations').updateOne({ id: r.id }, { $unset: { avisInviteLe: '' } });
      }
    }
    return envoyes;
  },
};

module.exports = AvisService;
