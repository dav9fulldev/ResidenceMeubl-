const db = require('../db');

/**
 * Paramètres modifiables depuis le back-office (collection « parametres »).
 * Valeurs par défaut : variables d'environnement, puis valeurs ci-dessous.
 * Lecture synchrone depuis un cache, rechargé au démarrage et à chaque modification.
 */
const DEFINITIONS = {
  acomptePourcentage: { env: 'ACOMPTE_POURCENTAGE', defaut: 30, min: 1, max: 100 },
  remboursementPourcentage: { env: 'ACOMPTE_REMBOURSEMENT_POURCENTAGE', defaut: 50, min: 0, max: 100 },
  remboursableApresPaiementJours: { env: 'ACOMPTE_REMBOURSABLE_APRES_PAIEMENT_JOURS', defaut: 5, min: 0, max: 365 },
  nonRemboursableAvantArriveeJours: { env: 'ACOMPTE_NON_REMBOURSABLE_AVANT_ARRIVEE_JOURS', defaut: 3, min: 0, max: 365 },
};

class ErreurParametre extends Error {}

class SettingsService {
  constructor() {
    this.cache = {};
  }

  defaut(cle) {
    const d = DEFINITIONS[cle];
    const v = parseInt(process.env[d.env], 10);
    return Number.isInteger(v) && v >= d.min && v <= d.max ? v : d.defaut;
  }

  get(cle) {
    return this.cache[cle] ?? this.defaut(cle);
  }

  tous() {
    return Object.fromEntries(Object.keys(DEFINITIONS).map(k => [k, this.get(k)]));
  }

  async charger() {
    const doc = await db.collection('parametres').findOne({ _id: 'acompte' });
    this.cache = {};
    if (doc) for (const k of Object.keys(DEFINITIONS)) if (Number.isInteger(doc[k])) this.cache[k] = doc[k];
    return this.tous();
  }

  async modifier(valeurs = {}) {
    const maj = {};
    for (const [k, v] of Object.entries(valeurs)) {
      const d = DEFINITIONS[k];
      if (!d) continue;
      const n = Number(v);
      if (!Number.isInteger(n) || n < d.min || n > d.max) {
        throw new ErreurParametre(`Valeur invalide pour ${k} (entier entre ${d.min} et ${d.max})`);
      }
      maj[k] = n;
    }
    await db.collection('parametres').updateOne(
      { _id: 'acompte' },
      { $set: { ...maj, modifieLe: new Date() } },
      { upsert: true }
    );
    return this.charger();
  }
}

const service = new SettingsService();
service.ErreurParametre = ErreurParametre;
service.DEFINITIONS = DEFINITIONS;
module.exports = service;
