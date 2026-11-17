import React from 'react';
import { Link } from 'react-router-dom';
import './NotFound.css';

/** Page affichée pour une adresse inconnue (ou une résidence introuvable). */
const NotFound = ({ titre = 'Page introuvable', message = 'Cette adresse ne correspond à aucune page du site. Le lien est peut-être incomplet ou la page a été déplacée.' }) => (
  <div className="not-found">
    <div className="not-found-carte">
      <p className="not-found-code" aria-hidden="true">404</p>
      <h1>{titre}</h1>
      <p>{message}</p>
      <div className="not-found-actions">
        <Link to="/residences" className="btn btn-primary">Voir les résidences</Link>
        <Link to="/" className="btn btn-outline">Accueil</Link>
      </div>
    </div>
  </div>
);

export default NotFound;
