import React from 'react';
import { BrowserRouter as Router, Routes, Route, Outlet, Navigate } from 'react-router-dom';
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
import AdminLayout from './components/admin/AdminLayout';
import ProtectedRoute from './components/ProtectedRoute';
import ConnectionBanner from './components/ConnectionBanner';
import { FavoritesProvider } from './context/FavoritesContext';
import { ResidencesProvider } from './context/ResidencesContext';

// Site public : en-tête, bandeau de connexion et pied de page
function PublicLayout() {
  return (
    <div className="App">
      <Header />
      <ConnectionBanner />
      <main>
        <Outlet />
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
              <Route path="residences" element={<AdminResidencesPage />} />
              <Route path="statistiques" element={<AdminStatsPage />} />
              <Route path="*" element={<Navigate to="dashboard" replace />} />
            </Route>
          </Routes>
        </Router>
      </FavoritesProvider>
    </ResidencesProvider>
  );
}

export default App;
