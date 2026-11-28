const db = require('../db');
const Tenant = require('./Tenant');

/**
 * Paramètres modifiables depuis le back-office (collection « parametres »), propres à chaque entreprise.
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
  nom: { defaut: 'BABI RESIDENCE', max: 80, requis: true },
  slogan: { defaut: '', max: 160 },
  telephone: { defaut: '', max: 30, type: 'tel' },
  whatsapp: { defaut: '', max: 30, type: 'tel' },
  email: { defaut: '', max: 120, type: 'email' },
  adresse: { defaut: '', max: 160 },
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

// Documents de la collection « parametres » : l'entreprise principale garde les identifiants
// historiques (« acompte », « etablissement », « paiement ») ; les autres sont suffixées « :<id> ».
const cleDoc = (type, entrepriseId) => (entrepriseId === Tenant.PRINCIPALE ? type : `${type}:${entrepriseId}`);
const TYPES = ['acompte', 'etablissement', 'paiement'];

class SettingsService {
  constructor() {
    this.parEntreprise = new Map(); // entrepriseId → { cache, textes, moyens }
  }

  /** Paramètres de l'entreprise courante (voir Tenant). */
  get donnees() {
    return this.parEntreprise.get(Tenant.courante()) || { cache: {}, textes: {}, moyens: {} };
  }

  // Compatibilité : lecture directe des valeurs de l'entreprise courante
  get cache() { return this.donnees.cache; }

  get textes() { return this.donnees.textes; }

  get moyens() { return this.donnees.moyens; }

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

  /** Recharge les paramètres de toutes les entreprises. */
  async charger() {
    const docs = await db.collection('parametres').find({}).toArray();
    const parEntreprise = new Map();
    const entree = (id) => {
      if (!parEntreprise.has(id)) parEntreprise.set(id, { cache: {}, textes: {}, moyens: {} });
      return parEntreprise.get(id);
    };
    for (const doc of docs) {
      const [type, id = Tenant.PRINCIPALE] = String(doc._id).split(':');
      if (!TYPES.includes(type)) continue;
      const e = entree(id);
      if (type === 'acompte') for (const k of Object.keys(DEFINITIONS)) { if (Number.isInteger(doc[k])) e.cache[k] = doc[k]; }
      if (type === 'etablissement') for (const k of Object.keys(TEXTES)) { if (typeof doc[k] === 'string') e.textes[k] = doc[k]; }
      if (type === 'paiement' && doc.actifs && typeof doc.actifs === 'object') e.moyens = { ...doc.actifs };
    }
    this.parEntreprise = parEntreprise;
    return this.tous();
  }

  /** Activation d'un moyen de paiement par l'admin (PI-SPI actif par défaut pour la plateforme). */
  moyenActif(id) {
    // Moyens activés par la plateforme : les mêmes pour toutes les entreprises (encaissement centralisé)
    const plateforme = this.parEntreprise.get(Tenant.PRINCIPALE)?.moyens || {};
    return plateforme[id] ?? (id === 'pispi');
  }

  async modifierMoyen(id, actif) {
    await db.collection('parametres').updateOne(
      { _id: cleDoc('paiement', Tenant.PRINCIPALE) },
      { $set: { [`actifs.${id}`]: Boolean(actif), modifieLe: new Date() } },
      { upsert: true }
    );
    await this.charger();
    return this.moyenActif(id);
  }

  // Valeur par défaut d'un texte : celles de la plateforme, ou le nom de l'entreprise inscrite
  defautTexte(k, d) {
    if (Tenant.estPrincipale()) return d.defaut;
    if (k === 'nom') return require('./EntrepriseService').nom(Tenant.courante()) || 'Entreprise';
    return '';
  }

  /** Identité complète (back-office) ; `publique` retire les champs privés. */
  etablissement({ publique = false } = {}) {
    return Object.fromEntries(Object.entries(TEXTES)
      .filter(([, d]) => !(publique && d.prive))
      .map(([k, d]) => [k, this.textes[k] ?? this.defautTexte(k, d)]));
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
      { _id: cleDoc('etablissement', Tenant.courante()) },
      { $set: { ...maj, modifieLe: new Date() } },
      { upsert: true }
    );
    // Le nom de l'entreprise suit celui de l'établissement (liste des entreprises, site public)
    if (maj.nom && !Tenant.estPrincipale()) {
      await db.collection('entreprises').updateOne({ _id: Tenant.courante() }, { $set: { nom: maj.nom } });
      await require('./EntrepriseService').recharger();
    }
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
      { _id: cleDoc('acompte', Tenant.courante()) },
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
