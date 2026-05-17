import React from 'react';
import { Link } from 'react-router-dom';
import { FaFacebook, FaInstagram, FaTwitter, FaPhone, FaEnvelope, FaMapMarkerAlt } from 'react-icons/fa';
import './Footer.css';

const Footer = () => {
  return (
    <footer className="footer">
      <div className="container">
        <div className="footer-content">
          {/* Informations de contact */}
          <div className="footer-section">
            <h3>Contact</h3>
            <div className="contact-info">
              <div className="contact-item">
                <FaPhone />
                <span>+225 27 22 49 28 90</span>
              </div>
              <div className="contact-item">
                <FaEnvelope />
                <span>contact@sankofart-residence.com</span>
              </div>
              <div className="contact-item">
                <FaMapMarkerAlt />
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
              <li>
                <Link to="/admin/login" className="admin-link">
                  🛠️ Administration
                </Link>
              </li>
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
          <div className="footer-section">
            <h3>Suivez-nous</h3>
            <div className="social-links">
              <a href="https://facebook.com" target="_blank" rel="noopener noreferrer">
                <FaFacebook />
              </a>
              <a href="https://instagram.com" target="_blank" rel="noopener noreferrer">
                <FaInstagram />
              </a>
              <a href="https://twitter.com" target="_blank" rel="noopener noreferrer">
                <FaTwitter />
              </a>
            </div>
          </div>
        </div>

        {/* Ligne de séparation */}
        <div className="footer-divider"></div>

        {/* Bas de page */}
        <div className="footer-bottom">
          <div className="footer-bottom-content">
            <p>&copy; 2024 Sankofart Résidence. Tous droits réservés.</p>
            <div className="footer-bottom-links">
              <Link to="/terms">Conditions d'utilisation</Link>
              <Link to="/privacy">Politique de confidentialité</Link>
              <Link to="/legal">Mentions légales</Link>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
