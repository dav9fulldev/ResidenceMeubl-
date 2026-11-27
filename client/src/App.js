import React, { Suspense, lazy } from 'react';
import { Analytics } from '@vercel/analytics/react';
import { BrowserRouter as Router, Routes, Route, Outlet, Navigate, useLocation } from 'react-router-dom';
import './App.css';
import Header from './components/Header';
import Footer from './components/Footer';
import Home from './pages/Home';
import ProtectedRoute from './components/ProtectedRoute';
import ConnectionBanner from './components/ConnectionBanner';
import ErrorBoundary from './components/ErrorBoundary';
import NotFound from './pages/NotFound';
import { FavoritesProvider } from './context/FavoritesContext';
import { ResidencesProvider } from './context/ResidencesContext';

// Pages chargées à la demande : l'accueil s'affiche sans télécharger le back-office ni le paiement
const Residences = lazy(() => import(/* webpackChunkName: "residences" */ './pages/Residences'));
const ResidenceDetail = lazy(() => import(/* webpackChunkName: "residencedetail" */ './pages/ResidenceDetail'));
const Reservation = lazy(() => import(/* webpackChunkName: "reservation" */ './pages/Reservation'));
const Favorites = lazy(() => import(/* webpackChunkName: "favorites" */ './pages/Favorites'));
const DevenirPartenaire = lazy(() => import(/* webpackChunkName: "devenirpartenaire" */ './pages/DevenirPartenaire'));
const MesReservations = lazy(() => import(/* webpackChunkName: "mesreservations" */ './pages/MesReservations'));
const AdminMotDePasse = lazy(() => import(/* webpackChunkName: "adminmotdepasse" */ './pages/AdminMotDePasse'));
const AdminLogin = lazy(() => import(/* webpackChunkName: "adminlogin" */ './pages/AdminLogin'));
const AdminInscription = lazy(() => import(/* webpackChunkName: "admininscription" */ './pages/AdminInscription'));
const AdminEntreprisesPage = lazy(() => import(/* webpackChunkName: "adminentreprises" */ './pages/AdminEntreprisesPage'));
const AdminAvisPage = lazy(() => import(/* webpackChunkName: "adminavis" */ './pages/AdminAvisPage'));
const AdminVisibilitePage = lazy(() => import(/* webpackChunkName: "adminvisibilite" */ './pages/AdminVisibilitePage'));
const AdminBoostersPage = lazy(() => import(/* webpackChunkName: "adminboosters" */ './pages/AdminBoostersPage'));
const AdminClientsPage = lazy(() => import(/* webpackChunkName: "adminclients" */ './pages/AdminClientsPage'));
const AdminUtilisateursPage = lazy(() => import(/* webpackChunkName: "adminutilisateurs" */ './pages/AdminUtilisateursPage'));
const AdminVerificationDossier = lazy(() => import(/* webpackChunkName: "adminverification" */ './pages/AdminVerificationDossier'));
const AdminPlateformePage = lazy(() => import(/* webpackChunkName: "adminplateforme" */ './pages/AdminPlateformePage'));
const AdminFinancesPage = lazy(() => import(/* webpackChunkName: "adminfinances" */ './pages/AdminFinancesPage'));
const AdminRevenusPage = lazy(() => import(/* webpackChunkName: "adminrevenus" */ './pages/AdminRevenusPage'));
const AdminVerificationsPage = lazy(() => import(/* webpackChunkName: "adminverifications" */ './pages/AdminVerificationsPage'));
const AdminDashboard = lazy(() => import(/* webpackChunkName: "admindashboard" */ './pages/AdminDashboard'));
const AdminReservationsPage = lazy(() => import(/* webpackChunkName: "adminreservationspage" */ './pages/AdminReservationsPage'));
const AdminResidencesPage = lazy(() => import(/* webpackChunkName: "adminresidencespage" */ './pages/AdminResidencesPage'));
const AdminStatsPage = lazy(() => import(/* webpackChunkName: "adminstatspage" */ './pages/AdminStatsPage'));
const AdminSettingsPage = lazy(() => import(/* webpackChunkName: "adminsettingspage" */ './pages/AdminSettingsPage'));
const AdminCalendarPage = lazy(() => import(/* webpackChunkName: "admincalendarpage" */ './pages/AdminCalendarPage'));
const AdminLayout = lazy(() => import(/* webpackChunkName: "admin" */ './components/admin/AdminLayout'));

