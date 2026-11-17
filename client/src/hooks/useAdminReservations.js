import { useCallback, useEffect, useState } from 'react';
import { useResidences } from '../context/ResidencesContext';

/**
 * Réservations pour le back-office, avec les compteurs « à traiter ».
 * Se recharge quand les résidences changent (action admin).
 */
export default function useAdminReservations() {
  const { getReservations, residences } = useResidences();
  const [reservations, setReservations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const recharger = useCallback(async () => {
    try {
      setReservations(await getReservations());
      setError('');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [getReservations]);

  useEffect(() => {
    recharger();
  }, [recharger, residences]);

  const demandes = reservations.filter(r => r.demandeAnnulation?.statut === 'en_attente');
  const enAttente = reservations.filter(r => r.statut === 'en_attente');

  return { reservations, demandes, enAttente, aTraiter: demandes.length + enAttente.length, loading, error, recharger };
}
