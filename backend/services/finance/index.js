const { ObjectId } = require('mongodb');
const db = require('../../db');
const Tenant = require('../Tenant');
const Ledger = require('./Ledger');
const Commission = require('./Commission');

/**
 * Module financier de BABI RESIDENCE (voir docs/finance/).
 *
 * La plateforme encaisse tous les paiements des clients (acompte, solde) sur ses comptes PI-SPI
 * et GeniusPay. Chaque paiement confirmé par le prestataire est comptabilisé dans le registre
 * (Ledger) et réparti entre la commission de BABI et la somme due à l'entreprise (owner_payables).
 * Cette somme devient versable 24 h après l'arrivée prévue du client, puis la plateforme la
 * reverse À LA MAIN (demande → approbation → exécution avec référence → confirmation avec preuve).
 *
 * Collections : ledger_transactions, ledger_entries, commission_rules, commissions, owner_payables,
 * owner_payout_methods, payouts, payment_webhooks, reconciliations, financial_audit_logs.
 */
const HEURE_ARRIVEE_UTC = 14;             // heure d'arrivée prévue (Abidjan = UTC)
const DELAI_ELIGIBILITE_MS = 24 * 3600 * 1000; // versable 24 h après l'arrivée
const STATUTS_REVERSEMENT = ['EN_ATTENTE_APPROBATION', 'APPROUVE', 'EXECUTE', 'CONFIRME', 'REJETE', 'ANNULE', 'ECHEC'];
const SOURCES = ['geniuspay', 'pispi', 'autre'];
const TYPES_BENEFICIAIRE = {
  mobile_money: { libelle: 'Mobile Money', format: /^\+?[0-9 ]{8,20}$/, aide: 'numéro de téléphone' },
  virement: { libelle: 'Virement bancaire', format: /^[A-Z0-9 ]{10,40}$/i, aide: 'RIB ou IBAN' },
  pispi: { libelle: 'PI-SPI', format: /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i, aide: 'adresse de paiement PI-SPI (UUID)' },
};

class ErreurFinance extends Error {
  constructor(message, status = 400) { super(message); this.status = status; }
}

const texte = (v, max) => String(v ?? '').trim().slice(0, max);
const eligibleLe = (arrivee) => new Date(Date.parse(`${arrivee}T${String(HEURE_ARRIVEE_UTC).padStart(2, '0')}:00:00Z`) + DELAI_ELIGIBILITE_MS);

// Prestataire qui détient l'argent d'un paiement
const fournisseurDe = (p) => {
  if (String(p?.end2endId || p?.reference || '').startsWith('SIMULATION')) return 'simulation';
  return p?.methode === 'geniuspay' ? 'geniuspay' : 'pispi';
};

