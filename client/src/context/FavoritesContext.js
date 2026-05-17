import React, { createContext, useContext, useState, useEffect } from 'react';

const FavoritesContext = createContext();

export const useFavorites = () => {
  const context = useContext(FavoritesContext);
  if (!context) {
    throw new Error('useFavorites must be used within a FavoritesProvider');
  }
  return context;
};

export const FavoritesProvider = ({ children }) => {
  const [favorites, setFavorites] = useState([]);

  // Charger les favoris depuis localStorage au démarrage
  useEffect(() => {
    const savedFavorites = localStorage.getItem('sankofart-favorites');
    if (savedFavorites) {
      setFavorites(JSON.parse(savedFavorites));
    }
  }, []);

  // Sauvegarder les favoris dans localStorage à chaque changement
  useEffect(() => {
    localStorage.setItem('sankofart-favorites', JSON.stringify(favorites));
  }, [favorites]);

  const addToFavorites = (residence) => {
    setFavorites(prev => {
      const exists = prev.find(fav => fav.id === residence.id);
      if (!exists) {
        return [...prev, residence];
      }
      return prev;
    });
  };

  const removeFromFavorites = (residenceId) => {
    setFavorites(prev => prev.filter(fav => fav.id !== residenceId));
  };

  const isFavorite = (residenceId) => {
    return favorites.some(fav => fav.id === residenceId);
  };

  const value = {
    favorites,
    addToFavorites,
    removeFromFavorites,
    isFavorite
  };

  return (
    <FavoritesContext.Provider value={value}>
      {children}
    </FavoritesContext.Provider>
  );
};
