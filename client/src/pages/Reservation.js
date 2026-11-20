import React, { useState, useEffect } from 'react';
import { useSearchParams, useNavigate, Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import {
  FaCalendarAlt, FaUser, FaEnvelope, FaPhone, FaCheck, FaArrowLeft, FaArrowRight, FaShieldAlt, FaUsers, FaMapMarkerAlt,
} from 'react-icons/fa';
import { useResidences } from '../context/ResidencesContext';
import useEtablissement from '../hooks/useEtablissement';
import { API_ENDPOINTS, apiRequest, getClientToken, setClientToken } from '../config/api';
import './Reservation.css';

const ETAPES = ['Votre séjour', 'Vos coordonnées', 'Vérification'];
const CHAMPS_ETAPE = [['arrivalDate', 'departureDate', 'guests'], ['firstName', 'lastName', 'email', 'phone'], []];
const CHAMPS_VOYAGEUR = ['voyageurPrenom', 'voyageurNom', 'voyageurTelephone'];
const fcfa = (n) => `${Math.round(Number(n) || 0).toLocaleString('fr-FR')} FCFA`;
const dateLongue = (d) => (d ? new Date(`${d}T00:00:00`).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' }) : '—');

const Reservation = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { getResidenceById, createReservation, offline, loading } = useResidences();
  const etab = useEtablissement();
  const [residence, setResidence] = useState(null);
  const [etape, setEtape] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [confirmation, setConfirmation] = useState(null);
  const [submitError, setSubmitError] = useState('');

  // Date du jour au format AAAA-MM-JJ (heure locale)
  const today = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);

  const { register, handleSubmit, formState: { errors }, setValue, watch, trigger, getValues } = useForm({ mode: 'onTouched' });

  // Conditions de l'entreprise qui propose la résidence (acompte, moyens de paiement)
  const [conditions, setConditions] = useState(null);
  useEffect(() => {
    if (!residence?.id) return undefined;
    let actif = true;
    apiRequest(API_ENDPOINTS.residences.getById(residence.id))
      .then(r => { if (actif) setConditions(r.data.entreprise || null); })
      .catch(() => {});
    return () => { actif = false; };
  }, [residence?.id]);
  const regles = conditions?.acompte || etab.acompte;
  const moyensTexte = (() => {
    const ids = (conditions?.moyensPaiement || etab.moyensPaiement || []).map(m => m.id);
    if (ids.includes('geniuspay') && ids.includes('pispi')) return 'Mobile Money, carte bancaire ou PI-SPI';
    if (ids.includes('geniuspay')) return 'Mobile Money ou carte bancaire';
    if (ids.includes('pispi')) return 'PI-SPI';
    return null;
  })();

  // Résidence et critères venus de l'URL (dates et personnes choisies sur l'accueil)
  useEffect(() => {
    const residenceId = searchParams.get('residence');
    if (residenceId) {
      const trouvee = getResidenceById(residenceId);
      if (trouvee) setResidence(trouvee);
    }
    const a = searchParams.get('arrivee');
    const d = searchParams.get('depart');
    const p = searchParams.get('personnes');
    if (a && a >= today) setValue('arrivalDate', a);
    if (d && (!a || d > a)) setValue('departureDate', d);
    if (p) setValue('guests', p);
  }, [searchParams, setValue, getResidenceById, today]);

  // Client connecté (Service client) : ses coordonnées sont reprises, il peut réserver pour un autre
  const [compte, setCompte] = useState(null);
  useEffect(() => {
    const token = getClientToken();
    if (!token) return undefined;
    let actif = true;
    apiRequest(API_ENDPOINTS.client.me, { token })
      .then((r) => {
        if (!actif || !r.data) return;
        setCompte(r.data);
        setValue('firstName', r.data.prenom); setValue('lastName', r.data.nom);
        setValue('email', r.data.email); setValue('phone', r.data.telephone);
      })
      .catch(() => {}); // session expirée : formulaire normal
    return () => { actif = false; };
  }, [setValue]);
  const seDeconnecter = () => {
    setClientToken(null);
    setCompte(null);
    for (const k of ['firstName', 'lastName', 'email', 'phone']) setValue(k, '');
  };
  const pourAutrui = watch('pourAutrui');

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
      // Sans compte connecté : accès immédiat à cette réservation dans « Mes réservations »
      if (!compte && result.acces) setClientToken(result.acces);
      try {
        const { firstName, lastName, email, phone } = data;
        localStorage.setItem('coordonneesClient', JSON.stringify({ firstName, lastName, email, phone }));
      } catch {
        // stockage indisponible : sans conséquence
      }
      setConfirmation({ ...result, email: data.email, ...data });
      window.scrollTo(0, 0);
    } catch (error) {
      setSubmitError(error.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const suivant = async () => {
    if (await trigger(etape === 1 && pourAutrui ? [...CHAMPS_ETAPE[1], ...CHAMPS_VOYAGEUR] : CHAMPS_ETAPE[etape])) {
      setEtape(e => Math.min(2, e + 1));
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const precedent = () => setEtape(e => Math.max(0, e - 1));

  const arrivee = watch('arrivalDate');
  const depart = watch('departureDate');
  const personnes = watch('guests');
  const nuits = arrivee && depart && depart > arrivee
    ? Math.round((Date.parse(`${depart}T00:00:00Z`) - Date.parse(`${arrivee}T00:00:00Z`)) / 86400000)
    : 0;
  const total = residence && nuits > 0 ? nuits * Number(residence.price) : 0;
  const pctAcompte = Number(regles?.pourcentage) || 30;
  const acompte = Math.ceil(total * pctAcompte / 100);
  const minStay = residence?.availability?.minStay || 1;
  const maxStay = residence?.availability?.maxStay || 365;

  // ---------- Écran de confirmation ----------
  if (confirmation) {
    return (
      <div className="reservation-page">
        <div className="container">
          <div className="resa-merci">
            <span className="resa-merci-icone"><FaCheck /></span>
            <p className="surtitre">Demande envoyée</p>
            <h1>Merci {confirmation.firstName}, c'est bien reçu !</h1>
            <p className="resa-merci-texte">
              Votre demande pour <b>{residence?.name}</b> du {dateLongue(confirmation.arrivalDate)} au {dateLongue(confirmation.departureDate)} est enregistrée.
              {confirmation.emailEnvoye ? ` Un récapitulatif vient d'être envoyé à ${confirmation.email}.` : ' Conservez bien votre référence ci-dessous.'}
            </p>

            <div className="resa-merci-ref">
              <span>Référence</span>
              <b>{confirmation.reference}</b>
            </div>

            <ol className="resa-suite">
              <li className="fait"><span><FaCheck /></span><div><b>Demande envoyée</b><p>Aucun paiement n'a été effectué.</p></div></li>
              <li><span>2</span><div><b>Confirmation par notre équipe</b><p>Nous vérifions la disponibilité et vous répondons par email.</p></div></li>
              <li><span>3</span><div><b>Acompte de {fcfa(Math.ceil(Number(confirmation.prixTotal) * pctAcompte / 100))}</b><p>{moyensTexte ? `À régler en ligne (${moyensTexte}) depuis « Mes réservations », une fois le séjour confirmé.` : 'Modalités communiquées à la confirmation du séjour.'}</p></div></li>
              <li><span>4</span><div><b>Votre séjour</b><p>Le solde de {fcfa(Number(confirmation.prixTotal) - Math.ceil(Number(confirmation.prixTotal) * pctAcompte / 100))} est réglé selon les modalités indiquées à la confirmation.</p></div></li>
            </ol>

            {!compte && (
              <p className="resa-merci-compte">
                Votre espace client est créé avec l'adresse <b>{confirmation.email}</b>. Pour retrouver toutes vos réservations,
                ouvrez l'email reçu et cliquez sur « Suivre ma réservation » : vous choisirez simplement votre mot de passe.
              </p>
            )}

            <div className="resa-merci-actions">
              <button type="button" className="btn btn-primary" onClick={() => navigate('/mes-reservations', { state: { email: confirmation.email, reference: confirmation.reference } })}>
                Suivre ma réservation
              </button>
              <Link to="/residences" className="btn btn-outline">Voir d'autres résidences</Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ---------- Formulaire en 3 étapes ----------
  return (
    <div className="reservation-page">
      <div className="container">
        <button type="button" className="resa-retour" onClick={() => (residence ? navigate(`/residence/${residence.id}`) : navigate('/residences'))}>
          <FaArrowLeft aria-hidden="true" /> {residence ? 'Retour à la résidence' : 'Retour aux résidences'}
        </button>
        <h1 className="resa-titre">Réserver votre séjour</h1>

        <ol className="resa-stepper" aria-label="Étapes de la réservation">
          {ETAPES.map((nom, i) => (
            <li key={nom} className={i < etape ? 'fait' : i === etape ? 'actif' : ''} aria-current={i === etape ? 'step' : undefined}>
              <span className="resa-stepper-pastille">{i < etape ? <FaCheck /> : i + 1}</span>
              <span className="resa-stepper-nom">{nom}</span>
            </li>
          ))}
        </ol>

        {!residence && !loading && (
          <div className="error-message" role="alert">
            Aucune résidence sélectionnée. <Link to="/residences">Choisissez une résidence</Link> pour la réserver.
          </div>
        )}

        <div className="resa-cadre">
          <form onSubmit={handleSubmit(onSubmit)} className="resa-form" noValidate>
            {/* Étape 1 : séjour */}
            <fieldset hidden={etape !== 0}>
              <legend>Votre séjour</legend>
              {residence?.availability && (
                <p className="resa-aide">Séjour de {minStay === 1 ? '1 nuit' : `${minStay} nuits`} minimum et {maxStay} nuits maximum.</p>
              )}
              <div className="form-row">
                <div className="form-group">
                  <label htmlFor="arrivalDate"><FaCalendarAlt aria-hidden="true" /> Arrivée</label>
                  <input type="date" id="arrivalDate" min={today} aria-invalid={Boolean(errors.arrivalDate)}
                    {...register('arrivalDate', {
                      required: 'Choisissez votre date d\'arrivée',
                      validate: v => v >= today || 'La date d\'arrivée ne peut pas être dans le passé',
                    })}
                    className={errors.arrivalDate ? 'error' : ''} />
                  {errors.arrivalDate && <span className="error-message" role="alert">{errors.arrivalDate.message}</span>}
                </div>
                <div className="form-group">
                  <label htmlFor="departureDate"><FaCalendarAlt aria-hidden="true" /> Départ</label>
                  <input type="date" id="departureDate" aria-invalid={Boolean(errors.departureDate)}
                    min={(() => {
                      if (!arrivee) return today;
                      const d = new Date(`${arrivee}T00:00:00Z`);
                      d.setUTCDate(d.getUTCDate() + minStay);
                      return d.toISOString().slice(0, 10);
                    })()}
                    {...register('departureDate', {
                      required: 'Choisissez votre date de départ',
                      validate: value => {
                        const a = getValues('arrivalDate');
                        if (!a) return true;
                        const n = Math.round((Date.parse(`${value}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000);
                        if (n <= 0) return 'Le départ doit être après l\'arrivée';
                        if (n < minStay) return `Séjour minimum : ${minStay} nuit${minStay > 1 ? 's' : ''} pour cette résidence`;
                        if (n > maxStay) return `Séjour maximum : ${maxStay} nuits pour cette résidence`;
                        return true;
                      },
                    })}
                    className={errors.departureDate ? 'error' : ''} />
                  {errors.departureDate && <span className="error-message" role="alert">{errors.departureDate.message}</span>}
                </div>
              </div>
              <div className="form-group">
                <label htmlFor="guests"><FaUsers aria-hidden="true" /> Nombre de personnes</label>
                <select id="guests" aria-invalid={Boolean(errors.guests)}
                  {...register('guests', { required: 'Indiquez le nombre de personnes', min: { value: 1, message: 'Au moins 1 personne' } })}
                  className={errors.guests ? 'error' : ''}>
                  <option value="">Choisir</option>
                  {Array.from({ length: residence?.maxGuests || 8 }, (_, i) => i + 1).map(n => (
                    <option key={n} value={n}>{n} personne{n > 1 ? 's' : ''}</option>
                  ))}
                </select>
                {errors.guests && <span className="error-message" role="alert">{errors.guests.message}</span>}
              </div>
            </fieldset>

            {/* Étape 2 : coordonnées */}
            <fieldset hidden={etape !== 1}>
              <legend>Vos coordonnées</legend>
              {compte && (
                <div className="resa-compte">
                  <p>Vous réservez en tant que <b>{compte.prenom} {compte.nom}</b><br /><span>{compte.email} · {compte.telephone}</span></p>
                  <button type="button" className="btn-lien" onClick={seDeconnecter}>Ce n'est pas moi</button>
                </div>
              )}
              <div className="form-row" hidden={Boolean(compte)}>
                <div className="form-group">
                  <label htmlFor="firstName"><FaUser aria-hidden="true" /> Prénom</label>
                  <input type="text" id="firstName" autoComplete="given-name" aria-invalid={Boolean(errors.firstName)}
                    {...register('firstName', { required: 'Le prénom est obligatoire', minLength: { value: 2, message: 'Au moins 2 caractères' } })}
                    className={errors.firstName ? 'error' : ''} />
                  {errors.firstName && <span className="error-message" role="alert">{errors.firstName.message}</span>}
                </div>
                <div className="form-group">
                  <label htmlFor="lastName"><FaUser aria-hidden="true" /> Nom</label>
                  <input type="text" id="lastName" autoComplete="family-name" aria-invalid={Boolean(errors.lastName)}
                    {...register('lastName', { required: 'Le nom est obligatoire', minLength: { value: 2, message: 'Au moins 2 caractères' } })}
                    className={errors.lastName ? 'error' : ''} />
                  {errors.lastName && <span className="error-message" role="alert">{errors.lastName.message}</span>}
                </div>
              </div>
              <div className="form-row" hidden={Boolean(compte)}>
                <div className="form-group">
                  <label htmlFor="email"><FaEnvelope aria-hidden="true" /> Email</label>
                  <input type="email" id="email" autoComplete="email" inputMode="email" aria-describedby="email-aide" aria-invalid={Boolean(errors.email)}
                    {...register('email', { required: 'L\'email est obligatoire', pattern: { value: /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i, message: 'Veuillez entrer un email valide' } })}
                    className={errors.email ? 'error' : ''} />
                  <span id="email-aide" className="champ-aide">La confirmation et le suivi arrivent à cette adresse.</span>
                  {errors.email && <span className="error-message" role="alert">{errors.email.message}</span>}
                </div>
                <div className="form-group">
                  <label htmlFor="phone"><FaPhone aria-hidden="true" /> Téléphone</label>
                  <input type="tel" id="phone" autoComplete="tel" inputMode="tel" placeholder="07 00 00 00 00" aria-invalid={Boolean(errors.phone)}
                    {...register('phone', { required: 'Le téléphone est obligatoire', pattern: { value: /^[+]?[0-9\s\-()]{8,}$/, message: 'Veuillez entrer un numéro valide' } })}
                    className={errors.phone ? 'error' : ''} />
                  {errors.phone && <span className="error-message" role="alert">{errors.phone.message}</span>}
                </div>
              </div>
              <label className="resa-autrui">
                <input type="checkbox" {...register('pourAutrui')} />
                Je réserve pour une autre personne
              </label>
              {pourAutrui && (
                <div className="resa-voyageur">
                  <p className="champ-aide">La réservation reste dans votre espace ; indiquez la personne qui séjourne.</p>
                  <div className="form-row">
                    <div className="form-group">
                      <label htmlFor="voyageurPrenom"><FaUser aria-hidden="true" /> Prénom du voyageur</label>
                      <input type="text" id="voyageurPrenom" aria-invalid={Boolean(errors.voyageurPrenom)}
                        {...register('voyageurPrenom', { required: pourAutrui && 'Le prénom du voyageur est obligatoire', minLength: { value: 2, message: 'Au moins 2 caractères' } })}
                        className={errors.voyageurPrenom ? 'error' : ''} />
                      {errors.voyageurPrenom && <span className="error-message" role="alert">{errors.voyageurPrenom.message}</span>}
                    </div>
                    <div className="form-group">
                      <label htmlFor="voyageurNom"><FaUser aria-hidden="true" /> Nom du voyageur</label>
                      <input type="text" id="voyageurNom" aria-invalid={Boolean(errors.voyageurNom)}
                        {...register('voyageurNom', { required: pourAutrui && 'Le nom du voyageur est obligatoire', minLength: { value: 2, message: 'Au moins 2 caractères' } })}
                        className={errors.voyageurNom ? 'error' : ''} />
                      {errors.voyageurNom && <span className="error-message" role="alert">{errors.voyageurNom.message}</span>}
                    </div>
                  </div>
                  <div className="form-group">
                    <label htmlFor="voyageurTelephone"><FaPhone aria-hidden="true" /> Téléphone du voyageur</label>
                    <input type="tel" id="voyageurTelephone" inputMode="tel" placeholder="07 00 00 00 00" aria-invalid={Boolean(errors.voyageurTelephone)}
                      {...register('voyageurTelephone', { required: pourAutrui && 'Le téléphone du voyageur est obligatoire', pattern: { value: /^[+]?[0-9\s\-()]{8,}$/, message: 'Veuillez entrer un numéro valide' } })}
                      className={errors.voyageurTelephone ? 'error' : ''} />
                    {errors.voyageurTelephone && <span className="error-message" role="alert">{errors.voyageurTelephone.message}</span>}
                  </div>
                </div>
              )}
              <div className="form-group">
                <label htmlFor="specialRequests">Demandes particulières <span className="facultatif">(facultatif)</span></label>
                <textarea id="specialRequests" rows="3" placeholder="Heure d'arrivée, lit bébé, préférences…" {...register('specialRequests')} />
              </div>
            </fieldset>

            {/* Étape 3 : vérification */}
            {etape === 2 && (
              <fieldset>
                <legend>Vérifiez votre demande</legend>
                <dl className="resa-verif">
                  <div><dt>Séjour</dt><dd>{dateLongue(arrivee)} → {dateLongue(depart)}<button type="button" onClick={() => setEtape(0)}>Modifier</button></dd></div>
                  <div><dt>Personnes</dt><dd>{personnes}<button type="button" onClick={() => setEtape(0)}>Modifier</button></dd></div>
                  <div><dt>{pourAutrui ? 'Réservé par' : 'Contact'}</dt><dd>{getValues('firstName')} {getValues('lastName')} · {getValues('email')} · {getValues('phone')}<button type="button" onClick={() => setEtape(1)}>Modifier</button></dd></div>
                  {pourAutrui && <div><dt>Voyageur</dt><dd>{getValues('voyageurPrenom')} {getValues('voyageurNom')} · {getValues('voyageurTelephone')}<button type="button" onClick={() => setEtape(1)}>Modifier</button></dd></div>}
                  {getValues('specialRequests') && <div><dt>Demandes</dt><dd>« {getValues('specialRequests')} »</dd></div>}
                </dl>
                <div className="resa-garanties">
                  <p><FaShieldAlt aria-hidden="true" /> <b>Aucun paiement maintenant.</b> Nous confirmons d'abord la disponibilité.</p>
                  <p><b>Payez uniquement sur BABI RESIDENCE</b>, depuis « Mes réservations ». Ne versez jamais d'argent demandé par WhatsApp, SMS ou téléphone : vous ne seriez pas protégé.</p>
                  <p>{moyensTexte
                    ? <>Après confirmation, vous réglez un acompte de {pctAcompte} % en ligne ({moyensTexte}). En cas d'annulation, il est remboursé en entier dans les {regles?.integralJours ?? 5} jours suivant le paiement{Number(regles?.remboursementPourcentage) > 0 ? `, puis à ${regles.remboursementPourcentage} %` : ''}, et plus du tout à moins de {regles?.avantArriveeJours ?? 3} jours de l'arrivée.</>
                    : <>Après confirmation, les modalités de paiement vous sont communiquées par {conditions?.nom || 'l\'établissement'}.</>}</p>
                </div>
              </fieldset>
            )}

            {submitError && <div className="error-message" role="alert">{submitError}</div>}
            {offline && <div className="error-message" role="alert">Le service de réservation est momentanément indisponible. Réessayez dans quelques instants.</div>}

            <div className="resa-navigation">
              {etape > 0 ? (
                <button type="button" className="btn btn-outline" onClick={precedent}><FaArrowLeft aria-hidden="true" /> Retour</button>
              ) : <span />}
              {etape < 2 ? (
                <button type="button" className="btn btn-primary" onClick={suivant} disabled={!residence}>
                  Continuer <FaArrowRight aria-hidden="true" />
                </button>
              ) : (
                <button type="submit" className="btn btn-primary" disabled={isSubmitting || !residence || offline}>
                  {isSubmitting ? 'Envoi en cours…' : 'Envoyer ma demande'}
                </button>
              )}
            </div>
          </form>

          {/* Récapitulatif */}
          {residence && (
            <aside className="resa-recap" aria-label="Récapitulatif">
              {residence.images?.[0] && <img src={residence.images[0]} alt="" />}
              <div className="resa-recap-corps">
                <p className="resa-recap-nom">{residence.name}</p>
                <p className="resa-recap-lieu"><FaMapMarkerAlt aria-hidden="true" /> {residence.location}</p>
                <dl className="resa-recap-lignes">
                  <div><dt>Arrivée</dt><dd>{arrivee ? dateLongue(arrivee) : '—'}</dd></div>
                  <div><dt>Départ</dt><dd>{depart ? dateLongue(depart) : '—'}</dd></div>
                  <div><dt>Personnes</dt><dd>{personnes || '—'}</dd></div>
                </dl>
                <div className="resa-recap-prix" aria-live="polite">
                  {nuits > 0 ? (
                    <>
                      <p><span>{fcfa(residence.price)} × {nuits} nuit{nuits > 1 ? 's' : ''}</span><span>{fcfa(total)}</span></p>
                      <p className="total"><span>Total du séjour</span><span>{fcfa(total)}</span></p>
                      <p className="acompte"><span>Acompte ({pctAcompte} %), après confirmation</span><span>{fcfa(acompte)}</span></p>
                      <p className="maintenant"><span>À payer maintenant</span><span>0 FCFA</span></p>
                    </>
                  ) : (
                    <p className="resa-recap-vide">{fcfa(residence.price)} / nuit · choisissez vos dates pour voir le total.</p>
                  )}
                </div>
              </div>
            </aside>
          )}
        </div>
      </div>
    </div>
  );
};

export default Reservation;
