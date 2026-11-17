import React from 'react';
import { Link } from 'react-router-dom';
import { FaFacebook, FaInstagram, FaTwitter, FaPhone, FaEnvelope, FaMapMarkerAlt } from 'react-icons/fa';
import './Footer.css';

// Pages des réseaux sociaux : renseigner les vraies adresses pour afficher la section « Suivez-nous »
const RESEAUX = [
  // { nom: 'Facebook', url: 'https://www.facebook.com/…', icone: <FaFacebook /> },
  // { nom: 'Instagram', url: 'https://www.instagram.com/…', icone: <FaInstagram /> },
  // { nom: 'X (Twitter)', url: 'https://x.com/…', icone: <FaTwitter /> },
];
export const TELEPHONE = '+225 27 22 49 28 90';
export const EMAIL = 'contact@sankofart-residence.com';

const Footer = () => {
  return (
    <footer className="footer">
      <div className="container">
        <div className="footer-content">
          {/* Informations de contact */}
          <div className="footer-section">
            <h3>Contact</h3>
            <div className="contact-info">
              <a className="contact-item" href={`tel:${TELEPHONE.replace(/\s/g, '')}`}>
                <FaPhone aria-hidden="true" />
                <span>{TELEPHONE}</span>
              </a>
              <a className="contact-item" href={`mailto:${EMAIL}`}>
                <FaEnvelope aria-hidden="true" />
                <span>{EMAIL}</span>
              </a>
              <div className="contact-item">
                <FaMapMarkerAlt aria-hidden="true" />
                <span>Abidjan, Côte d'Ivoire</span>
              </div>
            </div>
          </div>

          {/* Liens rapides */}
          <div className="footer-section">
            <h3>Liens rapides</h3>
            <ul className="footer-links">
              <li><Link to="/">Accueil</Link></li>
              <li><Link to="/residences">Résidences</Link></li>
              <li><Link to="/favorites">Favoris</Link></li>
              <li><Link to="/mes-reservations">Mes réservations</Link></li>
            </ul>
          </div>

          {/* Services */}
          <div className="footer-section">
            <h3>Services</h3>
            <ul className="footer-links">
              <li><Link to="/residences">Location courte durée</Link></li>
              <li><Link to="/residences">Location longue durée</Link></li>
              <li><Link to="/residences">Résidences de luxe</Link></li>
            </ul>
          </div>

          {/* Réseaux sociaux */}
          {RESEAUX.length > 0 && (
            <div className="footer-section">
              <h3>Suivez-nous</h3>
              <div className="social-links">
                {RESEAUX.map(r => (
                  <a key={r.nom} href={r.url} target="_blank" rel="noopener noreferrer" aria-label={r.nom}>{r.icone}</a>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Ligne de séparation */}
        <div className="footer-divider"></div>

        {/* Bas de page */}
        <div className="footer-bottom">
          <div className="footer-bottom-content">
            <p>&copy; {new Date().getFullYear()} Sankofart Résidence. Tous droits réservés.</p>
          </div>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
