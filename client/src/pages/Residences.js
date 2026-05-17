import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { FaSearch, FaFilter, FaStar, FaBed, FaBath, FaUsers, FaMapMarkerAlt, FaHeart } from 'react-icons/fa';
import { useResidences } from '../context/ResidencesContext';
import { useFavorites } from '../context/FavoritesContext';
import './Residences.css';

const Residences = () => {
  const [searchQuery, setSearchQuery] = useState('');
  const [filters, setFilters] = useState({
    priceMin: '',
    priceMax: '',
    bedrooms: '',
    city: '',
    availability: ''
  });
  const [showFilters, setShowFilters] = useState(false);
  const { residences, searchResidences } = useResidences();
  const [filteredResidences, setFilteredResidences] = useState(residences);
  const { addToFavorites, removeFromFavorites, isFavorite } = useFavorites();

  // Mettre à jour les résultats de recherche quand la requête ou les filtres changent
  useEffect(() => {
    console.log('Residences disponibles:', residences);
    console.log('Filtres actuels:', filters);
    console.log('Requête de recherche:', searchQuery);
    
    const results = searchResidences(searchQuery, filters);
    console.log('Résultats filtrés:', results);
    
    setFilteredResidences(results);
  }, [searchQuery, filters, searchResidences, residences]);

  const handleSearchChange = (e) => {
    setSearchQuery(e.target.value);
  };

  const handleFilterChange = (e) => {
    const { name, value } = e.target;
    setFilters(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const clearFilters = () => {
    setFilters({
      priceMin: '',
      priceMax: '',
      bedrooms: '',
      city: '',
      availability: ''
    });
    setSearchQuery('');
  };

  const toggleFavorite = (residence) => {
    if (isFavorite(residence.id)) {
      removeFromFavorites(residence.id);
    } else {
      addToFavorites(residence);
    }
  };

  const cities = [...new Set(residences.map(r => r.city))];
  const bedroomOptions = [1, 2, 3, 4, 5];

  return (
    <div className="residences-page">
      <div className="container">
        {/* En-tête de la page */}
        <div className="page-header">
          <h1>Nos Résidences</h1>
          <p>Découvrez notre sélection de résidences meublées d'exception</p>
        </div>

        {/* Barre de recherche et filtres */}
        <div className="search-filters">
          <div className="search-bar">
            <FaSearch className="search-icon" />
            <input
              type="text"
              placeholder="Rechercher une résidence, ville ou quartier..."
              value={searchQuery}
              onChange={handleSearchChange}
              className="search-input"
            />
          </div>

          <button
            className="filter-toggle"
            onClick={() => setShowFilters(!showFilters)}
          >
            <FaFilter />
            Filtres
          </button>
        </div>

        {/* Panneau de filtres */}
        {showFilters && (
          <div className="filters-panel">
            <div className="filters-grid">
              <div className="filter-group">
                <label>Prix minimum (FCFA)</label>
                <input
                  type="number"
                  name="priceMin"
                  value={filters.priceMin}
                  onChange={handleFilterChange}
                  placeholder="0"
                  className="filter-input"
                />
              </div>

              <div className="filter-group">
                <label>Prix maximum (FCFA)</label>
                <input
                  type="number"
                  name="priceMax"
                  value={filters.priceMax}
                  onChange={handleFilterChange}
                  placeholder="100000"
                  className="filter-input"
                />
              </div>

              <div className="filter-group">
                <label>Nombre de chambres</label>
                <select
                  name="bedrooms"
                  value={filters.bedrooms}
                  onChange={handleFilterChange}
                  className="filter-select"
                >
                  <option value="">Toutes</option>
                  {bedroomOptions.map(num => (
                    <option key={num} value={num}>{num}+ chambres</option>
                  ))}
                </select>
              </div>

              <div className="filter-group">
                <label>Ville</label>
                <select
                  name="city"
                  value={filters.city}
                  onChange={handleFilterChange}
                  className="filter-select"
                >
                  <option value="">Toutes les villes</option>
                  {cities.map(city => (
                    <option key={city} value={city}>{city}</option>
                  ))}
                </select>
              </div>

              <div className="filter-group">
                <label>Disponibilité</label>
                <select
                  name="availability"
                  value={filters.availability}
                  onChange={handleFilterChange}
                  className="filter-select"
                >
                  <option value="">Toutes les disponibilités</option>
                  <option value="disponible">Disponible</option>
                  <option value="occupé">Occupé</option>
                  <option value="réservé">Réservé</option>
                  <option value="maintenance">Maintenance</option>
                </select>
              </div>
            </div>

            <div className="filters-actions">
              <button className="btn btn-secondary" onClick={clearFilters}>
                Effacer les filtres
              </button>
            </div>
          </div>
        )}

        {/* Résultats de recherche */}
        <div className="results-info">
          <p>
            {filteredResidences.length} résidence{filteredResidences.length > 1 ? 's' : ''} trouvée{filteredResidences.length > 1 ? 's' : ''}
            {searchQuery && ` pour "${searchQuery}"`}
          </p>
        </div>

        {/* Grille des résidences */}
        {filteredResidences.length > 0 ? (
          <div className="residences-grid">
            {filteredResidences.map((residence) => (
              <div key={residence.id} className="residence-card">
                <div className="residence-image">
                  <img 
                    src={residence.images[0]} 
                    alt={residence.name}
                    className="residence-img"
                    onError={(e) => {
                      console.error('Erreur de chargement image:', residence.images[0]);
                      e.target.style.display = 'none';
                      e.target.nextSibling.style.display = 'flex';
                    }}
                  />
                  <div className="image-fallback" style={{display: 'none'}}>
                    <span>Photo {residence.name}</span>
                  </div>
                  
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
                      className={`favorite-btn ${isFavorite(residence.id) ? 'active' : ''}`}
                      onClick={() => toggleFavorite(residence)}
                      aria-label={isFavorite(residence.id) ? 'Retirer des favoris' : 'Ajouter aux favoris'}
                    >
                      <FaHeart />
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
        ) : (
          <div className="no-results">
            <div className="no-results-content">
              <h3>Aucune résidence trouvée</h3>
              <p>
                {searchQuery 
                  ? `Aucune résidence ne correspond à votre recherche "${searchQuery}"`
                  : 'Aucune résidence ne correspond à vos critères de filtrage'
                }
              </p>
              <button className="btn btn-primary" onClick={clearFilters}>
                Effacer les filtres
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default Residences;
