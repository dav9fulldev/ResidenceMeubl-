const db = require('../../db');

/**
 * Registre financier (Financial Ledger) : source de vérité des mouvements comptabilisés.
 *
 * Partie double : chaque transaction comporte des écritures dont le total des débits est égal
 * au total des crédits. Une transaction validée n'est jamais modifiée ni supprimée : une erreur
 * se corrige par une contre-passation (écritures inverses) puis une nouvelle transaction.
 *
 * Montants : entiers en FCFA (XOF), jamais de nombres à virgule.
 * Idempotence : chaque transaction porte une clé unique (ex. « PAIEMENT:<txId> ») ; une même
 * opération reçue deux fois (webhook rejoué, double clic) ne produit qu'une seule écriture.
 *
 * Collections : ledger_transactions, ledger_entries.
 *
 * Plan de comptes (simplifié, à compléter avec l'expert-comptable : frais des prestataires, taxes) :
 *   FONDS_PRESTATAIRE   actif  : fonds encaissés et présents chez le prestataire (par prestataire)
 *   DETTE_PROPRIETAIRE  passif : sommes dues à une entreprise (par entreprise ; négatif = elle doit à BABI)
 *   COMMISSION_BABI     produit : commissions de la plateforme
 *   REVENU_PLATEFORME   produit : séjours des résidences propres de BABI RESIDENCE
 *   TROP_PERCU_CLIENT   passif : paiements reçus en double, à rendre aux clients
 * Ces soldes sont des montants COMPTABILISÉS : ils ne prouvent pas que l'argent est disponible
 * sur un compte (voir le rapprochement, services/finance/Rapprochement.js).
 */
const DEVISE = 'XOF';
const COMPTES = {
  FONDS_PRESTATAIRE: { libelle: 'Fonds chez le prestataire', nature: 'actif' },
  DETTE_PROPRIETAIRE: { libelle: 'Dettes envers les propriétaires', nature: 'passif' },
  COMMISSION_BABI: { libelle: 'Commissions BABI RESIDENCE', nature: 'produit' },
  REVENU_PLATEFORME: { libelle: 'Séjours des résidences BABI RESIDENCE', nature: 'produit' },
  TROP_PERCU_CLIENT: { libelle: 'Trop-perçus à rendre aux clients', nature: 'passif' },
};

class ErreurLedger extends Error {
  constructor(message, status = 400) { super(message); this.status = status; }
}

const entier = (n) => Number.isSafeInteger(n);

/** Référence lisible et unique : LED-2026-000001 */
async function prochaineReference(prefixe, session) {
  const annee = new Date().getUTCFullYear();
  const r = await db.collection('counters').findOneAndUpdate(
    { _id: `${prefixe}-${annee}` }, { $inc: { seq: 1 } },
    { upsert: true, returnDocument: 'after', session }
  );
  return `${prefixe}-${annee}-${String(r.seq).padStart(6, '0')}`;
}

