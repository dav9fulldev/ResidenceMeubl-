import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  FaCheck, FaTimes, FaSyncAlt, FaSearch, FaArrowLeft, FaEnvelope, FaPhone, FaChevronRight,
  FaUndo, FaExclamationTriangle,
} from 'react-icons/fa';
import { useResidences } from '../context/ResidencesContext';
import './AdminReservations.css';

const STATUTS = { en_attente: 'En attente', confirmee: 'Confirmée', annulee: 'Annulée' };
const CLASSES = { en_attente: 'attente', confirmee: 'confirmee', annulee: 'annulee' };

const formatDate = (v) => (v ? new Date(v).toLocaleDateString('fr-FR') : '—');
const dateCourte = (v) => (v ? new Date(v).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }) : '—');
const fcfa = (n) => `${Number(n || 0).toLocaleString('fr-FR')} FCFA`;
const nuits = (r) => Math.max(0, Math.round((Date.parse(`${r.dates.depart}T00:00:00Z`) - Date.parse(`${r.dates.arrivee}T00:00:00Z`)) / 86400000));
const enDemande = (r) => r.demandeAnnulation?.statut === 'en_attente';
const aProbleme = (r) => r.acompte?.doublons?.length > 0 || ['a_rembourser', 'echec'].includes(r.acompte?.remboursement?.statut);

/** Badge « acompte » d'une ligne du tableau. */
function badgeAcompte(r) {
  const rb = r.acompte?.remboursement?.statut;
  if (rb === 'rembourse') return <span className="adm-badge neutre">Remboursé</span>;
  if (rb === 'en_cours') return <span className="adm-badge paye">Remboursement…</span>;
  if (['a_rembourser', 'echec'].includes(rb)) return <span className="adm-badge demande">À rembourser</span>;
  if (rb === 'non_remboursable') return <span className="adm-badge neutre">Conservé</span>;
  if (r.acompte?.paye) return <span className="adm-badge paye">Payé</span>;
  if (r.statut === 'confirmee' && r.acompte?.possible) return <span className="adm-badge attente">À payer</span>;
  return <span className="adm-acompte-vide">—</span>;
}

const ONGLETS = [
  ['a_traiter', 'À traiter'], ['demandes', 'Annulations demandées'], ['en_attente', 'En attente'],
  ['confirmee', 'Confirmées'], ['annulee', 'Annulées'], ['', 'Toutes'],
];

/**
 * Réservations : tableau filtrable + panneau de détail avec les actions possibles selon le statut.
 */
