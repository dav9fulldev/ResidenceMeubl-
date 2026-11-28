const db = require('../db');

/**
 * Alertes de disponibilité : un voyageur demande à être prévenu si une résidence se libère
 * à ses dates (annulation, refus d'une demande, fin d'une maintenance).
 *
 *  - une alerte par résidence, email et période (la même demande ne crée pas de doublon) ;
 *  - au plus 5 alertes en cours par adresse email ;
 *  - un seul email : l'alerte disparaît dès qu'elle a été envoyée, ou quand la date d'arrivée est passée ;
 *  - vérifiée tout de suite après une annulation, puis chaque heure (secours).
 *
 * Collection alertes_disponibilite { residenceId, entrepriseId, residenceNom, email, arrivee, depart, creeLe, envoiLe? }
 */
const MAX_PAR_EMAIL = 5;
const MAX_NUITS = 90;
const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,24}$/;
const JOUR = /^\d{4}-\d{2}-\d{2}$/;
const aujourdhui = () => new Date().toISOString().slice(0, 10);

class ErreurAlerte extends Error {
  constructor(message, status = 400) { super(message); this.status = status; }
}

const AlerteService = {
  ErreurAlerte,
  MAX_PAR_EMAIL,

  get collection() { return db.collection('alertes_disponibilite'); },

  /** Voyageur : demande une alerte. Retourne { creee: boolean }. */
  async creer(residenceId, { email, arrivee, depart } = {}) {
    const adresse = String(email ?? '').trim().toLowerCase().slice(0, 254);
    const a = String(arrivee ?? '');
    const d = String(depart ?? '');
    if (!EMAIL.test(adresse)) throw new ErreurAlerte('Adresse email invalide');
    if (!JOUR.test(a) || !JOUR.test(d) || Number.isNaN(Date.parse(a)) || Number.isNaN(Date.parse(d)) || d <= a) throw new ErreurAlerte('Choisissez une date d\'arrivée et une date de départ');
    if (a < aujourdhui()) throw new ErreurAlerte('La date d\'arrivée est déjà passée');
    if ((Date.parse(d) - Date.parse(a)) / 86400000 > MAX_NUITS) throw new ErreurAlerte(`Une alerte couvre au plus ${MAX_NUITS} nuits`);

    const ResidenceService = require('./ResidenceService');
    const residence = await ResidenceService.getResidenceById(residenceId);
    if (!residence) throw new ErreurAlerte('Résidence introuvable', 404);
    if (await require('./ReservationService').checkDisponibilite(residence.id, a, d)) {
      throw new ErreurAlerte('Bonne nouvelle : la résidence est libre à ces dates, vous pouvez réserver dès maintenant.', 409);
    }

    const cle = { residenceId: Number(residence.id), email: adresse, arrivee: a, depart: d };
    if (await this.collection.findOne(cle)) return { creee: false };
    const enCours = await this.collection.countDocuments({ email: adresse, arrivee: { $gte: aujourdhui() } });
    if (enCours >= MAX_PAR_EMAIL) throw new ErreurAlerte(`Vous avez déjà ${MAX_PAR_EMAIL} alertes en cours avec cette adresse.`, 429);
    await this.collection.updateOne(cle, { $setOnInsert: { ...cle, entrepriseId: residence.entrepriseId, residenceNom: residence.nom, creeLe: new Date() } }, { upsert: true });
    return { creee: true };
  },

  /**
   * Prévient les voyageurs dont les dates sont devenues libres (une résidence, ou toutes).
   * Retourne le nombre d'emails envoyés. Les alertes dont l'arrivée est passée sont supprimées.
   */
  async verifier({ residenceId = null, emails = require('./ReservationService').emailService } = {}) {
    await this.collection.deleteMany({ arrivee: { $lt: aujourdhui() } });
    const filtre = { envoiLe: { $exists: false }, ...(residenceId != null ? { residenceId: Number(residenceId) } : {}) };
    const alertes = await this.collection.find(filtre).sort({ creeLe: 1 }).limit(500).toArray();
    const Reservations = require('./ReservationService');
    const Tenant = require('./Tenant');
    let envoyes = 0;
    for (const alerte of alertes) {
      if (!(await Reservations.checkDisponibilite(alerte.residenceId, alerte.arrivee, alerte.depart))) continue;
      // Réserver l'envoi (une seule fois, même avec plusieurs serveurs)
      const pris = await this.collection.updateOne({ _id: alerte._id, envoiLe: { $exists: false } }, { $set: { envoiLe: new Date() } });
      if (pris.modifiedCount !== 1) continue;
      try {
        await Tenant.pour(alerte, () => emails.sendAlerteDisponibilite(alerte));
        await this.collection.deleteOne({ _id: alerte._id });
        envoyes += 1;
      } catch (e) {
        console.error('⚠️ Alerte de disponibilité non envoyée :', String(e?.message).replace(/\n|\r/g, ''));
        await this.collection.updateOne({ _id: alerte._id }, { $unset: { envoiLe: '' } });
      }
    }
    return envoyes;
  },

  /** Après une annulation : vérification immédiate pour cette résidence, sans bloquer. */
  verifierEnFond(residenceId) {
    this.verifier({ residenceId }).catch(e => console.error('⚠️ Alertes de disponibilité :', e.message));
  },
};

module.exports = AlerteService;
