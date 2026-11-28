import React, { useEffect, useState } from 'react';
import { FaBell, FaCheckCircle } from 'react-icons/fa';
import { API_ENDPOINTS, apiRequest } from '../config/api';
import './AlerteDisponibilite.css';

const jourLong = (j) => new Date(`${j}T00:00:00Z`).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', timeZone: 'UTC' });

/**
 * Fiche d'une résidence : quand les dates choisies sont déjà prises, le voyageur peut demander
 * à être prévenu par email si elles se libèrent (annulation, refus d'une demande).
 */
const AlerteDisponibilite = ({ residenceId, arrivee, depart }) => {
  const [libre, setLibre] = useState(null); // null : pas encore vérifié
  const [email, setEmail] = useState('');
  const [etat, setEtat] = useState({ envoi: false, ok: '', erreur: '' });

  useEffect(() => {
    setLibre(null);
    setEtat({ envoi: false, ok: '', erreur: '' });
    if (!arrivee || !depart || depart <= arrivee) return undefined;
    let actif = true;
    const t = setTimeout(() => {
      apiRequest(API_ENDPOINTS.residences.checkAvailability, { method: 'POST', body: { residenceId, dateArrivee: arrivee, dateDepart: depart } })
        .then(r => { if (actif) setLibre(Boolean(r.data?.disponible)); })
        .catch(() => { if (actif) setLibre(null); });
    }, 300);
    return () => { actif = false; clearTimeout(t); };
  }, [residenceId, arrivee, depart]);

  if (libre !== false) return null;

  const demander = async (e) => {
    e.preventDefault();
    setEtat({ envoi: true, ok: '', erreur: '' });
    try {
      const r = await apiRequest(API_ENDPOINTS.residences.alert(residenceId), { method: 'POST', body: { email, arrivee, depart } });
      setEtat({ envoi: false, ok: r.message, erreur: '' });
    } catch (err) {
      setEtat({ envoi: false, ok: '', erreur: err.message });
    }
  };

  return (
    <div className="alerte-dispo" role="status">
      <p className="alerte-dispo-titre"><b>Dates déjà prises</b> du {jourLong(arrivee)} au {jourLong(depart)}.</p>
      {etat.ok ? (
        <p className="alerte-dispo-ok"><FaCheckCircle aria-hidden="true" /> {etat.ok}</p>
      ) : (
        <form onSubmit={demander}>
          <label htmlFor="alerte-email">Recevoir un email si elles se libèrent</label>
          <div className="alerte-dispo-champ">
            <input id="alerte-email" type="email" required maxLength={254} autoComplete="email" placeholder="vous@exemple.com"
              value={email} onChange={(e) => { setEmail(e.target.value); setEtat(s => ({ ...s, erreur: '' })); }} />
            <button type="submit" className="btn btn-secondary" disabled={etat.envoi}><FaBell aria-hidden="true" /> {etat.envoi ? 'Envoi…' : 'Me prévenir'}</button>
          </div>
          {etat.erreur && <p className="alerte-dispo-erreur" role="alert">{etat.erreur}</p>}
          <small>Un seul email, sans engagement. Vous pouvez aussi choisir d’autres dates.</small>
        </form>
      )}
    </div>
  );
};

export default AlerteDisponibilite;
