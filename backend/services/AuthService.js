const crypto = require('crypto');

/**
 * Authentification administrateur par jeton signé (HMAC-SHA256).
 *
 * Variables d'environnement :
 *  - ADMIN_USERNAME / ADMIN_PASSWORD : identifiants de l'administrateur
 *  - ADMIN_TOKEN_SECRET : clé de signature des jetons (longue chaîne aléatoire).
 *    Si elle est absente, une clé temporaire est générée : les admins devront
 *    se reconnecter à chaque redémarrage du serveur.
 */
const DUREE_JETON_MS = 8 * 60 * 60 * 1000; // 8 heures

const secret = process.env.ADMIN_TOKEN_SECRET || crypto.randomBytes(32).toString('hex');
if (!process.env.ADMIN_TOKEN_SECRET && process.env.NODE_ENV !== 'test') {
  console.warn('⚠️ ADMIN_TOKEN_SECRET non défini : clé temporaire utilisée (déconnexion des admins au redémarrage).');
}

const base64url = (texte) => Buffer.from(texte).toString('base64url');

const signer = (contenu) => crypto.createHmac('sha256', secret).update(contenu).digest('base64url');

// Comparaison en temps constant pour éviter les attaques temporelles
const egal = (a, b) => {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
};

// Identifiants : dérivation scrypt (lente et salée), puis comparaison en temps constant
const SEL = crypto.randomBytes(16);
const egalIdentifiant = (a, b) => crypto.timingSafeEqual(
  crypto.scryptSync(String(a), SEL, 32),
  crypto.scryptSync(String(b), SEL, 32)
);

class AuthService {
  estConfigure() {
    return Boolean(process.env.ADMIN_USERNAME && process.env.ADMIN_PASSWORD);
  }

  verifierIdentifiants(username, password) {
    if (!this.estConfigure()) return false;
    // Les deux comparaisons sont toujours faites pour ne rien révéler
    const userOk = egalIdentifiant(username || '', process.env.ADMIN_USERNAME);
    const passOk = egalIdentifiant(password || '', process.env.ADMIN_PASSWORD);
    return userOk && passOk;
  }

  creerJeton(username) {
    return this.signerDonnees({ role: 'admin', sub: username, exp: Date.now() + DUREE_JETON_MS });
  }

  /**
   * Jeton d'accès client (sans compte) à ses réservations.
   * @param {string} email
   * @param {{ reference?: string, dureeMs?: number }} options
   *   reference : limite l'accès à une seule réservation
   */
  creerJetonClient(email, { reference, dureeMs = 24 * 60 * 60 * 1000 } = {}) {
    return this.signerDonnees({
      role: 'client',
      email: String(email).trim().toLowerCase(),
      ...(reference ? { ref: reference } : {}),
      exp: Date.now() + dureeMs,
    });
  }

  signerDonnees(donnees) {
    const contenu = base64url(JSON.stringify(donnees));
    return `${contenu}.${signer(contenu)}`;
  }

  // Retourne le contenu du jeton s'il est valide, sinon null
  verifierJeton(jeton) {
    if (typeof jeton !== 'string' || !jeton.includes('.')) return null;
    const [contenu, signature] = jeton.split('.');
    if (!signature || !egal(signature, signer(contenu))) return null;

    try {
      const donnees = JSON.parse(Buffer.from(contenu, 'base64url').toString());
      return donnees.exp > Date.now() ? donnees : null;
    } catch {
      return null;
    }
  }
}

module.exports = new AuthService();
