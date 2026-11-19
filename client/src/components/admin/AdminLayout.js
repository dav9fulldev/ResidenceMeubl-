import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { NavLink, Outlet, useNavigate, useLocation } from 'react-router-dom';
import {
  FaChartPie, FaChartLine, FaCalendarAlt, FaHome, FaSignOutAlt, FaExternalLinkAlt,
  FaMoon, FaSun, FaDownload, FaTimes, FaCog, FaRegCalendarCheck, FaBuilding, FaHourglassHalf, FaShieldAlt,
} from 'react-icons/fa';
import { API_ENDPOINTS } from '../../config/api';
import { CompteContext } from '../../context/CompteContext';
import { useResidences } from '../../context/ResidencesContext';
import ErrorBoundary from '../ErrorBoundary';
import useTheme from '../../hooks/useTheme';
import useInstallPrompt from '../../hooks/useInstallPrompt';
import useAdminReservations from '../../hooks/useAdminReservations';
import LogoBabi from '../LogoBabi';
import './AdminLayout.css';

const TITRES = {
  '/admin/dashboard': 'Vue d\'ensemble',
  '/admin/reservations': 'Réservations',
  '/admin/calendrier': 'Calendrier',
  '/admin/residences': 'Résidences',
  '/admin/statistiques': 'Statistiques',
  '/admin/parametres': 'Paramètres',
  '/admin/entreprises': 'Entreprises',
  '/admin/verifications': 'Vérifications',
};

/**
 * Mise en page du back-office : aucun élément du site public.
 * Ordinateur : menu latéral. Téléphone : barre du haut + onglets en bas.
 */
const AdminLayout = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { logoutAdmin, adminRequest, setEspaceAdmin } = useResidences();
  // Le back-office travaille sur les résidences de l'entreprise connectée
  useEffect(() => {
    setEspaceAdmin(true);
    return () => setEspaceAdmin(false);
  }, [setEspaceAdmin]);
  const [compte, setCompte] = useState(null);
  const [enAttente, setEnAttente] = useState(0); // entreprises à valider (administrateur de la plateforme)
  const [aVerifier, setAVerifier] = useState(0); // résidences à vérifier + signalements non traités

  // Compte connecté et son entreprise (statut de validation, droits)
  const recharger = useCallback(async () => {
    try {
      const moi = (await adminRequest(API_ENDPOINTS.admin.me)).data;
      setCompte(moi);
      if (moi.superAdmin) {
        const [liste, compteurs] = await Promise.all([
          adminRequest(API_ENDPOINTS.admin.companies).then(r => r.data),
          adminRequest(API_ENDPOINTS.admin.verificationCounters).then(r => r.data).catch(() => ({ aExaminer: 0, signalements: 0 })),
        ]);
        setEnAttente(liste.filter(e => e.statut === 'en_attente').length);
        setAVerifier(compteurs.aExaminer + compteurs.signalements);
      }
    } catch {
      // jeton refusé : adminRequest déconnecte déjà
    }
  }, [adminRequest]);
  useEffect(() => { recharger(); }, [recharger]);
  const valeurCompte = useMemo(() => ({ compte, recharger }), [compte, recharger]);
  const { theme, toggleTheme } = useTheme();
  const { installee, peutInstaller, ios, installer } = useInstallPrompt();
  const { aTraiter } = useAdminReservations();
  const [aideIOS, setAideIOS] = useState(false);

  // Titre de l'onglet / de l'application
  useEffect(() => {
    document.title = `${TITRES[location.pathname] || 'Administration'} · BABI Admin`;
    return () => { document.title = 'BABI RESIDENCE'; };
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
    { to: '/admin/dashboard', icone: <FaChartPie />, texte: 'Vue d\'ensemble', court: 'Aperçu', section: 'Gestion' },
    { to: '/admin/reservations', icone: <FaCalendarAlt />, texte: 'Réservations', badge: aTraiter, section: 'Gestion' },
    { to: '/admin/calendrier', icone: <FaRegCalendarCheck />, texte: 'Calendrier', section: 'Gestion' },
    { to: '/admin/residences', icone: <FaHome />, texte: 'Résidences', section: 'Gestion' },
    { to: '/admin/statistiques', icone: <FaChartLine />, texte: 'Statistiques', section: 'Pilotage', mobile: false },
    { to: '/admin/parametres', icone: <FaCog />, texte: 'Paramètres', section: 'Pilotage' },
    ...(compte?.superAdmin ? [
      { to: '/admin/entreprises', icone: <FaBuilding />, texte: 'Entreprises', court: 'Entreprises', badge: enAttente, section: 'Plateforme' },
      { to: '/admin/verifications', icone: <FaShieldAlt />, texte: 'Vérifications', court: 'Vérif.', badge: aVerifier, section: 'Plateforme' },
    ] : []),
  ];
  const nomEntreprise = compte?.entreprise?.nom || 'BABI RESIDENCE';

  return (
    <CompteContext.Provider value={valeurCompte}>
    <div className="admin-shell">
      {/* Menu latéral (ordinateur) */}
      <aside className="admin-sidebar">
        <div className="admin-brand">
          <LogoBabi className="admin-brand-logo" />
          <div>
            <strong title={nomEntreprise}>{nomEntreprise}</strong>
            <span>{compte?.superAdmin ? 'Administration de la plateforme' : 'Espace de gestion'}</span>
          </div>
        </div>

        <nav className="admin-nav" aria-label="Back-office">
          {liens.map((l, i) => (
            <React.Fragment key={l.to}>
            {l.section !== liens[i - 1]?.section && <p className="admin-nav-section">{l.section}</p>}
            <NavLink to={l.to} className={({ isActive }) => `admin-nav-link ${isActive ? 'active' : ''}`}>
              {l.icone}
              <span>{l.texte}</span>
              {l.badge > 0 && <span className="admin-badge" aria-label={`${l.badge} à traiter`}>{l.badge}</span>}
            </NavLink>
            </React.Fragment>
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
        {compte?.entreprise?.statut === 'en_attente' && (
          <div className="admin-bandeau-attente" role="status">
            <FaHourglassHalf aria-hidden="true" />
            <p><strong>Votre entreprise est en cours de vérification.</strong> Préparez vos résidences, vos coordonnées et vos moyens de paiement : elles apparaîtront sur le site dès la validation (vous serez prévenu par email).</p>
          </div>
        )}
        <ErrorBoundary cle={location.pathname}>
          <React.Suspense fallback={<div className="page-chargement" role="status">Chargement…</div>}>
            <Outlet />
          </React.Suspense>
        </ErrorBoundary>
      </main>

      {/* Onglets du bas (téléphone) */}
      <nav className="admin-tabbar" aria-label="Back-office">
        {liens.filter(l => l.mobile !== false).map(l => (
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
            <p>L'icône « BABI Admin » ouvrira directement le back-office, en plein écran.</p>
          </div>
        </div>
      )}
    </div>
    </CompteContext.Provider>
  );
};

export default AdminLayout;
