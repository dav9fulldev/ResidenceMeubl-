import React, { useState } from 'react';
import { FaCog, FaSave, FaTimes, FaPlus, FaTrash } from 'react-icons/fa';
import { useResidences } from '../context/ResidencesContext';
import AddResidenceForm from './AddResidenceForm';
import './AdminPanel.css';

const AdminPanel = () => {
  const {
    residences,
    updateResidenceStatus,
    updateReservationStatus,
    reloadResidences,
    addResidence,
    deleteResidence
  } = useResidences();

  const formatDate = (d) => (d ? new Date(d).toLocaleDateString('fr-FR') : '—');

  // Le client a changé d'avis : annuler la réservation libère la résidence
  const handleCancelReservation = async (residence) => {
    const a = residence.availability;
    if (!window.confirm(
      `Annuler la réservation de ${a.currentOccupant} (du ${formatDate(a.checkIn)} au ${formatDate(a.checkOut)}) ?\n` +
      'Les dates seront libérées et le client recevra un email d\'annulation.'
    )) return;
    const ok = await runAction(async () => {
      await updateReservationStatus(a.reservationId, 'annulee');
      await reloadResidences();
    });
    if (ok) setEditingResidence(null);
  };

  const [actionError, setActionError] = useState('');
  const [saving, setSaving] = useState(false);

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

  // Exécute une action admin et affiche l'erreur éventuelle
  const runAction = async (action) => {
    setSaving(true);
    setActionError('');
    try {
      await action();
      return true;
    } catch (error) {
      setActionError(error.message);
      return false;
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = (residence) => {
    if (window.confirm(`Supprimer définitivement « ${residence.name} » ?`)) {
      runAction(() => deleteResidence(residence.id));
    }
  };

  const handleAdd = async (newResidence) => {
    const ok = await runAction(() => addResidence(newResidence));
    if (ok) setShowAddForm(false);
  };

  const handleSave = async () => {
    if (editingResidence && editForm.status) {
      const ok = await runAction(() => updateResidenceStatus(editingResidence.id, editForm.status, {
        currentOccupant: editForm.currentOccupant,
        checkIn: editForm.checkIn,
        checkOut: editForm.checkOut,
        nextAvailable: editForm.nextAvailable
      }));
      if (!ok) return;
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

  return (
    <div className="admin-panel">

      {actionError && (
        <div className="error-message" role="alert">{actionError}</div>
      )}

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

        <div className="residences-management">
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
                      {residence.availability.automatic && residence.availability.reservationId && (
                        <div className="auto-status-notice">
                          <p>
                            <strong>{residence.availability.status === 'occupé' ? 'Occupée' : 'Réservée'}</strong> par{' '}
                            {residence.availability.currentOccupant}, du {formatDate(residence.availability.checkIn)} au{' '}
                            {formatDate(residence.availability.checkOut)} (réservation confirmée).
                          </p>
                          <p>Le client a changé d'avis ? Annulez sa réservation pour libérer la résidence.</p>
                          <button
                            type="button"
                            className="btn btn-danger btn-sm"
                            onClick={() => handleCancelReservation(residence)}
                            disabled={saving}
                          >
                            Annuler la réservation
                          </button>
                          <p className="auto-status-hint">Ou choisissez « Maintenance » ci-dessous pour bloquer la résidence.</p>
                        </div>
                      )}
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
                          disabled={saving}
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
                        onClick={() => handleDelete(residence)}
                        disabled={saving}
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
          onAddResidence={handleAdd}
          onClose={() => setShowAddForm(false)}
        />
      )}
    </div>
  );
};

export default AdminPanel;
