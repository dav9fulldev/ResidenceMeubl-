import React from 'react';
import { useNavigate } from 'react-router-dom';
import { FaSignOutAlt, FaCog, FaUsers, FaHome, FaCalendarAlt, FaCheckCircle } from 'react-icons/fa';
import { useResidences } from '../context/ResidencesContext';
import AdminPanel from '../components/AdminPanel';
import './AdminDashboard.css';

const AdminDashboard = () => {
  const navigate = useNavigate();
  const { logoutAdmin, residences } = useResidences();

  const handleLogout = () => {
    logoutAdmin();
    navigate('/admin/login');
  };

  // Statistiques
  const totalResidences = residences.length;
  const availableResidences = residences.filter(r => r.availability.status === 'disponible').length;
  const occupiedResidences = residences.filter(r => r.availability.status === 'occupé').length;
  const reservedResidences = residences.filter(r => r.availability.status === 'réservé').length;
  const maintenanceResidences = residences.filter(r => r.availability.status === 'maintenance').length;

  return (
    <div className="admin-dashboard">
      {/* Header du dashboard */}
      <header className="admin-dashboard-header">
        <div className="admin-dashboard-title">
          <h1>🛠️ Dashboard Administrateur</h1>
          <p>Gestion des résidences Sankofart</p>
        </div>
        
        <div className="admin-dashboard-actions">
          <button className="btn btn-outline btn-header" onClick={() => navigate('/')}>
            <FaHome />
            Voir le site
          </button>
          <button className="btn btn-secondary btn-header" onClick={handleLogout}>
            <FaSignOutAlt />
            Déconnexion
          </button>
        </div>
      </header>

      {/* Statistiques rapides */}
      <section className="admin-stats-overview">
        <div className="stat-card-overview total">
          <div className="stat-icon total">
            <FaHome />
          </div>
          <div className="stat-content">
            <span className="stat-number">{totalResidences}</span>
            <span className="stat-label">Total Résidences</span>
          </div>
        </div>

        <div className="stat-card-overview available">
          <div className="stat-icon available">
            <FaCheckCircle />
          </div>
          <div className="stat-content">
            <span className="stat-number">{availableResidences}</span>
            <span className="stat-label">Disponibles</span>
          </div>
        </div>

        <div className="stat-card-overview occupied">
          <div className="stat-icon occupied">
            <FaUsers />
          </div>
          <div className="stat-content">
            <span className="stat-number">{occupiedResidences}</span>
            <span className="stat-label">Occupées</span>
          </div>
          <span className="stat-subtitle">En cours</span>
        </div>

        <div className="stat-card-overview reserved">
          <div className="stat-icon reserved">
            <FaCalendarAlt />
          </div>
          <div className="stat-content">
            <span className="stat-number">{reservedResidences}</span>
            <span className="stat-label">Réservées</span>
          </div>
          <span className="stat-subtitle">À venir</span>
        </div>

        <div className="stat-card-overview maintenance">
          <div className="stat-icon maintenance">
            <FaCog />
          </div>
          <div className="stat-content">
            <span className="stat-number">{maintenanceResidences}</span>
            <span className="stat-label">Maintenance</span>
          </div>
          <span className="stat-subtitle">En cours</span>
        </div>
      </section>

      {/* Panel de gestion principal */}
      <AdminPanel />
    </div>
  );
};

export default AdminDashboard;
