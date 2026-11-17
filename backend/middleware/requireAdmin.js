const AuthService = require('../services/AuthService');

/**
 * Bloque l'accès si la requête ne porte pas un jeton admin valide
 * (en-tête « Authorization: Bearer <jeton> »).
 */
module.exports = function requireAdmin(req, res, next) {
  const [type, jeton] = (req.headers.authorization || '').split(' ');
  const donnees = type === 'Bearer' ? AuthService.verifierJeton(jeton) : null;
  // Un jeton client (lien « Mes réservations ») ne donne jamais accès à l'admin
  const admin = donnees && donnees.role === 'admin' ? donnees : null;

  if (!admin) {
    return res.status(401).json({
      success: false,
      message: 'Authentification administrateur requise',
    });
  }

  req.admin = admin;
  next();
};