// Indicateur affiché pendant le chargement d'une page
const Chargement = () => (
  <div className="page-chargement" role="status" aria-live="polite"><span className="page-chargement-rond" aria-hidden="true" />Chargement…</div>
);

// Statistiques de visite (Vercel Analytics) : jamais le back-office, jamais les paramètres d'adresse
// (les liens « Mes réservations » contiennent la clé d'accès personnelle du client)
const filtrerVisite = (event) => {
  try {
    const url = new URL(event.url);
    if (url.pathname.startsWith('/admin')) return null;
    return { ...event, url: `${url.origin}${url.pathname}` };
  } catch {
    return null;
  }
};

// Site public : en-tête, bandeau de connexion et pied de page
function PublicLayout() {
  const { pathname } = useLocation();
  return (
    <div className="App">
      <a href="#contenu" className="lien-evitement">Aller au contenu</a>
      <Header />
      <ConnectionBanner />
      <main id="contenu" tabIndex={-1}>
        <ErrorBoundary cle={pathname}>
          <Suspense fallback={<Chargement />}>
            <Outlet />
          </Suspense>
        </ErrorBoundary>
      </main>
      <Footer />
    </div>
  );
}

function App() {
  return (
    <ResidencesProvider>
      <FavoritesProvider>
        <Router>
          <Suspense fallback={<Chargement />}>
          <Routes>
            <Route element={<PublicLayout />}>
              <Route path="/" element={<Home />} />
              <Route path="/residences" element={<Residences />} />
              <Route path="/residence/:id" element={<ResidenceDetail />} />
              <Route path="/reservation" element={<Reservation />} />
              <Route path="/favorites" element={<Favorites />} />
              <Route path="/mes-reservations" element={<MesReservations />} />
              <Route path="/devenir-partenaire" element={<DevenirPartenaire />} />
              <Route path="/devenir-hote" element={<Navigate to="/devenir-partenaire" replace />} />
              <Route path="*" element={<NotFound />} />
            </Route>

            {/* Back-office : application à part, sans les onglets du site public */}
            <Route path="/admin/login" element={<AdminLogin />} />
            <Route path="/admin/mot-de-passe" element={<AdminMotDePasse />} />
            <Route path="/admin/inscription" element={<AdminInscription />} />
            <Route
              path="/admin"
              element={
                <ProtectedRoute>
                  <AdminLayout />
                </ProtectedRoute>
              }
            >
              <Route index element={<Navigate to="dashboard" replace />} />
              <Route path="dashboard" element={<AdminDashboard />} />
              <Route path="reservations" element={<AdminReservationsPage />} />
              <Route path="calendrier" element={<AdminCalendarPage />} />
              <Route path="residences" element={<AdminResidencesPage />} />
              <Route path="statistiques" element={<AdminStatsPage />} />
              <Route path="parametres" element={<AdminSettingsPage />} />
              <Route path="entreprises" element={<AdminEntreprisesPage />} />
              <Route path="utilisateurs" element={<AdminUtilisateursPage />} />
              <Route path="clients" element={<AdminClientsPage />} />
              <Route path="avis" element={<AdminAvisPage />} />
              <Route path="visibilite" element={<AdminVisibilitePage />} />
              <Route path="boosters" element={<AdminBoostersPage />} />
              <Route path="verifications" element={<AdminVerificationsPage />} />
              <Route path="finances" element={<AdminFinancesPage />} />
              <Route path="plateforme" element={<AdminPlateformePage />} />
              <Route path="revenus" element={<AdminRevenusPage />} />
              <Route path="residences/:id/verification" element={<AdminVerificationDossier />} />
              <Route path="*" element={<Navigate to="dashboard" replace />} />
            </Route>
          </Routes>
          </Suspense>
        </Router>
        <Analytics beforeSend={filtrerVisite} />
      </FavoritesProvider>
    </ResidencesProvider>
  );
}

export default App;
