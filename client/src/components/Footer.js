import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { FaFacebook, FaInstagram, FaTiktok, FaPhone, FaEnvelope, FaMapMarkerAlt, FaWhatsapp } from 'react-icons/fa';
import { FaXTwitter } from 'react-icons/fa6';
import useEtablissement from '../hooks/useEtablissement';
import { getClientToken } from '../config/api';
import './Footer.css';

const sansEspaces = (t) => String(t || '').replace(/[^\d+]/g, '');

/** Pied de page : coordonnées et réseaux réglés dans le back-office (Paramètres). */
const Footer = () => {
  const etab = useEtablissement();
  useLocation(); // relu à chaque page : le lien suit la session du client
  const clientConnu = Boolean(getClientToken());
  const reseaux = [
    ['Facebook', etab.facebook, <FaFacebook />],
    ['Instagram', etab.instagram, <FaInstagram />],
    ['TikTok', etab.tiktok, <FaTiktok />],
    ['X', etab.x, <FaXTwitter />],
  ].filter(([, url]) => url);

  return (
    <footer className="footer">
      <div className="container">
        <div className="footer-content">
          <div className="footer-section footer-marque">
            <p className="footer-nom">{etab.nom}</p>
            {etab.slogan && <p className="footer-slogan">{etab.slogan}</p>}
            {reseaux.length > 0 && (
              <div className="social-links">
                {reseaux.map(([nom, url, icone]) => (
                  <a key={nom} href={url} target="_blank" rel="noopener noreferrer" aria-label={nom}>{icone}</a>
                ))}
              </div>
            )}
          </div>

          <div className="footer-section">
            <h3>Nous contacter</h3>
            <div className="contact-info">
              {etab.telephone && (
                <a className="contact-item" href={`tel:${sansEspaces(etab.telephone)}`}>
                  <FaPhone aria-hidden="true" /><span>{etab.telephone}</span>
                </a>
              )}
              {etab.whatsapp && (
                <a className="contact-item" href={`https://wa.me/${sansEspaces(etab.whatsapp).replace('+', '')}`} target="_blank" rel="noopener noreferrer">
                  <FaWhatsapp aria-hidden="true" /><span>WhatsApp</span>
                </a>
              )}
              {etab.email && (
                <a className="contact-item" href={`mailto:${etab.email}`}>
                  <FaEnvelope aria-hidden="true" /><span>{etab.email}</span>
                </a>
              )}
              {etab.adresse && (
                <div className="contact-item">
                  <FaMapMarkerAlt aria-hidden="true" /><span>{etab.adresse}</span>
                </div>
              )}
            </div>
          </div>

          <div className="footer-section">
            <h3>Explorer</h3>
            <ul className="footer-links">
              <li><Link to="/">Accueil</Link></li>
              <li><Link to="/residences">Nos résidences</Link></li>
              <li><Link to="/favorites">Favoris</Link></li>
              {clientConnu && <li><Link to="/mes-reservations">Mes réservations</Link></li>}
              <li><Link to="/devenir-partenaire">Devenir partenaire</Link></li>
            </ul>
          </div>

          <div className="footer-section">
            <h3>Séjours</h3>
            <ul className="footer-links">
              <li><Link to="/residences">Courte durée</Link></li>
              <li><Link to="/residences">Longue durée</Link></li>
              <li><Link to="/residences">Résidences de standing</Link></li>
            </ul>
          </div>
        </div>

        <div className="footer-bottom">
          <p>&copy; {new Date().getFullYear()} {etab.nom}. Tous droits réservés.</p>
          <p>Paiements sécurisés : Mobile Money, carte bancaire, PI-SPI</p>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
