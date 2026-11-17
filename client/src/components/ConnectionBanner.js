import React, { useEffect, useState } from 'react';
import { useResidences } from '../context/ResidencesContext';
import './ConnectionBanner.css';

/**
 * Informe le visiteur quand le serveur met du temps à répondre
 * (réveil de l'hébergement gratuit) ou qu'il est injoignable.
 */
const ConnectionBanner = () => {
  const { loading, offline, reloadResidences } = useResidences();
  const [slow, setSlow] = useState(false);

  // N'afficher « connexion en cours » qu'au-delà de 3 secondes
  useEffect(() => {
    if (!loading) {
      setSlow(false);
      return undefined;
    }
    const timer = setTimeout(() => setSlow(true), 3000);
    return () => clearTimeout(timer);
  }, [loading]);

  if (loading && slow) {
    return (
      <div className="connection-banner info" role="status">
        <span className="connection-spinner" aria-hidden="true" />
        Connexion au serveur en cours… cela peut prendre jusqu'à une minute.
      </div>
    );
  }

  if (!loading && offline) {
    return (
      <div className="connection-banner warning" role="alert">
        Le serveur ne répond pas : vous consultez un aperçu du catalogue, la réservation est momentanément indisponible.
        <button type="button" onClick={reloadResidences}>Réessayer</button>
      </div>
    );
  }

  return null;
};

export default ConnectionBanner;
