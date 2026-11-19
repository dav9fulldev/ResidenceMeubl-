/**
 * Client de l'API Business PI-SPI (BCEAO), d'après la spécification officielle
 * « PI - API BUSINESS - OpenAPI 3.0 » v1.5.0 (developer.pispi.bceao.int/api-spec/openapi.yml).
 *
 * Authentification : OAuth2 client_credentials (scopes préfixés « piz/ ») + en-tête x-api-key.
 * En production, le participant exige en plus le mTLS (certificat délivré via PICERT).
 *
 * Variables d'environnement :
 *   PISPI_BASE_URL        URL de l'API Business du participant
 *   PISPI_PARTICIPANT_CODE code du participant (ex. CIC999), ajouté en préfixe des routes
 *   PISPI_TOKEN_URL       URL du serveur d'autorisation OAuth2
 *   PISPI_CLIENT_ID / PISPI_CLIENT_SECRET / PISPI_API_KEY
 *   PISPI_SCOPES          scopes accordés, séparés par des espaces (défaut ci-dessous)
 *   PISPI_PAYEE_ALIAS     adresse de paiement (alias SHID, UUID) du compte qui encaisse
 */
const SCOPES_PAR_DEFAUT = [
  'piz/demande_paiement.write',
  'piz/demande_paiement.read',
  'piz/paiement.read',
  'piz/retour_fonds.write',
  'piz/paiement.write',
].join(' ');

