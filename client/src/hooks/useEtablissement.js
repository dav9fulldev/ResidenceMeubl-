import { useEffect, useState } from 'react';
import { API_ENDPOINTS } from '../config/api';

// Tant que l'API n'a pas répondu : le nom de la marque seulement. Coordonnées, réseaux et
// slogan viennent de la base (Paramètres) ; un champ vide n'est pas affiché.
export const ETABLISSEMENT_DEFAUT = {
  nom: 'BABI RESIDENCE',
  slogan: '',
  telephone: '',
  whatsapp: '',
  email: '',
  adresse: '',
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
