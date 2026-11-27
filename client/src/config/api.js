/**
 * Configuration de l'API Backend
 * L'URL vient de REACT_APP_API_URL (client/.env en local, variables d'environnement sur Vercel).
 */
export const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:5001/api';

export const API_ENDPOINTS = {
  establishment: `${API_BASE_URL}/etablissement`,
  residences: {
    getAll: `${API_BASE_URL}/residences`,
    getById: (id) => `${API_BASE_URL}/residences/${id}`,
    checkAvailability: `${API_BASE_URL}/residences/check-disponibilite`,
    available: `${API_BASE_URL}/residences/disponibles`,
    smartSearch: `${API_BASE_URL}/residences/recherche-ia`,
    similar: (id) => `${API_BASE_URL}/residences/${id}/similaires`,
    report: (id) => `${API_BASE_URL}/residences/${id}/signalement`,
    reviews: (id) => `${API_BASE_URL}/residences/${id}/avis`,
    stats: `${API_BASE_URL}/residences/statistiques`,
  },
  reservations: {
    create: `${API_BASE_URL}/reservations`,
    getAll: `${API_BASE_URL}/reservations`,
    updateStatus: (id) => `${API_BASE_URL}/reservations/${id}/status`,
    decideCancellation: (id) => `${API_BASE_URL}/reservations/${id}/annulation`,
    markRefunded: (id) => `${API_BASE_URL}/reservations/${id}/remboursement`,
    retryRefund: (id) => `${API_BASE_URL}/reservations/${id}/remboursement/relancer`,
    balance: (id) => `${API_BASE_URL}/reservations/${id}/solde`,
    balanceRefund: (id) => `${API_BASE_URL}/reservations/${id}/solde/remboursement`,
  },
  client: {
    access: `${API_BASE_URL}/client/acces`,
    link: `${API_BASE_URL}/client/lien`,
    // Service client : compte créé à la réservation, mot de passe choisi depuis l'email
    login: `${API_BASE_URL}/client/connexion`,
    setPassword: `${API_BASE_URL}/client/mot-de-passe`,
    passwordLink: `${API_BASE_URL}/client/mot-de-passe/lien`,
    me: `${API_BASE_URL}/client/moi`,
    reservations: `${API_BASE_URL}/client/reservations`,
    hide: `${API_BASE_URL}/client/reservations/masquer`,
    requestCancellation: (id) => `${API_BASE_URL}/client/reservations/${id}/annulation`,
    review: (id) => `${API_BASE_URL}/client/reservations/${encodeURIComponent(id)}/avis`,
  },
  companies: {
    signup: `${API_BASE_URL}/entreprises/inscription`,
    verifyEmail: `${API_BASE_URL}/entreprises/verification-email`,
    resendCode: `${API_BASE_URL}/entreprises/verification-email/renvoi`,
    forgotPassword: `${API_BASE_URL}/entreprises/mot-de-passe/oubli`,
    resetPassword: `${API_BASE_URL}/entreprises/mot-de-passe/reinitialisation`,
    // Invitation dans l'équipe d'un partenaire (lien reçu par email)
    invitation: `${API_BASE_URL}/entreprises/invitation`,
    acceptInvitation: `${API_BASE_URL}/entreprises/invitation/acceptation`,
  },
  admin: {
    login: `${API_BASE_URL}/admin/login`,
    me: `${API_BASE_URL}/admin/moi`,
    password: `${API_BASE_URL}/admin/moi/mot-de-passe`,
    companies: `${API_BASE_URL}/admin/plateforme/entreprises`,
    reviews: (chemin = '') => `${API_BASE_URL}/admin/avis${chemin}`,
    // Utilisateurs de la plateforme (comptes du Service client), clients des partenaires
    // Booster de visibilité : partenaire (demandes) et plateforme (activation, tarifs)
    boosters: (chemin = '') => `${API_BASE_URL}/admin/boosters${chemin}`,
    platformBoosters: (chemin = '') => `${API_BASE_URL}/admin/plateforme/boosters${chemin}`,
    // Partenaire : son équipe (plusieurs comptes par entreprise)
    team: (chemin = '') => `${API_BASE_URL}/admin/equipe${chemin}`,
    // Partenaire : ses clients (voyageurs qui ont réservé ses résidences)
    partnerClients: `${API_BASE_URL}/admin/clients`,
    users: (q = '') => `${API_BASE_URL}/admin/plateforme/utilisateurs${q ? `?q=${encodeURIComponent(q)}` : ''}`,
    companyStatus: (id) => `${API_BASE_URL}/admin/plateforme/entreprises/${encodeURIComponent(id)}/statut`,
    // Module financier : plateforme (/finance…) et entreprise (/revenus…)
    finance: (chemin = '') => `${API_BASE_URL}/admin/finance${chemin}`,
    revenus: (chemin = '') => `${API_BASE_URL}/admin/revenus${chemin}`,
    paymentKeys: (id) => `${API_BASE_URL}/admin/paiements/cles/${encodeURIComponent(id)}`,
    residences: `${API_BASE_URL}/admin/residences`,
    residence: (id) => `${API_BASE_URL}/admin/residences/${id}`,
    residenceStatus: (id) => `${API_BASE_URL}/admin/residences/${id}/status`,
    residencePhotos: (id) => `${API_BASE_URL}/admin/residences/${id}/photos`,
    verification: (id) => `${API_BASE_URL}/admin/residences/${id}/verification`,
    verificationFile: (id, f) => `${API_BASE_URL}/admin/residences/${id}/verification/fichiers/${encodeURIComponent(f)}`,
    verifications: (statut) => `${API_BASE_URL}/admin/plateforme/verifications${statut ? `?statut=${encodeURIComponent(statut)}` : ''}`,
    verificationCounters: `${API_BASE_URL}/admin/plateforme/verifications/compteurs`,
    platformVerification: (id) => `${API_BASE_URL}/admin/plateforme/verifications/${id}`,
    platformVerificationFile: (id, f) => `${API_BASE_URL}/admin/plateforme/verifications/${id}/fichiers/${encodeURIComponent(f)}`,
    reports: (tous) => `${API_BASE_URL}/admin/plateforme/signalements${tous ? '?tous=1' : ''}`,
    report: (id) => `${API_BASE_URL}/admin/plateforme/signalements/${encodeURIComponent(id)}`,
    settings: `${API_BASE_URL}/admin/parametres`,
    establishment: `${API_BASE_URL}/admin/etablissement`,
    paymentConfig: `${API_BASE_URL}/admin/paiements/config`,
    paymentMethods: `${API_BASE_URL}/admin/paiements/moyens`,
    paymentMethod: (id) => `${API_BASE_URL}/admin/paiements/moyens/${encodeURIComponent(id)}`,
    stats: (annee) => `${API_BASE_URL}/admin/statistiques?annee=${annee}`,
    exportCsv: (annee) => `${API_BASE_URL}/admin/export/reservations.csv${annee ? `?annee=${annee}` : ''}`,
  },
};

