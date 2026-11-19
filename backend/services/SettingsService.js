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

// Identité de l'établissement (textes) : affichée sur le site, dans les emails et le back-office
const TEXTES = {
  nom: { defaut: 'Sankofart Résidence', max: 80, requis: true },
  slogan: { defaut: 'Résidences meublées d\'exception à Abidjan', max: 160 },
  telephone: { defaut: '+225 27 22 49 28 90', max: 30, type: 'tel' },
  whatsapp: { defaut: '', max: 30, type: 'tel' },
  email: { defaut: 'contact@sankofart-residence.com', max: 120, type: 'email' },
  adresse: { defaut: 'Abidjan, Côte d\'Ivoire', max: 160 },
  facebook: { defaut: '', max: 200, type: 'url' },
  instagram: { defaut: '', max: 200, type: 'url' },
  tiktok: { defaut: '', max: 200, type: 'url' },
  x: { defaut: '', max: 200, type: 'url' },
  // Privé : destinataire des alertes (nouvelle réservation, annulation…)
  emailNotifications: { defaut: '', max: 120, type: 'email', prive: true },
};

const FORMATS = {
  email: /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/,
  tel: /^[+0-9 ().-]{6,30}$/,
  url: /^https:\/\/[^\s]+$/,
};

class ErreurParametre extends Error {}

class SettingsService {
  constructor() {
    this.cache = {};
    this.textes = {};
    this.moyens = {};
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
    const [doc, etab, paiement] = await Promise.all([
      db.collection('parametres').findOne({ _id: 'acompte' }),
      db.collection('parametres').findOne({ _id: 'etablissement' }),
      db.collection('parametres').findOne({ _id: 'paiement' }),
    ]);
    this.moyens = paiement?.actifs && typeof paiement.actifs === 'object' ? { ...paiement.actifs } : {};
    this.cache = {};
    if (doc) for (const k of Object.keys(DEFINITIONS)) if (Number.isInteger(doc[k])) this.cache[k] = doc[k];
    this.textes = {};
    if (etab) for (const k of Object.keys(TEXTES)) if (typeof etab[k] === 'string') this.textes[k] = etab[k];
    return this.tous();
  }

  /** Activation d'un moyen de paiement par l'admin (PI-SPI actif par défaut). */
  moyenActif(id) {
    return this.moyens[id] ?? (id === 'pispi');
  }

  async modifierMoyen(id, actif) {
    await db.collection('parametres').updateOne(
      { _id: 'paiement' },
      { $set: { [`actifs.${id}`]: Boolean(actif), modifieLe: new Date() } },
      { upsert: true }
    );
    await this.charger();
    return this.moyenActif(id);
  }

  /** Identité complète (back-office) ; `publique` retire les champs privés. */
  etablissement({ publique = false } = {}) {
    return Object.fromEntries(Object.entries(TEXTES)
      .filter(([, d]) => !(publique && d.prive))
      .map(([k, d]) => [k, this.textes[k] ?? d.defaut]));
  }

  async modifierEtablissement(valeurs = {}) {
    const maj = {};
    for (const [k, d] of Object.entries(TEXTES)) {
      if (!Object.prototype.hasOwnProperty.call(valeurs, k)) continue;
      const texte = String(valeurs[k] ?? '').trim();
      if (d.requis && !texte) throw new ErreurParametre(`Le champ « ${k} » est obligatoire`);
      if (texte.length > d.max) throw new ErreurParametre(`« ${k} » : ${d.max} caractères au maximum`);
      if (texte && d.type && !FORMATS[d.type].test(texte)) {
        const attendu = { email: 'une adresse email valide', tel: 'un numéro de téléphone valide', url: 'une adresse commençant par https://' }[d.type];
        throw new ErreurParametre(`« ${k} » : ${attendu} est attendue`);
      }
      maj[k] = texte;
    }
    await db.collection('parametres').updateOne(
      { _id: 'etablissement' },
      { $set: { ...maj, modifieLe: new Date() } },
      { upsert: true }
    );
    await this.charger();
    return this.etablissement();
  }

  async modifier(valeurs = {}) {
    const maj = {};
    for (const [k, d] of Object.entries(DEFINITIONS)) {
      if (!Object.prototype.hasOwnProperty.call(valeurs, k)) continue;
      const n = Number(valeurs[k]);
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
service.TEXTES = TEXTES;
module.exports = service;
