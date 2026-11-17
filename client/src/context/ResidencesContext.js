import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { API_ENDPOINTS, apiRequest, getAdminToken, setAdminToken } from '../config/api';
import { fromApiResidence, toApiResidence } from '../config/mappers';
import { residences as fallbackResidences } from '../data/residences';

const ResidencesContext = createContext();

export const useResidences = () => {
  const context = useContext(ResidencesContext);
  if (!context) {
    throw new Error('useResidences must be used within a ResidencesProvider');
  }
  return context;
};

export const ResidencesProvider = ({ children }) => {
  const [residences, setResidences] = useState([]);
  const [loading, setLoading] = useState(true);
  // true quand l'API est injoignable : on affiche le catalogue local, en lecture seule
  const [offline, setOffline] = useState(false);
  const [isAdmin, setIsAdmin] = useState(() => Boolean(getAdminToken()));

  // Déconnecte l'admin si le serveur refuse le jeton (expiré ou invalide)
  const adminRequest = useCallback(async (url, options = {}) => {
    try {
      return await apiRequest(url, { ...options, auth: true });
    } catch (error) {
      if (error.status === 401) {
        setAdminToken(null);
        setIsAdmin(false);
      }
      throw error;
    }
  }, []);

  const loadResidences = useCallback(async () => {
    setLoading(true);
    try {
      const response = isAdmin
        ? await adminRequest(API_ENDPOINTS.admin.residences)
        : await apiRequest(API_ENDPOINTS.residences.getAll);
      setResidences(response.data.map(fromApiResidence));
      setOffline(false);
    } catch (error) {
      console.error('Chargement des résidences impossible, catalogue local utilisé :', error.message);
      setResidences(fallbackResidences);
      setOffline(true);
    } finally {
      setLoading(false);
    }
  }, [isAdmin, adminRequest]);

  useEffect(() => {
    loadResidences();
  }, [loadResidences]);

  // ---------- Public ----------

  const getResidenceById = useCallback(
    (id) => residences.find(r => r.id === parseInt(id, 10)),
    [residences]
  );

  const searchResidences = useCallback((query, filters = {}) => {
    let results = residences.filter(r => r.active !== false);
    const has = (v) => v !== undefined && v !== null && v !== '';

    if (has(query) && query.trim()) {
      const term = query.trim().toLowerCase();
      results = results.filter(r =>
        [r.name, r.city, r.neighborhood, r.location, r.type].some(v => v && v.toLowerCase().includes(term))
      );
    }
    if (has(filters.priceMin)) results = results.filter(r => r.price >= parseInt(filters.priceMin, 10));
    if (has(filters.priceMax)) results = results.filter(r => r.price <= parseInt(filters.priceMax, 10));
    if (has(filters.bedrooms)) results = results.filter(r => r.bedrooms >= parseInt(filters.bedrooms, 10));
    if (has(filters.city)) results = results.filter(r => r.city === filters.city);
    if (has(filters.availability)) results = results.filter(r => r.availability.status === filters.availability);

    return results;
  }, [residences]);

  // Envoie une réservation. Retourne { reference, prixTotal, emailEnvoye }.
  const createReservation = useCallback(async (residenceId, data) => {
    const response = await apiRequest(API_ENDPOINTS.reservations.create, {
      method: 'POST',
      body: {
        residenceId,
        nom: data.lastName,
        prenom: data.firstName,
        email: data.email,
        telephone: data.phone,
        dateArrivee: data.arrivalDate,
        dateDepart: data.departureDate,
        nombrePersonnes: Number(data.guests),
        notes: data.specialRequests || '',
      },
    });
    return response.data;
  }, []);

  // ---------- Administration ----------

  const loginAdmin = useCallback(async (username, password) => {
    try {
      const response = await apiRequest(API_ENDPOINTS.admin.login, {
        method: 'POST',
        body: { username, password },
      });
      setAdminToken(response.data.token);
      setIsAdmin(true);
      return { success: true };
    } catch (error) {
      return { success: false, message: error.message };
    }
  }, []);

  const logoutAdmin = useCallback(() => {
    setAdminToken(null);
    setIsAdmin(false);
  }, []);

  // Remplace une résidence dans la liste après une modification côté serveur
  const replaceResidence = (updated) => {
    const mapped = fromApiResidence(updated);
    setResidences(prev => prev.map(r => (r.id === mapped.id ? mapped : r)));
  };

  const updateResidenceStatus = useCallback(async (residenceId, status, details = {}) => {
    const response = await adminRequest(API_ENDPOINTS.admin.residenceStatus(residenceId), {
      method: 'PUT',
      body: {
        statut: status,
        details: {
          occupant: details.currentOccupant || null,
          arrivee: details.checkIn || null,
          depart: details.checkOut || null,
          prochaineDisponibilite: details.nextAvailable || null,
        },
      },
    });
    replaceResidence(response.data);
  }, [adminRequest]);

  const addResidence = useCallback(async (residence) => {
    const response = await adminRequest(API_ENDPOINTS.admin.residences, {
      method: 'POST',
      body: toApiResidence(residence),
    });
    setResidences(prev => [...prev, fromApiResidence(response.data)]);
  }, [adminRequest]);

  const updateResidence = useCallback(async (residenceId, residence) => {
    const response = await adminRequest(API_ENDPOINTS.admin.residence(residenceId), {
      method: 'PUT',
      body: toApiResidence(residence),
    });
    replaceResidence(response.data);
  }, [adminRequest]);

  const deleteResidence = useCallback(async (residenceId) => {
    await adminRequest(API_ENDPOINTS.admin.residence(residenceId), { method: 'DELETE' });
    setResidences(prev => prev.filter(r => r.id !== residenceId));
  }, [adminRequest]);

  const getReservations = useCallback(async () => {
    const response = await adminRequest(API_ENDPOINTS.reservations.getAll);
    return response.data;
  }, [adminRequest]);

  const updateReservationStatus = useCallback(async (reservationId, statut) => {
    const response = await adminRequest(API_ENDPOINTS.reservations.updateStatus(reservationId), {
      method: 'PUT',
      body: { statut },
    });
    return response.data;
  }, [adminRequest]);

  const value = useMemo(() => ({
    residences,
    loading,
    offline,
    isAdmin,
    reloadResidences: loadResidences,
    getResidenceById,
    searchResidences,
    createReservation,
    loginAdmin,
    logoutAdmin,
    updateResidenceStatus,
    addResidence,
    updateResidence,
    deleteResidence,
    getReservations,
    updateReservationStatus,
  }), [
    residences, loading, offline, isAdmin, loadResidences, getResidenceById, searchResidences,
    createReservation, loginAdmin, logoutAdmin, updateResidenceStatus, addResidence,
    updateResidence, deleteResidence, getReservations, updateReservationStatus,
  ]);

  return (
    <ResidencesContext.Provider value={value}>
      {children}
    </ResidencesContext.Provider>
  );
};
