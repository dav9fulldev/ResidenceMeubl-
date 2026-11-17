import React, { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { FaCalendarAlt, FaUser, FaEnvelope, FaPhone, FaCheckCircle, FaArrowLeft } from 'react-icons/fa';
import { useResidences } from '../context/ResidencesContext';
import './Reservation.css';

const Reservation = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { getResidenceById, createReservation, offline, loading } = useResidences();
  const [residence, setResidence] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [confirmation, setConfirmation] = useState(null);
  const [submitError, setSubmitError] = useState('');

  // Date du jour au format AAAA-MM-JJ (heure locale) pour les champs date
  const today = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);

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

  const onSubmit = async (data) => {
    if (!residence) return;
    setIsSubmitting(true);
    setSubmitError('');

    try {
      const result = await createReservation(residence.id, data);
      setConfirmation({ ...result, email: data.email });
      window.scrollTo(0, 0);
    } catch (error) {
      setSubmitError(error.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleBackToResidences = () => {
    navigate('/residences');
  };

  if (confirmation) {
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
            <p>
              <strong>Référence :</strong> {confirmation.reference}<br />
              <strong>Montant estimé :</strong> {Number(confirmation.prixTotal).toLocaleString('fr-FR')} FCFA
            </p>
            {confirmation.emailEnvoye
              ? <p>Un email de confirmation vous a été envoyé.</p>
              : <p>Conservez cette référence : l'email de confirmation n'a pas pu être envoyé.</p>}
            <div className="success-actions">
              <button
                className="btn btn-outline"
                onClick={() => navigate('/mes-reservations', {
                  state: { email: confirmation.email, reference: confirmation.reference },
                })}
              >
                Gérer ma réservation
              </button>
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

          {!residence && !loading && (
            <div className="error-message">
              Aucune résidence sélectionnée. Choisissez une résidence dans la liste pour la réserver.
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
            {residence?.availability && (
              <p className="sejour-regle">
                Séjour de {residence.availability.minStay === 1 ? '1 nuit' : `${residence.availability.minStay} nuits`} minimum
                {' '}et {residence.availability.maxStay} nuits maximum pour cette résidence.
              </p>
            )}

            <div className="form-row">
              <div className="form-group">
                <label htmlFor="arrivalDate">
                  <FaCalendarAlt /> Date d'arrivée *
                </label>
                <input
                  type="date"
                  id="arrivalDate"
                  min={today}
                  {...register('arrivalDate', {
                    required: 'La date d\'arrivée est obligatoire',
                    validate: value => value >= today || 'La date d\'arrivée ne peut pas être dans le passé'
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
                  min={(() => {
                    const arr = watch('arrivalDate');
                    if (!arr) return today;
                    const d = new Date(`${arr}T00:00:00Z`);
                    d.setUTCDate(d.getUTCDate() + (residence?.availability?.minStay || 1));
                    return d.toISOString().slice(0, 10);
                  })()}
                  {...register('departureDate', { 
                    required: 'La date de départ est obligatoire',
                    validate: value => {
                      const arrivalDate = watch('arrivalDate');
                      if (!arrivalDate) return true;
                      const departure = new Date(value);
                      const arrival = new Date(arrivalDate);
                      if (departure <= arrival) return 'La date de départ doit être après la date d\'arrivée';
                      const nuits = Math.round((departure - arrival) / 86400000);
                      const min = residence?.availability?.minStay || 1;
                      const max = residence?.availability?.maxStay || 365;
                      if (nuits < min) return `Séjour minimum : ${min} nuit${min > 1 ? 's' : ''} pour cette résidence`;
                      if (nuits > max) return `Séjour maximum : ${max} nuits pour cette résidence`;
                      return true;
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
                  {Array.from({ length: residence?.maxGuests || 8 }, (_, i) => i + 1).map(num => (
                    <option key={num} value={num}>{num} personne{num > 1 ? 's' : ''}</option>
                  ))}
                </select>
                {errors.guests && (
                  <span className="error-message">{errors.guests.message}</span>
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

            {submitError && (
              <div className="error-message" role="alert">{submitError}</div>
            )}
            {offline && (
              <div className="error-message" role="alert">
                Le service de réservation est momentanément indisponible. Réessayez dans quelques instants.
              </div>
            )}

            <div className="form-actions">
              <button
                type="submit"
                className="btn btn-primary btn-large"
                disabled={isSubmitting || !residence || offline}
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
