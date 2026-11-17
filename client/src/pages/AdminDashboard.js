import React from 'react';
import { Link } from 'react-router-dom';
import { FaHome, FaCheckCircle, FaUsers, FaCalendarAlt, FaCog, FaArrowRight, FaUndo, FaHourglassHalf } from 'react-icons/fa';
import { useResidences } from '../context/ResidencesContext';
import useAdminReservations from '../hooks/useAdminReservations';
import './AdminDashboard.css';

const formatDate = (d) => (d ? new Date(d).toLocaleDateString('fr-FR') : '—');

/**
 * Vue d'ensemble du back-office : chiffres clés et éléments à traiter.
 */
const AdminDashboard = () => {
  const { residences } = useResidences();
  const { reservations, demandes, enAttente, loading } = useAdminReservations();

  const compte = (statut) => residences.filter(r => r.availability.status === statut).length;
  const cartes = [
    { cle: 'total', icone: <FaHome />, nombre: residences.length, libelle: 'Résidences' },
    { cle: 'available', icone: <FaCheckCircle />, nombre: compte('disponible'), libelle: 'Disponibles' },
    { cle: 'occupied', icone: <FaUsers />, nombre: compte('occupé'), libelle: 'Occupées' },
    { cle: 'reserved', icone: <FaCalendarAlt />, nombre: compte('réservé'), libelle: 'Réservées' },
    { cle: 'maintenance', icone: <FaCog />, nombre: compte('maintenance'), libelle: 'Maintenance' },
  ];

  const confirmees = reservations.filter(r => r.statut === 'confirmee');
  const chiffreAffaires = confirmees.reduce((total, r) => total + (Number(r.prixTotal) || 0), 0);
  const acomptesPayes = reservations.filter(r => r.acompte?.paye);
  const acomptesEncaisses = acomptesPayes.reduce((t, r) => t + (Number(r.acompte.montant) || 0), 0);
  const acomptesAttendus = confirmees.filter(r => r.acompte && !r.acompte.paye && r.acompte.possible);
  const montantAttendu = acomptesAttendus.reduce((t, r) => t + (Number(r.acompte.montant) || 0), 0);
  const doublons = reservations.filter(r => r.acompte?.doublons?.length || ['a_rembourser', 'echec'].includes(r.acompte?.remboursement?.statut));
  const aTraiter = [
    ...doublons.map(r => ({ r, type: 'doublon' })),
    ...demandes.map(r => ({ r, type: 'demande' })),
    ...enAttente.filter(r => r.demandeAnnulation?.statut !== 'en_attente').map(r => ({ r, type: 'attente' })),
  ];

  return (
    <div className="admin-overview">
      <div className="admin-page-header">
        <div>
          <h1>Vue d'ensemble</h1>
          <p>Bonjour 👋 Voici l'état de vos résidences aujourd'hui.</p>
        </div>
      </div>

      <section className="overview-stats" aria-label="Résidences">
        {cartes.map(c => (
          <div key={c.cle} className={`overview-stat ${c.cle}`}>
            <span className="overview-stat-icon">{c.icone}</span>
            <span className="overview-stat-number">{c.nombre}</span>
            <span className="overview-stat-label">{c.libelle}</span>
          </div>
        ))}
      </section>

      <div className="overview-grid">
        <section className="overview-card">
          <div className="overview-card-header">
            <h2>À traiter</h2>
            <Link to="/admin/reservations">Tout voir <FaArrowRight /></Link>
          </div>
          {loading ? (
            <p className="overview-empty">Chargement…</p>
          ) : aTraiter.length === 0 ? (
            <p className="overview-empty">✅ Rien à traiter pour le moment.</p>
          ) : (
            <ul className="todo-list">
              {aTraiter.slice(0, 6).map(({ r, type }) => (
                <li key={`${type}-${r.id}`}>
                  <Link to="/admin/reservations" className={`todo-item ${type}`}>
                    <span className="todo-icon">{type === 'demande' ? <FaUndo /> : type === 'doublon' ? '⚠️' : <FaHourglassHalf />}</span>
                    <span className="todo-text">
                      <strong>{r.client.prenom} {r.client.nom}</strong>
                      <span>
                        {type === 'demande' ? 'Demande d\'annulation' : type === 'doublon' ? (['a_rembourser', 'echec'].includes(r.acompte?.remboursement?.statut) ? 'Remboursement d\'acompte à traiter' : 'Acompte payé en double : à rembourser') : 'Réservation à confirmer'} · {r.residence?.nom} · {formatDate(r.dates.arrivee)}
                      </span>
                    </span>
                    <FaArrowRight className="todo-arrow" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="overview-card">
          <div className="overview-card-header">
            <h2>Réservations</h2>
            <Link to="/admin/statistiques">Statistiques <FaArrowRight /></Link>
          </div>
          <dl className="overview-figures">
            <div><dt>En attente</dt><dd>{enAttente.length}</dd></div>
            <div><dt>Confirmées</dt><dd>{confirmees.length}</dd></div>
            <div><dt>Demandes d'annulation</dt><dd>{demandes.length}</dd></div>
            <div><dt>Montant confirmé</dt><dd>{chiffreAffaires.toLocaleString('fr-FR')} <small>FCFA</small></dd></div>
          </dl>
        </section>

        <section className="overview-card overview-acomptes">
          <div className="overview-card-header">
            <h2>💰 Acomptes PI-SPI</h2>
            <Link to="/admin/reservations">Détails <FaArrowRight /></Link>
          </div>
          <dl className="overview-figures">
            <div><dt>Encaissés</dt><dd>{acomptesEncaisses.toLocaleString('fr-FR')} <small>FCFA</small></dd></div>
            <div><dt>Acomptes reçus</dt><dd>{acomptesPayes.length}</dd></div>
            <div><dt>En attente de paiement</dt><dd>{acomptesAttendus.length} · {montantAttendu.toLocaleString('fr-FR')} <small>FCFA</small></dd></div>
          </dl>
          {acomptesPayes.length > 0 && (
            <ul className="acomptes-recents">
              {[...acomptesPayes].sort((a, b) => new Date(b.acompte.payeLe) - new Date(a.acompte.payeLe)).slice(0, 4).map(r => (
                <li key={r.id}>
                  <span>{r.client.prenom} {r.client.nom} · {r.residence?.nom}</span>
                  <b>{Number(r.acompte.montant).toLocaleString('fr-FR')} FCFA</b>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
};

export default AdminDashboard;
