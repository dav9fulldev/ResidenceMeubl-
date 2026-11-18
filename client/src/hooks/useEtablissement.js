import { useEffect, useState } from 'react';
import { API_ENDPOINTS } from '../config/api';

// Valeurs affichées tant que l'API n'a pas répondu (ou si elle est injoignable)
export const ETABLISSEMENT_DEFAUT = {
  nom: 'Sankofart Résidence',
  slogan: 'Résidences meublées d\'exception à Abidjan',
  telephone: '+225 27 22 49 28 90',
  whatsapp: '',
  email: 'contact@sankofart-residence.com',
  adresse: 'Abidjan, Côte d\'Ivoire',
  facebook: '', instagram: '', tiktok: '', x: '',
  acompte: { pourcentage: 30, remboursementPourcentage: 50, integralJours: 5, avantArriveeJours: 3 },
};

let cache = null;
let enCours = null;

function charger() {
  if (!enCours) {
    enCours = fetch(API_ENDPOINTS.establishment)
      .then(r => (r.ok ? r.json() : null))
      .then(j => { cache = { ...ETABLISSEMENT_DEFAUT, ...(j?.data || {}) }; return cache; })
      .catch(() => { enCours = null; return ETABLISSEMENT_DEFAUT; });
  }
  return enCours;
}

/** Identité publique de l'établissement (coordonnées, réseaux, règles d'acompte), chargée une fois. */
export default function useEtablissement() {
  const [etab, setEtab] = useState(cache || ETABLISSEMENT_DEFAUT);
  useEffect(() => {
    let actif = true;
    charger().then(v => { if (actif) setEtab(v); });
    return () => { actif = false; };
  }, []);
  return etab;
}
