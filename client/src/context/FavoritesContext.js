import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { API_ENDPOINTS, apiRequest, getClientToken } from '../config/api';
import { useResidences } from './ResidencesContext';

const FavoritesContext = createContext();

export const useFavorites = () => {
  const context = useContext(FavoritesContext);
  if (!context) {
    throw new Error('useFavorites must be used within a FavoritesProvider');
  }
  return context;
};

const CLE = 'babi-favoris';
const ANCIENNE_CLE = 'sankofart-favorites'; // anciens favoris : résidences complètes enregistrées telles quelles

/** Identifiants enregistrés sur l'appareil (reprend les anciens favoris une fois). */
const lireLocal = () => {
  try {
    const brut = localStorage.getItem(CLE);
    if (brut) return JSON.parse(brut).map(String);
    const ancien = localStorage.getItem(ANCIENNE_CLE);
    return ancien ? JSON.parse(ancien).map(r => String(r?.id ?? r)).filter(Boolean) : [];
  } catch {
    return [];
  }
};

const ecrireLocal = (ids) => {
  try {
    localStorage.setItem(CLE, JSON.stringify(ids));
    localStorage.removeItem(ANCIENNE_CLE);
  } catch {
    // stockage indisponible (navigation privée) : favoris gardés le temps de la visite
  }
};

/**
 * Favoris du voyageur : identifiants des résidences, enregistrés sur l'appareil et,
 * quand il est connecté à son compte, retrouvés sur tous ses appareils (fusion des deux listes).
 * Les résidences affichées sont toujours celles du catalogue à jour (prix, disponibilité).
 */
export const FavoritesProvider = ({ children }) => {
  const { residences } = useResidences();
  const [ids, setIds] = useState(lireLocal);
  const synchronise = useRef(false); // la liste du compte a été lue : les changements y sont enregistrés
  const [surCompte, setSurCompte] = useState(false);

  // Compte connecté : fusion avec ses favoris, puis enregistrement de la liste commune
  const synchroniser = useCallback(async () => {
    const token = getClientToken();
    if (!token) { synchronise.current = false; setSurCompte(false); return; }
    try {
      const r = await apiRequest(API_ENDPOINTS.client.favorites, { token });
      const distants = r.data || [];
      setIds(locaux => {
        const fusion = [...new Set([...locaux, ...distants])];
        if (fusion.length !== distants.length) {
          apiRequest(API_ENDPOINTS.client.favorites, { method: 'PUT', token, body: { ids: fusion } }).catch(() => {});
        }
        return fusion;
      });
      synchronise.current = true;
      setSurCompte(true);
    } catch {
      synchronise.current = false;
      setSurCompte(false); // accès limité à une réservation, session expirée ou hors ligne
    }
  }, []);

  useEffect(() => {
    synchroniser();
    // Connexion dans un autre onglet, ou retour sur l'onglet après s'être connecté
    const auRetour = () => { if (document.visibilityState === 'visible') synchroniser(); };
    window.addEventListener('storage', synchroniser);
    document.addEventListener('visibilitychange', auRetour);
    return () => {
      window.removeEventListener('storage', synchroniser);
      document.removeEventListener('visibilitychange', auRetour);
    };
  }, [synchroniser]);

  const changer = useCallback((maj) => {
    setIds(avant => {
      const apres = maj(avant);
      if (apres === avant) return avant;
      ecrireLocal(apres);
      const token = getClientToken();
      if (token && synchronise.current) {
        apiRequest(API_ENDPOINTS.client.favorites, { method: 'PUT', token, body: { ids: apres } }).catch(() => {});
      }
      return apres;
    });
  }, []);

  useEffect(() => { ecrireLocal(ids); }, [ids]);

  const addToFavorites = useCallback((residence) => {
    const id = String(residence?.id ?? residence);
    changer(avant => (avant.includes(id) ? avant : [...avant, id]));
  }, [changer]);

  const removeFromFavorites = useCallback((residenceId) => {
    const id = String(residenceId);
    changer(avant => (avant.includes(id) ? avant.filter(x => x !== id) : avant));
  }, [changer]);

  const isFavorite = useCallback((residenceId) => ids.includes(String(residenceId)), [ids]);

  // Résidences à jour, dans l'ordre d'ajout ; celles qui ne sont plus proposées n'apparaissent pas
  const favorites = useMemo(() => {
    const parId = new Map((residences || []).map(r => [String(r.id), r]));
    return ids.map(id => parId.get(id)).filter(Boolean);
  }, [ids, residences]);

  const value = useMemo(() => ({
    favorites, favoriteIds: ids, addToFavorites, removeFromFavorites, isFavorite, synchroniser, surCompte,
  }), [favorites, ids, addToFavorites, removeFromFavorites, isFavorite, synchroniser, surCompte]);

  return (
    <FavoritesContext.Provider value={value}>
      {children}
    </FavoritesContext.Provider>
  );
};
