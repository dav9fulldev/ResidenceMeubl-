import React, { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { FaStar, FaBed, FaBath, FaUsers, FaMapMarkerAlt, FaArrowLeft, FaCheck } from 'react-icons/fa';
import { useResidences } from '../context/ResidencesContext';
import { useFavorites } from '../context/FavoritesContext';
import AvailabilityStatus from '../components/AvailabilityStatus';
import './ResidenceDetail.css';

const ResidenceDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { getResidenceById } = useResidences();
  const [residence, setResidence] = useState(null);
  const [activeImage, setActiveImage] = useState(0);
  const { addToFavorites, removeFromFavorites, isFavorite } = useFavorites();

  useEffect(() => {
    const foundResidence = getResidenceById(id);
    if (foundResidence) {
      setResidence(foundResidence);
    } else {
      navigate('/residences');
    }
  }, [id, navigate, getResidenceById]);

  const toggleFavorite = () => {
    if (isFavorite(residence.id)) {
      removeFromFavorites(residence.id);
    } else {
      addToFavorites(residence);
    }
  };

  const handleReservation = () => {
    navigate(`/reservation?residence=${residence.id}`);
  };

  if (!residence) {
    return <div>Chargement...</div>;
  }

  return (
    <div className="residence-detail-page">
      <div className="container">
        {/* Bouton retour */}
        <div className="back-button">
          <Link to="/residences" className="btn btn-outline">
            <FaArrowLeft />
            Retour aux résidences
          </Link>
        </div>

        {/* En-tête de la résidence */}
        <div className="residence-header">
          <div className="residence-title">
            <h1>{residence.name}</h1>
            <p className="residence-reference">Référence: {residence.reference}</p>
            <div className="residence-meta">
              <div className="residence-rating">
                <FaStar />
                <span>{residence.rating}</span>
                <span className="reviews">({residence.reviews} avis)</span>
              </div>
              <button
                className={`favorite-btn ${isFavorite(residence.id) ? 'active' : ''}`}
                onClick={toggleFavorite}
                aria-label={isFavorite(residence.id) ? 'Retirer des favoris' : 'Ajouter aux favoris'}
              >
                <FaStar />
              </button>
            </div>
          </div>

          <div className="residence-price-card">
            <div className="price-info">
              <span className="price">{residence.price.toLocaleString()}</span>
              <span className="currency">{residence.currency}</span>
              <span className="period">/{residence.period}</span>
            </div>
            <button className="btn btn-primary btn-large" onClick={handleReservation}>
              Réserver maintenant
            </button>
            <p className="price-note">Prix par nuit • Taxes incluses</p>
          </div>
        </div>

        {/* Galerie d'images */}
        <div className="residence-gallery">
          <div className="main-image">
            <img 
              src={residence.images[activeImage]} 
              alt={`${residence.name}`}
              className="main-image-img"
            />
          </div>
          <div className="thumbnail-images">
            {residence.images.map((image, index) => (
              <div
                key={index}
                className={`thumbnail ${index === activeImage ? 'active' : ''}`}
                onClick={() => setActiveImage(index)}
              >
                <img 
                  src={image} 
                  alt={`${residence.name}`}
                  className="thumbnail-img"
                />
              </div>
            ))}
          </div>
        </div>

        {/* Statut de disponibilité */}
        <div className="availability-section">
          <h3>Disponibilité et réservation</h3>
          <AvailabilityStatus availability={residence.availability} />
        </div>

        {/* Informations principales */}
        <div className="residence-main-info">
          <div className="residence-location">
            <h3><FaMapMarkerAlt /> Localisation</h3>
            <p>{residence.location}</p>
            <p className="neighborhood">{residence.neighborhood}, {residence.city}</p>
          </div>

          <div className="residence-specs">
            <div className="spec-item">
              <FaBed />
              <div>
                <span className="spec-value">{residence.bedrooms}</span>
                <span className="spec-label">Chambres</span>
              </div>
            </div>
            <div className="spec-item">
              <FaBath />
              <div>
                <span className="spec-value">{residence.bathrooms}</span>
                <span className="spec-label">Salles de bain</span>
              </div>
            </div>
            <div className="spec-item">
              <FaUsers />
              <div>
                <span className="spec-value">{residence.maxGuests}</span>
                <span className="spec-label">Voyageurs max</span>
              </div>
            </div>
            <div className="spec-item">
              <div className="area-icon">m²</div>
              <div>
                <span className="spec-value">{residence.area}</span>
                <span className="spec-label">Surface</span>
              </div>
            </div>
          </div>
        </div>

        {/* Description */}
        <div className="residence-description">
          <h3>Description</h3>
          <p>{residence.description}</p>
        </div>

        {/* Équipements */}
        <div className="residence-amenities">
          <h3>Équipements et services</h3>
          <div className="amenities-grid">
            {residence.amenities.map((amenity, index) => (
              <div key={index} className="amenity-item">
                <FaCheck />
                <span>{amenity}</span>
              </div>
            ))}
          </div>
        </div>

        {/* CTA Réservation */}
        <div className="reservation-cta">
          <div className="cta-content">
            <h3>Prêt pour un séjour inoubliable ?</h3>
            <p>Réservez dès maintenant cette résidence exceptionnelle et profitez d'un confort de luxe.</p>
            <div className="cta-actions">
              <button className="btn btn-primary btn-large" onClick={handleReservation}>
                Réserver maintenant
              </button>
              <Link to="/residences" className="btn btn-outline btn-large">
                Voir d'autres résidences
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ResidenceDetail;
