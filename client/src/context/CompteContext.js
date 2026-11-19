import { createContext, useContext } from 'react';

/**
 * Compte connecté au back-office : { superAdmin, utilisateur, entreprise: { id, nom, statut, principale } }.
 * Fourni par AdminLayout (null pendant le chargement).
 */
export const CompteContext = createContext({ compte: null, recharger: () => {} });

export const useCompte = () => useContext(CompteContext);
