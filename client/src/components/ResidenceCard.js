import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { FaStar, FaBed, FaBath, FaUsers, FaMapMarkerAlt, FaHeart, FaRegHeart } from 'react-icons/fa';
import { useFavorites } from '../context/FavoritesContext';
import { sponsoriseIci } from '../utils/booster';
import { compterAffichage } from '../utils/statistiques';
import './ResidenceCard.css';

const STATUTS = {
  disponible: 'Disponible',
  'réservé': 'Dates partiellement prises',
  'occupé': 'Occupée en ce moment',
  maintenance: 'En maintenance',
};

/**
 * Carte de résidence commune (accueil, liste, favoris).
 * Toute la carte mène à la fiche ; le cœur et « Réserver » restent cliquables séparément.
 * @param badge     texte facultatif affiché sur la photo (ex. correspondance de la recherche IA)
 * @param contexte  recherche en cours { ville, quartier, texte } : booster ciblé et mention « Sponsorisé »
 */
const ResidenceCard = ({ residence, badge, eager = false, requete = '', libreAuxDates = false, contexte }) => {
  const { addToFavorites, removeFromFavorites, isFavorite } = useFavorites();
  const [imageKo, setImageKo] = useState(false);
  const favori = isFavorite(residence.id);
  const sponsorise = sponsoriseIci(residence, contexte);
  // Affichage compté quand la moitié de la carte est visible (résultats des boosters)
  const carte = useRef(null);
  useEffect(() => {
    const el = carte.current;
    if (!el || typeof IntersectionObserver === 'undefined') return undefined;
    const obs = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) { compterAffichage(residence.id, sponsorise); obs.disconnect(); }
    }, { threshold: 0.5 });
    obs.observe(el);
    return () => obs.disconnect();
  }, [residence.id, sponsorise]);
  const statut = residence.availability?.status;
  const lien = `/residence/${residence.id}${requete ? `?${requete}` : ''}`;

  const basculerFavori = () => {
    if (favori) removeFromFavorites(residence.id);
    else addToFavorites(residence);
  };

  return (
    <article className="rc" ref={carte}>
      <div className="rc-media">
        {!imageKo && residence.images?.[0] ? (
          <img
            src={residence.images[0]}
            alt=""
            loading={eager ? 'eager' : 'lazy'}
            decoding="async"
            onError={() => setImageKo(true)}
          />
        ) : (
          <div className="rc-media-vide" aria-hidden="true"><FaBed /></div>
        )}
        {libreAuxDates
          ? <span className="rc-statut rc-statut-ok">Libre à vos dates</span>
          : statut && <span className={`rc-statut rc-statut-${statut === 'disponible' ? 'ok' : statut === 'maintenance' ? 'ko' : 'partiel'}`}>{STATUTS[statut] || statut}</span>}
        {badge && <span className="rc-badge">{badge}</span>}
        <button
          type="button"
          className={`rc-favori ${favori ? 'actif' : ''}`}
          onClick={basculerFavori}
          aria-pressed={favori}
          aria-label={favori ? `Retirer ${residence.name} des favoris` : `Ajouter ${residence.name} aux favoris`}
        >
          {favori ? <FaHeart /> : <FaRegHeart />}
        </button>
      </div>

      <div className="rc-corps">
        <div className="rc-tete">
          <h3><Link to={lien} className="rc-lien">{residence.name}</Link></h3>
          {residence.rating ? (
            <span className="rc-note" aria-label={`Note ${residence.rating} sur 5, ${residence.reviews} avis`}><FaStar aria-hidden="true" /> {Number(residence.rating).toLocaleString('fr-FR')}{residence.reviews ? <small> ({residence.reviews})</small> : null}</span>
          ) : null}
        </div>
        {(sponsorise || residence.company?.recommande) && (
          <p className="rc-mentions">
            {sponsorise && <span className="rc-sponsorise">Sponsorisé</span>}
            {residence.company?.recommande && <span className="rc-recommande">Partenaire recommandé</span>}
          </p>
        )}
        <p className="rc-lieu"><FaMapMarkerAlt aria-hidden="true" /> {residence.location}</p>
        <ul className="rc-specs">
          <li><FaBed aria-hidden="true" /> {residence.bedrooms} ch.</li>
          <li><FaBath aria-hidden="true" /> {residence.bathrooms} sdb</li>
          <li><FaUsers aria-hidden="true" /> {residence.maxGuests} pers.</li>
        </ul>
        {residence.description && <p className="rc-desc">{residence.description}</p>}
        <div className="rc-pied">
          <p className="rc-prix">
            <strong>{Number(residence.price).toLocaleString('fr-FR')} {residence.currency || 'FCFA'}</strong>
            <span> / {residence.period || 'nuit'}</span>
          </p>
          <Link to={`/reservation?residence=${residence.id}${requete ? `&${requete}` : ''}`} className="btn btn-primary rc-reserver">
            Réserver
          </Link>
        </div>
      </div>
    </article>
  );
};

export default ResidenceCard;
