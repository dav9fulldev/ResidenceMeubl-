const crypto = require('crypto');

/**
 * Client de l'API GeniusPay (https://geniuspay.ci/docs/api).
 *
 * Variables d'environnement :
 *   GENIUSPAY_API_KEY         clé publique  (pk_sandbox_… ou pk_live_…) → en-tête X-API-Key
 *   GENIUSPAY_API_SECRET      clé secrète   (sk_sandbox_… ou sk_live_…) → en-tête X-API-Secret
 *   GENIUSPAY_WEBHOOK_SECRET  secret de signature des webhooks (whsec_…)
 *   GENIUSPAY_BASE_URL        facultatif, défaut https://geniuspay.ci/api/v1/merchant
 * Le bac à sable ou la production se choisit par le préfixe des clés (même adresse).
 */
const DELAI_MS = 15000;
const TOLERANCE_WEBHOOK_S = 300;

class ErreurGeniusPay extends Error {
  constructor(message, { status = 502, code = null } = {}) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

const lire = (nom) => (process.env[nom] || '').trim();

class GeniusPayClient {
  get config() {
    return {
      baseUrl: (lire('GENIUSPAY_BASE_URL') || 'https://geniuspay.ci/api/v1/merchant').replace(/\/+$/, ''),
      cle: lire('GENIUSPAY_API_KEY'),
      secret: lire('GENIUSPAY_API_SECRET'),
      secretWebhook: lire('GENIUSPAY_WEBHOOK_SECRET'),
    };
  }

  problemesConfiguration() {
    const c = this.config;
    const p = [];
    if (!c.cle) p.push('GENIUSPAY_API_KEY manquante');
    if (!c.secret) p.push('GENIUSPAY_API_SECRET manquante');
    if (c.cle && c.secret) {
      const env = (k) => (/_(sandbox|test)_/.test(k) ? 'sandbox' : /_live_/.test(k) ? 'live' : null);
      if (env(c.cle) && env(c.secret) && env(c.cle) !== env(c.secret)) p.push('Les clés publique et secrète ne sont pas du même environnement (sandbox / live)');
    }
    if (!c.secretWebhook) p.push('GENIUSPAY_WEBHOOK_SECRET manquant (confirmation des paiements par webhook)');
    return p;
  }

  // Configuré = on peut créer et lire des paiements (le webhook est un plus, la vérification périodique prend le relais)
  estConfigure() {
    const c = this.config;
    return Boolean(c.cle && c.secret);
  }

  get environnement() {
    return /_live_/.test(this.config.cle) ? 'live' : 'sandbox';
  }

  async requete(methode, chemin, corps) {
    const c = this.config;
    let reponse;
    try {
      reponse = await fetch(`${c.baseUrl}${chemin}`, {
        method: methode,
        headers: {
          'X-API-Key': c.cle,
          'X-API-Secret': c.secret,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: corps ? JSON.stringify(corps) : undefined,
        signal: AbortSignal.timeout(DELAI_MS),
      });
    } catch (error) {
      throw new ErreurGeniusPay(`GeniusPay injoignable : ${error.message}`);
    }
    let json = null;
    try { json = await reponse.json(); } catch { /* corps vide */ }
    if (reponse.status === 404) return null;
    if (!reponse.ok || json?.success === false) {
      const code = json?.error?.code || null;
      const message = json?.error?.message || json?.message || `Erreur HTTP ${reponse.status}`;
      throw new ErreurGeniusPay(`GeniusPay : ${message}${code ? ` (${code})` : ''}`, { status: reponse.status, code });
    }
    return json?.data ?? json;
  }

  /**
   * Crée un paiement en mode « page de paiement » (le client choisit Wave, Orange Money, MTN, Moov ou carte).
   * @returns {{ id, reference, status, checkout_url, payment_url, expires_at, environment }}
   */
  creerPaiement({ montant, description, client = {}, successUrl, errorUrl, metadata = {} }) {
    return this.requete('POST', '/payments', {
      amount: Math.round(Number(montant)),
      currency: 'XOF',
      description: String(description || '').slice(0, 500),
      customer: {
        ...(client.nom ? { name: client.nom } : {}),
        ...(client.email ? { email: client.email } : {}),
        ...(client.telephone ? { phone: client.telephone } : {}),
        country: client.pays || 'CI',
      },
      ...(successUrl ? { success_url: successUrl } : {}),
      ...(errorUrl ? { error_url: errorUrl } : {}),
      metadata,
    });
  }

  /** Paiement par sa référence (null si inconnu). Statuts : pending, processing, completed, failed, expired, cancelled, refunded. */
  lirePaiement(reference) {
    return this.requete('GET', `/payments/${encodeURIComponent(reference)}`);
  }

  /**
   * Signature d'un webhook : HMAC-SHA256(timestamp + "." + payload JSON, secret), en hexadécimal,
   * en-têtes X-Webhook-Signature et X-Webhook-Timestamp. Rejette un horodatage de plus de 5 minutes.
   * Le JSON signé est vérifié tel que reçu, puis réencodé comme le fait PHP (json_encode).
   */
  signatureValide(corpsBrut, signature, horodatage, maintenant = Date.now()) {
    const secret = this.config.secretWebhook;
    const ts = String(horodatage || '').trim();
    const recue = String(signature || '').trim().replace(/^sha256=/i, '').toLowerCase();
    if (!secret || !recue || !/^\d+$/.test(ts)) return false;
    if (Math.abs(Math.floor(maintenant / 1000) - Number(ts)) > TOLERANCE_WEBHOOK_S) return false;

    const brut = Buffer.isBuffer(corpsBrut) ? corpsBrut.toString('utf8') : String(corpsBrut || '');
    const candidats = [brut];
    try {
      const objet = JSON.parse(brut);
      const compact = JSON.stringify(objet);
      // json_encode de PHP : « / » échappé, caractères non ASCII en \uXXXX
      const php = compact.replace(/\//g, '\\/').replace(/[\u007f-￿]/g, (ch) => `\\u${ch.charCodeAt(0).toString(16).padStart(4, '0')}`);
      candidats.push(compact, php);
    } catch {
      // corps non JSON : seul le texte brut est testé
    }
    return candidats.some((texte) => {
      const attendu = crypto.createHmac('sha256', secret).update(`${ts}.${texte}`).digest('hex');
      const a = Buffer.from(attendu);
      const b = Buffer.from(recue);
      return a.length === b.length && crypto.timingSafeEqual(a, b);
    });
  }
}

const client = new GeniusPayClient();
client.ErreurGeniusPay = ErreurGeniusPay;
module.exports = client;
