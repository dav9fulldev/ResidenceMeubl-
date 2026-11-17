import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
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
import ProtectedRoute from './components/ProtectedRoute';
import ConnectionBanner from './components/ConnectionBanner';
import { FavoritesProvider } from './context/FavoritesContext';
import { ResidencesProvider } from './context/ResidencesContext';

function App() {
  return (
    <ResidencesProvider>
      <FavoritesProvider>
        <Router>
          <div className="App">
            <Header />
            <ConnectionBanner />
            <main>
              <Routes>
                <Route path="/" element={<Home />} />
                <Route path="/residences" element={<Residences />} />
                <Route path="/residence/:id" element={<ResidenceDetail />} />
                <Route path="/reservation" element={<Reservation />} />
                <Route path="/favorites" element={<Favorites />} />
                <Route path="/mes-reservations" element={<MesReservations />} />
                
                {/* Routes Administrateur */}
                <Route path="/admin/login" element={<AdminLogin />} />
                <Route 
                  path="/admin/dashboard" 
                  element={
                    <ProtectedRoute>
                      <AdminDashboard />
                    </ProtectedRoute>
                  } 
                />
              </Routes>
            </main>
            <Footer />
          </div>
        </Router>
      </FavoritesProvider>
    </ResidencesProvider>
  );
}

export default App;
