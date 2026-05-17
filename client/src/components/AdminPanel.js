import React, { useState } from 'react';
import { FaCog, FaEyeSlash, FaSave, FaTimes, FaPlus, FaTrash } from 'react-icons/fa';
import { useResidences } from '../context/ResidencesContext';
import AddResidenceForm from './AddResidenceForm';
import './AdminPanel.css';

const AdminPanel = () => {
  const { 
    residences, 
    isAdmin, 
    toggleAdminMode, 
    updateResidenceStatus,
    addResidence,
    deleteResidence
  } = useResidences();
  
  const [editingResidence, setEditingResidence] = useState(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editForm, setEditForm] = useState({
    status: '',
    currentOccupant: '',
    checkIn: '',
    checkOut: '',
    nextAvailable: ''
  });

  const handleEdit = (residence) => {
    setEditingResidence(residence);
    setEditForm({
      status: residence.availability.status,
      currentOccupant: residence.availability.currentOccupant || '',
      checkIn: residence.availability.checkIn || '',
      checkOut: residence.availability.checkOut || '',
      nextAvailable: residence.availability.nextAvailable || ''
    });
  };

  const handleSave = () => {
    if (editingResidence && editForm.status) {
      updateResidenceStatus(editingResidence.id, editForm.status, {
        currentOccupant: editForm.currentOccupant,
        checkIn: editForm.checkIn,
        checkOut: editForm.checkOut,
        nextAvailable: editForm.nextAvailable
      });
      setEditingResidence(null);
      setEditForm({
        status: '',
        currentOccupant: '',
        checkIn: '',
        checkOut: '',
        nextAvailable: ''
      });
    }
  };

  const handleCancel = () => {
    setEditingResidence(null);
    setEditForm({
      status: '',
      currentOccupant: '',
      checkIn: '',
      checkOut: '',
      nextAvailable: ''
    });
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'disponible': return '#10b981';
      case 'occupé': return '#ef4444';
      case 'réservé': return '#f59e0b';
      case 'maintenance': return '#8b5cf6';
      default: return '#6b7280';
    }
  };

  if (!isAdmin) {
    return (
      <div className="admin-toggle">
        <button 
          className="btn btn-secondary btn-admin-toggle"
          onClick={toggleAdminMode}
        >
          <FaCog />
          Mode Administrateur
        </button>
      </div>
    );
  }

  return (
    <div className="admin-panel">
      <div className="admin-header">
        <h3>🛠️ Panel Administrateur</h3>
        <button 
          className="btn btn-outline btn-sm"
          onClick={toggleAdminMode}
        >
          <FaEyeSlash />
          Masquer
        </button>
      </div>

      <div className="admin-content">
        <div className="admin-actions">
          <button 
            className="btn btn-primary"
            onClick={() => setShowAddForm(true)}
          >
            <FaPlus />
            Ajouter une résidence
          </button>
        </div>

        <div className="admin-stats">
          <div className="stat-card">
            <span className="stat-number">{residences.length}</span>
            <span className="stat-label">Total Résidences</span>
          </div>
          <div className="stat-card">
            <span className="stat-number">
              {residences.filter(r => r.availability.status === 'disponible').length}
            </span>
            <span className="stat-label">Disponibles</span>
          </div>
          <div className="stat-card">
            <span className="stat-number">
              {residences.filter(r => r.availability.status === 'occupé').length}
            </span>
            <span className="stat-label">Occupées</span>
          </div>
          <div className="stat-card">
            <span className="stat-number">
              {residences.filter(r => r.availability.status === 'réservé').length}
            </span>
            <span className="stat-label">Réservées</span>
          </div>
        </div>

        <div className="residences-management">
          <h4>Gestion des Résidences</h4>
          <div className="residences-list">
            {residences.map((residence) => (
              <div key={residence.id} className="residence-admin-card">
                <div className="residence-admin-info">
                  <div className="residence-admin-header">
                    <h5>{residence.name}</h5>
                    <div 
                      className="status-indicator"
                      style={{ backgroundColor: getStatusColor(residence.availability.status) }}
                    >
                      {residence.availability.status}
                    </div>
                  </div>
                  <p className="residence-reference">Réf: {residence.reference}</p>
                  <p className="residence-location">{residence.location}</p>
                </div>

                <div className="residence-admin-actions">
                  {editingResidence?.id === residence.id ? (
                    <div className="edit-form">
                      <select
                        value={editForm.status}
                        onChange={(e) => setEditForm(prev => ({ ...prev, status: e.target.value }))}
                        className="form-select"
                      >
                        <option value="">Sélectionner un statut</option>
                        <option value="disponible">Disponible</option>
                        <option value="occupé">Occupé</option>
                        <option value="réservé">Réservé</option>
                        <option value="maintenance">Maintenance</option>
                      </select>

                      {editForm.status === 'occupé' && (
                        <>
                          <input
                            type="text"
                            placeholder="Nom de l'occupant"
                            value={editForm.currentOccupant}
                            onChange={(e) => setEditForm(prev => ({ ...prev, currentOccupant: e.target.value }))}
                            className="form-input"
                          />
                          <input
                            type="date"
                            placeholder="Date de libération"
                            value={editForm.nextAvailable}
                            onChange={(e) => setEditForm(prev => ({ ...prev, nextAvailable: e.target.value }))}
                            className="form-input"
                          />
                        </>
                      )}

                      {editForm.status === 'réservé' && (
                        <>
                          <input
                            type="text"
                            placeholder="Nom du client"
                            value={editForm.currentOccupant}
                            onChange={(e) => setEditForm(prev => ({ ...prev, currentOccupant: e.target.value }))}
                            className="form-input"
                          />
                          <input
                            type="date"
                            placeholder="Date de check-in"
                            value={editForm.checkIn}
                            onChange={(e) => setEditForm(prev => ({ ...prev, checkIn: e.target.value }))}
                            className="form-input"
                          />
                          <input
                            type="date"
                            placeholder="Date de check-out"
                            value={editForm.checkOut}
                            onChange={(e) => setEditForm(prev => ({ ...prev, checkOut: e.target.value }))}
                            className="form-input"
                          />
                        </>
                      )}

                      <div className="edit-actions">
                        <button 
                          className="btn btn-primary btn-sm"
                          onClick={handleSave}
                        >
                          <FaSave />
                          Sauvegarder
                        </button>
                        <button 
                          className="btn btn-secondary btn-sm"
                          onClick={handleCancel}
                        >
                          <FaTimes />
                          Annuler
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="residence-actions">
                      <button 
                        className="btn btn-outline btn-sm"
                        onClick={() => handleEdit(residence)}
                      >
                        <FaCog />
                        Modifier
                      </button>
                      <button 
                        className="btn btn-danger btn-sm"
                        onClick={() => deleteResidence(residence.id)}
                        title="Supprimer la résidence"
                      >
                        <FaTrash />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Formulaire d'ajout de résidence */}
      {showAddForm && (
        <AddResidenceForm
          onAddResidence={addResidence}
          onClose={() => setShowAddForm(false)}
        />
      )}
    </div>
  );
};

export default AdminPanel;
