import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { FaUsers, FaMapMarkerAlt } from 'react-icons/fa';
import { useResidences } from '../context/ResidencesContext';
import './SimilarResidences.css';

/**
 * « Vous aimerez aussi » : les résidences les plus proches (calculées par l'IA côté serveur).
 */
const SimilarResidences = ({ residenceId }) => {
  const { getSimilarResidences, offline } = useResidences();
  const [items, setItems] = useState([]);

  useEffect(() => {
    if (offline) return undefined;
    let annule = false;
    getSimilarResidences(residenceId)
      .then((data) => { if (!annule) setItems(data); })
      .catch(() => { if (!annule) setItems([]); }); // section simplement masquée en cas d'erreur
    return () => { annule = true; };
  }, [residenceId, getSimilarResidences, offline]);

  if (items.length === 0) return null;

  return (
    <section className="similar-residences" aria-labelledby="similar-title">
      <h3 id="similar-title">✨ Vous aimerez aussi</h3>
      <div className="similar-grid">
        {items.map((r) => (
          <Link key={r.id} to={`/residence/${r.id}`} className="similar-card">
            <div className="similar-image">
              {r.images[0] && <img src={r.images[0]} alt={r.name} loading="lazy" />}
            </div>
            <div className="similar-content">
              <strong>{r.name}</strong>
              <span className="similar-type">{r.type}</span>
              <span><FaMapMarkerAlt /> {r.neighborhood}, {r.city}</span>
              <span><FaUsers /> {r.maxGuests} pers. max</span>
              <span className="similar-price">
                {r.price.toLocaleString('fr-FR')} FCFA <small>/ nuit</small>
              </span>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
};

export default SimilarResidences;
