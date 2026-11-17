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

  // Coordonnées mémorisées sur cet appareil pour la prochaine réservation
  useEffect(() => {
    try {
      const memo = JSON.parse(localStorage.getItem('coordonneesClient') || 'null');
      if (memo) for (const k of ['firstName', 'lastName', 'email', 'phone']) if (memo[k]) setValue(k, memo[k]);
    } catch {
      // stockage indisponible : rien à pré-remplir
    }
  }, [setValue]);

  const onSubmit = async (data) => {
    if (!residence) return;
    setIsSubmitting(true);
    setSubmitError('');

    try {
      const result = await createReservation(residence.id, data);
      try {
        const { firstName, lastName, email, phone } = data;
        localStorage.setItem('coordonneesClient', JSON.stringify({ firstName, lastName, email, phone }));
      } catch {
        // stockage indisponible : sans conséquence
      }
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
            <p>Merci ! Nous avons bien reçu votre demande.</p>
            <ol className="resa-etapes">
              <li>Nous vérifions la disponibilité et confirmons votre séjour par email.</li>
              <li>Vous réglez ensuite l'acompte par PI-SPI depuis « Mes réservations ».</li>
              <li>Vous pouvez suivre ou annuler votre demande à tout moment depuis cette même page.</li>
            </ol>
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

  const arrivee = watch('arrivalDate');
  const depart = watch('departureDate');
  const nuits = arrivee && depart && depart > arrivee
    ? Math.round((Date.parse(`${depart}T00:00:00Z`) - Date.parse(`${arrivee}T00:00:00Z`)) / 86400000)
    : 0;
  const total = residence && nuits > 0 ? nuits * Number(residence.price) : 0;
  const fcfa = (n) => `${Number(n).toLocaleString('fr-FR')} FCFA`;
  const minStay = residence?.availability?.minStay || 1;
  const maxStay = residence?.availability?.maxStay || 365;

  return (
    <div className="reservation-page">
      <div className="container">
        <div className="reservation-header">
          <button type="button" className="back-btn" onClick={() => (residence ? navigate(`/residence/${residence.id}`) : handleBackToResidences())}>
            <FaArrowLeft aria-hidden="true" />
            {residence ? 'Retour à la résidence' : 'Retour aux résidences'}
          </button>
          <h1>Réserver votre séjour</h1>
          <p>Aucun paiement maintenant : nous confirmons d'abord la disponibilité.</p>
        </div>

        <div className="reservation-content">
          {residence && (
            <div className="resa-resume">
              {residence.images?.[0] && <img src={residence.images[0]} alt="" />}
              <div>
                <p className="resa-resume-nom">{residence.name}</p>
                <p className="resa-resume-lieu">{residence.location}</p>
                <p className="resa-resume-prix"><strong>{fcfa(residence.price)}</strong> / {residence.period || 'nuit'}</p>
              </div>
            </div>
          )}

          {!residence && !loading && (
            <div className="error-message" role="alert">
              Aucune résidence sélectionnée. Choisissez une résidence dans la liste pour la réserver.
            </div>
          )}

          <form onSubmit={handleSubmit(onSubmit)} className="reservation-form" noValidate>
            <h3>1. Votre séjour</h3>
            {residence?.availability && (
              <p className="sejour-regle">
                Séjour de {minStay === 1 ? '1 nuit' : `${minStay} nuits`} minimum et {maxStay} nuits maximum.
              </p>
            )}

            <div className="form-row">
              <div className="form-group">
                <label htmlFor="arrivalDate">
                  <FaCalendarAlt aria-hidden="true" /> Arrivée *
                </label>
                <input
                  type="date"
                  id="arrivalDate"
                  min={today}
                  aria-invalid={Boolean(errors.arrivalDate)}
                  {...register('arrivalDate', {
                    required: 'Choisissez votre date d\'arrivée',
                    validate: value => value >= today || 'La date d\'arrivée ne peut pas être dans le passé'
                  })}
                  className={errors.arrivalDate ? 'error' : ''}
                />
                {errors.arrivalDate && (
                  <span className="error-message" role="alert">{errors.arrivalDate.message}</span>
                )}
              </div>

              <div className="form-group">
                <label htmlFor="departureDate">
                  <FaCalendarAlt aria-hidden="true" /> Départ *
                </label>
                <input
                  type="date"
                  id="departureDate"
                  min={(() => {
                    if (!arrivee) return today;
                    const d = new Date(`${arrivee}T00:00:00Z`);
                    d.setUTCDate(d.getUTCDate() + minStay);
                    return d.toISOString().slice(0, 10);
                  })()}
                  aria-invalid={Boolean(errors.departureDate)}
                  {...register('departureDate', {
                    required: 'Choisissez votre date de départ',
                    validate: value => {
                      const arrivalDate = watch('arrivalDate');
                      if (!arrivalDate) return true;
                      const n = Math.round((Date.parse(`${value}T00:00:00Z`) - Date.parse(`${arrivalDate}T00:00:00Z`)) / 86400000);
                      if (n <= 0) return 'Le départ doit être après l\'arrivée';
                      if (n < minStay) return `Séjour minimum : ${minStay} nuit${minStay > 1 ? 's' : ''} pour cette résidence`;
                      if (n > maxStay) return `Séjour maximum : ${maxStay} nuits pour cette résidence`;
                      return true;
                    }
                  })}
                  className={errors.departureDate ? 'error' : ''}
                />
                {errors.departureDate && (
                  <span className="error-message" role="alert">{errors.departureDate.message}</span>
                )}
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label htmlFor="guests">
                  <FaUser aria-hidden="true" /> Nombre de personnes *
                </label>
                <select
                  id="guests"
                  aria-invalid={Boolean(errors.guests)}
                  {...register('guests', {
                    required: 'Indiquez le nombre de personnes',
                    min: { value: 1, message: 'Au moins 1 personne' }
                  })}
                  className={errors.guests ? 'error' : ''}
                >
                  <option value="">Choisir</option>
                  {Array.from({ length: residence?.maxGuests || 8 }, (_, i) => i + 1).map(num => (
                    <option key={num} value={num}>{num} personne{num > 1 ? 's' : ''}</option>
                  ))}
                </select>
                {errors.guests && (
                  <span className="error-message" role="alert">{errors.guests.message}</span>
                )}
              </div>
            </div>

            {residence && (
              <div className="resa-total" aria-live="polite">
                {nuits > 0 ? (
                  <>
                    <p><span>{fcfa(residence.price)} × {nuits} nuit{nuits > 1 ? 's' : ''}</span><strong>{fcfa(total)}</strong></p>
                    <p className="resa-total-note">Total estimé. Après notre confirmation, un acompte vous sera demandé par PI-SPI.</p>
                  </>
                ) : (
                  <p className="resa-total-note">Choisissez vos dates pour voir le prix total.</p>
                )}
              </div>
            )}

            <h3>2. Vos coordonnées</h3>
            <div className="form-row">
              <div className="form-group">
                <label htmlFor="firstName">
                  <FaUser aria-hidden="true" /> Prénom *
                </label>
                <input
                  type="text"
                  id="firstName"
                  autoComplete="given-name"
                  aria-invalid={Boolean(errors.firstName)}
                  {...register('firstName', {
                    required: 'Le prénom est obligatoire',
                    minLength: { value: 2, message: 'Le prénom doit contenir au moins 2 caractères' }
                  })}
                  className={errors.firstName ? 'error' : ''}
                />
                {errors.firstName && (
                  <span className="error-message" role="alert">{errors.firstName.message}</span>
                )}
              </div>

              <div className="form-group">
                <label htmlFor="lastName">
                  <FaUser aria-hidden="true" /> Nom *
                </label>
                <input
                  type="text"
                  id="lastName"
                  autoComplete="family-name"
                  aria-invalid={Boolean(errors.lastName)}
                  {...register('lastName', {
                    required: 'Le nom est obligatoire',
                    minLength: { value: 2, message: 'Le nom doit contenir au moins 2 caractères' }
                  })}
                  className={errors.lastName ? 'error' : ''}
                />
                {errors.lastName && (
                  <span className="error-message" role="alert">{errors.lastName.message}</span>
                )}
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label htmlFor="email">
                  <FaEnvelope aria-hidden="true" /> Email *
                </label>
                <input
                  type="email"
                  id="email"
                  autoComplete="email"
                  inputMode="email"
                  aria-describedby="email-aide"
                  aria-invalid={Boolean(errors.email)}
                  {...register('email', {
                    required: 'L\'email est obligatoire',
                    pattern: {
                      value: /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i,
                      message: 'Veuillez entrer un email valide'
                    }
                  })}
                  className={errors.email ? 'error' : ''}
                />
                <span id="email-aide" className="champ-aide">La confirmation et le suivi arrivent à cette adresse.</span>
                {errors.email && (
                  <span className="error-message" role="alert">{errors.email.message}</span>
                )}
              </div>

              <div className="form-group">
                <label htmlFor="phone">
                  <FaPhone aria-hidden="true" /> Téléphone *
                </label>
                <input
                  type="tel"
                  id="phone"
                  autoComplete="tel"
                  inputMode="tel"
                  placeholder="07 00 00 00 00"
                  aria-invalid={Boolean(errors.phone)}
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
                  <span className="error-message" role="alert">{errors.phone.message}</span>
                )}
              </div>
            </div>

            <div className="form-group full-width">
              <label htmlFor="specialRequests">
                Demandes particulières (facultatif)
              </label>
              <textarea
                id="specialRequests"
                rows="3"
                placeholder="Heure d'arrivée, lit bébé, préférences…"
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
                {isSubmitting ? 'Envoi en cours…' : 'Envoyer ma demande de réservation'}
              </button>
              <p className="resa-rassurance">Aucun paiement n'est demandé avant notre confirmation.</p>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default Reservation;
