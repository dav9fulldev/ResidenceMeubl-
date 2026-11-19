const crypto = require('crypto');
const db = require('../../db');
const Tenant = require('../Tenant');

/**
 * Clés des prestataires de paiement, par entreprise.
 *
 * - Plateforme (entreprise principale) : variables d'environnement, comme avant.
 * - Autres entreprises : saisies par le gestionnaire dans Paramètres → Moyens de paiement,
 *   chiffrées en base (AES-256-GCM, collection « cles_paiement »). L'argent arrive ainsi
 *   directement sur le compte de chaque entreprise.
 *
 * Clé de chiffrement : CLES_CHIFFREMENT (recommandé), sinon dérivée de ADMIN_TOKEN_SECRET.
 * Sans l'une des deux, les entreprises ne peuvent pas enregistrer de clés.
 */
const CHAMPS = {
  pispi: [
    { nom: 'PISPI_BASE_URL', libelle: 'Adresse de l\'API Business', secret: false, format: 'url' },
    { nom: 'PISPI_TOKEN_URL', libelle: 'Adresse du serveur d\'autorisation (OAuth2)', secret: false, format: 'url' },
    { nom: 'PISPI_PARTICIPANT_CODE', libelle: 'Code participant (ex. CIC999)', secret: false, format: 'code' },
    { nom: 'PISPI_CLIENT_ID', libelle: 'Client ID', secret: true },
    { nom: 'PISPI_CLIENT_SECRET', libelle: 'Client secret', secret: true },
    { nom: 'PISPI_API_KEY', libelle: 'Clé d\'API (x-api-key)', secret: true },
    { nom: 'PISPI_PAYEE_ALIAS', libelle: 'Adresse de paiement du compte qui encaisse (UUID)', secret: false, format: 'uuid' },
    { nom: 'PISPI_WEBHOOK_SECRET', libelle: 'Secret du webhook', secret: true, facultatif: true },
    { nom: 'PISPI_APP_URL', libelle: 'Lien « Ouvrir l\'application » (facultatif)', secret: false, format: 'url', facultatif: true },
  ],
  geniuspay: [
    { nom: 'GENIUSPAY_API_KEY', libelle: 'Clé publique (pk_…)', secret: false, format: 'pk' },
    { nom: 'GENIUSPAY_API_SECRET', libelle: 'Clé secrète (sk_…)', secret: true, format: 'sk' },
    { nom: 'GENIUSPAY_WEBHOOK_SECRET', libelle: 'Secret du webhook (whsec_…)', secret: true, facultatif: true },
  ],
};
const PAR_NOM = Object.fromEntries(Object.values(CHAMPS).flat().map(c => [c.nom, c]));
// Réglages communs à toute la plateforme (jamais propres à une entreprise)
const COMMUNS = ['GENIUSPAY_BASE_URL', 'PISPI_PAYS', 'PISPI_SCOPES', 'PAIEMENT_MODE'];

const FORMATS = {
  url: /^https:\/\/[^\s]+$/,
  code: /^[A-Z0-9]{3,12}$/,
  uuid: /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
  pk: /^pk_[A-Za-z0-9_]+$/,
  sk: /^sk_[A-Za-z0-9_]+$/,
};

class ErreurCles extends Error {
  constructor(message, status = 400) { super(message); this.status = status; }
}

const cleChiffrement = () => {
  const source = (process.env.CLES_CHIFFREMENT || process.env.ADMIN_TOKEN_SECRET || '').trim();
  if (source.length < 32) return null;
  return Buffer.from(crypto.hkdfSync('sha256', source, 'babi-residence', 'cles-paiement', 32));
};

function chiffrer(texte) {
  const cle = cleChiffrement();
  if (!cle) throw new ErreurCles('Enregistrement des clés indisponible : CLES_CHIFFREMENT n\'est pas défini sur le serveur', 503);
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', cle, iv);
  const donnees = Buffer.concat([c.update(String(texte), 'utf8'), c.final()]);
  return [iv, c.getAuthTag(), donnees].map(b => b.toString('base64')).join('.');
}

