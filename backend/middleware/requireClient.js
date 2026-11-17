const AuthService = require('../services/AuthService');

/**
 * Accès client sans compte : jeton obtenu avec email + référence,
 * ou via le lien envoyé par email. Ajoute req.client = { email, ref? }.
 */
module.exports = function requireClient(req, res, next) {
  const [type, jeton] = (req.headers.authorization || '').split(' ');
  const donnees = type === 'Bearer' ? AuthService.verifierJeton(jeton) : null;

  if (!donnees || donnees.role !== 'client' || !donnees.email) {
    return res.status(401).json({
      success: false,
      message: 'Accès expiré ou invalide. Retrouvez votre réservation avec votre email et votre référence.',
    });
  }

  req.client = { email: donnees.email, ref: donnees.ref || null };
  next();
};
