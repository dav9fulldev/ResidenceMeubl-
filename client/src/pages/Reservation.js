import React, { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { FaCalendarAlt, FaUser, FaEnvelope, FaPhone, FaFileUpload, FaCheckCircle, FaArrowLeft } from 'react-icons/fa';
import { useResidences } from '../context/ResidencesContext';
import './Reservation.css';

const Reservation = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { getResidenceById, reserveResidence } = useResidences();
  const [residence, setResidence] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [uploadedFile, setUploadedFile] = useState(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
    setValue,
    watch
  } = useForm();

  // Récupérer l'ID de la résidence depuis l'URL et pré-remplir le formulaire
  useEffect(() => {
    const residenceId = searchParams.get('residence');
    if (residenceId) {
      const foundResidence = getResidenceById(residenceId);
      if (foundResidence) {
        setResidence(foundResidence);
        // Pré-remplir automatiquement les informations de la résidence
        setValue('residenceName', foundResidence.name);
        setValue('residenceReference', foundResidence.reference);
        setValue('residenceLocation', foundResidence.location);
        setValue('residencePrice', `${foundResidence.price.toLocaleString()} ${foundResidence.currency}/${foundResidence.period}`);
      }
    }
  }, [searchParams, setValue, getResidenceById]);

  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (file) {
      setUploadedFile(file);
    }
  };

  const onSubmit = async (data) => {
    setIsSubmitting(true);
    
    try {
      // Simuler l'envoi au backend
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Ici, vous enverriez les données au backend via API
      console.log('Données de réservation:', data);
      
      // Mettre à jour le statut de la résidence
      if (residence) {
        reserveResidence(residence.id, {
          fullName: `${data.firstName} ${data.lastName}`,
          checkIn: data.checkIn,
          checkOut: data.checkOut
        });
      }
      
      setIsSubmitted(true);
    } catch (error) {
      console.error('Erreur lors de la réservation:', error);
      alert('Une erreur est survenue. Veuillez réessayer.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleBackToResidences = () => {
    navigate('/residences');
  };

  if (isSubmitted) {
    return (
      <div className="reservation-page">
        <div className="container">
          <div className="success-message">
            <FaCheckCircle className="success-icon" />
            <h1>Réservation envoyée avec succès !</h1>
            <p>
              Merci pour votre réservation. Nous avons reçu votre demande et nous vous 
              contacterons dans les plus brefs délais pour confirmer votre séjour.
            </p>
            <div className="success-actions">
              <button 
                className="btn btn-primary"
                onClick={handleBackToResidences}
              >
                Voir d'autres résidences
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="reservation-page">
      <div className="container">
        {/* En-tête */}
        <div className="reservation-header">
          <button className="back-btn" onClick={handleBackToResidences}>
            <FaArrowLeft />
            Retour aux résidences
          </button>
          <h1>Formulaire de Réservation</h1>
          <p>Remplissez ce formulaire pour réserver votre séjour</p>
        </div>

        <div className="reservation-content">
          {/* Informations de la résidence */}
          {residence && (
            <div className="residence-summary">
              <h3>Résidence sélectionnée</h3>
              <div className="residence-info">
                <div className="info-item">
                  <strong>Nom :</strong>
                  <span>{residence.name}</span>
                </div>
                <div className="info-item">
                  <strong>Référence :</strong>
                  <span>{residence.reference}</span>
                </div>
                <div className="info-item">
                  <strong>Localisation :</strong>
                  <span>{residence.location}</span>
                </div>
                <div className="info-item">
                  <strong>Prix :</strong>
                  <span>{residence.price.toLocaleString()} {residence.currency}/{residence.period}</span>
                </div>
              </div>
            </div>
          )}

          {/* Formulaire de réservation */}
          <form onSubmit={handleSubmit(onSubmit)} className="reservation-form">
            <h3>Informations personnelles</h3>
            
            <div className="form-row">
              <div className="form-group">
                <label htmlFor="firstName">
                  <FaUser /> Prénom *
                </label>
                <input
                  type="text"
                  id="firstName"
                  {...register('firstName', { 
                    required: 'Le prénom est obligatoire',
                    minLength: { value: 2, message: 'Le prénom doit contenir au moins 2 caractères' }
                  })}
                  className={errors.firstName ? 'error' : ''}
                />
                {errors.firstName && (
                  <span className="error-message">{errors.firstName.message}</span>
                )}
              </div>

              <div className="form-group">
                <label htmlFor="lastName">
                  <FaUser /> Nom *
                </label>
                <input
                  type="text"
                  id="lastName"
                  {...register('lastName', { 
                    required: 'Le nom est obligatoire',
                    minLength: { value: 2, message: 'Le nom doit contenir au moins 2 caractères' }
                  })}
                  className={errors.lastName ? 'error' : ''}
                />
                {errors.lastName && (
                  <span className="error-message">{errors.lastName.message}</span>
                )}
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label htmlFor="email">
                  <FaEnvelope /> Email *
                </label>
                <input
                  type="email"
                  id="email"
                  {...register('email', { 
                    required: 'L\'email est obligatoire',
                    pattern: { 
                      value: /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i,
                      message: 'Veuillez entrer un email valide'
                    }
                  })}
                  className={errors.email ? 'error' : ''}
                />
                {errors.email && (
                  <span className="error-message">{errors.email.message}</span>
                )}
              </div>

              <div className="form-group">
                <label htmlFor="phone">
                  <FaPhone /> Téléphone *
                </label>
                <input
                  type="tel"
                  id="phone"
                  {...register('phone', { 
                    required: 'Le téléphone est obligatoire',
                    pattern: { 
                      value: /^[+]?[0-9\s\-()]{8,}$/,
                      message: 'Veuillez entrer un numéro de téléphone valide'
                    }
                  })}
                  className={errors.phone ? 'error' : ''}
                />
                {errors.phone && (
                  <span className="error-message">{errors.phone.message}</span>
                )}
              </div>
            </div>

            <h3>Détails du séjour</h3>

            <div className="form-row">
              <div className="form-group">
                <label htmlFor="arrivalDate">
                  <FaCalendarAlt /> Date d'arrivée *
                </label>
                <input
                  type="date"
                  id="arrivalDate"
                  {...register('arrivalDate', { 
                    required: 'La date d\'arrivée est obligatoire',
                    validate: value => {
                      const today = new Date();
                      const selectedDate = new Date(value);
                      return selectedDate >= today || 'La date d\'arrivée doit être future';
                    }
                  })}
                  className={errors.arrivalDate ? 'error' : ''}
                />
                {errors.arrivalDate && (
                  <span className="error-message">{errors.arrivalDate.message}</span>
                )}
              </div>

              <div className="form-group">
                <label htmlFor="departureDate">
                  <FaCalendarAlt /> Date de départ *
                </label>
                <input
                  type="date"
                  id="departureDate"
                  {...register('departureDate', { 
                    required: 'La date de départ est obligatoire',
                    validate: value => {
                      const arrivalDate = watch('arrivalDate');
                      if (!arrivalDate) return true;
                      const departure = new Date(value);
                      const arrival = new Date(arrivalDate);
                      return departure > arrival || 'La date de départ doit être après la date d\'arrivée';
                    }
                  })}
                  className={errors.departureDate ? 'error' : ''}
                />
                {errors.departureDate && (
                  <span className="error-message">{errors.departureDate.message}</span>
                )}
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label htmlFor="guests">
                  <FaUser /> Nombre de personnes *
                </label>
                <select
                  id="guests"
                  {...register('guests', { 
                    required: 'Le nombre de personnes est obligatoire',
                    min: { value: 1, message: 'Le nombre de personnes doit être au moins 1' }
                  })}
                  className={errors.guests ? 'error' : ''}
                >
                  <option value="">Sélectionnez</option>
                  {[1, 2, 3, 4, 5, 6, 7, 8].map(num => (
                    <option key={num} value={num}>{num} personne{num > 1 ? 's' : ''}</option>
                  ))}
                </select>
                {errors.guests && (
                  <span className="error-message">{errors.guests.message}</span>
                )}
              </div>

              <div className="form-group">
                <label htmlFor="identityDocument">
                  <FaFileUpload /> Pièce d'identité *
                </label>
                <input
                  type="file"
                  id="identityDocument"
                  accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
                  onChange={handleFileUpload}
                  className={errors.identityDocument ? 'error' : ''}
                />
                {uploadedFile && (
                  <span className="file-info">Fichier sélectionné : {uploadedFile.name}</span>
                )}
                {errors.identityDocument && (
                  <span className="error-message">{errors.identityDocument.message}</span>
                )}
              </div>
            </div>

            <div className="form-group full-width">
              <label htmlFor="specialRequests">
                Demandes spéciales (optionnel)
              </label>
              <textarea
                id="specialRequests"
                rows="4"
                placeholder="Précisez vos demandes particulières, allergies, préférences..."
                {...register('specialRequests')}
              />
            </div>

            <div className="form-actions">
              <button
                type="submit"
                className="btn btn-primary btn-large"
                disabled={isSubmitting}
              >
                {isSubmitting ? 'Envoi en cours...' : 'Envoyer la réservation'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default Reservation;
