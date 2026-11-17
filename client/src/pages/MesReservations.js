import React, { useCallback, useEffect, useState } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { FaSearch, FaEnvelope, FaSignOutAlt } from 'react-icons/fa';
import { API_ENDPOINTS, apiRequest, getClientToken, setClientToken } from '../config/api';
import PaiementAcompte, { preparerPaiementDirect } from '../components/PaiementAcompte';
import './MesReservations.css';

const STATUTS = {
  en_attente: { texte: 'En attente de confirmation', classe: 'attente' },
  confirmee: { texte: 'Confirmée', classe: 'confirmee' },
  annulee: { texte: 'Annulée', classe: 'annulee' },
};

const formatDate = (d) => (d ? new Date(d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }) : '—');

/**
 * « Mes réservations » : accès sans compte (email + référence, ou lien reçu par email),
 * historique et demande d'annulation.
 */
const MesReservations = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [token, setToken] = useState(() => getClientToken());
  const [reservations, setReservations] = useState(null);
  const [email, setEmail] = useState(location.state?.email || '');
  const [reference, setReference] = useState(location.state?.reference || '');
  const [mode, setMode] = useState('reference'); // 'reference' | 'lien'
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');

  // Demande d'annulation en cours de saisie
  const [cancelId, setCancelId] = useState(null);
  const [motif, setMotif] = useState('');
  const [sending, setSending] = useState(false);
  const [paiementPour, setPaiementPour] = useState(null); // réservation dont on paie l'acompte
  const [paiementDirect, setPaiementDirect] = useState(null);

  const masquer = async (ids) => {
    const texte = ids
      ? 'Retirer cette réservation de votre historique ?'
      : 'Retirer de votre historique toutes les réservations annulées ou terminées ?';
    if (!window.confirm(texte)) return;
    try {
      await apiRequest(API_ENDPOINTS.client.hide, { method: 'POST', token, body: ids ? { ids } : {} });
      setReservations(prev => prev.filter(r => (ids ? !ids.includes(r.id) : !r.peutMasquer)));
    } catch (err) {
      setError(err.message);
    }
  };

  const ouvrirPaiement = (r) => {
    setPaiementDirect(preparerPaiementDirect(r)); // à faire pendant le geste (ouverture d'onglet)
    setPaiementPour(r);
  };

  // Lien reçu par email : ?acces=<jeton> → mémoriser puis retirer de l'adresse
  useEffect(() => {
    const acces = searchParams.get('acces');
    if (acces) {
      setClientToken(acces);
      setToken(acces);
      navigate('/mes-reservations', { replace: true });
    }
  }, [searchParams, navigate]);

  const deconnexion = useCallback((message = '') => {
    setClientToken(null);
    setToken(null);
    setReservations(null);
    setError(message);
  }, []);

  const charger = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const response = await apiRequest(API_ENDPOINTS.client.reservations, { token });
      setReservations(response.data);
      if (response.email) setEmail(response.email);
    } catch (err) {
      if (err.status === 401) deconnexion('Votre accès a expiré. Identifiez-vous à nouveau.');
      else setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [token, deconnexion]);

  useEffect(() => {
    charger();
  }, [charger]);

  const accederAvecReference = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const response = await apiRequest(API_ENDPOINTS.client.access, {
        method: 'POST',
        body: { email, reference },
      });
      setClientToken(response.data.token);
      setToken(response.data.token);
    } catch (err) {
      setError(err.message);
      setLoading(false);
    }
  };

  const recevoirLien = async (e) => {
    e.preventDefault();
    setError('');
    setInfo('');
    setLoading(true);
    try {
      const response = await apiRequest(API_ENDPOINTS.client.link, { method: 'POST', body: { email } });
      setInfo(response.message);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const envoyerDemande = async (reservation) => {
    setSending(true);
    setError('');
    try {
      const response = await apiRequest(API_ENDPOINTS.client.requestCancellation(reservation.id), {
        method: 'POST',
        token,
        body: { motif },
      });
      setReservations((prev) => prev.map((r) => (r.id === reservation.id ? response.data : r)));
      setInfo(response.message);
      setCancelId(null);
      setMotif('');
    } catch (err) {
      if (err.status === 401) deconnexion('Votre accès a expiré. Identifiez-vous à nouveau.');
      else setError(err.message);
    } finally {
      setSending(false);
    }
  };

  // ---------- Formulaire d'accès ----------
  if (!token) {
    return (
      <div className="mes-reservations-page">
        <div className="container mes-reservations-container">
          <h1>Mes réservations</h1>
          <p className="mes-reservations-intro">
            Consultez vos réservations et demandez une annulation, sans créer de compte.
          </p>

          <div className="acces-tabs" role="tablist">
            <button type="button" role="tab" aria-selected={mode === 'reference'}
              className={mode === 'reference' ? 'active' : ''} onClick={() => { setMode('reference'); setError(''); setInfo(''); }}>
              <FaSearch /> Avec ma référence
            </button>
            <button type="button" role="tab" aria-selected={mode === 'lien'}
              className={mode === 'lien' ? 'active' : ''} onClick={() => { setMode('lien'); setError(''); setInfo(''); }}>
              <FaEnvelope /> Recevoir un lien par email
            </button>
          </div>

          <form className="acces-form" onSubmit={mode === 'reference' ? accederAvecReference : recevoirLien}>
            <label htmlFor="acces-email">Email utilisé pour la réservation</label>
            <input id="acces-email" type="email" required value={email}
              onChange={(e) => setEmail(e.target.value)} placeholder="vous@exemple.com" autoComplete="email" />

            {mode === 'reference' ? (
              <>
                <label htmlFor="acces-ref">Référence de réservation</label>
                <input id="acces-ref" type="text" required value={reference}
                  onChange={(e) => setReference(e.target.value)} placeholder="RES_…" />
                <p className="acces-hint">La référence figure sur la page de confirmation et dans l'email reçu après votre réservation.</p>
              </>
            ) : (
              <p className="acces-hint">Vous recevrez un lien valable 24 heures pour voir l'historique de toutes vos réservations.</p>
            )}

            {error && <div className="error-message" role="alert">{error}</div>}
            {info && <div className="success-notice" role="status">{info}</div>}

            <button type="submit" className="btn btn-primary" disabled={loading}>
              {loading ? 'Patientez…' : mode === 'reference' ? 'Voir ma réservation' : 'Recevoir le lien'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  // ---------- Historique ----------
  return (
    <div className="mes-reservations-page">
      <div className="container mes-reservations-container">
        <div className="mes-reservations-header">
          <div>
            <h1>Mes réservations</h1>
            {email && <p className="mes-reservations-intro">{email}</p>}
          </div>
          <button type="button" className="btn btn-outline btn-sm" onClick={() => deconnexion('')}>
            <FaSignOutAlt /> Quitter
          </button>
        </div>

        {error && <div className="error-message" role="alert">{error}</div>}
        {info && <div className="success-notice" role="status">{info}</div>}

        {loading && !reservations && <p>Chargement…</p>}
        {reservations && reservations.length === 0 && <p>Aucune réservation trouvée.</p>}
        {reservations?.filter(r => r.peutMasquer).length > 1 && (
          <p className="nettoyer-historique">
            <button type="button" className="btn-lien-discret" onClick={() => masquer(null)}>
              Retirer toutes les réservations annulées ou terminées
            </button>
          </p>
        )}

        <div className="client-reservations">
          {reservations?.map((r) => {
            const statut = STATUTS[r.statut] || { texte: r.statut, classe: '' };
            const demande = r.demandeAnnulation;
            return (
              <article key={r.id} className={`client-reservation statut-${statut.classe}`}>
                {r.residence.photo && (
                  <img className="client-reservation-photo" src={r.residence.photo} alt={r.residence.nom} loading="lazy" />
                )}
                <div className="client-reservation-body">
                  <div className="client-reservation-title">
                    <h2>{r.residence.nom}</h2>
                    <span className={`client-badge ${statut.classe}`}>{statut.texte}</span>
                  </div>
                  <p>{r.residence.localisation}</p>
                  <p><strong>Du {formatDate(r.dates.arrivee)} au {formatDate(r.dates.depart)}</strong> · {r.nombrePersonnes} pers.</p>
                  <p>{Number(r.prixTotal).toLocaleString('fr-FR')} FCFA · Réf. {r.id}</p>

                  {['a_rembourser', 'echec', 'en_cours'].includes(r.acompte?.remboursement?.statut) && (
                    <p className="demande-info attente">↩️ Acompte de {Number(r.acompte.montant).toLocaleString('fr-FR')} FCFA : remboursement en cours.</p>
                  )}
                  {r.acompte?.remboursement?.statut === 'rembourse' && (
                    <p className="demande-info acceptee">↩️ Acompte remboursé le {formatDate(r.acompte.remboursement.le)}.</p>
                  )}
                  {r.acompte?.paye && !r.acompte?.remboursement && (
                    <p className="demande-info acceptee">💰 Acompte de {Number(r.acompte.montant).toLocaleString('fr-FR')} FCFA reçu le {formatDate(r.acompte.payeLe)}.</p>
                  )}
                  {r.acompte?.possible && (
                    <div className="acompte-bloc">
                      <p>
                        Garantissez votre séjour : acompte de <strong>{Number(r.acompte.montant).toLocaleString('fr-FR')} FCFA</strong> ({r.acompte.pourcentage} %).
                      </p>
                      <button type="button" className="btn btn-primary btn-sm" onClick={() => ouvrirPaiement(r)}>
                        Payer l'acompte avec PI-SPI
                      </button>
                    </div>
                  )}

                  {demande?.statut === 'en_attente' && (
                    <p className="demande-info attente">⏳ Demande d'annulation envoyée le {formatDate(demande.dateDemande)} : en attente de réponse.</p>
                  )}
                  {demande?.statut === 'acceptee' && (
                    <p className="demande-info acceptee">✔ Demande d'annulation acceptée le {formatDate(demande.dateReponse)}.</p>
                  )}
                  {demande?.statut === 'refusee' && (
                    <p className="demande-info refusee">
                      ✖ Demande d'annulation refusée le {formatDate(demande.dateReponse)}
                      {demande.reponse ? ` : « ${demande.reponse} »` : '.'}
                    </p>
                  )}

                  {r.peutMasquer && (
                    <button type="button" className="btn-lien-discret" onClick={() => masquer([r.id])}>
                      Retirer de mon historique
                    </button>
                  )}
                  {r.peutDemanderAnnulation && cancelId !== r.id && (
                    <button type="button" className="btn btn-outline btn-sm" onClick={() => { setCancelId(r.id); setMotif(''); setInfo(''); }}>
                      Demander l'annulation
                    </button>
                  )}

                  {cancelId === r.id && (
                    <div className="cancel-form">
                      <label htmlFor={`motif-${r.id}`}>Motif (facultatif)</label>
                      <textarea id={`motif-${r.id}`} rows="3" maxLength={500} value={motif}
                        onChange={(e) => setMotif(e.target.value)}
                        placeholder="Ex. : voyage reporté, changement de dates…" />
                      <p className="acces-hint">Votre réservation reste valable tant que notre équipe n'a pas validé l'annulation. Vous serez prévenu par email.</p>
                      <div className="cancel-actions">
                        <button type="button" className="btn btn-danger btn-sm" onClick={() => envoyerDemande(r)} disabled={sending}>
                          {sending ? 'Envoi…' : 'Envoyer la demande'}
                        </button>
                        <button type="button" className="btn btn-outline btn-sm" onClick={() => setCancelId(null)} disabled={sending}>
                          Retour
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </article>
            );
          })}
        </div>

        {paiementPour && (
          <PaiementAcompte
            reservation={paiementPour}
            direct={paiementDirect}
            token={token}
            onPaye={() => charger()}
            onFermer={() => { setPaiementPour(null); setPaiementDirect(null); charger(); }}
          />
        )}

        <p className="mes-reservations-footer">
          <Link to="/residences">Réserver un nouveau séjour</Link>
        </p>
      </div>
    </div>
  );
};

export default MesReservations;
