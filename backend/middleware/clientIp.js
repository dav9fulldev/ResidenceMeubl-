const net = require('net');
const { ipKeyGenerator } = require('express-rate-limit');

/**
 * Adresse IP réelle du visiteur.
 *
 * Derrière plusieurs relais (Render = Cloudflare + répartiteur interne), req.ip
 * renvoie une IP interne commune à tous les visiteurs. Si CLIENT_IP_HEADER est
 * défini (ex. « cf-connecting-ip » sur Render), cet en-tête est utilisé.
 *
 * ⚠️ N'activer CLIENT_IP_HEADER que derrière un relais qui écrase cet en-tête
 * (Cloudflare le fait) : sinon un client pourrait le fabriquer.
 */
function clientIp(req) {
  const nomEntete = (process.env.CLIENT_IP_HEADER || '').trim().toLowerCase();
  if (nomEntete) {
    const valeur = String(req.headers[nomEntete] || '').split(',')[0].trim();
    if (net.isIP(valeur)) return valeur;
  }
  return req.ip;
}

// Clé utilisée par express-rate-limit (regroupe les IPv6 par bloc /56)
const cleLimite = (req) => ipKeyGenerator(clientIp(req));

module.exports = { clientIp, cleLimite };