const AdminReservations = () => {
  const { getReservations, updateReservationStatus, decideCancellation, markRefunded, retryRefund, reloadResidences, residences } = useResidences();
  const [params, setParams] = useSearchParams();
  const [reservations, setReservations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [filter, setFilter] = useState('a_traiter');
  const [recherche, setRecherche] = useState('');
  const [busyId, setBusyId] = useState(null);
  const premierChargement = useRef(true);
  const selectionId = params.get('id');

  const load = useCallback(async () => {
    try {
      const data = await getReservations();
      setReservations([...data].sort((a, b) => new Date(b.dateCreation) - new Date(a.dateCreation)));
      if (premierChargement.current) {
        premierChargement.current = false;
        const cible = params.get('id');
        if (cible) {
          const r = data.find(x => x.id === cible);
          if (r && !(enDemande(r) || r.statut === 'en_attente' || aProbleme(r))) setFilter('');
        } else if (!data.some(r => enDemande(r) || r.statut === 'en_attente' || aProbleme(r))) {
          setFilter('');
        }
      }
    } catch (err) {
      setError(`Chargement des réservations impossible : ${err.message}`);
    } finally {
      setLoading(false);
    }
  }, [getReservations, params]);

  useEffect(() => { load(); }, [load, residences]);

  const choisir = (id) => {
    const p = new URLSearchParams(params);
    if (id) p.set('id', id); else p.delete('id');
    setParams(p, { replace: true });
  };

  const maj = (id, champs) => setReservations(prev => prev.map(x => (x.id === id ? { ...x, ...champs } : x)));

  const relancer = async (r) => {
    setError(''); setNotice('');
    try {
      const res = await retryRefund(r.id);
      maj(r.id, { acompte: { ...r.acompte, remboursement: res.remboursement } });
      if (res.remboursement?.statut === 'echec') setError(`Remboursement refusé : ${res.remboursement.raison}`);
      else setNotice('Remboursement relancé via PI-SPI.');
    } catch (err) {
      setError(err.message);
    }
  };

  const rembourser = async (r) => {
    const reference = window.prompt(
      `Confirmez que ${Number(r.acompte.remboursement?.montant ?? r.acompte.montant).toLocaleString('fr-FR')} FCFA ont été remboursés à ${r.client.prenom} ${r.client.nom}.\nRéférence du remboursement (facultatif) :`, '');
    if (reference === null) return;
    try {
      const res = await markRefunded(r.id, reference);
      maj(r.id, { acompte: { ...r.acompte, remboursement: res.remboursement } });
      setNotice('Remboursement enregistré.');
    } catch (err) {
      setError(err.message);
    }
  };

  const changeStatus = async (reservation, statut) => {
    if (statut === 'annulee' && !window.confirm(`Refuser la réservation de ${reservation.client.prenom} ${reservation.client.nom} ? Le client sera prévenu par email.`)) return;
    setBusyId(reservation.id); setError(''); setNotice('');
    try {
      const result = await updateReservationStatus(reservation.id, statut);
      maj(reservation.id, { statut, statutLe: new Date().toISOString() });
      reloadResidences();
      const action = statut === 'confirmee' ? 'confirmée' : 'refusée';
      if (result?.emailEnvoye) setNotice(`Réservation ${action}. Un email a été envoyé à ${reservation.client.email}.`);
      else setError(`Réservation ${action}, mais l'email au client n'a pas pu être envoyé. Prévenez-le par téléphone (${reservation.client.telephone}).`);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyId(null);
    }
  };

  const decide = async (reservation, decision) => {
    let message = '';
    if (decision === 'refuser') {
      const saisie = window.prompt('Refuser la demande d\'annulation.\nMessage pour le client (facultatif) :', '');
      if (saisie === null) return;
      message = saisie;
    } else if (!window.confirm(`Accepter l'annulation de ${reservation.client.prenom} ${reservation.client.nom} ?\nLes dates seront libérées et le client prévenu par email.`)) {
      return;
    }
    setBusyId(reservation.id); setError(''); setNotice('');
    try {
      const result = await decideCancellation(reservation.id, decision, message);
      maj(reservation.id, { statut: result.statut, demandeAnnulation: result.demandeAnnulation, statutLe: new Date().toISOString() });
      if (decision === 'accepter') { reloadResidences(); load(); }
      const action = decision === 'accepter' ? 'Annulation acceptée' : 'Demande refusée, réservation maintenue';
      if (result.emailEnvoye) setNotice(`${action}. Un email a été envoyé à ${reservation.client.email}.`);
      else setError(`${action}, mais l'email au client n'a pas pu être envoyé. Prévenez-le par téléphone (${reservation.client.telephone}).`);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyId(null);
    }
  };

  const filtres = useMemo(() => ({
    a_traiter: (r) => enDemande(r) || r.statut === 'en_attente' || aProbleme(r),
    demandes: enDemande,
    en_attente: (r) => r.statut === 'en_attente',
    confirmee: (r) => r.statut === 'confirmee',
    annulee: (r) => r.statut === 'annulee',
    '': () => true,
  }), []);

  const q = recherche.trim().toLowerCase();
  const visibles = reservations
    .filter(filtres[filter])
    .filter(r => !q || `${r.client.prenom} ${r.client.nom} ${r.client.email} ${r.client.telephone} ${r.residence?.nom} ${r.id}`.toLowerCase().includes(q));
  const compte = (f) => reservations.filter(filtres[f]).length;
  const selection = reservations.find(r => r.id === selectionId) || null;

  return (
    <div className={`adm-maitre-detail resa-admin ${selection ? 'avec-detail' : ''}`}>
      <section className="adm-carte resa-liste">
        <div className="resa-outils">
          <label className="resa-recherche">
            <FaSearch aria-hidden="true" />
            <input
              type="search"
              placeholder="Client, résidence, référence…"
              value={recherche}
              onChange={(e) => setRecherche(e.target.value)}
              aria-label="Rechercher une réservation"
            />
          </label>
          <button type="button" className="adm-btn" onClick={load} disabled={loading} aria-label="Actualiser la liste">
            <FaSyncAlt /> <span className="resa-txt-large">Actualiser</span>
          </button>
        </div>

        <div className="adm-onglets" role="tablist" aria-label="Filtrer les réservations">
          {ONGLETS.map(([valeur, libelle]) => (
            <button
              key={valeur || 'toutes'}
              type="button"
              role="tab"
              aria-selected={filter === valeur}
              className={`adm-onglet ${filter === valeur ? 'actif' : ''}`}
              onClick={() => setFilter(valeur)}
            >
              {libelle} <span className="adm-compte">{compte(valeur)}</span>
            </button>
          ))}
        </div>

        {error && <div className="error-message" role="alert">{error}</div>}
        {notice && <div className="success-notice" role="status">{notice}</div>}

        {loading ? <p className="adm-vide">Chargement…</p> : visibles.length === 0 ? (
          <p className="adm-vide">{q ? 'Aucune réservation ne correspond à votre recherche.' : filter === 'a_traiter' ? 'Rien à traiter. Tout est à jour.' : 'Aucune réservation.'}</p>
        ) : (
          <div className="adm-table-cadre">
            <table className="adm-table cartes resa-table">
              <thead>
                <tr>
                  <th>Client</th><th>Résidence</th><th>Séjour</th><th>Montant</th><th>Acompte</th><th>Statut</th><th aria-label="Ouvrir" />
                </tr>
              </thead>
              <tbody>
                {visibles.map(r => (
                  <tr
                    key={r.id}
                    className={r.id === selectionId ? 'selection' : ''}
                    onClick={() => choisir(r.id)}
                    tabIndex={0}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); choisir(r.id); } }}
                    aria-label={`Réservation de ${r.client.prenom} ${r.client.nom}`}
                  >
                    <td data-label="Client">
                      <span className="adm-principal">{r.client.prenom} {r.client.nom}</span>
                      <span className="adm-secondaire">{r.client.telephone}</span>
                    </td>
                    <td data-label="Résidence">{r.residence?.nom}</td>
                    <td data-label="Séjour">
                      {dateCourte(r.dates.arrivee)} → {dateCourte(r.dates.depart)}
                      <span className="adm-secondaire">{nuits(r)} nuit{nuits(r) > 1 ? 's' : ''} · {r.details?.nombrePersonnes} pers.</span>
                    </td>
                    <td data-label="Montant" className="resa-montant">{fcfa(r.prixTotal)}</td>
                    <td data-label="Acompte">{badgeAcompte(r)}</td>
                    <td data-label="Statut">
                      {enDemande(r)
                        ? <span className="adm-badge demande">Annulation demandée</span>
                        : <span className={`adm-badge ${CLASSES[r.statut]}`}>{STATUTS[r.statut] || r.statut}</span>}
                    </td>
                    <td className="resa-chevron sans-label"><FaChevronRight /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {selection && (
        <aside className="adm-carte adm-panneau resa-detail" aria-label="Détail de la réservation">
          <button type="button" className="adm-btn discret adm-panneau-retour" onClick={() => choisir(null)}>
            <FaArrowLeft /> Retour à la liste
          </button>
          <div className="resa-detail-tete">
            <div>
              <p className="surtitre">Réservation</p>
              <h2>{selection.client.prenom} {selection.client.nom}</h2>
            </div>
            <button type="button" className="resa-fermer" onClick={() => choisir(null)} aria-label="Fermer le détail"><FaTimes /></button>
          </div>
          <div className="resa-detail-badges">
            {enDemande(selection)
              ? <span className="adm-badge demande">Annulation demandée</span>
              : <span className={`adm-badge ${CLASSES[selection.statut]}`}>{STATUTS[selection.statut]}</span>}
            {(selection.acompte?.paye || selection.acompte?.remboursement || (selection.statut === 'confirmee' && selection.acompte?.possible)) && badgeAcompte(selection)}
          </div>

          <dl className="adm-infos">
            <div><dt>Résidence</dt><dd>{selection.residence?.nom}</dd></div>
            <div><dt>Arrivée</dt><dd>{formatDate(selection.dates.arrivee)}</dd></div>
            <div><dt>Départ</dt><dd>{formatDate(selection.dates.depart)}</dd></div>
            <div><dt>Durée</dt><dd>{nuits(selection)} nuit{nuits(selection) > 1 ? 's' : ''}</dd></div>
            <div><dt>Personnes</dt><dd>{selection.details?.nombrePersonnes}</dd></div>
            <div><dt>Montant</dt><dd>{fcfa(selection.prixTotal)}</dd></div>
          </dl>

          <div className="resa-contact">
            <a className="adm-btn" href={`mailto:${selection.client.email}`}><FaEnvelope /> {selection.client.email}</a>
            <a className="adm-btn" href={`tel:${selection.client.telephone}`}><FaPhone /> {selection.client.telephone}</a>
          </div>

          {selection.notes && (
            <div className="resa-bloc"><h3>Demande du client</h3><p>« {selection.notes} »</p></div>
          )}

          {enDemande(selection) && (
            <div className="resa-bloc alerte">
              <h3><FaUndo /> Le client demande l'annulation</h3>
              <p>Le {formatDate(selection.demandeAnnulation.dateDemande)}{selection.demandeAnnulation.motif ? ` : « ${selection.demandeAnnulation.motif} »` : '.'}</p>
              {selection.acompte?.paye && selection.acompte.politique && (
                <p className="resa-consequence">
                  {selection.acompte.politique.remboursable
                    ? (selection.acompte.politique.integral
                      ? <>Si vous acceptez : <b>{fcfa(selection.acompte.montant)}</b> remboursés en entier automatiquement.</>
                      : <>Si vous acceptez : <b>{fcfa(selection.acompte.politique.montant)}</b> remboursés automatiquement ({selection.acompte.politique.pourcentage} % de l'acompte de {fcfa(selection.acompte.montant)}).</>)
                    : <>Si vous acceptez : acompte conservé ({selection.acompte.politique.raison.toLowerCase()}).</>}
                </p>
              )}
            </div>
          )}

          {/* Acompte */}
          {(selection.statut === 'confirmee' || selection.acompte?.paye) && selection.acompte && (
            <div className="resa-bloc">
              <h3>Acompte PI-SPI</h3>
              {selection.acompte.paye
                ? <p><b>{fcfa(selection.acompte.montant)}</b> payés le {formatDate(selection.acompte.payeLe)}.</p>
                : <p><b>{fcfa(selection.acompte.montant)}</b> à payer par le client depuis « Mes réservations ».</p>}
              {selection.acompte.remboursement?.statut === 'en_cours' && (
                <p>Remboursement de {fcfa(selection.acompte.remboursement.montant ?? selection.acompte.montant)} en cours via PI-SPI…</p>
              )}
              {selection.acompte.remboursement?.statut === 'rembourse' && (
                <p>{fcfa(selection.acompte.remboursement.montant ?? selection.acompte.montant)} remboursés le {formatDate(selection.acompte.remboursement.le)}{selection.acompte.remboursement.automatique ? ' par PI-SPI' : ''}{selection.acompte.remboursement.reference ? ` (réf. ${selection.acompte.remboursement.reference})` : ''}.</p>
              )}
              {selection.acompte.remboursement?.statut === 'non_remboursable' && (
                <>
                  <p>Acompte conservé : {selection.acompte.remboursement.raison}.</p>
                  <button type="button" className="adm-btn" onClick={() => { if (window.confirm('Rembourser quand même cet acompte (geste commercial) ?')) relancer(selection); }}>
                    Rembourser quand même
                  </button>
                </>
              )}
              {['a_rembourser', 'echec'].includes(selection.acompte.remboursement?.statut) && (
                <div className="resa-probleme">
                  <p><FaExclamationTriangle /> Remboursement de {fcfa(selection.acompte.remboursement.montant ?? selection.acompte.montant)} non effectué{selection.acompte.remboursement.raison ? ` : ${selection.acompte.remboursement.raison}` : ''}.</p>
                  <div className="resa-actions-ligne">
                    <button type="button" className="adm-btn principal" onClick={() => relancer(selection)}>Relancer via PI-SPI</button>
                    <button type="button" className="adm-btn" onClick={() => rembourser(selection)}>Remboursé autrement</button>
                  </div>
                </div>
              )}
              {selection.acompte.doublons?.length > 0 && (
                <p className="resa-probleme"><FaExclamationTriangle /> Paiement en double ({selection.acompte.doublons.map(d => `${fcfa(d.montant)}, réf. ${d.txId}`).join(' ; ')}) : à rembourser au client.</p>
              )}
            </div>
          )}

          {selection.demandeAnnulation?.statut === 'refusee' && (
            <p className="resa-ref">Demande d'annulation refusée le {formatDate(selection.demandeAnnulation.dateReponse)}.</p>
          )}
          <p className="resa-ref">Réf. {selection.id} · reçue le {formatDate(selection.dateCreation)}</p>

          {/* Actions selon le statut */}
          <div className="resa-actions">
            {enDemande(selection) ? (
              <>
                <button type="button" className="adm-btn" onClick={() => decide(selection, 'refuser')} disabled={busyId === selection.id}>
                  <FaTimes /> Maintenir le séjour
                </button>
                <button type="button" className="adm-btn danger" onClick={() => decide(selection, 'accepter')} disabled={busyId === selection.id}>
                  <FaCheck /> Accepter l'annulation
                </button>
              </>
            ) : selection.statut === 'en_attente' ? (
              <>
                <button type="button" className="adm-btn" onClick={() => changeStatus(selection, 'annulee')} disabled={busyId === selection.id}>
                  <FaTimes /> Refuser
                </button>
                <button type="button" className="adm-btn principal" onClick={() => changeStatus(selection, 'confirmee')} disabled={busyId === selection.id}>
                  <FaCheck /> Confirmer le séjour
                </button>
              </>
            ) : selection.statut === 'confirmee' ? (
              <p className="resa-ref">Séjour confirmé. Une annulation n'est possible que sur demande du client.</p>
            ) : null}
          </div>
        </aside>
      )}
    </div>
  );
};

export default AdminReservations;
