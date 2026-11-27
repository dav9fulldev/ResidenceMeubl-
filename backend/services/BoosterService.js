const { ObjectId } = require('mongodb');
const db = require('../db');

/**
 * Booster de visibilité : un partenaire paie pour qu'une résidence soit mieux placée, en plus de sa note.
 * Parcours inspiré du « Booster la publication » de Facebook :
 *   résidence → objectif (visites de la fiche ou réservations) → audience (tout le site, ou les voyageurs
 *   qui cherchent dans le quartier / la ville de la résidence) → budget par jour et durée (estimation
 *   des affichages) → paiement → résultats (affichages, visites, réservations, coût par résultat) → prolonger.
 * Plus le budget par jour est élevé, plus le bonus de classement est fort (plafonné).
 *
 *   1. le partenaire demande un booster (résidence publiée, durée 7, 15 ou 30 jours, prix de la plateforme) ;
 *   2. il paie en ligne (GeniusPay : Mobile Money ou carte) : dès que le paiement est confirmé
 *      (webhook signé, retour sur la page ou vérification périodique, toujours relu chez GeniusPay),
 *      le booster s'active seul et le paiement est inscrit au registre (FONDS_PRESTATAIRE → REVENU_VISIBILITE) ;
 *      en secours (virement, espèces), le super-administrateur active à la main avec la référence ;
 *   3. le booster court du moment de l'activation jusqu'à sa fin ; il peut être arrêté.
 * Chaque action est inscrite au journal financier (financial_audit_logs).
 *
 * Effet : bonus limité ajouté au score de recommandation (ResidenceService), refusé à une résidence
 * mal notée ; mention « Sponsorisé » sur l'annonce.
 *
 * Collection boosters { _id, reference, entrepriseId, residenceId, residenceNom, duree, montant, statut,
 *   demandeLe, demandePar, debut?, fin?, activeLe?, activePar?, paiement?, motif?, arreteLe? }
 * Statuts : en_attente, actif (terminé une fois la fin passée), refuse, annule, arrete.
 */
const DUREES = [3, 7, 14, 30];
const REGLAGES_DEFAUT = { budgetMin: 500, budgetMax: 10000 }; // FCFA par jour, réglés par la plateforme
const PAS_BUDGET = 500;
const BONUS_MIN = 0.3;        // bonus au budget minimal (score de recommandation sur une échelle de 1 à 5)
const BONUS_MAX = 0.8;        // bonus au budget maximal : la note reste le premier critère
const NOTE_MINIMALE = 3;      // en dessous (score de la résidence), le booster ne donne pas de bonus
const OBJECTIFS = { visites: 'Plus de visites de la fiche', reservations: 'Plus de réservations' };
const AUDIENCES = { tout: 'Tout le site', quartier: 'Voyageurs qui cherchent dans le quartier', ville: 'Voyageurs qui cherchent dans la ville' };
const MOYENS = ['mobile_money', 'virement', 'especes', 'autre'];
const texte = (v, max) => String(v ?? '').trim().slice(0, max);
// Même règle que les acomptes (PaymentService) : adresse publique, https de préférence
const urlSite = () => {
  const liste = String(process.env.PUBLIC_SITE_URL || process.env.FRONTEND_URL || '').split(',').map(x => x.trim()).filter(Boolean);
  return (liste.find(u => u.startsWith('https://')) || liste[0] || 'http://localhost:3000').replace(/\/+$/, '');
};
const ECHECS_GENIUSPAY = { failed: 'Paiement refusé', cancelled: 'Paiement annulé', expired: 'Délai de paiement dépassé' };

class ErreurBooster extends Error {
  constructor(message, status = 400) { super(message); this.status = status; }
}

