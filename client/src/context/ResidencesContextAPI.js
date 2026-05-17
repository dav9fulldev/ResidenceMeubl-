import React, { createContext, useContext, useState, useEffect } from 'react';
import { API_ENDPOINTS, apiRequest } from '../config/api';
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
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [useBackend, setUseBackend] = useState(true); // Toggle backend/local

  // Vérifier l'authentification admin au démarrage
  useEffect(() => {
    const adminStatus = localStorage.getItem('isAdmin');
    if (adminStatus === 'true') {
      setIsAdmin(true);
    }
  }, []);

  // Charger les résidences depuis l'API ou local
  useEffect(() => {
    const loadResidences = async () => {
      if (useBackend) {
        try {
          setLoading(true);
          const response = await apiRequest(API_ENDPOINTS.residences.getAll);
          
          if (response.success && response.data) {
            // Mapper les propriétés du backend vers le frontend
            const mappedResidences = response.data.map(r => ({
              id: r.id,
              name: r.nom,
              reference: r.reference,
              type: r.typeAppartement,
              description: r.description,
              location: r.localisation,
              city: r.ville,
              neighborhood: r.quartier,
              price: r.prix,
              currency: 'FCFA',
              period: 'nuit',
              bedrooms: r.nombreChambres,
              bathrooms: Math.ceil(r.nombreChambres / 2),
              maxGuests: r.capacite,
              rating: 4.5,
              available: r.availability?.status === 'disponible',
              images: r.photos,
              amenities: r.equipements || r.amenities || [],
              availability: r.availability || {
                status: 'disponible',
                nextAvailable: null,
                currentOccupant: null,
                checkIn: null,
                checkOut: null
              }
            }));
            setResidences(mappedResidences);
          } else {
            throw new Error('Format de réponse invalide');
          }
        } catch (error) {
          console.error('❌ Erreur lors du chargement des résidences depuis l\'API:', error);
          console.log('📦 Utilisation des données locales en fallback');
          setResidences(fallbackResidences);
          setUseBackend(false);
        } finally {
          setLoading(false);
        }
      } else {
        // Mode local
        const savedResidences = localStorage.getItem('residences');
        if (savedResidences) {
          setResidences(JSON.parse(savedResidences));
        } else {
          setResidences(fallbackResidences);
        }
        setLoading(false);
      }
    };

    loadResidences();
  }, [useBackend]);

  // Sauvegarder dans localStorage en mode local
  useEffect(() => {
    if (!useBackend && residences.length > 0) {
      localStorage.setItem('residences', JSON.stringify(residences));
    }
  }, [residences, useBackend]);

  // Login admin
  const loginAdmin = async (username, password) => {
    if (useBackend) {
      try {
        const response = await apiRequest(API_ENDPOINTS.admin.login, {
          method: 'POST',
          body: JSON.stringify({ username, password }),
        });

        if (response.success) {
          setIsAdmin(true);
          localStorage.setItem('isAdmin', 'true');
          localStorage.setItem('adminToken', response.data.token);
          return { success: true };
        }
        return { success: false, message: response.message };
      } catch (error) {
        return { success: false, message: error.message };
      }
    } else {
      // Mode local
      if (username === 'admin' && password === 'sankofart2024') {
        setIsAdmin(true);
        localStorage.setItem('isAdmin', 'true');
        return { success: true };
      }
      return { success: false, message: 'Identifiants incorrects' };
    }
  };

  // Logout admin
  const logoutAdmin = async () => {
    if (useBackend) {
      try {
        await apiRequest(API_ENDPOINTS.admin.logout, {
          method: 'POST',
        });
      } catch (error) {
        console.error('Erreur lors de la déconnexion:', error);
      }
    }
    setIsAdmin(false);
    localStorage.removeItem('isAdmin');
    localStorage.removeItem('adminToken');
  };

  // Réserver une résidence
  const reserveResidence = async (residenceId, reservationData) => {
    if (useBackend) {
      try {
        // Créer la réservation via l'API
        await apiRequest(API_ENDPOINTS.reservations.create, {
          method: 'POST',
          body: JSON.stringify({
            residenceId,
            nom: reservationData.lastName,
            prenom: reservationData.firstName,
            email: reservationData.email,
            telephone: reservationData.phone,
            dateArrivee: reservationData.checkIn,
            dateDepart: reservationData.checkOut,
            nombrePersonnes: reservationData.guests,
            pieceIdentite: reservationData.idNumber,
            notes: reservationData.notes || ''
          }),
        });

        // Mettre à jour le statut via l'API admin
        const residence = residences.find(r => r.id === residenceId);
        if (residence) {
          await apiRequest(API_ENDPOINTS.admin.updateResidenceStatus(residenceId), {
            method: 'PUT',
            body: JSON.stringify({
              status: 'réservé',
              details: {
                reservedFrom: reservationData.checkIn,
                reservedUntil: reservationData.checkOut
              }
            }),
          });
        }

        // Recharger les résidences
        const response = await apiRequest(API_ENDPOINTS.residences.getAll);
        if (response.success) {
          const mappedResidences = response.data.map(r => ({
            id: r.id,
            name: r.nom,
            type: r.typeAppartement,
            location: r.localisation,
            price: r.prix,
            bedrooms: r.nombreChambres,
            images: r.photos,
            availability: r.availability
          }));
          setResidences(mappedResidences);
        }
      } catch (error) {
        console.error('Erreur lors de la réservation:', error);
        throw error;
      }
    } else {
      // Mode local
      setResidences(prev => prev.map(residence => {
        if (residence.id === residenceId) {
          return {
            ...residence,
            available: false,
            availability: {
              status: 'réservé',
              nextAvailable: reservationData.checkOut,
              currentOccupant: `${reservationData.firstName} ${reservationData.lastName}`,
              checkIn: reservationData.checkIn,
              checkOut: reservationData.checkOut
            }
          };
        }
        return residence;
      }));
    }
  };

  // Mettre à jour le statut d'une résidence (admin)
  const updateResidenceStatus = async (residenceId, newStatus, additionalData = {}) => {
    if (useBackend) {
      try {
        const response = await apiRequest(API_ENDPOINTS.admin.updateResidenceStatus(residenceId), {
          method: 'PUT',
          body: JSON.stringify({
            status: newStatus,
            details: additionalData
          }),
        });

        if (response.success) {
          // Recharger les résidences
          const listResponse = await apiRequest(API_ENDPOINTS.residences.getAll);
          if (listResponse.success) {
            const mappedResidences = listResponse.data.map(r => ({
              id: r.id,
              name: r.nom,
              reference: r.reference,
              type: r.typeAppartement,
              description: r.description,
              location: r.localisation,
              city: r.ville,
              neighborhood: r.quartier,
              price: r.prix,
              currency: 'FCFA',
              period: 'nuit',
              bedrooms: r.nombreChambres,
              bathrooms: Math.ceil(r.nombreChambres / 2),
              maxGuests: r.capacite,
              rating: 4.5,
              available: r.availability?.status === 'disponible',
              images: r.photos,
              amenities: r.equipements || r.amenities || [],
              availability: r.availability
            }));
            setResidences(mappedResidences);
          }
        }
      } catch (error) {
        console.error('Erreur lors de la mise à jour du statut:', error);
        throw error;
      }
    } else {
      // Mode local
      setResidences(prev => prev.map(residence => {
        if (residence.id === residenceId) {
          let availability = { ...residence.availability };
          
          switch (newStatus) {
            case 'disponible':
              availability = {
                status: 'disponible',
                nextAvailable: null,
                currentOccupant: null,
                checkIn: null,
                checkOut: null
              };
              break;
            case 'occupé':
              availability = {
                status: 'occupé',
                nextAvailable: additionalData.occupiedUntil || null,
                currentOccupant: additionalData.occupantName || 'Occupé',
                checkIn: additionalData.checkIn || null,
                checkOut: additionalData.occupiedUntil || null
              };
              break;
            case 'réservé':
              availability = {
                status: 'réservé',
                nextAvailable: additionalData.reservedUntil || null,
                currentOccupant: additionalData.reservedBy || 'Réservé',
                checkIn: additionalData.reservedFrom || null,
                checkOut: additionalData.reservedUntil || null
              };
              break;
            case 'maintenance':
              availability = {
                status: 'maintenance',
                nextAvailable: additionalData.nextAvailable || null,
                maintenanceReason: additionalData.maintenanceReason || 'En maintenance',
                checkIn: null,
                checkOut: null
              };
              break;
            default:
              break;
          }

          return {
            ...residence,
            available: newStatus === 'disponible',
            availability
          };
        }
        return residence;
      }));
    }
  };

  // Libérer une résidence
  const releaseResidence = (residenceId) => {
    updateResidenceStatus(residenceId, 'disponible', {});
  };

  // Obtenir une résidence par ID
  const getResidenceById = (id) => {
    return residences.find(r => r.id === parseInt(id));
  };

  // Rechercher des résidences
  const searchResidences = (filters) => {
    let filtered = [...residences];

    // Filtre par recherche (nom, localisation, ville, quartier)
    if (filters.search && filters.search.trim()) {
      const search = filters.search.toLowerCase();
      filtered = filtered.filter(r =>
        (r.name && r.name.toLowerCase().includes(search)) ||
        (r.location && r.location.toLowerCase().includes(search)) ||
        (r.city && r.city.toLowerCase().includes(search)) ||
        (r.neighborhood && r.neighborhood.toLowerCase().includes(search)) ||
        (r.type && r.type.toLowerCase().includes(search))
      );
    }

    // Filtre par localisation
    if (filters.location && filters.location.trim()) {
      const location = filters.location.toLowerCase();
      filtered = filtered.filter(r =>
        (r.location && r.location.toLowerCase().includes(location)) ||
        (r.city && r.city.toLowerCase().includes(location)) ||
        (r.neighborhood && r.neighborhood.toLowerCase().includes(location))
      );
    }

    // Filtre par type
    if (filters.type && filters.type.trim()) {
      filtered = filtered.filter(r => r.type && r.type === filters.type);
    }

    // Filtre par prix
    if (filters.priceMin !== undefined && filters.priceMin !== null && filters.priceMin !== '') {
      const priceMin = parseInt(filters.priceMin);
      if (!isNaN(priceMin)) {
        filtered = filtered.filter(r => r.price >= priceMin);
      }
    }

    if (filters.priceMax !== undefined && filters.priceMax !== null && filters.priceMax !== '') {
      const priceMax = parseInt(filters.priceMax);
      if (!isNaN(priceMax)) {
        filtered = filtered.filter(r => r.price <= priceMax);
      }
    }

    // Filtre par nombre de chambres
    if (filters.bedrooms !== undefined && filters.bedrooms !== null && filters.bedrooms !== '') {
      const bedrooms = parseInt(filters.bedrooms);
      if (!isNaN(bedrooms)) {
        filtered = filtered.filter(r => r.bedrooms >= bedrooms);
      }
    }

    // Filtre par disponibilité
    if (filters.availability && filters.availability.trim()) {
      filtered = filtered.filter(r => r.availability?.status === filters.availability);
    }

    return filtered;
  };

  const value = {
    residences,
    loading,
    useBackend,
    setUseBackend,
    isAdmin,
    loginAdmin,
    logoutAdmin,
    reserveResidence,
    releaseResidence,
    updateResidenceStatus,
    getResidenceById,
    searchResidences,
  };

  return (
    <ResidencesContext.Provider value={value}>
      {children}
    </ResidencesContext.Provider>
  );
};