const Ledger = {
  DEVISE,
  COMPTES,
  ErreurLedger,
  prochaineReference,

  get transactions() { return db.collection('ledger_transactions'); },
  get ecritures() { return db.collection('ledger_entries'); },

  async index() {
    await Promise.all([
      this.transactions.createIndex({ cle: 1 }, { unique: true }),
      this.transactions.createIndex({ reference: 1 }, { unique: true }),
      this.transactions.createIndex({ reservationId: 1 }),
      this.transactions.createIndex({ entrepriseId: 1, creeLe: -1 }),
      this.transactions.createIndex({ type: 1, creeLe: -1 }),
      this.ecritures.createIndex({ transactionId: 1 }),
      this.ecritures.createIndex({ compte: 1, entrepriseId: 1 }),
      this.ecritures.createIndex({ reservationId: 1 }),
    ]);
  },

  /**
   * Vérifie qu'une transaction est valide avant écriture : montants entiers positifs, comptes connus,
   * débits = crédits. Lève une erreur sinon (aucune écriture partielle).
   */
  valider(ecritures) {
    if (!Array.isArray(ecritures) || ecritures.length < 2) throw new ErreurLedger('Une transaction comporte au moins deux écritures');
    let debit = 0;
    let credit = 0;
    for (const e of ecritures) {
      if (!COMPTES[e.compte]) throw new ErreurLedger(`Compte inconnu : ${e.compte}`);
      if (!entier(e.montant) || e.montant < 0) throw new ErreurLedger('Montant invalide : entier positif en FCFA attendu');
      if (!['DEBIT', 'CREDIT'].includes(e.sens)) throw new ErreurLedger('Sens invalide');
      if (e.sens === 'DEBIT') debit += e.montant; else credit += e.montant;
    }
    if (debit !== credit) throw new ErreurLedger(`Transaction déséquilibrée : ${debit} au débit, ${credit} au crédit`);
    return debit;
  },

  /**
   * Enregistre une transaction et ses écritures (dans la session fournie, ou dans une transaction
   * MongoDB dédiée). Idempotent : si la clé existe déjà, renvoie la transaction existante sans rien écrire.
   * @returns {{ transaction, cree: boolean }}
   */
  async poster({ cle, type, libelle, reservationId = null, entrepriseId = null, ecritures, par = 'systeme', meta = {} }, session = null) {
    if (!cle) throw new ErreurLedger('Clé d\'idempotence obligatoire');
    const lignes = ecritures.filter(e => e.montant !== 0);
    const total = this.valider(lignes);
    const executer = async (s) => {
      const existante = await this.transactions.findOne({ cle }, { session: s });
      if (existante) return { transaction: existante, cree: false };
      const maintenant = new Date();
      const transaction = {
        reference: await prochaineReference('LED', s),
        cle, type, libelle, reservationId, entrepriseId, montant: total, devise: DEVISE,
        statut: 'POSTED', par, meta, creeLe: maintenant,
      };
      const { insertedId } = await this.transactions.insertOne(transaction, { session: s });
      await this.ecritures.insertMany(lignes.map(e => ({
        transactionId: insertedId, reference: transaction.reference, type, compte: e.compte, sens: e.sens, montant: e.montant, devise: DEVISE,
        entrepriseId: e.entrepriseId ?? entrepriseId, reservationId, fournisseur: e.fournisseur || null, creeLe: maintenant,
      })), { session: s });
      return { transaction: { ...transaction, _id: insertedId }, cree: true };
    };
    return session ? executer(session) : db.transaction(executer);
  },

  /** Contre-passation : écritures inverses d'une transaction (l'originale reste inchangée). */
  async contrePasser(transactionId, { motif, par }, session = null) {
    const t = await this.transactions.findOne({ _id: transactionId }, { session });
    if (!t) throw new ErreurLedger('Transaction introuvable', 404);
    if (t.type === 'CONTREPASSATION') throw new ErreurLedger('Une contre-passation ne se contre-passe pas', 409);
    const lignes = await this.ecritures.find({ transactionId: t._id }, { session }).toArray();
    return this.poster({
      cle: `CONTRE:${t._id}`, type: 'CONTREPASSATION', libelle: `Contre-passation de ${t.reference} : ${motif}`,
      reservationId: t.reservationId, entrepriseId: t.entrepriseId, par, meta: { origine: t.reference, motif },
      ecritures: lignes.map(e => ({ compte: e.compte, sens: e.sens === 'DEBIT' ? 'CREDIT' : 'DEBIT', montant: e.montant, entrepriseId: e.entrepriseId, fournisseur: e.fournisseur })),
    }, session);
  },

  /**
   * Solde d'un compte (débits − crédits pour un actif, crédits − débits pour un passif ou un produit),
   * éventuellement par entreprise ou par prestataire.
   */
  async solde(compte, filtre = {}) {
    const [r] = await this.ecritures.aggregate([
      { $match: { compte, ...filtre } },
      { $group: { _id: null, debit: { $sum: { $cond: [{ $eq: ['$sens', 'DEBIT'] }, '$montant', 0] } }, credit: { $sum: { $cond: [{ $eq: ['$sens', 'CREDIT'] }, '$montant', 0] } } } },
    ]).toArray();
    const debit = r?.debit || 0;
    const credit = r?.credit || 0;
    return COMPTES[compte].nature === 'actif' ? debit - credit : credit - debit;
  },

  /** Balance générale : total des débits et des crédits (doivent être égaux). */
  async balance() {
    const lignes = await this.ecritures.aggregate([
      { $group: { _id: '$compte', debit: { $sum: { $cond: [{ $eq: ['$sens', 'DEBIT'] }, '$montant', 0] } }, credit: { $sum: { $cond: [{ $eq: ['$sens', 'CREDIT'] }, '$montant', 0] } } } },
    ]).toArray();
    const debit = lignes.reduce((s, l) => s + l.debit, 0);
    const credit = lignes.reduce((s, l) => s + l.credit, 0);
    return { equilibree: debit === credit, debit, credit, comptes: lignes };
  },
};

module.exports = Ledger;
