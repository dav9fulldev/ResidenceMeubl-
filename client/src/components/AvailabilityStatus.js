import React from 'react';
import { FaCalendarAlt, FaUser, FaClock, FaCheckCircle, FaExclamationTriangle, FaInfoCircle } from 'react-icons/fa';
import './AvailabilityStatus.css';

const AvailabilityStatus = ({ availability }) => {
  const getStatusInfo = (status) => {
    switch (status) {
      case 'disponible':
        return {
          icon: <FaCheckCircle />,
          color: '#10b981',
          bgColor: '#ecfdf5',
          text: 'Disponible',
          description: 'Résidence libre pour réservation'
        };
      case 'occupé':
        return {
          icon: <FaUser />,
          color: '#ef4444',
          bgColor: '#fef2f2',
          text: 'Occupé',
          description: 'Résidence actuellement louée'
        };
      case 'réservé':
        return {
          icon: <FaClock />,
          color: '#f59e0b',
          bgColor: '#fffbeb',
          text: 'Réservé',
          description: 'Résidence réservée pour une future date'
        };
      case 'maintenance':
        return {
          icon: <FaExclamationTriangle />,
          color: '#8b5cf6',
          bgColor: '#f3f4f6',
          text: 'Maintenance',
          description: 'Résidence en cours de rénovation'
        };
      default:
        return {
          icon: <FaInfoCircle />,
          color: '#6b7280',
          bgColor: '#f9fafb',
          text: 'Indisponible',
          description: 'Statut non défini'
        };
    }
  };

  const formatDate = (dateString) => {
    if (!dateString) return null;
    const date = new Date(dateString);
    return date.toLocaleDateString('fr-FR', {
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    });
  };

  const statusInfo = getStatusInfo(availability.status);

  return (
    <div className="availability-status">
      {/* Badge de statut principal */}
      <div 
        className="status-badge"
        style={{
          backgroundColor: statusInfo.bgColor,
          color: statusInfo.color,
          borderColor: statusInfo.color
        }}
      >
        {statusInfo.icon}
        <span className="status-text">{statusInfo.text}</span>
      </div>

      {/* Description du statut */}
      <p className="status-description">{statusInfo.description}</p>

      {/* Informations détaillées selon le statut */}
      {availability.status === 'occupé' && (
        <div className="occupancy-details">
          <div className="detail-item">
            <FaUser className="detail-icon" />
            <span>Occupé par : <strong>{availability.currentOccupant}</strong></span>
          </div>
          <div className="detail-item">
            <FaCalendarAlt className="detail-icon" />
            <span>Libération : <strong>{formatDate(availability.nextAvailable)}</strong></span>
          </div>
          <div className="detail-item">
            <FaClock className="detail-icon" />
            <span>Check-in : {formatDate(availability.checkIn)}</span>
          </div>
          <div className="detail-item">
            <FaClock className="detail-icon" />
            <span>Check-out : {formatDate(availability.checkOut)}</span>
          </div>
        </div>
      )}

      {availability.status === 'réservé' && (
        <div className="reservation-details">
          <div className="detail-item">
            <FaUser className="detail-icon" />
            <span>Réservé par : <strong>{availability.currentOccupant}</strong></span>
          </div>
          <div className="detail-item">
            <FaCalendarAlt className="detail-icon" />
            <span>Disponible à partir du : <strong>{formatDate(availability.nextAvailable)}</strong></span>
          </div>
          <div className="detail-item">
            <FaClock className="detail-icon" />
            <span>Check-in : {formatDate(availability.checkIn)}</span>
          </div>
          <div className="detail-item">
            <FaClock className="detail-icon" />
            <span>Check-out : {formatDate(availability.checkOut)}</span>
          </div>
        </div>
      )}

      {availability.status === 'disponible' && (
        <div className="availability-details">
          <div className="detail-item">
            <FaCalendarAlt className="detail-icon" />
            <span>Séjour minimum : <strong>{availability.minStay} nuit{availability.minStay > 1 ? 's' : ''}</strong></span>
          </div>
          <div className="detail-item">
            <FaCalendarAlt className="detail-icon" />
            <span>Séjour maximum : <strong>{availability.maxStay} nuits</strong></span>
          </div>
        </div>
      )}

      {/* Bouton d'action selon le statut */}
      <div className="availability-action">
        {availability.status === 'disponible' ? (
          <button className="btn btn-primary btn-availability">
            Réserver maintenant
          </button>
        ) : (
          <button className="btn btn-secondary btn-availability" disabled>
            {availability.status === 'occupé' ? 'Indisponible' : 
             availability.status === 'réservé' ? 'Déjà réservé' : 'En maintenance'}
          </button>
        )}
      </div>
    </div>
  );
};

export default AvailabilityStatus;
