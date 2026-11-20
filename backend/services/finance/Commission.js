const db = require('../../db');
const Tenant = require('../Tenant');

/**
 * Moteur de commission.
 *
 * - Taux en points de base (800 = 8 %) : entier, aucun calcul à virgule stocké.
 * - Règles historisées (collection « commission_rules ») : un changement de taux crée une nouvelle
 *   règle ; les anciennes réservations gardent le taux figé au moment de leur création
 *   (reservation.conditionsFinancieres).
 * - Arrondi : au FCFA le plus proche (0,5 arrondi au-dessus), calcul reproductible.
 * - Les résidences de la plateforme elle-même (entreprise interne) ne paient pas de commission (taux 0).
 */
const TAUX_DEFAUT_PB = 800;

const Commission = {
  get regles() { return db.collection('commission_rules'); },

  async initialiser() {
    await this.regles.createIndex({ actifDepuis: -1 });
    if (await this.regles.estimatedDocumentCount() === 0) {
      await this.regles.insertOne({ nom: 'Commission standard', type: 'POURCENTAGE', tauxPb: TAUX_DEFAUT_PB, devise: 'XOF', actifDepuis: new Date(0), creeLe: new Date(), par: 'systeme' });
    }
  },

  /** Règle en vigueur à une date (par défaut maintenant). */
  async regleA(date = new Date()) {
    return this.regles.find({ actifDepuis: { $lte: new Date(date) } }).sort({ actifDepuis: -1 }).limit(1).next();
  },

  async historique() {
    return this.regles.find({}).sort({ actifDepuis: -1 }).toArray();
  },

  /** Nouveau taux, applicable aux réservations créées à partir de maintenant. */
  async changerTaux(tauxPourcent, par) {
    const pb = Math.round(Number(tauxPourcent) * 100);
    if (!Number.isInteger(pb) || pb < 0 || pb > 5000) throw Object.assign(new Error('Taux invalide : entre 0 et 50 %'), { status: 400 });
    const regle = { nom: 'Commission standard', type: 'POURCENTAGE', tauxPb: pb, devise: 'XOF', actifDepuis: new Date(), creeLe: new Date(), par };
    await this.regles.insertOne(regle);
    return regle;
  },

  /** Conditions financières figées à la création d'une réservation. */
  async conditionsPour(entrepriseId, date = new Date()) {
    if (require('../EntrepriseService').estInterne(entrepriseId)) return { tauxCommissionPb: 0, regleId: null, proprePlateforme: true, figeesLe: new Date() };
    const regle = await this.regleA(date);
    return { tauxCommissionPb: regle ? regle.tauxPb : TAUX_DEFAUT_PB, regleId: regle?._id || null, proprePlateforme: false, figeesLe: new Date() };
  },

  /** Conditions d'une réservation existante (figées, ou reconstituées pour les anciennes réservations). */
  async conditionsDe(r) {
    if (r.conditionsFinancieres) return r.conditionsFinancieres;
    return this.conditionsPour(r.entrepriseId || Tenant.PRINCIPALE, r.dateCreation || new Date());
  },

  /** Commission sur un montant, arrondie au FCFA le plus proche. */
  calculer(montant, tauxPb) {
    return Math.round((Number(montant) * Number(tauxPb)) / 10000);
  },
};

module.exports = Commission;
