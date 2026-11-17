import React, { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import {
  FaStar, FaBed, FaBath, FaUsers, FaMapMarkerAlt, FaArrowLeft, FaCheck, FaHeart, FaRegHeart,
  FaChevronLeft, FaChevronRight,
} from 'react-icons/fa';
import { useResidences } from '../context/ResidencesContext';
import { useFavorites } from '../context/FavoritesContext';
import AvailabilityStatus from '../components/AvailabilityStatus';
import SimilarResidences from '../components/SimilarResidences';
import NotFound from './NotFound';
import './ResidenceDetail.css';

const ResidenceDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { getResidenceById, loading } = useResidences();
  const [activeImage, setActiveImage] = useState(0);
  const { addToFavorites, removeFromFavorites, isFavorite } = useFavorites();

  const residence = loading ? null : getResidenceById(id);

  useEffect(() => {
    setActiveImage(0);
    window.scrollTo(0, 0);
  }, [id]);

  useEffect(() => {
    if (residence) document.title = `${residence.name} · Sankofart Résidence`;
  }, [residence]);

  if (loading) {
    return (
      <div className="residence-detail-page" aria-busy="true">
        <div className="container">
          <div className="rd-squelette rd-squelette-titre" />
          <div className="rd-squelette rd-squelette-photo" />
          <p className="rd-chargement">Chargement de la résidence…</p>
        </div>
      </div>
    );
  }

  if (!residence) {
    return <NotFound titre="Résidence introuvable" message="Cette résidence n'existe pas ou n'est plus proposée. Découvrez nos autres résidences disponibles." />;
  }

  const favori = isFavorite(residence.id);
  const images = residence.images?.length ? residence.images : [];
  const enMaintenance = residence.availability?.status === 'maintenance';
  const reserver = () => navigate(`/reservation?residence=${residence.id}`);
  const basculerFavori = () => (favori ? removeFromFavorites(residence.id) : addToFavorites(residence));
  const changerImage = (pas) => setActiveImage(i => (i + pas + images.length) % images.length);
  const prix = `${Number(residence.price).toLocaleString('fr-FR')} ${residence.currency || 'FCFA'}`;

  return (
    <div className="residence-detail-page">
      <div className="container">
        <Link to="/residences" className="rd-retour">
          <FaArrowLeft aria-hidden="true" /> Toutes les résidences
        </Link>

        {/* En-tête */}
        <header className="rd-entete">
          <div>
            <h1>{residence.name}</h1>
            <p className="rd-sous-titre">
              {residence.rating ? (
                <span className="rd-note"><FaStar aria-hidden="true" /> {residence.rating}{residence.reviews ? ` · ${residence.reviews} avis` : ''}</span>
              ) : null}
              <span><FaMapMarkerAlt aria-hidden="true" /> {residence.location}{residence.neighborhood ? `, ${residence.neighborhood}` : ''}</span>
              {residence.reference && <span className="rd-ref">Réf. {residence.reference}</span>}
            </p>
          </div>
          <button
            type="button"
            className={`rd-favori ${favori ? 'actif' : ''}`}
            onClick={basculerFavori}
            aria-pressed={favori}
          >
            {favori ? <FaHeart aria-hidden="true" /> : <FaRegHeart aria-hidden="true" />}
            <span>{favori ? 'Dans vos favoris' : 'Ajouter aux favoris'}</span>
          </button>
        </header>

        {/* Galerie */}
        {images.length > 0 && (
          <div className="rd-galerie">
            <div className="rd-photo">
              <img src={images[activeImage]} alt={`${residence.name}, photo ${activeImage + 1} sur ${images.length}`} />
              {images.length > 1 && (
                <>
                  <button type="button" className="rd-fleche gauche" onClick={() => changerImage(-1)} aria-label="Photo précédente"><FaChevronLeft /></button>
                  <button type="button" className="rd-fleche droite" onClick={() => changerImage(1)} aria-label="Photo suivante"><FaChevronRight /></button>
                  <span className="rd-compteur">{activeImage + 1} / {images.length}</span>
                </>
              )}
            </div>
            {images.length > 1 && (
              <div className="rd-vignettes">
                {images.map((image, index) => (
                  <button
                    type="button"
                    key={index}
                    className={`rd-vignette ${index === activeImage ? 'active' : ''}`}
                    onClick={() => setActiveImage(index)}
                    aria-label={`Afficher la photo ${index + 1}`}
                    aria-current={index === activeImage}
                  >
                    <img src={image} alt="" loading="lazy" />
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="rd-colonnes">
          <div className="rd-principal">
            {/* Caractéristiques */}
            <ul className="rd-specs">
              <li><FaBed aria-hidden="true" /><strong>{residence.bedrooms}</strong> chambre{residence.bedrooms > 1 ? 's' : ''}</li>
              <li><FaBath aria-hidden="true" /><strong>{residence.bathrooms}</strong> salle{residence.bathrooms > 1 ? 's' : ''} de bain</li>
              <li><FaUsers aria-hidden="true" /><strong>{residence.maxGuests}</strong> personne{residence.maxGuests > 1 ? 's' : ''} max</li>
              {residence.area && <li><span className="rd-m2" aria-hidden="true">m²</span><strong>{residence.area}</strong> m²</li>}
            </ul>

            <section className="rd-section">
              <h2>Description</h2>
              <p>{residence.description}</p>
            </section>

            {residence.amenities?.length > 0 && (
              <section className="rd-section">
                <h2>Équipements et services</h2>
                <ul className="rd-equipements">
                  {residence.amenities.map((amenity, index) => (
                    <li key={index}><FaCheck aria-hidden="true" /> {amenity}</li>
                  ))}
                </ul>
              </section>
            )}

            <section className="rd-section">
              <h2>Emplacement</h2>
              <p className="rd-lieu"><FaMapMarkerAlt aria-hidden="true" /> {residence.location}<br />
                <span>{[residence.neighborhood, residence.city].filter(Boolean).join(', ')}</span>
              </p>
            </section>
          </div>

          {/* Réservation (colonne qui reste visible sur ordinateur) */}
          <aside className="rd-reservation" aria-label="Réservation">
            <p className="rd-prix"><strong>{prix}</strong> / {residence.period || 'nuit'}</p>
            <p className="rd-prix-note">Prix par nuit, taxes incluses</p>
            <AvailabilityStatus availability={residence.availability} onReserve={reserver} />
          </aside>
        </div>

        <SimilarResidences residenceId={residence.id} />
      </div>

      {/* Téléphone : barre de réservation fixe */}
      <div className="rd-barre">
        <p><strong>{prix}</strong><span> / {residence.period || 'nuit'}</span></p>
        <button type="button" className="btn btn-primary" onClick={reserver} disabled={enMaintenance}>
          {enMaintenance ? 'En maintenance' : 'Réserver'}
        </button>
      </div>
    </div>
  );
};

export default ResidenceDetail;
