const AuthService = require('../services/AuthService');
const ClientService = require('../services/ClientService');

const refus = (res) => res.status(401).json({
  success: false,
  message: 'Votre session a expiré. Connectez-vous pour retrouver vos réservations.',
});

/**
 * Accès « Mes réservations ». Ajoute req.client = { email, ref?, id? }.
 *  - session d'un compte (Service client) : jeton portant cid, refusé si le compte a disparu
 *    ou si la session a été fermée (mot de passe changé) ;
 *  - accès limité à une réservation (email + référence, ou juste après la réservation) ;
 *  - anciens liens reçus par email avant le Service client (jusqu'à leur expiration).
 */
module.exports = async function requireClient(req, res, next) {
  const [type, jeton] = (req.headers.authorization || '').split(' ');
  const donnees = type === 'Bearer' ? AuthService.verifierJeton(jeton) : null;
  if (!donnees || donnees.role !== 'client' || !donnees.email) return refus(res);

  if (donnees.cid) {
    try {
      const client = await ClientService.depuisSession(donnees);
      if (!client) return refus(res);
      req.client = { email: client.email, ref: null, id: client._id };
    } catch (error) {
      console.error('Erreur d\'authentification client :', error.message);
      return res.status(500).json({ success: false, message: 'Erreur d\'authentification' });
    }
  } else {
    req.client = { email: donnees.email, ref: donnees.ref || null };
  }
  next();
};
