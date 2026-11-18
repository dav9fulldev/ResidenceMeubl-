import React from 'react';
import { BrowserRouter as Router, Routes, Route, Outlet, Navigate, useLocation } from 'react-router-dom';
import './App.css';
import Header from './components/Header';
import Footer from './components/Footer';
import Home from './pages/Home';
import Residences from './pages/Residences';
import ResidenceDetail from './pages/ResidenceDetail';
import Reservation from './pages/Reservation';
import Favorites from './pages/Favorites';
import MesReservations from './pages/MesReservations';
import AdminLogin from './pages/AdminLogin';
import AdminDashboard from './pages/AdminDashboard';
import AdminReservationsPage from './pages/AdminReservationsPage';
import AdminResidencesPage from './pages/AdminResidencesPage';
import AdminStatsPage from './pages/AdminStatsPage';
import AdminSettingsPage from './pages/AdminSettingsPage';
import AdminCalendarPage from './pages/AdminCalendarPage';
import AdminLayout from './components/admin/AdminLayout';
import ProtectedRoute from './components/ProtectedRoute';
import ConnectionBanner from './components/ConnectionBanner';
import ErrorBoundary from './components/ErrorBoundary';
import NotFound from './pages/NotFound';
import { FavoritesProvider } from './context/FavoritesContext';
import { ResidencesProvider } from './context/ResidencesContext';

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
          <Outlet />
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
          <Routes>
            <Route element={<PublicLayout />}>
              <Route path="/" element={<Home />} />
              <Route path="/residences" element={<Residences />} />
              <Route path="/residence/:id" element={<ResidenceDetail />} />
              <Route path="/reservation" element={<Reservation />} />
              <Route path="/favorites" element={<Favorites />} />
              <Route path="/mes-reservations" element={<MesReservations />} />
              <Route path="*" element={<NotFound />} />
            </Route>

            {/* Back-office : application à part, sans les onglets du site public */}
            <Route path="/admin/login" element={<AdminLogin />} />
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
              <Route path="*" element={<Navigate to="dashboard" replace />} />
            </Route>
          </Routes>
        </Router>
      </FavoritesProvider>
    </ResidencesProvider>
  );
}

export default App;