function dechiffrer(valeur) {
  const cle = cleChiffrement();
  if (!cle) return '';
  try {
    const [iv, tag, donnees] = String(valeur).split('.').map(b => Buffer.from(b, 'base64'));
    const d = crypto.createDecipheriv('aes-256-gcm', cle, iv);
    d.setAuthTag(tag);
    return Buffer.concat([d.update(donnees), d.final()]).toString('utf8');
  } catch {
    return ''; // clé de chiffrement changée : la valeur doit être ressaisie
  }
}

const apercu = (v) => (v ? `••••${v.slice(-4)}` : '');

class Cles {
  constructor() {
    this.cache = new Map(); // entrepriseId → { NOM: valeur en clair }
  }

  get collection() { return db.collection('cles_paiement'); }

  async charger() {
    const docs = await this.collection.find({}).toArray();
    this.cache = new Map(docs.map(d => [d._id, Object.fromEntries(
      Object.entries(d.valeurs || {}).filter(([k]) => PAR_NOM[k]).map(([k, v]) => [k, dechiffrer(v)])
    )]));
  }

  /** Valeur d'un réglage de paiement pour l'entreprise courante. */
  lire(nom) {
    if (Tenant.estPrincipale() || COMMUNS.includes(nom)) return process.env[nom] || '';
    return this.cache.get(Tenant.courante())?.[nom] || '';
  }

  /** Champs d'un prestataire tels que le gestionnaire les voit (secrets masqués). */
  formulaire(fournisseur) {
    return (CHAMPS[fournisseur] || []).map(c => {
      const v = this.lire(c.nom);
      return { ...c, defini: Boolean(v), valeur: c.secret ? '' : v, apercu: c.secret ? apercu(v) : null };
    });
  }

  /**
   * Enregistre les clés d'un prestataire pour l'entreprise courante.
   * Un champ secret laissé vide garde sa valeur ; `null` l'efface.
   */
  async enregistrer(fournisseur, valeurs = {}) {
    if (Tenant.estPrincipale()) throw new ErreurCles('Les clés de la plateforme se règlent dans les variables d\'environnement du serveur', 409);
    const champs = CHAMPS[fournisseur];
    if (!champs) throw new ErreurCles('Moyen de paiement inconnu', 404);
    const set = {};
    const unset = {};
    for (const c of champs) {
      if (!Object.prototype.hasOwnProperty.call(valeurs, c.nom)) continue;
      const brut = valeurs[c.nom];
      if (brut === null) { unset[`valeurs.${c.nom}`] = ''; continue; }
      const v = String(brut).trim().replace(/^['"]|['"]$/g, '');
      if (!v) { if (!c.secret) unset[`valeurs.${c.nom}`] = ''; continue; }
      if (v.length > 500) throw new ErreurCles(`« ${c.libelle} » est trop long`);
      if (c.format && !FORMATS[c.format].test(v)) throw new ErreurCles(`« ${c.libelle} » : format invalide`);
      set[`valeurs.${c.nom}`] = chiffrer(c.format === 'uuid' ? v.toLowerCase() : v);
    }
    await this.collection.updateOne(
      { _id: Tenant.courante() },
      { ...(Object.keys(set).length ? { $set: { ...set, modifieLe: new Date() } } : { $set: { modifieLe: new Date() } }), ...(Object.keys(unset).length ? { $unset: unset } : {}) },
      { upsert: true }
    );
    await this.charger();
    return this.formulaire(fournisseur);
  }

  chiffrementDisponible() {
    return Boolean(cleChiffrement());
  }
}

const service = new Cles();
service.CHAMPS = CHAMPS;
service.ErreurCles = ErreurCles;
module.exports = service;
