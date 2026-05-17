import React from 'react';
import { Link } from 'react-router-dom';
import { FaStar, FaBed, FaBath, FaUsers, FaMapMarkerAlt, FaTrash } from 'react-icons/fa';
import { useFavorites } from '../context/FavoritesContext';
import './Favorites.css';

const Favorites = () => {
  const { favorites, removeFromFavorites } = useFavorites();

  const handleRemoveFavorite = (residenceId) => {
    if (window.confirm('Êtes-vous sûr de vouloir retirer cette résidence de vos favoris ?')) {
      removeFromFavorites(residenceId);
    }
  };

  if (favorites.length === 0) {
    return (
      <div className="favorites-page">
        <div className="container">
          <div className="empty-favorites">
            <div className="empty-icon">💔</div>
            <h1>Aucun favori pour le moment</h1>
            <p>
              Vous n'avez pas encore ajouté de résidences à vos favoris. 
              Parcourez nos résidences et ajoutez celles qui vous plaisent !
            </p>
            <Link to="/residences" className="btn btn-primary btn-large">
              Découvrir nos résidences
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="favorites-page">
      <div className="container">
        {/* En-tête */}
        <div className="page-header">
          <h1>Mes Favoris</h1>
          <p>
            {favorites.length} résidence{favorites.length > 1 ? 's' : ''} dans vos favoris
          </p>
        </div>

        {/* Grille des favoris */}
        <div className="favorites-grid">
          {favorites.map((residence) => (
            <div key={residence.id} className="favorite-card">
              <div className="residence-image">
                <img 
                  src={residence.images[0]} 
                  alt={residence.name}
                  className="residence-img"
                />
                
                {/* Badge de disponibilité */}
                <div className={`availability-badge ${residence.availability.status}`}>
                  {residence.availability.status === 'disponible' && <span>✓ Disponible</span>}
                  {residence.availability.status === 'occupé' && <span>👤 Occupé</span>}
                  {residence.availability.status === 'réservé' && <span>⏰ Réservé</span>}
                  {residence.availability.status === 'maintenance' && <span>🔧 Maintenance</span>}
                </div>
                
                <div className="residence-badges">
                  <div className="residence-rating">
                    <FaStar />
                    <span>{residence.rating}</span>
                  </div>
                  
                  <button
                    className="remove-favorite-btn"
                    onClick={() => handleRemoveFavorite(residence.id)}
                    aria-label="Retirer des favoris"
                  >
                    <FaTrash />
                  </button>
                </div>
              </div>

              <div className="residence-content">
                <h3>{residence.name}</h3>
                <p className="residence-reference">Réf: {residence.reference}</p>
                
                <p className="residence-location">
                  <FaMapMarkerAlt />
                  {residence.location}
                </p>

                <div className="residence-details">
                  <span><FaBed /> {residence.bedrooms} chambres</span>
                  <span><FaBath /> {residence.bathrooms} sdb</span>
                  <span><FaUsers /> {residence.maxGuests} pers. max</span>
                </div>

                <p className="residence-description">
                  {residence.description.substring(0, 120)}...
                </p>

                <div className="residence-amenities">
                  <h4>Équipements :</h4>
                  <div className="amenities-list">
                    {residence.amenities.slice(0, 4).map((amenity, index) => (
                      <span key={index} className="amenity-tag">{amenity}</span>
                    ))}
                    {residence.amenities.length > 4 && (
                      <span className="amenity-more">+{residence.amenities.length - 4} autres</span>
                    )}
                  </div>
                </div>

                <div className="residence-footer">
                  <div className="residence-price">
                    <span className="price">{residence.price.toLocaleString()}</span>
                    <span className="currency">{residence.currency}</span>
                    <span className="period">/{residence.period}</span>
                  </div>

                  <div className="residence-actions">
                    <Link
                      to={`/residence/${residence.id}`}
                      className="btn btn-outline"
                    >
                      Voir détails
                    </Link>
                    <Link
                      to={`/reservation?residence=${residence.id}`}
                      className="btn btn-primary"
                    >
                      Réserver
                    </Link>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Actions supplémentaires */}
        <div className="favorites-actions">
          <div className="actions-content">
            <h3>Besoin d'aide pour choisir ?</h3>
            <p>
              Comparez vos résidences favorites et contactez-nous pour des conseils personnalisés.
            </p>
            <div className="action-buttons">
              <Link to="/residences" className="btn btn-secondary">
                Voir toutes les résidences
              </Link>
              <a href="mailto:contact@sankofartresidence.com" className="btn btn-outline">
                Nous contacter
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Favorites;
