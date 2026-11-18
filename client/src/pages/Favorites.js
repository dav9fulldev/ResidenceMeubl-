import React from 'react';
import { Link } from 'react-router-dom';

import { useFavorites } from '../context/FavoritesContext';
import ResidenceCard from '../components/ResidenceCard';
import useEtablissement from '../hooks/useEtablissement';
import './Favorites.css';

const Favorites = () => {
  const { favorites } = useFavorites();
  const { email: EMAIL } = useEtablissement();

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
        <div className="rc-grille">
          {favorites.map((residence) => (
            <ResidenceCard key={residence.id} residence={residence} />
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
              <a href={`mailto:${EMAIL}`} className="btn btn-outline">
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
