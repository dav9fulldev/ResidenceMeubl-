const { AsyncLocalStorage } = require('async_hooks');

/**
 * Entreprise « courante » (multi-entreprises).
 *
 * Chaque requête du back-office s'exécute dans le contexte de l'entreprise du gestionnaire
 * connecté : les paramètres (acompte, identité, moyens de paiement), les clés de paiement
 * et les emails suivent automatiquement cette entreprise.
 *
 * - run(id, fn)         exécute fn pour l'entreprise id (paiements, emails, tâches de fond)
 * - run(id, fn, true)   idem en mode back-office : filtre() limite en plus les requêtes
 *                       en base aux données de cette entreprise
 * - Hors contexte       entreprise principale (la plateforme BABI RESIDENCE) et aucun filtre
 */
const PRINCIPALE = 'babi';
const als = new AsyncLocalStorage();

const Tenant = {
  PRINCIPALE,

  run(entrepriseId, fn, admin = false) {
    return als.run({ entrepriseId: entrepriseId || PRINCIPALE, admin }, fn);
  },

  /** Exécute fn hors de tout contexte (tâches qui portent sur toutes les entreprises). */
  sansContexte(fn) {
    return als.exit(fn);
  },

  courante() {
    return als.getStore()?.entrepriseId || PRINCIPALE;
  },

  estPrincipale() {
    return Tenant.courante() === PRINCIPALE;
  },

  /** Filtre MongoDB des données du back-office : {} hors back-office. */
  filtre() {
    const s = als.getStore();
    return s?.admin ? { entrepriseId: s.entrepriseId } : {};
  },

  /** Exécute fn dans le contexte de l'entreprise d'une réservation ou d'une résidence. */
  pour(doc, fn) {
    return Tenant.run(doc?.entrepriseId || PRINCIPALE, fn, Boolean(als.getStore()?.admin));
  },
};

module.exports = Tenant;
