/**
 * Configuration de l'API Backend
 * L'URL vient de REACT_APP_API_URL (client/.env en local, variables d'environnement sur Vercel).
 */
export const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:5001/api';

export const API_ENDPOINTS = {
  residences: {
    getAll: `${API_BASE_URL}/residences`,
    getById: (id) => `${API_BASE_URL}/residences/${id}`,
    checkAvailability: `${API_BASE_URL}/residences/check-disponibilite`,
  },
  reservations: {
    create: `${API_BASE_URL}/reservations`,
    getAll: `${API_BASE_URL}/reservations`,
    updateStatus: (id) => `${API_BASE_URL}/reservations/${id}/status`,
  },
  admin: {
    login: `${API_BASE_URL}/admin/login`,
    residences: `${API_BASE_URL}/admin/residences`,
    residence: (id) => `${API_BASE_URL}/admin/residences/${id}`,
    residenceStatus: (id) => `${API_BASE_URL}/admin/residences/${id}/status`,
  },
};

const TOKEN_KEY = 'adminToken';

export const getAdminToken = () => {
  try {
    return sessionStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
};

export const setAdminToken = (token) => {
  try {
    if (token) sessionStorage.setItem(TOKEN_KEY, token);
    else sessionStorage.removeItem(TOKEN_KEY);
  } catch {
    // stockage indisponible (navigation privée) : la session ne survivra pas au rechargement
  }
};

export class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

/**
 * Requête vers l'API. `auth: true` ajoute le jeton admin.
 * Lève une ApiError avec le message renvoyé par le serveur.
 */
export const apiRequest = async (url, { auth = false, body, ...options } = {}) => {
  const headers = { 'Content-Type': 'application/json', ...options.headers };
  if (auth) {
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
    throw new ApiError(data?.message || `Erreur du serveur (${response.status})`, response.status);
  }
  return data;
};
