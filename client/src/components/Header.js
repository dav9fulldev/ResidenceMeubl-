import React, { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useFavorites } from '../context/FavoritesContext';
import { FaHeart, FaBars, FaTimes, FaSearch } from 'react-icons/fa';
import './Header.css';

const Header = () => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const { favorites } = useFavorites();
  const location = useLocation();

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
          <Link to="/" onClick={closeMenu}>
            <img 
              src="/images/logo_entreprise.png" 
              alt="Sankofart Résidence" 
              className="logo-image"
            />
            <span>Luxury & Comfort</span>
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
          </ul>
        </nav>

        <div className="header-actions">
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
            aria-label="Menu"
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
