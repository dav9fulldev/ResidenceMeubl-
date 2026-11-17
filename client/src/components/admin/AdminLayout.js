import React, { useEffect, useState } from 'react';
import { NavLink, Outlet, useNavigate, useLocation } from 'react-router-dom';
import {
  FaChartPie, FaChartLine, FaCalendarAlt, FaHome, FaSignOutAlt, FaExternalLinkAlt,
  FaMoon, FaSun, FaDownload, FaTimes, FaCog,
} from 'react-icons/fa';
import { useResidences } from '../../context/ResidencesContext';
import ErrorBoundary from '../ErrorBoundary';
import useTheme from '../../hooks/useTheme';
import useInstallPrompt from '../../hooks/useInstallPrompt';
import useAdminReservations from '../../hooks/useAdminReservations';
import './AdminLayout.css';

const TITRES = {
  '/admin/dashboard': 'Vue d\'ensemble',
  '/admin/reservations': 'Réservations',
  '/admin/residences': 'Résidences',
  '/admin/statistiques': 'Statistiques',
  '/admin/parametres': 'Paramètres',
};

/**
 * Mise en page du back-office : aucun élément du site public.
 * Ordinateur : menu latéral. Téléphone : barre du haut + onglets en bas.
 */
const AdminLayout = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { logoutAdmin } = useResidences();
  const { theme, toggleTheme } = useTheme();
  const { installee, peutInstaller, ios, installer } = useInstallPrompt();
  const { aTraiter } = useAdminReservations();
  const [aideIOS, setAideIOS] = useState(false);

  // Titre de l'onglet / de l'application
  useEffect(() => {
    document.title = `${TITRES[location.pathname] || 'Administration'} · Sankofart Admin`;
    return () => { document.title = 'Sankofart Résidence'; };
  }, [location.pathname]);

  const deconnexion = () => {
    logoutAdmin();
    navigate('/admin/login');
  };

  const boutonInstaller = !installee && (peutInstaller || ios) && (
    <button
      type="button"
      className="admin-side-action install"
      onClick={() => (peutInstaller ? installer() : setAideIOS(true))}
    >
      <FaDownload /> <span>Installer l'application</span>
    </button>
  );

  const liens = [
    { to: '/admin/dashboard', icone: <FaChartPie />, texte: 'Vue d\'ensemble', court: 'Aperçu' },
    { to: '/admin/reservations', icone: <FaCalendarAlt />, texte: 'Réservations', badge: aTraiter },
    { to: '/admin/residences', icone: <FaHome />, texte: 'Résidences' },
    { to: '/admin/statistiques', icone: <FaChartLine />, texte: 'Statistiques' },
    { to: '/admin/parametres', icone: <FaCog />, texte: 'Paramètres' },
  ];

  return (
    <div className="admin-shell">
      {/* Menu latéral (ordinateur) */}
      <aside className="admin-sidebar">
        <div className="admin-brand">
          <img src="/icons/icon-192.png" alt="" />
          <div>
            <strong>Sankofart</strong>
            <span>Administration</span>
          </div>
        </div>

        <nav className="admin-nav" aria-label="Back-office">
          {liens.map(l => (
            <NavLink key={l.to} to={l.to} className={({ isActive }) => `admin-nav-link ${isActive ? 'active' : ''}`}>
              {l.icone}
              <span>{l.texte}</span>
              {l.badge > 0 && <span className="admin-badge" aria-label={`${l.badge} à traiter`}>{l.badge}</span>}
            </NavLink>
          ))}
        </nav>

        <div className="admin-side-actions">
          {boutonInstaller}
          <button type="button" className="admin-side-action" onClick={toggleTheme}>
            {theme === 'dark' ? <FaSun /> : <FaMoon />}
            <span>{theme === 'dark' ? 'Mode clair' : 'Mode sombre'}</span>
          </button>
          <a className="admin-side-action" href="/" target="_blank" rel="noopener noreferrer">
            <FaExternalLinkAlt /> <span>Voir le site</span>
          </a>
          <button type="button" className="admin-side-action danger" onClick={deconnexion}>
            <FaSignOutAlt /> <span>Déconnexion</span>
          </button>
        </div>
      </aside>

      {/* Barre du haut (téléphone) */}
      <header className="admin-topbar">
        <img src="/icons/icon-192.png" alt="" />
        <strong>{TITRES[location.pathname] || 'Administration'}</strong>
        <div className="admin-topbar-actions">
          {!installee && (peutInstaller || ios) && (
            <button type="button" onClick={() => (peutInstaller ? installer() : setAideIOS(true))} aria-label="Installer l'application">
              <FaDownload />
            </button>
          )}
          <button type="button" onClick={toggleTheme} aria-label={theme === 'dark' ? 'Mode clair' : 'Mode sombre'}>
            {theme === 'dark' ? <FaSun /> : <FaMoon />}
          </button>
          <button type="button" onClick={deconnexion} aria-label="Déconnexion">
            <FaSignOutAlt />
          </button>
        </div>
      </header>

      <main className="admin-main">
        <ErrorBoundary cle={location.pathname}>
          <Outlet />
        </ErrorBoundary>
      </main>

      {/* Onglets du bas (téléphone) */}
      <nav className="admin-tabbar" aria-label="Back-office">
        {liens.map(l => (
          <NavLink key={l.to} to={l.to} className={({ isActive }) => `admin-tab ${isActive ? 'active' : ''}`}>
            <span className="admin-tab-icon">
              {l.icone}
              {l.badge > 0 && <span className="admin-badge small">{l.badge}</span>}
            </span>
            <span>{l.court || l.texte}</span>
          </NavLink>
        ))}
      </nav>

      {/* Marche à suivre sur iPhone / iPad */}
      {aideIOS && (
        <div className="admin-modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="aide-ios-titre" onClick={() => setAideIOS(false)}>
          <div className="admin-modal" onClick={(e) => e.stopPropagation()}>
            <button type="button" className="admin-modal-close" onClick={() => setAideIOS(false)} aria-label="Fermer"><FaTimes /></button>
            <h2 id="aide-ios-titre">Installer sur iPhone / iPad</h2>
            <ol>
              <li>Ouvrez cette page dans <strong>Safari</strong>.</li>
              <li>Touchez le bouton <strong>Partager</strong> (carré avec une flèche vers le haut).</li>
              <li>Choisissez <strong>Sur l'écran d'accueil</strong>, puis <strong>Ajouter</strong>.</li>
            </ol>
            <p>L'icône « Sankofart Admin » ouvrira directement le back-office, en plein écran.</p>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminLayout;