const Finance = {
  Ledger,
  Commission,
  ErreurFinance,
  STATUTS_REVERSEMENT,
  TYPES_BENEFICIAIRE,
  eligibleLe,

  get dettes() { return db.collection('owner_payables'); },
  get commissions() { return db.collection('commissions'); },
  get beneficiaires() { return db.collection('owner_payout_methods'); },
  get reversements() { return db.collection('payouts'); },
  get audit() { return db.collection('financial_audit_logs'); },
  get webhooks() { return db.collection('payment_webhooks'); },
  get reservations() { return db.collection('reservations'); },

  async initialiser() {
    await Promise.all([
      Ledger.index(),
      Commission.initialiser(),
      this.dettes.createIndex({ entrepriseId: 1, eligibleLe: 1 }),
      this.reversements.createIndex({ reference: 1 }, { unique: true }),
      this.reversements.createIndex({ entrepriseId: 1, statut: 1 }),
      this.webhooks.createIndex({ fournisseur: 1, evenementId: 1 }, { unique: true }),
      this.audit.createIndex({ le: -1 }),
      db.collection('reconciliations').createIndex({ creeLe: -1 }),
    ]);
    await this.reprendre().catch(e => console.error('⚠️ Reprise du registre financier :', e.message));
  },

  // ---------- Comptabilisation (appelée par les paiements, le solde sur place et les remboursements) ----------

  /** Met à jour la commission et la dette d'une réservation (dans la transaction en cours). */
  async cumuler(r, cond, { brut = 0, commission = 0, du = 0, rembourse = 0 }, session) {
    if (cond.proprePlateforme) return;
    const maintenant = new Date();
    await this.commissions.updateOne({ _id: r.id }, {
      $inc: { brut, commission },
      $set: { entrepriseId: r.entrepriseId, tauxPb: cond.tauxCommissionPb, regleId: cond.regleId || null, devise: 'XOF', majLe: maintenant },
      $setOnInsert: { creeLe: maintenant },
    }, { upsert: true, session });
    await this.dettes.updateOne({ _id: r.id }, {
      $inc: { brut, commission, du, rembourse },
      $set: {
        entrepriseId: r.entrepriseId, residence: r.residenceInfo?.nom || null, client: `${r.client?.prenom || ''} ${r.client?.nom || ''}`.trim(),
        arrivee: r.dates?.arrivee, depart: r.dates?.depart, eligibleLe: eligibleLe(r.dates?.arrivee), majLe: maintenant,
      },
      $setOnInsert: { verse: 0, bloque: null, creeLe: maintenant },
    }, { upsert: true, session });
  },

  /** Paiement d'un client confirmé par le prestataire (acompte ou solde en ligne). */
  async paiementConfirme(r, p, session = null) {
    const cond = await Commission.conditionsDe(r);
    const montant = Number(p.montant);
    const fournisseur = fournisseurDe(p);
    const objet = p.objet || 'acompte';
    const executer = async (s) => {
      if (cond.proprePlateforme) {
        return Ledger.poster({
          cle: `PAIEMENT:${p.txId}`, type: 'PAIEMENT_CLIENT', libelle: `${objet === 'solde' ? 'Solde' : 'Acompte'} ${r.id} (résidence de la plateforme)`,
          reservationId: r.id, entrepriseId: r.entrepriseId, meta: { txId: p.txId, objet, fournisseur },
          ecritures: [
            { compte: 'FONDS_PRESTATAIRE', sens: 'DEBIT', montant, fournisseur },
            { compte: 'REVENU_PLATEFORME', sens: 'CREDIT', montant },
          ],
        }, s);
      }
      const commission = Commission.calculer(montant, cond.tauxCommissionPb);
      const res = await Ledger.poster({
        cle: `PAIEMENT:${p.txId}`, type: 'PAIEMENT_CLIENT', libelle: `${objet === 'solde' ? 'Solde' : 'Acompte'} ${r.id}`,
        reservationId: r.id, entrepriseId: r.entrepriseId, meta: { txId: p.txId, objet, fournisseur, tauxPb: cond.tauxCommissionPb },
        ecritures: [
          { compte: 'FONDS_PRESTATAIRE', sens: 'DEBIT', montant, fournisseur },
          { compte: 'COMMISSION_BABI', sens: 'CREDIT', montant: commission },
          { compte: 'DETTE_PROPRIETAIRE', sens: 'CREDIT', montant: montant - commission },
        ],
      }, s);
      if (res.cree) await this.cumuler(r, cond, { brut: montant, commission, du: montant - commission }, s);
      return res;
    };
    return session ? executer(session) : db.transaction(executer);
  },

  /** Paiement reçu en double : l'argent est là, mais il est dû au client. */
  async paiementEnDouble(r, p, session = null) {
    const montant = Number(p.montant);
    const fournisseur = fournisseurDe(p);
    return Ledger.poster({
      cle: `DOUBLON:${p.txId}`, type: 'PAIEMENT_EN_DOUBLE', libelle: `Paiement en double ${r.id} : à rembourser`,
      reservationId: r.id, entrepriseId: r.entrepriseId, meta: { txId: p.txId, fournisseur },
      ecritures: [
        { compte: 'FONDS_PRESTATAIRE', sens: 'DEBIT', montant, fournisseur },
        { compte: 'TROP_PERCU_CLIENT', sens: 'CREDIT', montant },
      ],
    }, session);
  },

  /**
   * Solde réglé sur place à l'entreprise : l'argent ne passe pas par la plateforme, mais la commission
   * reste due ; elle est déduite du prochain reversement (dette négative).
   */
  async soldeSurPlace(r, montant, session = null) {
    const cond = await Commission.conditionsDe(r);
    if (cond.proprePlateforme) return null;
    const commission = Commission.calculer(montant, cond.tauxCommissionPb);
    const executer = async (s) => {
      const res = await Ledger.poster({
        cle: `SURPLACE:${r.id}`, type: 'COMMISSION_SUR_PLACE', libelle: `Commission sur le solde reçu sur place ${r.id}`,
        reservationId: r.id, entrepriseId: r.entrepriseId, meta: { montantEncaisseParEntreprise: montant, tauxPb: cond.tauxCommissionPb },
        ecritures: [
          { compte: 'DETTE_PROPRIETAIRE', sens: 'DEBIT', montant: commission },
          { compte: 'COMMISSION_BABI', sens: 'CREDIT', montant: commission },
        ],
      }, s);
      if (res.cree) await this.cumuler(r, cond, { brut: montant, commission, du: -commission }, s);
      return res;
    };
    return session ? executer(session) : db.transaction(executer);
  },

  /**
   * Remboursement effectué au client. La commission est rendue au prorata du montant remboursé :
   * BABI garde sa commission sur la part conservée (frais d'annulation).
   * enLigne = false : solde payé sur place puis rendu par l'entreprise elle-même.
   */
  async remboursementEffectue(r, objet, montant, { enLigne = true, fournisseur = null } = {}, session = null) {
    const R = Number(montant) || 0;
    if (R <= 0) return null;
    const cond = await Commission.conditionsDe(r);
    const cR = Commission.calculer(R, cond.tauxCommissionPb);
    const cle = `REMBOURSEMENT:${objet}:${r.id}`;
    const source = fournisseur || (objet === 'solde' ? fournisseurDe(r.solde) : fournisseurDe(r.acompte));
    const executer = async (s) => {
      if (cond.proprePlateforme) {
        if (!enLigne) return null;
        return Ledger.poster({
          cle, type: 'REMBOURSEMENT_CLIENT', libelle: `Remboursement ${objet} ${r.id} (résidence de la plateforme)`, reservationId: r.id, entrepriseId: r.entrepriseId,
          meta: { objet, fournisseur: source },
          ecritures: [{ compte: 'REVENU_PLATEFORME', sens: 'DEBIT', montant: R }, { compte: 'FONDS_PRESTATAIRE', sens: 'CREDIT', montant: R, fournisseur: source }],
        }, s);
      }
      if (!enLigne) {
        const res = await Ledger.poster({
          cle, type: 'ANNULATION_COMMISSION', libelle: `Commission rendue : solde ${r.id} remboursé par l'entreprise`, reservationId: r.id, entrepriseId: r.entrepriseId,
          meta: { objet, montantRembourseParEntreprise: R },
          ecritures: [{ compte: 'COMMISSION_BABI', sens: 'DEBIT', montant: cR }, { compte: 'DETTE_PROPRIETAIRE', sens: 'CREDIT', montant: cR }],
        }, s);
        if (res.cree) await this.cumuler(r, cond, { brut: -R, commission: -cR, du: cR, rembourse: R }, s);
        return res;
      }
      const res = await Ledger.poster({
        cle, type: 'REMBOURSEMENT_CLIENT', libelle: `Remboursement ${objet} ${r.id}`, reservationId: r.id, entrepriseId: r.entrepriseId,
        meta: { objet, fournisseur: source, tauxPb: cond.tauxCommissionPb },
        ecritures: [
          { compte: 'COMMISSION_BABI', sens: 'DEBIT', montant: cR },
          { compte: 'DETTE_PROPRIETAIRE', sens: 'DEBIT', montant: R - cR },
          { compte: 'FONDS_PRESTATAIRE', sens: 'CREDIT', montant: R, fournisseur: source },
        ],
      }, s);
      if (res.cree) await this.cumuler(r, cond, { commission: -cR, du: -(R - cR), rembourse: R }, s);
      return res;
    };
    return session ? executer(session) : db.transaction(executer);
  },

  /**
   * Reprise : comptabilise les paiements et remboursements déjà enregistrés sur les réservations
   * (avant le module financier, ou après une interruption). Idempotent : chaque opération a sa clé.
   */
  async reprendre() {
    const liste = await this.reservations.find({
      $or: [{ 'acompte.paye': true }, { 'solde.paye': true }, { 'paiements.statut': 'doublon' }],
    }, { projection: { _id: 0 } }).toArray();
    let n = 0;
    for (const r of liste) {
      if (!r.entrepriseId) r.entrepriseId = Tenant.PRINCIPALE;
      const trouver = (txId) => (r.paiements || []).find(p => p.txId === txId);
      if (r.acompte?.paye) {
        const p = trouver(r.acompte.txId) || { txId: r.acompte.txId || `ACOMPTE-${r.id}`, montant: r.acompte.montant, methode: r.acompte.methode, end2endId: r.acompte.end2endId };
        if ((await this.paiementConfirme(r, { ...p, objet: 'acompte' })).cree) n += 1;
      }
      if (r.solde?.paye && r.solde.enLigne) {
        const p = trouver(r.solde.txId) || { txId: r.solde.txId || `SOLDE-${r.id}`, montant: r.solde.montant, methode: r.solde.methode, reference: r.solde.reference };
        if ((await this.paiementConfirme(r, { ...p, objet: 'solde' })).cree) n += 1;
      }
      if (r.solde?.paye && !r.solde.enLigne) {
        if ((await this.soldeSurPlace(r, Number(r.solde.montant) || 0))?.cree) n += 1;
      }
      for (const p of (r.paiements || []).filter(x => x.statut === 'doublon')) {
        if ((await this.paiementEnDouble(r, p)).cree) n += 1;
      }
      if (r.acompte?.remboursement?.statut === 'rembourse') {
        if ((await this.remboursementEffectue(r, 'acompte', r.acompte.remboursement.montant ?? r.acompte.montant))?.cree) n += 1;
      }
      if (r.solde?.remboursement?.statut === 'rembourse') {
        if ((await this.remboursementEffectue(r, 'solde', r.solde.remboursement.montant ?? r.solde.montant, { enLigne: Boolean(r.solde.enLigne) }))?.cree) n += 1;
      }
    }
    if (n && process.env.NODE_ENV !== 'test') console.log(`📒 Registre financier : ${n} opération(s) reprise(s)`);
    return n;
  },

  // ---------- Sommes dues aux entreprises ----------

  /** Statut d'une dette au moment présent. */
  statutDette(d, { reservation, entrepriseStatut } = {}, maintenant = new Date()) {
    const reste = d.du - d.verse;
    if (d.bloque) return 'LITIGE';
    if (reste < 0) return 'A_DEDUIRE';
    if (reste === 0) return d.verse > 0 ? 'VERSEE' : 'SOLDEE';
    if (entrepriseStatut === 'suspendue' || reservation?.demandeAnnulation?.statut === 'en_attente') return 'BLOQUEE';
    if (maintenant < new Date(d.eligibleLe)) return 'EN_ATTENTE';
    return d.verse > 0 ? 'PARTIELLEMENT_VERSEE' : 'ELIGIBLE';
  },

  async listerDettes(filtre = {}) {
    const docs = await this.dettes.find(filtre).sort({ eligibleLe: 1 }).toArray();
    const EntrepriseService = require('../EntrepriseService');
    const resas = new Map((await this.reservations.find({ id: { $in: docs.map(d => d._id) } }, { projection: { _id: 0, id: 1, statut: 1, demandeAnnulation: 1 } }).toArray()).map(r => [r.id, r]));
    return docs.map(d => ({
      reservationId: d._id, entrepriseId: d.entrepriseId, entreprise: EntrepriseService.nom(d.entrepriseId), residence: d.residence, client: d.client,
      arrivee: d.arrivee, depart: d.depart, brut: d.brut, commission: d.commission, rembourse: d.rembourse || 0, du: d.du, verse: d.verse,
      reste: d.du - d.verse, eligibleLe: d.eligibleLe, bloque: d.bloque || null, statutReservation: resas.get(d._id)?.statut || null,
      statut: this.statutDette(d, { reservation: resas.get(d._id), entrepriseStatut: EntrepriseService.statut(d.entrepriseId) }),
    }));
  },

  /** Montant versable maintenant à une entreprise : dettes éligibles, moins les commissions à déduire. */
  async disponible(entrepriseId) {
    const dettes = await this.listerDettes({ entrepriseId });
    const versables = dettes.filter(d => ['ELIGIBLE', 'PARTIELLEMENT_VERSEE'].includes(d.statut));
    const aDeduire = dettes.filter(d => d.statut === 'A_DEDUIRE');
    const total = versables.reduce((s, d) => s + d.reste, 0) + aDeduire.reduce((s, d) => s + d.reste, 0);
    return { montant: Math.max(0, total), versables, aDeduire, toutes: dettes };
  },

  async bloquerDette(reservationId, { bloque, motif }, par) {
    const d = await this.dettes.findOne({ _id: { $eq: String(reservationId) } });
    if (!d) throw new ErreurFinance('Somme due introuvable', 404);
    const valeur = bloque ? { motif: texte(motif, 300) || 'Litige', le: new Date(), par } : null;
    if (bloque && valeur.motif.length < 3) throw new ErreurFinance('Indiquez le motif du blocage');
    await this.dettes.updateOne({ _id: d._id }, { $set: { bloque: valeur } });
    await this.journaliser(par, bloque ? 'DETTE_BLOQUEE' : 'DETTE_DEBLOQUEE', { reservationId: d._id, entrepriseId: d.entrepriseId, motif: valeur?.motif || null });
  },

  // ---------- Coordonnées de versement des entreprises ----------

  async beneficiaire(entrepriseId) {
    return this.beneficiaires.findOne({ _id: { $eq: String(entrepriseId) } });
  },

  async enregistrerBeneficiaire(entrepriseId, { type, operateur, beneficiaire, destination } = {}, par) {
    const t = TYPES_BENEFICIAIRE[type];
    if (!t) throw new ErreurFinance('Moyen de versement invalide');
    const nom = texte(beneficiaire, 100);
    const dest = texte(destination, 60);
    if (nom.length < 2) throw new ErreurFinance('Indiquez le nom du bénéficiaire (titulaire du compte)');
    if (!t.format.test(dest)) throw new ErreurFinance(`Coordonnées invalides : ${t.aide} attendu`);
    const doc = {
      type, operateur: texte(operateur, 40) || null, beneficiaire: nom, destination: type === 'pispi' ? dest.toLowerCase() : dest,
      statut: 'a_verifier', modifieLe: new Date(), modifiePar: par, verifieLe: null, verifiePar: null, motif: null,
    };
    await this.beneficiaires.updateOne({ _id: String(entrepriseId) }, { $set: doc }, { upsert: true });
    await this.journaliser(par, 'BENEFICIAIRE_MODIFIE', { entrepriseId, type });
    require('../ReservationService').emailService?.sendAlerteFinance?.(
      `Coordonnées de versement à vérifier : ${require('../EntrepriseService').nom(entrepriseId)}`,
      'Une entreprise a saisi ou modifié ses coordonnées de versement. Aucun reversement ne lui sera possible avant votre vérification.'
    ).catch(() => {});
    return this.beneficiaire(entrepriseId);
  },

  async verifierBeneficiaire(entrepriseId, { valide, motif }, par) {
    const b = await this.beneficiaire(entrepriseId);
    if (!b) throw new ErreurFinance('Aucune coordonnée de versement enregistrée', 404);
    await this.beneficiaires.updateOne({ _id: b._id }, { $set: { statut: valide ? 'verifie' : 'refuse', verifieLe: new Date(), verifiePar: par, motif: valide ? null : texte(motif, 300) || 'Coordonnées refusées' } });
    await this.journaliser(par, valide ? 'BENEFICIAIRE_VERIFIE' : 'BENEFICIAIRE_REFUSE', { entrepriseId });
    return this.beneficiaire(entrepriseId);
  },

  // ---------- Reversements manuels ----------

  /** Répartit un montant sur les dettes : d'abord les commissions à déduire, puis les plus anciennes. */
  repartir(montant, { versables, aDeduire }) {
    const allocations = aDeduire.map(d => ({ reservationId: d.reservationId, montant: d.reste }));
    let reste = montant - aDeduire.reduce((s, d) => s + d.reste, 0);
    for (const d of versables) {
      if (reste <= 0) break;
      const part = Math.min(d.reste, reste);
      allocations.push({ reservationId: d.reservationId, montant: part });
      reste -= part;
    }
    if (reste > 0) throw new ErreurFinance('Montant supérieur à la somme versable', 409);
    return allocations;
  },

  async creerReversement(entrepriseId, montantDemande, par) {
    const EntrepriseService = require('../EntrepriseService');
    if (!EntrepriseService.statut(entrepriseId) || entrepriseId === Tenant.PRINCIPALE) throw new ErreurFinance('Entreprise invalide', 404);
    const b = await this.beneficiaire(entrepriseId);
    if (b?.statut !== 'verifie') throw new ErreurFinance('Les coordonnées de versement de l\'entreprise doivent d\'abord être vérifiées', 409);
    if (await this.reversements.findOne({ entrepriseId, statut: { $in: ['EN_ATTENTE_APPROBATION', 'APPROUVE', 'EXECUTE'] } })) {
      throw new ErreurFinance('Un reversement est déjà en cours pour cette entreprise : terminez-le d\'abord', 409);
    }
    const dispo = await this.disponible(entrepriseId);
    const montant = montantDemande === undefined || montantDemande === null || montantDemande === '' ? dispo.montant : Number(montantDemande);
    if (!Number.isSafeInteger(montant) || montant <= 0) throw new ErreurFinance('Montant invalide (entier en FCFA)');
    if (montant > dispo.montant) throw new ErreurFinance(`Montant supérieur à la somme versable (${dispo.montant} FCFA)`, 409);
    const allocations = this.repartir(montant, dispo);
    const maintenant = new Date();
    const doc = {
      reference: await Ledger.prochaineReference('PO'), entrepriseId, montant, devise: 'XOF', statut: 'EN_ATTENTE_APPROBATION',
      beneficiaire: { type: b.type, operateur: b.operateur, beneficiaire: b.beneficiaire, destination: b.destination },
      allocations, demandeLe: maintenant, demandePar: par, historique: [{ statut: 'EN_ATTENTE_APPROBATION', le: maintenant, par }],
    };
    const { insertedId } = await this.reversements.insertOne(doc);
    await this.journaliser(par, 'REVERSEMENT_CREE', { reversement: doc.reference, entrepriseId, montant });
    return { ...doc, _id: insertedId };
  },

  async reversement(id) {
    if (!/^[0-9a-f]{24}$/.test(String(id))) throw new ErreurFinance('Reversement introuvable', 404);
    const p = await this.reversements.findOne({ _id: new ObjectId(String(id)) });
    if (!p) throw new ErreurFinance('Reversement introuvable', 404);
    return p;
  },

  /**
   * Avance un reversement : approuver, rejeter, executer (référence + source des fonds),
   * confirmer (preuve obligatoire), echec (contre-passation), annuler.
   */
  async agirReversement(id, action, donnees = {}, par) {
    const p = await this.reversement(id);
    const TRANSITIONS = {
      approuver: { de: ['EN_ATTENTE_APPROBATION'], vers: 'APPROUVE' },
      rejeter: { de: ['EN_ATTENTE_APPROBATION', 'APPROUVE'], vers: 'REJETE', motif: true },
      annuler: { de: ['APPROUVE'], vers: 'ANNULE', motif: true },
      executer: { de: ['APPROUVE'], vers: 'EXECUTE' },
      confirmer: { de: ['EXECUTE'], vers: 'CONFIRME' },
      echec: { de: ['EXECUTE'], vers: 'ECHEC', motif: true },
    };
    const t = TRANSITIONS[action];
    if (!t) throw new ErreurFinance('Action invalide');
    if (!t.de.includes(p.statut)) throw new ErreurFinance(`Action impossible : le reversement est « ${p.statut} »`, 409);
    const motif = texte(donnees.motif, 300);
    if (t.motif && motif.length < 3) throw new ErreurFinance('Indiquez le motif');
    const maintenant = new Date();
    const set = { statut: t.vers };
    const ajout = { statut: t.vers, le: maintenant, par, ...(motif ? { motif } : {}) };

    if (action === 'approuver') Object.assign(set, { approuveLe: maintenant, approuvePar: par });
    if (action === 'confirmer') {
      if (!p.preuve) throw new ErreurFinance('Joignez la preuve du virement avant de confirmer', 409);
      if (p.executePar === par && p.montant >= Number(process.env.FINANCE_SEUIL_DOUBLE_VALIDATION || Infinity)) {
        throw new ErreurFinance('Montant important : la confirmation doit être faite par une autre personne que l\'exécution', 409);
      }
      Object.assign(set, { confirmeLe: maintenant, confirmePar: par });
    }

    if (action === 'executer') {
      const reference = texte(donnees.referenceExterne, 80);
      const source = SOURCES.includes(donnees.source) ? donnees.source : null;
      if (reference.length < 3) throw new ErreurFinance('Indiquez la référence de l\'opération de virement');
      if (!source) throw new ErreurFinance('Indiquez d\'où partent les fonds (geniuspay, pispi ou autre)');
      // Les dettes ont pu changer depuis la demande (remboursement, litige) : on revérifie
      const dispo = await this.disponible(p.entrepriseId);
      const parDette = new Map(dispo.toutes.map(d => [d.reservationId, d]));
      for (const a of p.allocations) {
        const d = parDette.get(a.reservationId);
        const valide = d && (a.montant < 0 ? d.statut === 'A_DEDUIRE' && d.reste <= a.montant : ['ELIGIBLE', 'PARTIELLEMENT_VERSEE'].includes(d.statut) && d.reste >= a.montant);
        if (!valide) throw new ErreurFinance('Les sommes dues ont changé depuis la demande : rejetez ce reversement et créez-en un nouveau', 409);
      }
      await db.transaction(async (s) => {
        await Ledger.poster({
          cle: `REVERSEMENT:${p._id}`, type: 'REVERSEMENT_PROPRIETAIRE', libelle: `Reversement ${p.reference}`, entrepriseId: p.entrepriseId, par,
          meta: { reversement: p.reference, referenceExterne: reference, source },
          ecritures: [
            { compte: 'DETTE_PROPRIETAIRE', sens: 'DEBIT', montant: p.montant },
            { compte: 'FONDS_PRESTATAIRE', sens: 'CREDIT', montant: p.montant, fournisseur: source },
          ],
        }, s);
        for (const a of p.allocations) await this.dettes.updateOne({ _id: a.reservationId }, { $inc: { verse: a.montant } }, { session: s });
        await this.reversements.updateOne({ _id: p._id, statut: 'APPROUVE' }, { $set: { ...set, executeLe: maintenant, executePar: par, referenceExterne: reference, source }, $push: { historique: ajout } }, { session: s });
      });
      await this.journaliser(par, 'REVERSEMENT_EXECUTE', { reversement: p.reference, montant: p.montant, referenceExterne: reference });
      return this.reversement(id);
    }

    if (action === 'echec') {
      await db.transaction(async (s) => {
        const t2 = await Ledger.transactions.findOne({ cle: `REVERSEMENT:${p._id}` }, { session: s });
        if (t2) await Ledger.contrePasser(t2._id, { motif: `Reversement ${p.reference} en échec : ${motif}`, par }, s);
        for (const a of p.allocations) await this.dettes.updateOne({ _id: a.reservationId }, { $inc: { verse: -a.montant } }, { session: s });
        await this.reversements.updateOne({ _id: p._id, statut: 'EXECUTE' }, { $set: set, $push: { historique: ajout } }, { session: s });
      });
      await this.journaliser(par, 'REVERSEMENT_ECHEC', { reversement: p.reference, motif });
      return this.reversement(id);
    }

    await this.reversements.updateOne({ _id: p._id, statut: p.statut }, { $set: { ...set, ...(motif ? { motif } : {}) }, $push: { historique: ajout } });
    await this.journaliser(par, `REVERSEMENT_${t.vers}`, { reversement: p.reference, motif: motif || null });
    return this.reversement(id);
  },

  /** Preuve du virement (PDF ou image), stockée de façon privée. */
  async ajouterPreuve(id, contenu, nom, par) {
    const p = await this.reversement(id);
    if (!['EXECUTE', 'CONFIRME'].includes(p.statut)) throw new ErreurFinance('La preuve se joint une fois le virement exécuté', 409);
    const Verification = require('../VerificationService');
    const { buffer, mime } = Verification.decoder(contenu, ['application/pdf', 'image/jpeg', 'image/png', 'image/webp']);
    const fichier = await Verification.stocker('justificatifs', buffer, mime, { residenceId: null, entrepriseId: p.entrepriseId, type: 'preuve_reversement', reversement: p.reference });
    await this.reversements.updateOne({ _id: p._id }, { $set: { preuve: { id: fichier, nom: texte(nom, 120) || `preuve-${p.reference}`, mime, ajouteLe: new Date(), par } } });
    await this.journaliser(par, 'REVERSEMENT_PREUVE', { reversement: p.reference });
    return this.reversement(id);
  },

  async lirePreuve(id) {
    const p = await this.reversement(id);
    if (!p.preuve) throw new ErreurFinance('Aucune preuve', 404);
    return { flux: db.bucket('justificatifs').openDownloadStream(new ObjectId(p.preuve.id)), mime: p.preuve.mime, nom: p.preuve.nom };
  },

  async listerReversements(filtre = {}) {
    const EntrepriseService = require('../EntrepriseService');
    const liste = await this.reversements.find(filtre).sort({ demandeLe: -1 }).limit(300).toArray();
    return liste.map(p => ({ ...p, id: p._id.toString(), entreprise: EntrepriseService.nom(p.entrepriseId) }));
  },

  // ---------- Journal d'audit ----------

  async journaliser(par, action, details = {}) {
    await this.audit.insertOne({ par: String(par || 'systeme'), action, details, le: new Date() });
  },

  // ---------- Webhooks des prestataires ----------

  /** Trace chaque notification reçue (rejouée ou non) : la même notification n'est comptée qu'une fois. */
  async tracerWebhook(fournisseur, corpsBrut, signatureValide) {
    const crypto = require('crypto');
    let corps = null;
    try { corps = JSON.parse(corpsBrut.toString('utf8')); } catch { /* corps illisible */ }
    const evenementId = String(corps?.id || corps?.event_id || corps?.data?.id || '') || crypto.createHash('sha256').update(corpsBrut).digest('hex');
    const reference = String(corps?.data?.reference || corps?.data?.metadata?.txId || (Array.isArray(corps?.data) ? corps.data.map(e => e.txId).filter(Boolean).join(',') : '') || '').slice(0, 200) || null;
    const maintenant = new Date();
    const res = await this.webhooks.findOneAndUpdate(
      { fournisseur, evenementId },
      {
        $setOnInsert: { fournisseur, evenementId, reference, signatureValide, recuLe: maintenant, corps: signatureValide ? corpsBrut.toString('utf8').slice(0, 8000) : null },
        $inc: { receptions: 1 }, $set: { derniereReceptionLe: maintenant, statut: signatureValide ? 'RECU' : 'REJETE' },
      },
      { upsert: true, returnDocument: 'after' }
    );
    return res;
  },

  async webhookTraite(id, statut, erreur = null) {
    if (!id) return;
    await this.webhooks.updateOne({ _id: id }, { $set: { statut, traiteLe: new Date(), ...(erreur ? { erreur: String(erreur).slice(0, 300) } : {}) } });
  },

  // ---------- Vue d'ensemble et registre ----------

  async apercu({ du, au } = {}) {
    const periode = {};
    if (du) periode.$gte = new Date(du);
    if (au) periode.$lte = new Date(`${au}T23:59:59.999Z`);
    const filtreDate = Object.keys(periode).length ? { creeLe: periode } : {};
    const sommeType = async (type) => (await Ledger.transactions.aggregate([{ $match: { type, ...filtreDate } }, { $group: { _id: null, total: { $sum: '$montant' }, nombre: { $sum: 1 } } }]).toArray())[0] || { total: 0, nombre: 0 };
    const sommeCompte = async (compte) => {
      const [r] = await Ledger.ecritures.aggregate([{ $match: { compte, ...filtreDate } }, { $group: { _id: null, d: { $sum: { $cond: [{ $eq: ['$sens', 'DEBIT'] }, '$montant', 0] } }, c: { $sum: { $cond: [{ $eq: ['$sens', 'CREDIT'] }, '$montant', 0] } } } }]).toArray();
      return (r?.c || 0) - (r?.d || 0);
    };
    const [paiements, remboursements, reverses, commissions, revenuPlateforme, echecs, enAttente, fonds, balance, dettes, dernierRappro, doublons] = await Promise.all([
      sommeType('PAIEMENT_CLIENT'), sommeType('REMBOURSEMENT_CLIENT'), sommeType('REVERSEMENT_PROPRIETAIRE'),
      sommeCompte('COMMISSION_BABI'), sommeCompte('REVENU_PLATEFORME'),
      this.reservations.aggregate([{ $unwind: '$paiements' }, { $match: { 'paiements.statut': { $in: ['refuse', 'expire'] }, ...(Object.keys(periode).length ? { 'paiements.creeLe': periode } : {}) } }, { $count: 'n' }]).toArray(),
      this.reversements.aggregate([{ $match: { statut: { $in: ['EN_ATTENTE_APPROBATION', 'APPROUVE'] } } }, { $group: { _id: null, total: { $sum: '$montant' }, nombre: { $sum: 1 } } }]).toArray(),
      Ledger.ecritures.aggregate([{ $match: { compte: 'FONDS_PRESTATAIRE' } }, { $group: { _id: '$fournisseur', d: { $sum: { $cond: [{ $eq: ['$sens', 'DEBIT'] }, '$montant', 0] } }, c: { $sum: { $cond: [{ $eq: ['$sens', 'CREDIT'] }, '$montant', 0] } } } }]).toArray(),
      Ledger.balance(),
      this.listerDettes({}),
      db.collection('reconciliations').find({}).sort({ creeLe: -1 }).limit(1).next(),
      Ledger.solde('TROP_PERCU_CLIENT'),
    ]);
    const versable = dettes.filter(d => ['ELIGIBLE', 'PARTIELLEMENT_VERSEE'].includes(d.statut)).reduce((s, d) => s + d.reste, 0);
    return {
      periode: { du: du || null, au: au || null },
      encaisse: paiements.total, paiementsReussis: paiements.nombre, paiementsEchoues: echecs[0]?.n || 0,
      commissions, revenuPlateforme,
      detteProprietaires: dettes.reduce((s, d) => s + d.reste, 0),
      versable,
      enAttenteDeDelai: dettes.filter(d => d.statut === 'EN_ATTENTE').reduce((s, d) => s + d.reste, 0),
      bloque: dettes.filter(d => ['BLOQUEE', 'LITIGE'].includes(d.statut)).reduce((s, d) => s + d.reste, 0),
      reverse: reverses.total, reversementsEnAttente: { total: enAttente[0]?.total || 0, nombre: enAttente[0]?.nombre || 0 },
      rembourse: remboursements.total, tropPercu: doublons,
      fondsParPrestataire: fonds.map(f => ({ fournisseur: f._id || '—', solde: f.d - f.c })),
      balanceEquilibree: balance.equilibree,
      anomalies: dernierRappro ? dernierRappro.anomalies.length : null,
      dernierRapprochement: dernierRappro ? { le: dernierRappro.creeLe, anomalies: dernierRappro.anomalies.length } : null,
    };
  },

  async registre({ type, entrepriseId, du, au, page = 1 } = {}) {
    const filtre = {};
    if (type) filtre.type = String(type);
    if (entrepriseId) filtre.entrepriseId = String(entrepriseId);
    if (du || au) filtre.creeLe = { ...(du ? { $gte: new Date(du) } : {}), ...(au ? { $lte: new Date(`${au}T23:59:59.999Z`) } : {}) };
    const parPage = 50;
    const p = Math.max(1, parseInt(page, 10) || 1);
    const [total, liste] = await Promise.all([
      Ledger.transactions.countDocuments(filtre),
      Ledger.transactions.find(filtre).sort({ creeLe: -1 }).skip((p - 1) * parPage).limit(parPage).toArray(),
    ]);
    const lignes = await Ledger.ecritures.find({ transactionId: { $in: liste.map(t => t._id) } }).toArray();
    const EntrepriseService = require('../EntrepriseService');
    return {
      total, page: p, parPage,
      transactions: liste.map(t => ({
        id: t._id.toString(), reference: t.reference, type: t.type, libelle: t.libelle, montant: t.montant, reservationId: t.reservationId,
        entreprise: t.entrepriseId ? EntrepriseService.nom(t.entrepriseId) : null, creeLe: t.creeLe, par: t.par, meta: t.meta,
        ecritures: lignes.filter(e => e.transactionId.equals(t._id)).map(e => ({ compte: e.compte, sens: e.sens, montant: e.montant, fournisseur: e.fournisseur })),
      })),
    };
  },

  async registreCsv(filtre = {}) {
    const lignes = [['Référence', 'Date', 'Type', 'Libellé', 'Réservation', 'Entreprise', 'Compte', 'Prestataire', 'Débit', 'Crédit']];
    const EntrepriseService = require('../EntrepriseService');
    const txs = await Ledger.transactions.find(filtre).sort({ creeLe: 1 }).toArray();
    const ecr = await Ledger.ecritures.find({ transactionId: { $in: txs.map(t => t._id) } }).toArray();
    for (const t of txs) {
      for (const e of ecr.filter(x => x.transactionId.equals(t._id))) {
        lignes.push([t.reference, t.creeLe.toISOString(), t.type, t.libelle, t.reservationId || '', EntrepriseService.nom(e.entrepriseId) || '', e.compte, e.fournisseur || '', e.sens === 'DEBIT' ? e.montant : '', e.sens === 'CREDIT' ? e.montant : '']);
      }
    }
    // Protection contre l'injection de formules dans Excel
    const cellule = (v) => { let s = String(v ?? ''); if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`; return `"${s.replace(/"/g, '""')}"`; };
    return `﻿${lignes.map(l => l.map(cellule).join(';')).join('\r\n')}`;
  },

  // ---------- Espace de l'entreprise ----------

  async revenusEntreprise(entrepriseId) {
    const [dispo, reversements, beneficiaire] = await Promise.all([
      this.disponible(entrepriseId),
      this.listerReversements({ entrepriseId }),
      this.beneficiaire(entrepriseId),
    ]);
    const dettes = dispo.toutes;
    return {
      versable: dispo.montant,
      enAttente: dettes.filter(d => d.statut === 'EN_ATTENTE').reduce((s, d) => s + d.reste, 0),
      bloque: dettes.filter(d => ['BLOQUEE', 'LITIGE'].includes(d.statut)).reduce((s, d) => s + d.reste, 0),
      totalVerse: dettes.reduce((s, d) => s + d.verse, 0),
      totalCommissions: dettes.reduce((s, d) => s + d.commission, 0),
      dettes,
      reversements: reversements.map(({ preuve, allocations, historique, demandePar, approuvePar, executePar, confirmePar, ...p }) => ({ ...p, preuve: Boolean(preuve) })),
      beneficiaire: beneficiaire ? { type: beneficiaire.type, operateur: beneficiaire.operateur, beneficiaire: beneficiaire.beneficiaire, destination: beneficiaire.destination, statut: beneficiaire.statut, motif: beneficiaire.motif } : null,
      types: Object.fromEntries(Object.entries(TYPES_BENEFICIAIRE).map(([k, v]) => [k, { libelle: v.libelle, aide: v.aide }])),
    };
  },
};

module.exports = Finance;
