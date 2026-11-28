import React, { useCallback, useEffect, useState } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { FaSignOutAlt, FaEye, FaEyeSlash } from 'react-icons/fa';
import { API_ENDPOINTS, apiRequest, getClientToken, setClientToken } from '../config/api';
import PaiementAcompte, { preparerPaiementDirect } from '../components/PaiementAcompte';
import { Etoiles, FormulaireAvis } from '../components/Avis';
import { useFavorites } from '../context/FavoritesContext';
import './MesReservations.css';

const fcfa = (n) => `${Number(n).toLocaleString('fr-FR')} FCFA`;
const dateCourte = (d) => new Date(d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' });

// Conditions de remboursement de l'acompte, par paliers, avec les dates de la réservation
function texteConditions(p) {
  const maintenant = new Date();
  if (!p.remboursable) return 'Non remboursable en cas d\'annulation désormais.';
  const parts = [];
  if (maintenant < new Date(p.limiteIntegral)) parts.push(`remboursé en entier si vous annulez avant le ${dateCourte(p.limiteIntegral)}`);
  if (p.paliers) parts.push(`${fcfa(p.montantPartiel)} (${p.pourcentagePartiel} %) remboursés jusqu'au ${dateCourte(p.limite)}`);
  return `En cas d'annulation : ${parts.join(', puis ')}.`;
}


const STATUTS = {
  en_attente: { texte: 'En attente de confirmation', classe: 'attente' },
  confirmee: { texte: 'Confirmée', classe: 'confirmee' },
  annulee: { texte: 'Annulée', classe: 'annulee' },
};

const formatDate = (d) => (d ? new Date(d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }) : '—');

const MIN_MDP = 8;

// Email du client mémorisé sur l'appareil (dernière session ou dernière réservation)
const emailMemorise = () => {
  try {
    return localStorage.getItem('clientEmail') || JSON.parse(localStorage.getItem('coordonneesClient') || 'null')?.email || '';
  } catch {
    return '';
  }
};
const memoriserEmail = (e) => { try { if (e) localStorage.setItem('clientEmail', String(e).toLowerCase()); } catch { /* stockage indisponible */ } };
const oublierEmail = () => { try { localStorage.removeItem('clientEmail'); localStorage.removeItem('coordonneesClient'); } catch { /* stockage indisponible */ } };

/**
 * « Mes réservations » (Service client). Aucun formulaire de connexion pour le public :
 *  - session ouverte (après une réservation, un lien d'email ou une connexion) : les réservations ;
 *  - ?mdp=<jeton> (lien des emails, compte sans mot de passe) : choix du mot de passe ;
 *  - session expirée, email connu (appareil ou #email= des liens d'email) : le mot de passe seul ;
 *  - personne de connu : rien à remplir, invitation à découvrir les résidences.
 */
