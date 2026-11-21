const AuthService = require('../services/AuthService');
const EntrepriseService = require('../services/EntrepriseService');
const Tenant = require('../services/Tenant');

const refus = (res, status, message) => res.status(status).json({ success: false, message });

/**
 * Bloque l'accès si la requête ne porte pas un jeton du back-office valide
 * (en-tête « Authorization: Bearer <jeton> »), puis exécute la suite de la requête
 * dans le contexte de l'entreprise du gestionnaire (voir services/Tenant.js).
 *
 * req.admin = { sub, ent (entreprise), uid? (compte gestionnaire), sa (super-admin) }
 */
module.exports = async function requireAdmin(req, res, next) {
  const [type, jeton] = (req.headers.authorization || '').split(' ');
  const donnees = type === 'Bearer' ? AuthService.verifierJeton(jeton) : null;
  // Un jeton client (lien « Mes réservations ») ne donne jamais accès à l'admin
  if (!donnees || donnees.role !== 'admin') return refus(res, 401, 'Authentification administrateur requise');

  // Anciens jetons (avant le multi-entreprises) : super-admin de l'entreprise principale
  const admin = { ...donnees, ent: donnees.ent || Tenant.PRINCIPALE, sa: donnees.sa ?? !donnees.uid };

  try {
    if (admin.uid) {
      // Compte supprimé ou déplacé : le jeton ne vaut plus rien
      const u = await EntrepriseService.utilisateur(admin.uid);
      if (!u || u.entrepriseId !== admin.ent) return refus(res, 401, 'Session expirée, reconnectez-vous');
      if (EntrepriseService.emailAVerifier(u)) return refus(res, 403, 'Confirmez d\'abord votre adresse email');
      // Mot de passe réinitialisé : les sessions ouvertes avant ne valent plus rien
      if (u.sessionsInvalideesLe && (Number(admin.iat) || 0) < new Date(u.sessionsInvalideesLe).getTime()) {
        return refus(res, 401, 'Session expirée, reconnectez-vous');
      }
    }
    if (EntrepriseService.statut(admin.ent) === 'suspendue') {
      return refus(res, 403, 'Le compte de votre entreprise est suspendu. Contactez BABI RESIDENCE.');
    }
    if (!EntrepriseService.statut(admin.ent)) return refus(res, 401, 'Session expirée, reconnectez-vous');
  } catch (error) {
    console.error('Erreur d\'authentification :', error.message);
    return refus(res, 500, 'Erreur d\'authentification');
  }

  req.admin = admin;
  Tenant.run(admin.ent, () => next(), true);
};

/** Réservé à l'administrateur de la plateforme (validation des entreprises). */
module.exports.superAdmin = function requireSuperAdmin(req, res, next) {
  if (!req.admin?.sa) return refus(res, 403, 'Réservé à l\'administrateur de la plateforme');
  next();
};
