const db = require('../../db');
const Ledger = require('./Ledger');

/**
 * Rapprochement financier : compare le registre avec les paiements enregistrés sur les réservations
 * et, sur demande, avec l'état réel de chaque transaction chez le prestataire.
 *
 * Contrôles :
 *  - PAIEMENT_NON_COMPTABILISE : paiement payé sur une réservation, absent du registre
 *  - COMPTABILISE_SANS_PAIEMENT : écriture de paiement sans paiement payé correspondant
 *  - ECART_MONTANT : montant différent entre la réservation et le registre
 *  - ECART_DETTE : sommes dues d'une entreprise ≠ solde de son compte DETTE_PROPRIETAIRE
 *  - BALANCE_DESEQUILIBREE : total des débits ≠ total des crédits
 *  - TROP_PERCU : paiements reçus en double, à rendre aux clients
 *  - ECART_PRESTATAIRE / INVERIFIABLE : statut ou montant différent chez le prestataire (option)
 * Les anomalies sont à examiner par un administrateur : le rapprochement ne corrige rien lui-même.
 */
const MAX_VERIFICATIONS_PRESTATAIRE = 100;

const Rapprochement = {
  get collection() { return db.collection('reconciliations'); },

  async lancer({ du, au, verifierPrestataire = false } = {}, par = 'systeme') {
    const periode = {};
    if (du) periode.$gte = new Date(du);
    if (au) periode.$lte = new Date(`${au}T23:59:59.999Z`);
    const anomalies = [];

    // 1. Paiements payés sur les réservations
    const resas = await db.collection('reservations').find({ 'paiements.statut': { $in: ['paye', 'doublon'] } }, { projection: { _id: 0, id: 1, entrepriseId: 1, paiements: 1 } }).toArray();
    const payes = [];
    for (const r of resas) {
      for (const p of r.paiements || []) {
        if (!['paye', 'doublon'].includes(p.statut)) continue;
        if (periode.$gte && new Date(p.payeLe || p.creeLe) < periode.$gte) continue;
        if (periode.$lte && new Date(p.payeLe || p.creeLe) > periode.$lte) continue;
        payes.push({ ...p, reservationId: r.id, entrepriseId: r.entrepriseId });
      }
    }
    const cles = payes.map(p => (p.statut === 'doublon' ? `DOUBLON:${p.txId}` : `PAIEMENT:${p.txId}`));
    const comptabilisees = new Map((await Ledger.transactions.find({ cle: { $in: cles } }).toArray()).map(t => [t.cle, t]));
    const totaux = {};
    for (const p of payes) {
      const cle = p.statut === 'doublon' ? `DOUBLON:${p.txId}` : `PAIEMENT:${p.txId}`;
      const t = comptabilisees.get(cle);
      const fournisseur = p.methode === 'geniuspay' ? 'geniuspay' : 'pispi';
      totaux[fournisseur] = totaux[fournisseur] || { interne: 0, registre: 0, nombre: 0 };
      totaux[fournisseur].interne += Number(p.montant) || 0;
      totaux[fournisseur].nombre += 1;
      if (!t) { anomalies.push({ type: 'PAIEMENT_NON_COMPTABILISE', reservationId: p.reservationId, txId: p.txId, montant: p.montant }); continue; }
      totaux[fournisseur].registre += t.montant;
      if (t.montant !== Number(p.montant)) anomalies.push({ type: 'ECART_MONTANT', reservationId: p.reservationId, txId: p.txId, montant: p.montant, registre: t.montant });
    }

    // 2. Écritures de paiement sans paiement payé correspondant
    const txs = await Ledger.transactions.find({ type: 'PAIEMENT_CLIENT', ...(Object.keys(periode).length ? { creeLe: periode } : {}) }, { projection: { cle: 1, reference: 1, reservationId: 1, montant: 1 } }).toArray();
    const clesPayees = new Set(cles);
    for (const t of txs) {
      if (!clesPayees.has(t.cle) && !String(t.cle).match(/^PAIEMENT:(ACOMPTE|SOLDE)-/)) {
        anomalies.push({ type: 'COMPTABILISE_SANS_PAIEMENT', reference: t.reference, reservationId: t.reservationId, montant: t.montant });
      }
    }

    // 3. Sommes dues par entreprise = solde du compte de dette
    const dettes = await db.collection('owner_payables').aggregate([{ $group: { _id: '$entrepriseId', reste: { $sum: { $subtract: ['$du', '$verse'] } } } }]).toArray();
    for (const d of dettes) {
      const solde = await Ledger.solde('DETTE_PROPRIETAIRE', { entrepriseId: d._id });
      if (solde !== d.reste) anomalies.push({ type: 'ECART_DETTE', entrepriseId: d._id, dettes: d.reste, registre: solde });
    }

    // 4. Balance et trop-perçus
    const balance = await Ledger.balance();
    if (!balance.equilibree) anomalies.push({ type: 'BALANCE_DESEQUILIBREE', debit: balance.debit, credit: balance.credit });
    const tropPercu = await Ledger.solde('TROP_PERCU_CLIENT');
    if (tropPercu > 0) anomalies.push({ type: 'TROP_PERCU', montant: tropPercu });

    // 5. Option : état réel chez le prestataire (appels réseau, hors transaction)
    let verifies = 0;
    if (verifierPrestataire) {
      const GeniusPay = require('../paiement/GeniusPayClient');
      const PiSpi = require('../paiement/PiSpiClient');
      for (const p of payes.filter(x => !String(x.end2endId || '').startsWith('SIMULATION')).slice(0, MAX_VERIFICATIONS_PRESTATAIRE)) {
        try {
          if (p.methode === 'geniuspay') {
            const g = await GeniusPay.lirePaiement(p.reference);
            if (g?.status !== 'completed' || Number(g.amount) < Number(p.montant)) anomalies.push({ type: 'ECART_PRESTATAIRE', fournisseur: 'geniuspay', txId: p.txId, reservationId: p.reservationId, statutPrestataire: g?.status || 'introuvable', montant: p.montant, montantPrestataire: g?.amount ?? null });
          } else {
            const recu = await PiSpi.lirePaiementRecu(p.txId);
            if (recu?.statut !== 'IRREVOCABLE' || Number(recu.montant) < Number(p.montant)) anomalies.push({ type: 'ECART_PRESTATAIRE', fournisseur: 'pispi', txId: p.txId, reservationId: p.reservationId, statutPrestataire: recu?.statut || 'introuvable', montant: p.montant, montantPrestataire: recu?.montant ?? null });
          }
          verifies += 1;
        } catch (error) {
          anomalies.push({ type: 'INVERIFIABLE', txId: p.txId, reservationId: p.reservationId, erreur: String(error.message).slice(0, 200) });
        }
      }
    }

    const doc = {
      periode: { du: du || null, au: au || null }, verifierPrestataire: Boolean(verifierPrestataire), verifiesChezPrestataire: verifies,
      totaux, paiements: payes.length, anomalies, statut: anomalies.length ? 'ANOMALIES' : 'CONFORME', creeLe: new Date(), par,
    };
    const { insertedId } = await this.collection.insertOne(doc);
    return { ...doc, id: insertedId.toString() };
  },

  async lister() {
    return (await this.collection.find({}).sort({ creeLe: -1 }).limit(30).toArray()).map(r => ({ ...r, id: r._id.toString() }));
  },
};

module.exports = Rapprochement;