const TOKEN_KEY = 'adminToken';

// localStorage : l'admin reste connecté dans l'application installée (le jeton expire après 8 h)
export const getAdminToken = () => {
  try {
    return localStorage.getItem(TOKEN_KEY) || sessionStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
};

export const setAdminToken = (token) => {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
    sessionStorage.removeItem(TOKEN_KEY); // ancien emplacement
  } catch {
    // stockage indisponible (navigation privée) : la session ne survivra pas au rechargement
  }
};

export class ApiError extends Error {
  constructor(message, status, corps = null) {
    super(message);
    this.status = status;
    this.code = corps?.code || null; // ex. EMAIL_NON_VERIFIE
    this.corps = corps;
  }
}

/**
 * Requête vers l'API. `auth: true` ajoute le jeton admin.
 * Lève une ApiError avec le message renvoyé par le serveur.
 */
// Jeton « Mes réservations » : session du compte client (30 jours) ou accès à une réservation.
// Gardé sur l'appareil pour que le client reste connecté.
const CLIENT_TOKEN_KEY = 'clientToken';

export const getClientToken = () => {
  try {
    return localStorage.getItem(CLIENT_TOKEN_KEY) || sessionStorage.getItem(CLIENT_TOKEN_KEY);
  } catch {
    return null;
  }
};

export const setClientToken = (token) => {
  try {
    sessionStorage.removeItem(CLIENT_TOKEN_KEY); // ancien emplacement
    if (token) localStorage.setItem(CLIENT_TOKEN_KEY, token);
    else localStorage.removeItem(CLIENT_TOKEN_KEY);
  } catch {
    // stockage indisponible : l'accès durera le temps de la page
  }
};

export const apiRequest = async (url, { auth = false, token, body, ...options } = {}) => {
  const headers = { 'Content-Type': 'application/json', ...options.headers };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  } else if (auth) {
    const token = getAdminToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  }

  let response;
  try {
    response = await fetch(url, {
      ...options,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError('Impossible de joindre le serveur. Vérifiez votre connexion et réessayez.', 0);
  }

  let data = null;
  try {
    data = await response.json();
  } catch {
    // réponse vide ou non JSON
  }

  if (!response.ok) {
    throw new ApiError(data?.message || `Erreur du serveur (${response.status})`, response.status, data);
  }
  return data;
};
