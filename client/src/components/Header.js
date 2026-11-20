import React, { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useFavorites } from '../context/FavoritesContext';
import { FaHeart, FaBars, FaTimes, FaSearch, FaMoon, FaSun } from 'react-icons/fa';
import useTheme from '../hooks/useTheme';
import LogoBabi from './LogoBabi';
import { getClientToken } from '../config/api';
import './Header.css';

const Header = () => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const { favorites } = useFavorites();
  const location = useLocation();
  const { theme, toggleTheme } = useTheme();
  // « Mes réservations » n'est pas proposé au public : seulement au client qui a une session sur
  // cet appareil (après une réservation, une connexion ou le lien d'un email). Relu à chaque page.
  const clientConnu = Boolean(getClientToken()) || location.pathname === '/mes-reservations';

  // Fermer le menu à chaque changement de page, et bloquer le défilement derrière le menu ouvert
  useEffect(() => {
    setIsMenuOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    document.body.style.overflow = isMenuOpen ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [isMenuOpen]);

  const toggleMenu = () => {
    setIsMenuOpen(!isMenuOpen);
  };

  const toggleSearch = () => {
    setIsSearchOpen(!isSearchOpen);
  };

  const closeMenu = () => {
    setIsMenuOpen(false);
  };

  const isActive = (path) => {
    return location.pathname === path;
  };

  return (
    <header className="header">
      <div className="header-container">
        <div className="logo">
          <Link to="/" onClick={closeMenu} aria-label="BABI RESIDENCE, accueil">
            <LogoBabi className="logo-image" />
            <span className="logo-texte">
              <b>BABI</b>
              <small>RESIDENCE</small>
            </span>
          </Link>
        </div>

        <nav className={`nav-menu ${isMenuOpen ? 'active' : ''}`}>
          <ul className="nav-list">
            <li className="nav-item">
              <Link 
                to="/" 
                className={`nav-link ${isActive('/') ? 'active' : ''}`}
                onClick={closeMenu}
              >
                Accueil
              </Link>
            </li>
            <li className="nav-item">
              <Link 
                to="/residences" 
                className={`nav-link ${isActive('/residences') ? 'active' : ''}`}
                onClick={closeMenu}
              >
                Résidences
              </Link>
            </li>
            <li className="nav-item">
              <Link 
                to="/favorites" 
                className={`nav-link ${isActive('/favorites') ? 'active' : ''}`}
                onClick={closeMenu}
              >
                <FaHeart className="favorites-icon" />
                Favoris
                {favorites.length > 0 && (
                  <span className="favorites-count">{favorites.length}</span>
                )}
              </Link>
            </li>
            {clientConnu && (
              <li className="nav-item">
                <Link
                  to="/mes-reservations"
                  className={`nav-link ${isActive('/mes-reservations') ? 'active' : ''}`}
                  onClick={closeMenu}
                >
                  Mes réservations
                </Link>
              </li>
            )}
            <li className="nav-item nav-item-hote">
              <Link to="/devenir-partenaire" className={`nav-link ${isActive('/devenir-partenaire') ? 'active' : ''}`} onClick={closeMenu}>
                Devenir partenaire
              </Link>
            </li>
          </ul>
        </nav>

        <div className="header-actions">
          {/* Espace des partenaires (gestionnaires de résidences) */}
          <Link to="/devenir-partenaire" className="header-hote" onClick={closeMenu}>Devenir partenaire</Link>
          <button
            className="theme-toggle"
            onClick={toggleTheme}
            aria-label={theme === 'dark' ? 'Passer en mode clair' : 'Passer en mode sombre'}
            title={theme === 'dark' ? 'Mode clair' : 'Mode sombre'}
          >
            {theme === 'dark' ? <FaSun /> : <FaMoon />}
          </button>

          <button 
            className="search-toggle"
            onClick={toggleSearch}
            aria-label="Rechercher"
          >
            <FaSearch />
          </button>
          
          <button 
            className="mobile-menu-toggle"
            onClick={toggleMenu}
            aria-label={isMenuOpen ? 'Fermer le menu' : 'Ouvrir le menu'}
            aria-expanded={isMenuOpen}
          >
            {isMenuOpen ? <FaTimes /> : <FaBars />}
          </button>
        </div>
      </div>

      {/* Barre de recherche */}
      {isSearchOpen && (
        <div className="search-bar">
          <div className="search-container">
            <input
              type="text"
              placeholder="Rechercher une résidence, ville ou quartier..."
              className="search-input"
            />
            <button className="search-button">
              <FaSearch />
            </button>
          </div>
        </div>
      )}
    </header>
  );
};

export default Header;
