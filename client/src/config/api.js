/**
 * Configuration de l'API Backend
 */

// URL de l'API backend
export const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:5001/api';

// Endpoints
export const API_ENDPOINTS = {
  // Résidences
  residences: {
    getAll: `${API_BASE_URL}/residences`,
    getById: (id) => `${API_BASE_URL}/residences/${id}`,
    search: `${API_BASE_URL}/residences/search`,
    checkAvailability: `${API_BASE_URL}/residences/check-disponibilite`,
  },
  
  // Réservations
  reservations: {
    create: `${API_BASE_URL}/reservations`,
    getById: (id) => `${API_BASE_URL}/reservations/${id}`,
    getAll: `${API_BASE_URL}/reservations`,
    updateStatus: (id) => `${API_BASE_URL}/reservations/${id}/status`,
    getStats: `${API_BASE_URL}/reservations/stats`,
  },
  
  // Admin
  admin: {
    login: `${API_BASE_URL}/admin/login`,
    logout: `${API_BASE_URL}/admin/logout`,
    getStats: `${API_BASE_URL}/admin/stats`,
    updateResidenceStatus: (id) => `${API_BASE_URL}/admin/residences/${id}/status`,
    updateResidence: (id) => `${API_BASE_URL}/admin/residences/${id}`,
    getAllResidences: `${API_BASE_URL}/admin/residences`,
  }
};

// Options par défaut pour les requêtes
export const DEFAULT_HEADERS = {
  'Content-Type': 'application/json',
};

// Helper pour les requêtes API
export const apiRequest = async (url, options = {}) => {
  try {
    const response = await fetch(url, {
      ...options,
      headers: {
        ...DEFAULT_HEADERS,
        ...options.headers,
      },
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.message || 'Erreur lors de la requête API');
    }

    return data;
  } catch (error) {
    console.error('Erreur API:', error);
    throw error;
  }
};