const MesReservations = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [token, setToken] = useState(() => getClientToken());
  const { synchroniser } = useFavorites(); // favoris retrouvés sur le compte dès la connexion
  const [reservations, setReservations] = useState(null);
  const [email, setEmail] = useState(() => location.state?.email || emailMemorise());
  const [motDePasse, setMotDePasse] = useState('');
  const [confirmationMdp, setConfirmationMdp] = useState('');
  const [voirMdp, setVoirMdp] = useState(false);
  const [noterId, setNoterId] = useState(null); // réservation en cours de notation
  const [jetonMdp, setJetonMdp] = useState(null); // lien « choisir mon mot de passe » reçu par email
  const [compte, setCompte] = useState(null); // compte connecté ; null pour un accès à une seule réservation
  const [limitee, setLimitee] = useState(false); // accès à une seule réservation (référence ou juste après réservation)
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');

  // Demande d'annulation en cours de saisie
  const [cancelId, setCancelId] = useState(null);
  const [motif, setMotif] = useState('');
  const [sending, setSending] = useState(false);
  const [paiementPour, setPaiementPour] = useState(null); // réservation dont on paie l'acompte
  const [paiementDirect, setPaiementDirect] = useState(null);
  // Retour depuis la page de paiement GeniusPay
  const [retourPaiement, setRetourPaiement] = useState(null); // { etat: 'verif' | 'paye' | 'echec' | 'attente', message }

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

  const [objetPaiement, setObjetPaiement] = useState('acompte'); // 'acompte' | 'solde'
  const ouvrirPaiement = (r, objet = 'acompte') => {
    setPaiementDirect(preparerPaiementDirect(r, objet)); // à faire pendant le geste (ouverture d'onglet)
    setObjetPaiement(objet);
    setPaiementPour(r);
  };

  // Liens des emails d'un compte qui a déjà son mot de passe : #email=<adresse> (jamais envoyé au serveur)
  useEffect(() => {
    const m = /^#email=(.+)$/.exec(location.hash || '');
    if (m) {
      const adresse = decodeURIComponent(m[1]);
      setEmail(adresse);
      memoriserEmail(adresse);
      navigate('/mes-reservations', { replace: true });
    }
  }, [location.hash, navigate]);

  // Liens reçus par email : ?mdp=<jeton> (choisir son mot de passe) ou ancien ?acces=<jeton>,
  // mémorisés puis retirés de l'adresse
  useEffect(() => {
    const mdp = searchParams.get('mdp');
    const acces = searchParams.get('acces');
    if (mdp) {
      setJetonMdp(mdp);
      navigate('/mes-reservations', { replace: true });
    } else if (acces) {
      setClientToken(acces);
      setToken(acces);
      navigate('/mes-reservations', { replace: true });
    }
  }, [searchParams, navigate]);

  // ?paiement=geniuspay&reservation=…&tx=…[&echec=1] : on confirme auprès du serveur (qui interroge GeniusPay)
  useEffect(() => {
    if (searchParams.get('paiement') !== 'geniuspay' || !token) return;
    const reservationId = searchParams.get('reservation');
    const tx = searchParams.get('tx');
    const echecAnnonce = searchParams.get('echec') === '1';
    navigate('/mes-reservations', { replace: true });
    if (!reservationId || !tx) return;
    // Pas d'annulation au nettoyage : retirer les paramètres de l'adresse relance cet effet
    const actif = true;
    setRetourPaiement({ etat: 'verif', message: 'Nous vérifions votre paiement auprès de GeniusPay…' });
    (async () => {
      for (let essai = 0; essai < 8 && actif; essai += 1) {
        try {
          const r = await apiRequest(`${API_ENDPOINTS.client.reservations}/${reservationId}/acompte/${tx}`, { token });
          if (r.data.statut === 'paye') {
            if (actif) setRetourPaiement({ etat: 'paye', message: r.data.objet === 'solde'
              ? 'Solde reçu : votre séjour est entièrement réglé. Un reçu vous a été envoyé par email.'
              : 'Acompte reçu : votre séjour est garanti. Un reçu vous a été envoyé par email.' });
            charger();
            return;
          }
          if (['refuse', 'expire'].includes(r.data.statut)) {
            if (actif) setRetourPaiement({ etat: 'echec', message: `${r.data.raison || 'Le paiement n\'a pas abouti.'} Vous pouvez réessayer depuis la réservation ci-dessous.` });
            return;
          }
        } catch {
          // réseau : on réessaie
        }
        await new Promise(res => setTimeout(res, 2500));
      }
      if (actif) {
        setRetourPaiement(echecAnnonce
          ? { etat: 'echec', message: 'Le paiement n\'a pas abouti. Vous pouvez réessayer depuis la réservation ci-dessous.' }
          : { etat: 'attente', message: 'Paiement en cours de confirmation. Cette page se mettra à jour dès que GeniusPay l\'aura validé (vous recevrez aussi un email).' });
        charger();
      }
    })();
  }, [searchParams, token]); // eslint-disable-line react-hooks/exhaustive-deps

  const deconnexion = useCallback((message = '') => {
    setClientToken(null);
    setToken(null);
    setReservations(null);
    setCompte(null);
    setMotDePasse('');
    setError(message);
  }, []);

  const charger = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const [response, moi] = await Promise.all([
        apiRequest(API_ENDPOINTS.client.reservations, { token }),
        apiRequest(API_ENDPOINTS.client.me, { token }).catch(() => null),
      ]);
      setReservations(response.data);
      setCompte(moi?.data || null);
      setLimitee(Boolean(moi?.limiteA));
      if (response.email) { setEmail(response.email); memoriserEmail(response.email); }
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

  const ouvrirSession = (data) => {
    setClientToken(data.token);
    setToken(data.token);
    setCompte(data.client);
    synchroniser();
    memoriserEmail(data.client?.email);
    setMotDePasse('');
    setConfirmationMdp('');
  };

  const seConnecter = async (e) => {
    e.preventDefault();
    setError('');
    setInfo('');
    setLoading(true);
    try {
      ouvrirSession((await apiRequest(API_ENDPOINTS.client.login, { method: 'POST', body: { email, motDePasse } })).data);
    } catch (err) {
      setError(err.message);
      setLoading(false);
    }
  };

  const choisirMotDePasse = async (e) => {
    e.preventDefault();
    setError('');
    if (motDePasse.length < MIN_MDP) return setError(`Le mot de passe doit contenir au moins ${MIN_MDP} caractères.`);
    if (motDePasse !== confirmationMdp) return setError('Les deux mots de passe ne sont pas identiques.');
    setLoading(true);
    try {
      const r = await apiRequest(API_ENDPOINTS.client.setPassword, { method: 'POST', body: { jeton: jetonMdp, motDePasse } });
      setJetonMdp(null);
      ouvrirSession(r.data);
      setInfo('Mot de passe enregistré. Vous êtes connecté sur cet appareil.');
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
      const response = await apiRequest(API_ENDPOINTS.client.passwordLink, { method: 'POST', body: { email } });
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

  const champMotDePasse = (id, valeur, setValeur, autoComplete, label) => (
    <>
      <label htmlFor={id}>{label}</label>
      <div className="acces-mdp">
        <input id={id} type={voirMdp ? 'text' : 'password'} required value={valeur} maxLength={200}
          onChange={(e) => { setValeur(e.target.value); setError(''); }} autoComplete={autoComplete} />
        <button type="button" onClick={() => setVoirMdp(v => !v)} aria-label={voirMdp ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}>
          {voirMdp ? <FaEyeSlash /> : <FaEye />}
        </button>
      </div>
    </>
  );

  // ---------- Choix du mot de passe (lien reçu par email) ----------
  if (jetonMdp) {
    return (
      <div className="mes-reservations-page">
        <div className="container mes-reservations-container">
          <h1>Choisissez votre mot de passe</h1>
          <p className="mes-reservations-intro">
            Votre espace client a été créé lors de votre réservation. Choisissez un mot de passe pour retrouver toutes vos réservations, payer en ligne et suivre vos demandes.
          </p>
          <form className="acces-form" onSubmit={choisirMotDePasse}>
            {champMotDePasse('mdp-nouveau', motDePasse, setMotDePasse, 'new-password', 'Mot de passe')}
            {champMotDePasse('mdp-confirmation', confirmationMdp, setConfirmationMdp, 'new-password', 'Confirmer le mot de passe')}
            <p className="acces-hint">Au moins {MIN_MDP} caractères.</p>
            {error && <div className="error-message" role="alert">{error}</div>}
            <button type="submit" className="btn btn-primary" disabled={loading}>{loading ? 'Patientez…' : 'Enregistrer et voir mes réservations'}</button>
            {error && (email
              ? <button type="button" className="btn-lien-discret" onClick={(e) => { setJetonMdp(null); recevoirLien(e); }}>Recevoir un nouveau lien à {email}</button>
              : <p className="acces-hint">Utilisez le lien du dernier email reçu de BABI RESIDENCE.</p>)}
          </form>
        </div>
      </div>
    );
  }

  // ---------- Sans session ----------
  if (!token) {
    // Personne de connu sur cet appareil : rien à remplir
    if (!email) {
      return (
        <div className="mes-reservations-page">
          <div className="container mes-reservations-container acces-container">
            <h1>Mes réservations</h1>
            <p className="mes-reservations-intro">
              Vos réservations apparaîtront ici après votre première réservation. Ensuite, le bouton « Suivre ma réservation » de nos emails vous y ramène directement.
            </p>
            {error && <div className="error-message" role="alert">{error}</div>}
            <Link to="/residences" className="btn btn-primary">Découvrir les résidences</Link>
          </div>
        </div>
      );
    }
    // Client connu (session expirée) : son mot de passe seulement
    return (
      <div className="mes-reservations-page">
        <div className="container mes-reservations-container acces-container">
          <h1>Mes réservations</h1>
          <p className="mes-reservations-intro">Entrez votre mot de passe pour <b>{email}</b>.</p>
          <form className="acces-form" onSubmit={seConnecter}>
            {champMotDePasse('acces-mdp', motDePasse, setMotDePasse, 'current-password', 'Mot de passe')}
            {error && <div className="error-message" role="alert">{error}</div>}
            {info && <div className="success-notice" role="status">{info}</div>}
            <button type="submit" className="btn btn-primary" disabled={loading}>{loading ? 'Patientez…' : 'Voir mes réservations'}</button>
          </form>
          <ul className="acces-autres">
            <li>Pas encore de mot de passe, ou oublié ? <button type="button" className="btn-lien-discret" disabled={loading} onClick={recevoirLien}>Recevoir un lien par email</button></li>
            <li>Ce n'est pas vous ? <button type="button" className="btn-lien-discret" onClick={() => { oublierEmail(); setEmail(''); setError(''); setInfo(''); }}>Oublier cet appareil</button></li>
          </ul>
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
            {compte
              ? <p className="mes-reservations-intro">{compte.prenom} {compte.nom} · {compte.email}</p>
              : email && <p className="mes-reservations-intro">{email}</p>}
          </div>
          <button type="button" className="btn btn-outline btn-sm" onClick={() => deconnexion('')}>
            <FaSignOutAlt /> {compte ? 'Se déconnecter' : 'Quitter'}
          </button>
        </div>

        {limitee && reservations && (
          <div className="acces-limite">
            <p>Vous voyez uniquement cette réservation. Pour retrouver toutes vos réservations, cliquez sur « Suivre ma réservation » dans l'email reçu et choisissez votre mot de passe.</p>
          </div>
        )}

        {error && <div className="error-message" role="alert">{error}</div>}
        {info && <div className="success-notice" role="status">{info}</div>}
        {retourPaiement && (
          <div className={`retour-paiement ${retourPaiement.etat}`} role="status" aria-live="polite">
            {retourPaiement.etat === 'verif' && <span className="retour-spinner" aria-hidden="true" />}
            <p>{retourPaiement.message}</p>
            {retourPaiement.etat !== 'verif' && (
              <button type="button" className="retour-fermer" onClick={() => setRetourPaiement(null)} aria-label="Fermer le message">×</button>
            )}
          </div>
        )}

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
                  {r.voyageur && <p className="client-reservation-voyageur">Pour {r.voyageur.prenom} {r.voyageur.nom}</p>}
                  <p>{Number(r.prixTotal).toLocaleString('fr-FR')} FCFA · Réf. {r.id}</p>

                  {r.maNote && <p className="demande-info acceptee">Votre note : <Etoiles note={r.maNote} taille="petite" /> Merci pour votre avis.</p>}
                  {r.peutNoter && noterId !== r.id && (
                    <div className="acompte-bloc">
                      <p>Comment s'est passé votre séjour ? Votre avis aide les prochains voyageurs.</p>
                      <button type="button" className="btn btn-primary btn-sm" onClick={() => setNoterId(r.id)}>Noter mon séjour</button>
                    </div>
                  )}
                  {r.peutNoter && noterId === r.id && (
                    <FormulaireAvis reservationId={r.id} token={token} onAnnuler={() => setNoterId(null)}
                      onEnvoye={(note, message) => {
                        setNoterId(null);
                        setInfo(message);
                        setReservations(prev => prev.map(x => (x.id === r.id ? { ...x, maNote: note, peutNoter: false } : x)));
                      }} />
                  )}

                  {['a_rembourser', 'echec', 'en_cours'].includes(r.acompte?.remboursement?.statut) && (
                    <p className="demande-info attente">↩️ Remboursement de {Number(r.acompte.remboursement.montant ?? r.acompte.montant).toLocaleString('fr-FR')} FCFA en cours.</p>
                  )}
                  {r.acompte?.remboursement?.statut === 'rembourse' && (
                    <p className="demande-info acceptee">↩️ {Number(r.acompte.remboursement.montant ?? r.acompte.montant).toLocaleString('fr-FR')} FCFA remboursés le {formatDate(r.acompte.remboursement.le)}.</p>
                  )}
                  {r.acompte?.paye && !r.acompte?.remboursement && (
                    <p className="demande-info acceptee">
                      💰 Acompte de {Number(r.acompte.montant).toLocaleString('fr-FR')} FCFA reçu le {formatDate(r.acompte.payeLe)}.
                      {r.acompte.politique && r.statut !== 'annulee' && ` ${texteConditions(r.acompte.politique)}`}
                    </p>
                  )}
                  {r.acompte?.remboursement?.statut === 'non_remboursable' && (
                    <p className="demande-info refusee">Acompte non remboursé : {r.acompte.remboursement.raison}.</p>
                  )}
                  {r.acompte?.possible && (
                    <div className="acompte-bloc">
                      <p>
                        Garantissez votre séjour : acompte de <strong>{Number(r.acompte.montant).toLocaleString('fr-FR')} FCFA</strong> ({r.acompte.pourcentage} %).
                      </p>
                      <button type="button" className="btn btn-primary btn-sm" onClick={() => ouvrirPaiement(r)}>
                        {r.acompte.enCours?.methode === 'geniuspay' ? 'Reprendre le paiement de l\'acompte' : 'Payer l\'acompte'}
                      </button>
                      <p className="acompte-moyens-acceptes">
                        {(r.acompte.moyens || ['pispi']).map(m => (m === 'geniuspay' ? 'Wave, Orange Money, MTN, Moov, carte' : 'appli bancaire (PI-SPI)')).join(' · ')}
                      </p>
                    </div>
                  )}
                  {r.solde?.paye && r.statut !== 'annulee' && (
                    <p className="demande-info acceptee">
                      ✅ Séjour entièrement réglé : solde de {Number(r.solde.montant).toLocaleString('fr-FR')} FCFA {r.solde.enLigne ? 'payé en ligne' : `réglé sur place (${r.solde.libelleMoyen})`} le {formatDate(r.solde.payeLe)}.
                    </p>
                  )}
                  {r.solde?.remboursement?.statut === 'a_rembourser' && (
                    <p className="demande-info attente">↩️ Solde de {Number(r.solde.montant).toLocaleString('fr-FR')} FCFA : remboursement en cours par notre équipe.</p>
                  )}
                  {r.solde?.remboursement?.statut === 'rembourse' && (
                    <p className="demande-info acceptee">↩️ Solde de {Number(r.solde.montant).toLocaleString('fr-FR')} FCFA remboursé le {formatDate(r.solde.remboursement.le)}.</p>
                  )}
                  {r.solde?.aRegler && (
                    <div className="acompte-bloc solde-bloc">
                      <p>
                        Reste à régler : <strong>{Number(r.solde.montant).toLocaleString('fr-FR')} FCFA</strong>, en ligne dès maintenant ou à votre arrivée.
                      </p>
                      {r.solde.possible && (
                        <>
                          <button type="button" className="btn btn-outline btn-sm" onClick={() => ouvrirPaiement(r, 'solde')}>
                            {r.solde.enCours?.methode === 'geniuspay' ? 'Reprendre le paiement du solde' : 'Payer le solde en ligne'}
                          </button>
                          <p className="acompte-moyens-acceptes">
                            {(r.solde.moyens || ['pispi']).map(m => (m === 'geniuspay' ? 'Wave, Orange Money, MTN, Moov, carte' : 'appli bancaire (PI-SPI)')).join(' · ')} · ou sur place à l'arrivée
                          </p>
                        </>
                      )}
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
                      {r.acompte?.paye && r.acompte.politique && (
                        <p className={`demande-info ${r.acompte.politique.remboursable ? 'acceptee' : 'refusee'}`}>
                          {r.acompte.politique.remboursable
                            ? (r.acompte.politique.integral
                              ? `✓ Si l'annulation est acceptée, votre acompte de ${fcfa(r.acompte.montant)} vous sera remboursé en entier.`
                              : `✓ Si l'annulation est acceptée, ${fcfa(r.acompte.politique.montant)} vous seront remboursés (${r.acompte.politique.pourcentage} % de votre acompte de ${fcfa(r.acompte.montant)}).`)
                            : `⚠️ Votre acompte de ${Number(r.acompte.montant).toLocaleString('fr-FR')} FCFA ne sera pas remboursé : ${r.acompte.politique.raison.toLowerCase()}.`}
                        </p>
                      )}
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
            objet={objetPaiement}
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