const DELAI_MS = 10000;
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// Nettoie une valeur de .env (espaces, guillemets copiés par erreur)
// Valeurs de l'entreprise courante (variables d'environnement pour la plateforme, voir Cles.js)
const env = (nom) => (require('./Cles').lire(nom) || '').trim().replace(/^['"]|['"]$/g, '').trim();

// Toutes les routes de l'API sont préfixées par le code participant (ex. /CIC999/demandes-paiements)
function urlAvecParticipant(base, code) {
  const propre = base.replace(/\/+$/, '');
  if (!code || propre.split('/').pop() === code) return propre;
  return `${propre}/${code}`;
}

class ErreurPiSpi extends Error {
  constructor(message, { status = 0, code = null, detail = null } = {}) {
    super(message);
    this.status = status;
    this.code = code;
    this.detail = detail;
  }
}

class PiSpiClient {
  constructor() {
    this.jetons = new Map(); // un jeton OAuth2 par jeu d'identifiants (une entreprise = ses clés)
  }

  get config() {
    return {
      baseUrl: urlAvecParticipant(env('PISPI_BASE_URL'), env('PISPI_PARTICIPANT_CODE')),
      tokenUrl: env('PISPI_TOKEN_URL'),
      clientId: env('PISPI_CLIENT_ID'),
      clientSecret: env('PISPI_CLIENT_SECRET'),
      apiKey: env('PISPI_API_KEY'),
      scopes: env('PISPI_SCOPES') || SCOPES_PAR_DEFAUT,
      payeAlias: env('PISPI_PAYEE_ALIAS').toLowerCase(),
    };
  }

  // Liste des réglages manquants ou invalides (vide = prêt)
  problemesConfiguration() {
    const c = this.config;
    const problemes = [];
    if (!/^https:\/\//.test(c.baseUrl)) problemes.push('PISPI_BASE_URL');
    if (!/^https:\/\//.test(c.tokenUrl)) problemes.push('PISPI_TOKEN_URL');
    if (!c.clientId) problemes.push('PISPI_CLIENT_ID');
    if (!c.clientSecret) problemes.push('PISPI_CLIENT_SECRET');
    if (!c.apiKey) problemes.push('PISPI_API_KEY');
    if (!UUID_V4.test(c.payeAlias)) problemes.push('PISPI_PAYEE_ALIAS (adresse de paiement au format UUID)');
    return problemes;
  }

  estConfigure() {
    return this.problemesConfiguration().length === 0;
  }

  // Jeton OAuth2 mis en cache jusqu'à une minute avant expiration
  get cleJeton() {
    const c = this.config;
    return `${c.tokenUrl}|${c.clientId}`;
  }

  async obtenirJeton() {
    const cache = this.jetons.get(this.cleJeton);
    if (cache && Date.now() < cache.expireA - 60000) return cache.jeton;
    const c = this.config;
    // Format du portail PI-SPI : identifiants dans le corps (client_secret_post)
    const corps = new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: c.clientId,
      client_secret: c.clientSecret,
      scope: c.scopes,
    });
    const reponse = await fetch(c.tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: corps,
      signal: AbortSignal.timeout(DELAI_MS),
    });
    const donnees = await reponse.json().catch(() => ({}));
    if (!reponse.ok || !donnees.access_token) {
      throw new ErreurPiSpi(`Authentification PI-SPI refusée (${reponse.status}${donnees.error ? ` : ${donnees.error}` : ''})`, { status: reponse.status, code: donnees.error });
    }
    this.jetons.set(this.cleJeton, { jeton: donnees.access_token, expireA: Date.now() + (Number(donnees.expires_in) || 3600) * 1000 });
    return donnees.access_token;
  }

  async requete(methode, chemin, corps) {
    const c = this.config;
    const executer = async () => fetch(`${c.baseUrl}${chemin}`, {
      method: methode,
      headers: {
        Authorization: `Bearer ${await this.obtenirJeton()}`,
        'x-api-key': c.apiKey,
        Accept: 'application/json',
        ...(corps ? { 'Content-Type': 'application/json' } : {}),
      },
      body: corps ? JSON.stringify(corps) : undefined,
      signal: AbortSignal.timeout(DELAI_MS),
    });

    let reponse = await executer();
    if (reponse.status === 401) {
      // Jeton expiré ou révoqué : un seul nouvel essai
      this.jetons.delete(this.cleJeton);
      reponse = await executer();
    }
    if (reponse.status === 404) return null;

    const texte = await reponse.text();
    let donnees = null;
    try { donnees = texte ? JSON.parse(texte) : null; } catch { donnees = { detail: texte.slice(0, 200) }; }
    if (!reponse.ok) {
      // Erreurs au format RFC 7807
      const message = donnees?.detail || donnees?.title || `Erreur PI-SPI ${reponse.status}`;
      throw new ErreurPiSpi(message, { status: reponse.status, code: donnees?.type || null, detail: donnees });
    }
    return donnees;
  }

  /**
   * Demande de paiement e-commerce (catégorie 521) vers l'adresse de paiement du client.
   * Vérifié sur le sandbox (17/11/2026) : contrairement à la spécification v1.5.0, le champ
   * dateLimitePaiement est refusé pour la catégorie 521 ; PI-SPI gère lui-même l'expiration.
   */
  async creerDemandePaiement({ txId, payeurAlias, montant, motif, logoUrl }) {
    const corps = {
      txId,
      confirmation: false,
      categorie: '521',
      payeurAlias: String(payeurAlias).trim().toLowerCase(),
      payeAlias: this.config.payeAlias,
      montant: Math.round(montant),
      motif: String(motif).slice(0, 140),
      ...(logoUrl && logoUrl.length <= 140 ? { logoUrl } : {}),
    };
    return this.requete('POST', '/demandes-paiements', corps);
  }

  // Statut d'une demande de paiement envoyée
  async lireDemandePaiement(txId) {
    return this.requete('GET', `/demandes-paiements/${encodeURIComponent(txId)}`);
  }

  /**
   * Paiement reçu : txId = référence (referenceLabel) du QR dynamique,
   * ou txId de la demande de paiement. null si rien n'est encore arrivé.
   */
  async lirePaiementRecu(txId) {
    return this.requete('GET', `/paiements-recus/${encodeURIComponent(txId)}`);
  }

  /**
   * Retour de fonds (remboursement intégral) d'un paiement reçu. Idempotent côté PI-SPI.
   * Limite : 90 jours après le paiement (403 au-delà).
   * Réponse : le paiement avec retourStatut (INITIE | IRREVOCABLE | REJETE).
   */
  async retournerFonds(end2endId) {
    return this.requete('PUT', `/paiements/${encodeURIComponent(end2endId)}/retours`);
  }

  /**
   * Paiement immédiat sortant (catégorie 733) : sert au remboursement partiel.
   * payeurAlias = notre adresse (le business paie), payeAlias = adresse du client.
   */
  async envoyerPaiement({ txId, payeAlias, montant, motif }) {
    return this.requete('POST', '/paiements-envoyes', {
      txId,
      payeurAlias: this.config.payeAlias,
      payeAlias: String(payeAlias).trim().toLowerCase(),
      montant: Math.round(montant),
      confirmation: false,
      motif: String(motif).slice(0, 140),
    });
  }

  async lirePaiementEnvoye(txId) {
    return this.requete('GET', `/paiements-envoyes/${encodeURIComponent(txId)}`);
  }

  // Détail d'un paiement (dont retourStatut) par son identifiant de bout en bout
  async lirePaiement(end2endId) {
    return this.requete('GET', `/paiements/${encodeURIComponent(end2endId)}`);
  }
}

const client = new PiSpiClient();
client.ErreurPiSpi = ErreurPiSpi;
client.UUID_V4 = UUID_V4;
client.urlAvecParticipant = urlAvecParticipant;
module.exports = client;