const BoosterService = {
  DUREES, BONUS_MIN, BONUS_MAX, NOTE_MINIMALE, MOYENS, OBJECTIFS, AUDIENCES, PAS_BUDGET, ErreurBooster,

  get collection() { return db.collection('boosters'); },
  get parametres() { return db.collection('parametres'); },

  async reglages() {
    const doc = await this.parametres.findOne({ _id: 'booster' });
    return { ...REGLAGES_DEFAUT, ...(doc?.reglages || {}), durees: DUREES, pas: PAS_BUDGET, bonusMin: BONUS_MIN, bonusMax: BONUS_MAX };
  },

  /** Plateforme : budget par jour minimal et maximal (FCFA entiers, multiples de 500) */
  async changerReglages({ budgetMin, budgetMax } = {}, par) {
    const min = Number(budgetMin);
    const max = Number(budgetMax);
    const ok = (v) => Number.isSafeInteger(v) && v >= PAS_BUDGET && v <= 1000000 && v % PAS_BUDGET === 0;
    if (!ok(min) || !ok(max) || max <= min) throw new ErreurBooster(`Budgets invalides : multiples de ${PAS_BUDGET} FCFA, le maximum au-dessus du minimum`);
    await this.parametres.updateOne({ _id: 'booster' }, { $set: { reglages: { budgetMin: min, budgetMax: max }, modifieLe: new Date(), modifiePar: par } }, { upsert: true });
    await require('./finance').journaliser(par, 'BOOSTER_REGLAGES', { budgetMin: min, budgetMax: max });
    return this.reglages();
  },

  /** Bonus de classement selon le budget par jour (entre BONUS_MIN et BONUS_MAX) */
  bonusPour(budgetJour, { budgetMin, budgetMax } = REGLAGES_DEFAUT) {
    const t = Math.min(1, Math.max(0, (Number(budgetJour) - budgetMin) / ((budgetMax - budgetMin) || 1)));
    return Math.round((BONUS_MIN + (BONUS_MAX - BONUS_MIN) * t) * 100) / 100;
  },

  /** Champs d'un booster créé avant les campagnes (formules fixes) */
  normaliser(b) {
    return { ...b, objectif: b.objectif || 'visites', audience: b.audience || 'tout', budgetJour: b.budgetJour || Math.round(b.montant / b.duree) };
  },

  /** Statut affiché : un booster actif dont la fin est passée est « terminé ». */
  vue(b0, maintenant = new Date()) {
    const b = this.normaliser(b0);
    // Actif dont la fin est passée : terminé ; actif qui n'a pas encore commencé (prolongation) : programmé
    const statut = b.statut === 'actif' && b.fin && new Date(b.fin) <= maintenant ? 'termine'
      : b.statut === 'actif' && b.debut && new Date(b.debut) > maintenant ? 'programme' : b.statut;
    return {
      id: b._id.toString(), reference: b.reference, entrepriseId: b.entrepriseId, residenceId: b.residenceId, residenceNom: b.residenceNom,
      duree: b.duree, montant: b.montant, statut, objectif: b.objectif, audience: b.audience, budgetJour: b.budgetJour,
      cible: b.cible || null, bonus: b.bonus ?? null, prolongationDe: b.prolongationDe || null, demandeLe: b.demandeLe, debut: b.debut || null, fin: b.fin || null,
      paiement: b.paiement || null, motif: b.motif || null,
      paiementEnLigne: b.paiementEnLigne ? { statut: b.paiementEnLigne.statut, raison: b.paiementEnLigne.raison || null, creeLe: b.paiementEnLigne.creeLe } : null,
    };
  },

  /**
   * Partenaire : crée une campagne (en attente de paiement) pour une de ses résidences publiées.
   * { residenceId, objectif, audience, budgetJour, duree }. Une seule demande en attente par résidence ;
   * une résidence déjà boostée peut être prolongée (le nouveau booster commence à la fin du précédent).
   */
  async demander(entrepriseId, { residenceId, objectif = 'visites', audience = 'tout', budgetJour, duree } = {}, par) {
    const d = Number(duree);
    if (!DUREES.includes(d)) throw new ErreurBooster(`Durée invalide : ${DUREES.join(', ')} jours`);
    if (!OBJECTIFS[objectif]) throw new ErreurBooster('Objectif invalide');
    if (!AUDIENCES[audience]) throw new ErreurBooster('Audience invalide');
    const reglages = await this.reglages();
    const budget = Number(budgetJour);
    if (!Number.isSafeInteger(budget) || budget % PAS_BUDGET !== 0 || budget < reglages.budgetMin || budget > reglages.budgetMax) {
      throw new ErreurBooster(`Budget par jour entre ${reglages.budgetMin} et ${reglages.budgetMax} FCFA, par pas de ${PAS_BUDGET}`);
    }
    const residence = await db.collection('residences').findOne({ id: Number(residenceId), entrepriseId: { $eq: String(entrepriseId) } });
    if (!residence) throw new ErreurBooster('Résidence introuvable', 404);
    if (residence.statutVerification !== 'verifiee' || residence.actif === false) throw new ErreurBooster('Seule une résidence vérifiée et publiée peut être boostée', 409);
    const cible = audience === 'quartier' ? residence.quartier : audience === 'ville' ? residence.ville : null;
    if (audience !== 'tout' && !cible) throw new ErreurBooster(`La résidence n'a pas de ${audience} renseigné(e)`, 409);
    if (await this.collection.findOne({ residenceId: residence.id, statut: 'en_attente' })) throw new ErreurBooster('Une demande est déjà en attente de paiement pour cette résidence', 409);
    const Ledger = require('./finance/Ledger');
    const doc = {
      reference: await Ledger.prochaineReference('BST'), entrepriseId: String(entrepriseId), residenceId: residence.id, residenceNom: residence.nom,
      objectif, audience, cible, budgetJour: budget, duree: d, montant: budget * d, bonus: this.bonusPour(budget, reglages),
      statut: 'en_attente', demandeLe: new Date(), demandePar: par,
    };
    const { insertedId } = await this.collection.insertOne(doc);
    await require('./finance').journaliser(par, 'BOOSTER_DEMANDE', { booster: doc.reference, entrepriseId: doc.entrepriseId, residenceId: doc.residenceId, objectif, audience, budgetJour: budget, duree: d, montant: doc.montant });
    return { ...doc, _id: insertedId };
  },

  async listerEntreprise(entrepriseId) {
    const liste = await this.collection.find({ entrepriseId: { $eq: String(entrepriseId) } }).sort({ demandeLe: -1 }).limit(100).toArray();
    return Promise.all(liste.map(async b => ({ ...this.vue(b), resultats: await this.resultats(b) })));
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
      const v = await this.activer(b, { moyen, reference: ref, montant: b.montant }, par);
      if (!v) throw new ErreurBooster('Seule une demande en attente peut être activée', 409);
      return v;
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

  /** Active une demande en attente (une seule fois). Retourne la vue, ou null si déjà traitée. */
  async activer(b, paiement, par) {
    const maintenant = new Date();
    // Prolongation : si la résidence est déjà boostée, le nouveau booster commence à la fin du précédent
    const enCours = await this.collection.find({ residenceId: b.residenceId, statut: 'actif', fin: { $gt: maintenant } }).sort({ fin: -1 }).limit(1).toArray();
    const debut = enCours[0] ? new Date(enCours[0].fin) : maintenant;
    const fin = new Date(debut.getTime() + b.duree * 86400000);
    const r = await this.collection.updateOne({ _id: b._id, statut: 'en_attente' }, { $set: {
      statut: 'actif', debut, fin, activeLe: maintenant, activePar: par, paiement, prolongationDe: enCours[0]?.reference || null,
    } });
    if (!r.modifiedCount) return null;
    await require('./finance').journaliser(par, 'BOOSTER_ACTIVE', { booster: b.reference, entrepriseId: b.entrepriseId, montant: paiement.montant, moyen: paiement.moyen, reference: paiement.reference, fin });
    return this.vue({ ...b, statut: 'actif', debut, fin, paiement, prolongationDe: enCours[0]?.reference || null });
  },

  // ---------- Paiement en ligne (GeniusPay) ----------

  /** Partenaire : crée la page de paiement GeniusPay d'une demande en attente. Retourne l'adresse de paiement. */
  async payerEnLigne(entrepriseId, id, payeur = {}) {
    const GeniusPay = require('./paiement/GeniusPayClient');
    if (!GeniusPay.estConfigure()) throw new ErreurBooster('Le paiement en ligne n\'est pas disponible pour le moment. Contactez BABI RESIDENCE.', 409);
    const b = await this.trouver(id, { entrepriseId: String(entrepriseId) });
    if (b.statut !== 'en_attente') throw new ErreurBooster('Ce booster n\'attend plus de paiement', 409);
    const txId = `BST${Date.now().toString(36)}${require('crypto').randomBytes(4).toString('hex')}`.toUpperCase();
    const retour = `${urlSite()}/admin/visibilite?paiement=geniuspay&booster=${b._id}`;
    const p = await GeniusPay.creerPaiement({
      montant: b.montant,
      description: `Booster ${b.duree} jours - ${b.residenceNom} (${b.reference})`,
      client: { nom: texte(payeur.nom, 120) || 'Partenaire BABI RESIDENCE', email: payeur.email || undefined, telephone: payeur.telephone || undefined },
      successUrl: retour,
      errorUrl: `${retour}&echec=1`,
      metadata: { booster: b._id.toString(), txId, objet: 'booster' },
    });
    if (!p?.reference || !p?.checkout_url) throw new ErreurBooster('GeniusPay n\'a pas renvoyé de page de paiement', 502);
    const creeLe = new Date();
    await this.collection.updateOne({ _id: b._id }, { $set: { paiementEnLigne: {
      txId, reference: p.reference, checkoutUrl: p.checkout_url, statut: 'en_attente', montant: b.montant, creeLe,
      expireLe: p.expires_at ? new Date(p.expires_at) : new Date(creeLe.getTime() + 24 * 3600 * 1000), environnement: p.environment || null,
    } } });
    return { checkoutUrl: p.checkout_url };
  },

  /**
   * Relit le paiement chez GeniusPay ; s'il est payé (montant suffisant), active le booster et l'inscrit
   * au registre. Idempotent. Retourne la vue à jour.
   */
  async verifierPaiement(id) {
    const b = await this.trouver(id);
    const pl = b.paiementEnLigne;
    if (!pl || pl.statut !== 'en_attente' || b.statut !== 'en_attente') return this.vue(b);
    const GeniusPay = require('./paiement/GeniusPayClient');
    const g = await GeniusPay.lirePaiement(pl.reference);
    if (g?.status === 'completed' && Number(g.amount) >= Number(pl.montant)) {
      const Ledger = require('./finance/Ledger');
      await db.transaction(async (session) => {
        const r = await this.collection.updateOne({ _id: b._id, 'paiementEnLigne.statut': 'en_attente' }, { $set: { 'paiementEnLigne.statut': 'paye', 'paiementEnLigne.payeLe': new Date() } }, { session });
        if (!r.modifiedCount) return;
        await Ledger.poster({
          cle: `BOOSTER:${pl.txId}`, type: 'BOOSTER', libelle: `Booster ${b.duree} jours - ${b.residenceNom} (${b.reference})`,
          entrepriseId: b.entrepriseId, par: 'systeme:geniuspay', meta: { booster: b.reference, reference: pl.reference },
          ecritures: [
            { compte: 'FONDS_PRESTATAIRE', sens: 'DEBIT', montant: pl.montant, fournisseur: 'geniuspay' },
            { compte: 'REVENU_VISIBILITE', sens: 'CREDIT', montant: pl.montant },
          ],
        }, session);
      });
      const vue = await this.activer(b, { moyen: 'geniuspay', reference: pl.reference, montant: pl.montant }, 'systeme:geniuspay');
      return vue || this.vue(await this.trouver(id));
    }
    if (ECHECS_GENIUSPAY[g?.status]) {
      await this.collection.updateOne({ _id: b._id, 'paiementEnLigne.statut': 'en_attente' }, { $set: { 'paiementEnLigne.statut': 'echec', 'paiementEnLigne.raison': ECHECS_GENIUSPAY[g.status] } });
    }
    return this.vue(await this.trouver(id));
  },

  /** Vérification périodique (secours si un webhook se perd) : paiements des 2 dernières heures */
  async verifierEnAttente() {
    const depuis = new Date(Date.now() - 2 * 3600 * 1000);
    const liste = await this.collection.find({ statut: 'en_attente', 'paiementEnLigne.statut': 'en_attente', 'paiementEnLigne.creeLe': { $gt: depuis } }, { projection: { _id: 1 } }).toArray();
    for (const b of liste) {
      try { await this.verifierPaiement(b._id.toString()); } catch (e) { console.error('⚠️ Vérification d\'un booster :', String(e.message).replace(/\n|\r/g, '')); }
    }
  },

  /** Boosters en cours : Map residenceId → { audience, cible, bonus } (le plus fort si plusieurs) */
  async actifs() {
    const maintenant = new Date();
    const liste = await this.collection.find({ statut: 'actif', debut: { $lte: maintenant }, fin: { $gt: maintenant } }).toArray();
    const map = new Map();
    for (const b0 of liste) {
      const b = this.normaliser(b0);
      const v = { audience: b.audience, cible: b.cible || null, bonus: b.bonus ?? 0.5 };
      if (!map.has(b.residenceId) || map.get(b.residenceId).bonus < v.bonus) map.set(b.residenceId, v);
    }
    return map;
  },

  // ---------- Statistiques et résultats ----------

  get stats() { return db.collection('statistiques_residences'); },

  /** Site public : affichages des cartes (dont sponsorisés) et visites des fiches, par jour */
  async enregistrerStatistiques({ affichages = [], visite = null } = {}) {
    const jour = new Date().toISOString().slice(0, 10);
    const ops = [];
    const compte = new Map();
    for (const a of affichages.slice(0, 50)) {
      const id = Number(a?.id);
      if (!Number.isSafeInteger(id) || id < 1) continue;
      const c = compte.get(id) || { affichages: 0, affichagesSponsorises: 0, visites: 0 };
      c.affichages += 1;
      if (a.s) c.affichagesSponsorises += 1;
      compte.set(id, c);
    }
    const v = Number(visite);
    if (Number.isSafeInteger(v) && v > 0) {
      const c = compte.get(v) || { affichages: 0, affichagesSponsorises: 0, visites: 0 };
      c.visites += 1;
      compte.set(v, c);
    }
    for (const [id, c] of compte) {
      ops.push({ updateOne: { filter: { _id: `${id}:${jour}` }, update: { $inc: c, $setOnInsert: { residenceId: id, jour } }, upsert: true } });
    }
    if (ops.length) await this.stats.bulkWrite(ops, { ordered: false });
    return ops.length;
  },

  /** Moyenne quotidienne (14 derniers jours) d'affichages et taux de visite, par résidence */
  async moyennes(residenceIds) {
    const depuis = new Date(Date.now() - 14 * 86400000).toISOString().slice(0, 10);
    const lignes = await this.stats.aggregate([
      { $match: { residenceId: { $in: residenceIds }, jour: { $gte: depuis } } },
      { $group: { _id: '$residenceId', affichages: { $sum: '$affichages' }, visites: { $sum: '$visites' } } },
    ]).toArray();
    return new Map(lignes.map(l => [l._id, { affichagesJour: Math.round(l.affichages / 14), tauxVisite: l.affichages ? Math.min(0.5, l.visites / l.affichages) : null }]));
  },

  /** Résultats d'un booster : sur sa période (jusqu'à aujourd'hui) */
  async resultats(b) {
    const maintenant = new Date();
    if (!b.debut || new Date(b.debut) > maintenant) return null; // pas encore commencé
    const fin = new Date(Math.min(new Date(b.fin).getTime(), maintenant.getTime()));
    if (fin <= new Date(b.debut)) return { affichages: 0, affichagesSponsorises: 0, visites: 0, reservations: 0, montantReservations: 0 };
    const [s] = await this.stats.aggregate([
      { $match: { residenceId: b.residenceId, jour: { $gte: new Date(b.debut).toISOString().slice(0, 10), $lte: fin.toISOString().slice(0, 10) } } },
      { $group: { _id: null, affichages: { $sum: '$affichages' }, affichagesSponsorises: { $sum: '$affichagesSponsorises' }, visites: { $sum: '$visites' } } },
    ]).toArray();
    const resas = await db.collection('reservations').find(
      { residenceId: b.residenceId, statut: { $ne: 'annulee' }, dateCreation: { $gte: new Date(b.debut), $lte: fin } },
      { projection: { prixTotal: 1 } }
    ).toArray();
    return {
      affichages: s?.affichages || 0, affichagesSponsorises: s?.affichagesSponsorises || 0, visites: s?.visites || 0,
      reservations: resas.length, montantReservations: resas.reduce((t, r) => t + (Number(r.prixTotal) || 0), 0),
    };
  },
};

module.exports = BoosterService;
