import React, { useCallback, useEffect, useRef, useState } from 'react';
import { FaCheck, FaTimes, FaSyncAlt } from 'react-icons/fa';
import { useResidences } from '../context/ResidencesContext';
import './AdminReservations.css';

const STATUTS = {
  en_attente: 'En attente',
  confirmee: 'Confirmée',
  annulee: 'Annulée',
};

const formatDate = (value) => (value ? new Date(value).toLocaleDateString('fr-FR') : '—');

const AdminReservations = () => {
  const { getReservations, updateReservationStatus, decideCancellation, markRefunded, reloadResidences, residences } = useResidences();

  const rembourser = async (r) => {
    const reference = window.prompt(
      `Confirmez que l'acompte de ${Number(r.acompte.montant).toLocaleString('fr-FR')} FCFA a été remboursé à ${r.client.prenom} ${r.client.nom}.\nRéférence du remboursement (facultatif) :`, '');
    if (reference === null) return;
    try {
      const res = await markRefunded(r.id, reference);
      setReservations(prev => prev.map(x => (x.id === r.id ? { ...x, acompte: { ...x.acompte, remboursement: res.remboursement } } : x)));
      setNotice('Remboursement enregistré.');
    } catch (err) {
      setError(err.message);
    }
  };
  const [reservations, setReservations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('en_attente');
  const [busyId, setBusyId] = useState(null);
  const [notice, setNotice] = useState('');
  const premierChargement = useRef(true);

  // Les messages (erreur d'email, confirmation) ne sont pas effacés par un rechargement
  const load = useCallback(async () => {
    try {
      const data = await getReservations();
      // Les plus récentes en premier
      setReservations([...data].sort((a, b) => new Date(b.dateCreation) - new Date(a.dateCreation)));
      // Au premier chargement, afficher d'abord les demandes d'annulation s'il y en a
      if (premierChargement.current) {
        premierChargement.current = false;
        if (data.some(r => r.demandeAnnulation?.statut === 'en_attente')) setFilter('demandes');
      }
    } catch (err) {
      setError(`Chargement des réservations impossible : ${err.message}`);
    } finally {
      setLoading(false);
    }
  }, [getReservations]);

  // Recharger aussi quand une action du panneau des résidences a modifié les données
  useEffect(() => {
    load();
  }, [load, residences]);

  const changeStatus = async (reservation, statut) => {
    if (statut === 'annulee' && !window.confirm(`Refuser la réservation de ${reservation.client.prenom} ${reservation.client.nom} ? Le client sera prévenu par email.`)) return;
    setBusyId(reservation.id);
    setError('');
    setNotice('');
    try {
      const result = await updateReservationStatus(reservation.id, statut);
      setReservations(prev => prev.map(r => (r.id === reservation.id ? { ...r, statut } : r)));
      // Le statut des résidences (réservé / occupé) dépend des réservations confirmées
      reloadResidences();
      const action = statut === 'confirmee' ? 'confirmée' : 'refusée';
      if (result?.emailEnvoye) {
        setNotice(`Réservation ${action}. Un email a été envoyé à ${reservation.client.email}.`);
      } else {
        setError(`Réservation ${action}, mais l'email au client n'a pas pu être envoyé. Prévenez-le par téléphone (${reservation.client.telephone}).`);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyId(null);
    }
  };

  // Le client demande l'annulation : l'admin accepte ou refuse
  const decide = async (reservation, decision) => {
    let message = '';
    if (decision === 'refuser') {
      const saisie = window.prompt('Refuser la demande d\'annulation.\nMessage pour le client (facultatif) :', '');
      if (saisie === null) return;
      message = saisie;
    } else if (!window.confirm(
      `Accepter l'annulation de ${reservation.client.prenom} ${reservation.client.nom} ?\nLes dates seront libérées et le client prévenu par email.`
    )) {
      return;
    }

    setBusyId(reservation.id);
    setError('');
    setNotice('');
    try {
      const result = await decideCancellation(reservation.id, decision, message);
      setReservations(prev => prev.map(r => (r.id === reservation.id
        ? { ...r, statut: result.statut, demandeAnnulation: result.demandeAnnulation }
        : r)));
      if (decision === 'accepter') reloadResidences();
      const action = decision === 'accepter' ? 'Annulation acceptée' : 'Demande refusée, réservation maintenue';
      if (result.emailEnvoye) {
        setNotice(`${action}. Un email a été envoyé à ${reservation.client.email}.`);
      } else {
        setError(`${action}, mais l'email au client n'a pas pu être envoyé. Prévenez-le par téléphone (${reservation.client.telephone}).`);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyId(null);
    }
  };

  const enDemande = (r) => r.demandeAnnulation?.statut === 'en_attente';
  const visibles = filter === 'demandes'
    ? reservations.filter(enDemande)
    : filter ? reservations.filter(r => r.statut === filter) : reservations;
  const count = (statut) => (statut === 'demandes'
    ? reservations.filter(enDemande).length
    : reservations.filter(r => r.statut === statut).length);

  return (
    <section className="admin-reservations">
      <div className="admin-reservations-header">
        <h3>Liste des réservations</h3>
        <button className="btn btn-outline btn-sm" onClick={load} disabled={loading}>
          <FaSyncAlt /> Actualiser
        </button>
      </div>

      <div className="admin-reservations-filters" role="tablist">
        {[['demandes', '↩️ Demandes d\'annulation'], ['en_attente', 'En attente'], ['confirmee', 'Confirmées'], ['annulee', 'Annulées'], ['', 'Toutes']].map(([value, label]) => (
          <button
            key={value || 'all'}
            role="tab"
            aria-selected={filter === value}
            className={`filter-chip ${filter === value ? 'active' : ''}`}
            onClick={() => setFilter(value)}
          >
            {label} ({value ? count(value) : reservations.length})
          </button>
        ))}
      </div>

      {error && <div className="error-message" role="alert">{error}</div>}
      {notice && <div className="success-notice" role="status">{notice}</div>}

      {loading ? (
        <p className="admin-reservations-empty">Chargement…</p>
      ) : visibles.length === 0 ? (
        <p className="admin-reservations-empty">Aucune réservation.</p>
      ) : (
        <div className="admin-reservations-list">
          {visibles.map((r) => (
            <article key={r.id} className={`reservation-card statut-${r.statut}`}>
              <div className="reservation-card-main">
                <div className="reservation-card-title">
                  <strong>{r.client.prenom} {r.client.nom}</strong>
                  <span className={`reservation-badge statut-${r.statut}`}>{STATUTS[r.statut] || r.statut}</span>
                </div>
                <p>{r.residence?.nom} · {formatDate(r.dates.arrivee)} → {formatDate(r.dates.depart)}</p>
                <p>
                  {r.details?.nombrePersonnes} pers. · {Number(r.prixTotal).toLocaleString('fr-FR')} FCFA
                </p>
                <p className="reservation-contact">
                  <a href={`mailto:${r.client.email}`}>{r.client.email}</a> · <a href={`tel:${r.client.telephone}`}>{r.client.telephone}</a>
                </p>
                {r.notes && <p className="reservation-notes">« {r.notes} »</p>}
                {r.statut === 'confirmee' && r.acompte && (
                  <p className={`reservation-acompte ${r.acompte.paye ? 'paye' : 'attente'}`}>
                    {r.acompte.paye
                      ? `💰 Acompte payé : ${Number(r.acompte.montant).toLocaleString('fr-FR')} FCFA le ${formatDate(r.acompte.payeLe)} (PI-SPI)`
                      : `⏳ Acompte à payer : ${Number(r.acompte.montant).toLocaleString('fr-FR')} FCFA`}
                  </p>
                )}
                {r.acompte?.remboursement?.statut === 'a_rembourser' && (
                  <p className="reservation-acompte doublon">
                    ⚠️ Réservation annulée : acompte de {Number(r.acompte.montant).toLocaleString('fr-FR')} FCFA à rembourser au client.{' '}
                    <button type="button" className="btn btn-outline btn-sm" onClick={() => rembourser(r)}>Marquer comme remboursé</button>
                  </p>
                )}
                {r.acompte?.remboursement?.statut === 'rembourse' && (
                  <p className="reservation-acompte paye">
                    ↩️ Acompte remboursé le {formatDate(r.acompte.remboursement.le)}{r.acompte.remboursement.reference ? ` (réf. ${r.acompte.remboursement.reference})` : ''}
                  </p>
                )}
                {r.acompte?.doublons?.length > 0 && (
                  <p className="reservation-acompte doublon">
                    ⚠️ Paiement en double reçu ({r.acompte.doublons.map(d => `${Number(d.montant).toLocaleString('fr-FR')} FCFA, réf. ${d.txId}`).join(' ; ')}) : à rembourser au client.
                  </p>
                )}
                {enDemande(r) && (
                  <p className="reservation-demande">
                    ↩️ <strong>Le client demande l'annulation</strong> (le {formatDate(r.demandeAnnulation.dateDemande)})
                    {r.demandeAnnulation.motif ? ` : « ${r.demandeAnnulation.motif} »` : ''}
                  </p>
                )}
                {r.demandeAnnulation?.statut === 'refusee' && (
                  <p className="reservation-ref">Demande d'annulation refusée le {formatDate(r.demandeAnnulation.dateReponse)}</p>
                )}
                <p className="reservation-ref">Réf. {r.id} · reçue le {formatDate(r.dateCreation)}</p>
              </div>

              <div className="reservation-card-actions">
                {enDemande(r) ? (
                  <>
                    <button className="btn btn-danger btn-sm" onClick={() => decide(r, 'accepter')} disabled={busyId === r.id}>
                      <FaCheck /> Accepter l'annulation
                    </button>
                    <button className="btn btn-outline btn-sm" onClick={() => decide(r, 'refuser')} disabled={busyId === r.id}>
                      <FaTimes /> Refuser
                    </button>
                  </>
                ) : (
                <>
                {r.statut !== 'confirmee' && r.statut !== 'annulee' && (
                  <button
                    className="btn btn-primary btn-sm"
                    onClick={() => changeStatus(r, 'confirmee')}
                    disabled={busyId === r.id}
                  >
                    <FaCheck /> Confirmer
                  </button>
                )}
                {r.statut === 'en_attente' && (
                  <button
                    className="btn btn-danger btn-sm"
                    onClick={() => changeStatus(r, 'annulee')}
                    disabled={busyId === r.id}
                  >
                    <FaTimes /> Refuser
                  </button>
                )}
                {r.statut === 'confirmee' && (
                  <p className="reservation-ref">Annulation possible uniquement sur demande du client.</p>
                )}
                </>
                )}
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
};

export default AdminReservations;
