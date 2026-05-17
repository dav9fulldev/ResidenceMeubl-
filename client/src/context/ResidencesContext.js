import React, { createContext, useContext, useState, useEffect } from 'react';
import { residences as initialResidences } from '../data/residences';

const ResidencesContext = createContext();

export const useResidences = () => {
  const context = useContext(ResidencesContext);
  if (!context) {
    throw new Error('useResidences must be used within a ResidencesProvider');
  }
  return context;
};

export const ResidencesProvider = ({ children }) => {
  const [residences, setResidences] = useState(initialResidences);
  const [isAdmin, setIsAdmin] = useState(false); // Mode administrateur

  // Charger les données depuis localStorage au démarrage
  useEffect(() => {
    const savedResidences = localStorage.getItem('residences');
    if (savedResidences) {
      setResidences(JSON.parse(savedResidences));
    }
  }, []);

  // Sauvegarder les changements dans localStorage
  useEffect(() => {
    localStorage.setItem('residences', JSON.stringify(residences));
  }, [residences]);

  // Fonction pour réserver une résidence
  const reserveResidence = (residenceId, reservationData) => {
    setResidences(prev => prev.map(residence => {
      if (residence.id === residenceId) {
        return {
          ...residence,
          available: false,
          availability: {
            status: 'réservé',
            nextAvailable: reservationData.checkOut,
            currentOccupant: reservationData.fullName,
            checkIn: reservationData.checkIn,
            checkOut: reservationData.checkOut,
            minStay: residence.availability.minStay,
            maxStay: residence.availability.maxStay
          }
        };
      }
      return residence;
    }));
  };

  // Fonction pour libérer une résidence (check-out)
  const releaseResidence = (residenceId) => {
    setResidences(prev => prev.map(residence => {
      if (residence.id === residenceId) {
        return {
          ...residence,
          available: true,
          availability: {
            status: 'disponible',
            nextAvailable: null,
            currentOccupant: null,
            checkIn: null,
            checkOut: null,
            minStay: residence.availability.minStay,
            maxStay: residence.availability.maxStay
          }
        };
      }
      return residence;
    }));
  };

  // Fonction pour changer manuellement le statut (admin)
  const updateResidenceStatus = (residenceId, newStatus, additionalData = {}) => {
    setResidences(prev => prev.map(residence => {
      if (residence.id === residenceId) {
        let availability;
        
        switch (newStatus) {
          case 'disponible':
            availability = {
              status: 'disponible',
              nextAvailable: null,
              currentOccupant: null,
              checkIn: null,
              checkOut: null,
              minStay: residence.availability.minStay,
              maxStay: residence.availability.maxStay
            };
            break;
          case 'occupé':
            availability = {
              status: 'occupé',
              nextAvailable: additionalData.nextAvailable || null,
              currentOccupant: additionalData.currentOccupant || 'Occupant actuel',
              checkIn: additionalData.checkIn || new Date().toISOString().split('T')[0],
              checkOut: additionalData.checkOut || null,
              minStay: residence.availability.minStay,
              maxStay: residence.availability.maxStay
            };
            break;
          case 'réservé':
            availability = {
              status: 'réservé',
              nextAvailable: additionalData.nextAvailable || null,
              currentOccupant: additionalData.currentOccupant || 'Client réservé',
              checkIn: additionalData.checkIn || null,
              checkOut: additionalData.checkOut || null,
              minStay: residence.availability.minStay,
              maxStay: residence.availability.maxStay
            };
            break;
          case 'maintenance':
            availability = {
              status: 'maintenance',
              nextAvailable: additionalData.nextAvailable || null,
              currentOccupant: null,
              checkIn: null,
              checkOut: null,
              minStay: residence.availability.minStay,
              maxStay: residence.availability.maxStay
            };
            break;
          default:
            availability = {
              status: 'disponible',
              nextAvailable: null,
              currentOccupant: null,
              checkIn: null,
              checkOut: null,
              minStay: residence.availability.minStay,
              maxStay: residence.availability.maxStay
            };
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
  };

  // Fonction pour basculer le mode administrateur
  const toggleAdminMode = () => {
    setIsAdmin(prev => !prev);
  };

  // Fonction pour se connecter en tant qu'admin
  const loginAdmin = () => {
    setIsAdmin(true);
    localStorage.setItem('adminAuthenticated', 'true');
  };

  // Fonction pour se déconnecter
  const logoutAdmin = () => {
    setIsAdmin(false);
    localStorage.removeItem('adminAuthenticated');
  };

  // Vérifier l'authentification au démarrage
  useEffect(() => {
    const isAuthenticated = localStorage.getItem('adminAuthenticated') === 'true';
    if (isAuthenticated) {
      setIsAdmin(true);
    }
  }, []);

  // Fonction pour récupérer une résidence par ID
  const getResidenceById = (id) => {
    return residences.find(residence => residence.id === parseInt(id));
  };

  // Fonction pour rechercher des résidences
  const searchResidences = (query, filters = {}) => {
    let results = [...residences];

    // Recherche par nom, ville ou quartier
    if (query && query.trim() !== '') {
      const searchTerm = query.toLowerCase();
      results = results.filter(residence => 
        residence.name.toLowerCase().includes(searchTerm) ||
        residence.city.toLowerCase().includes(searchTerm) ||
        residence.neighborhood.toLowerCase().includes(searchTerm)
      );
    }

    // Filtres - seulement si les valeurs sont définies et non vides
    if (filters.priceMin !== undefined && filters.priceMin !== '' && filters.priceMin !== null) {
      results = results.filter(residence => residence.price >= parseInt(filters.priceMin));
    }
    if (filters.priceMax !== undefined && filters.priceMax !== '' && filters.priceMax !== null) {
      results = results.filter(residence => residence.price <= parseInt(filters.priceMax));
    }
    if (filters.bedrooms && filters.bedrooms !== '') {
      results = results.filter(residence => residence.bedrooms >= parseInt(filters.bedrooms));
    }
    if (filters.city && filters.city !== '') {
      results = results.filter(residence => residence.city === filters.city);
    }
    if (filters.availability && filters.availability !== '') {
      results = results.filter(residence => residence.availability.status === filters.availability);
    }

    return results;
  };

  // Fonction pour ajouter une nouvelle résidence
  const addResidence = (newResidence) => {
    setResidences(prev => [...prev, newResidence]);
  };

  // Fonction pour supprimer une résidence
  const deleteResidence = (residenceId) => {
    if (window.confirm('Êtes-vous sûr de vouloir supprimer cette résidence ?')) {
      setResidences(prev => prev.filter(residence => residence.id !== residenceId));
    }
  };

  // Fonction pour mettre à jour une résidence existante
  const updateResidence = (residenceId, updatedData) => {
    setResidences(prev => prev.map(residence => 
      residence.id === residenceId 
        ? { ...residence, ...updatedData }
        : residence
    ));
  };

  const value = {
    residences,
    isAdmin,
    reserveResidence,
    releaseResidence,
    updateResidenceStatus,
    addResidence,
    deleteResidence,
    updateResidence,
    toggleAdminMode,
    loginAdmin,
    logoutAdmin,
    getResidenceById,
    searchResidences
  };

  return (
    <ResidencesContext.Provider value={value}>
      {children}
    </ResidencesContext.Provider>
  );
};
