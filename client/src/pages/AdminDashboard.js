import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  FaArrowRight, FaArrowUp, FaArrowDown, FaWallet, FaBed, FaInbox, FaCoins,
  FaCalendarPlus, FaCheck, FaUndo, FaMoneyBillWave, FaTimes, FaExclamationTriangle,
} from 'react-icons/fa';
import { useResidences } from '../context/ResidencesContext';
import useAdminReservations from '../hooks/useAdminReservations';
import { BarChart, formatFCFA } from '../components/admin/Charts';
import '../components/admin/Charts.css';
import './AdminDashboard.css';

const NOMS_MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
const dateCourte = (d) => (d ? new Date(d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }) : '—');
const fcfa = (n) => `${Math.round(Number(n) || 0).toLocaleString('fr-FR')} FCFA`;

function ilYA(date) {
  const min = Math.round((Date.now() - new Date(date).getTime()) / 60000);
  if (min < 1) return 'à l\'instant';
  if (min < 60) return `il y a ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `il y a ${h} h`;
  const j = Math.round(h / 24);
  return j === 1 ? 'hier' : `il y a ${j} jours`;
}

/** Petite courbe de tendance (sans axes) : les 12 mois de l'année. */
function Tendance({ valeurs, jusqua }) {
  const v = valeurs.slice(0, jusqua || valeurs.length);
  if (v.length < 2 || v.every(x => !x)) return null;
  const max = Math.max(...v) || 1;
  const L = 96, H = 32;
  const pts = v.map((x, i) => `${(i / (v.length - 1)) * L},${H - 2 - (x / max) * (H - 4)}`).join(' ');
  const [dx, dy] = pts.split(' ').at(-1).split(',');
  return (
    <svg className="kpi-tendance" viewBox={`0 0 ${L} ${H}`} width={L} height={H} aria-hidden="true">
      <polyline points={pts} fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={dx} cy={dy} r="3" fill="currentColor" />
    </svg>
  );
}

/** Événements récents tirés des réservations (création, confirmation, acompte, annulation, remboursement). */
function activites(reservations) {
  const ev = [];
  for (const r of reservations) {
    const qui = `${r.client.prenom} ${r.client.nom}`;
    const ou = r.residence?.nom || 'Résidence';
    if (r.dateCreation) ev.push({ le: r.dateCreation, type: 'nouvelle', texte: <>Nouvelle demande de <b>{qui}</b> · {ou}</>, id: r.id });
    if (r.statutLe && r.statut === 'confirmee') ev.push({ le: r.statutLe, type: 'confirmee', texte: <>Séjour de <b>{qui}</b> confirmé · {ou}</>, id: r.id });
    if (r.statutLe && r.statut === 'annulee') ev.push({ le: r.statutLe, type: 'annulee', texte: <>Réservation de <b>{qui}</b> annulée · {ou}</>, id: r.id });
    if (r.acompte?.paye && r.acompte.payeLe) ev.push({ le: r.acompte.payeLe, type: 'acompte', texte: <>Acompte de <b>{fcfa(r.acompte.montant)}</b> reçu de {qui}</>, id: r.id });
    if (r.demandeAnnulation?.dateDemande) ev.push({ le: r.demandeAnnulation.dateDemande, type: 'demande', texte: <><b>{qui}</b> demande l'annulation · {ou}</>, id: r.id });
    if (r.acompte?.remboursement?.statut === 'rembourse' && r.acompte.remboursement.le) {
      ev.push({ le: r.acompte.remboursement.le, type: 'rembourse', texte: <><b>{fcfa(r.acompte.remboursement.montant ?? r.acompte.montant)}</b> remboursés à {qui}</>, id: r.id });
    }
  }
  return ev.sort((a, b) => new Date(b.le) - new Date(a.le));
}

const ICONES_ACTIVITE = {
  nouvelle: <FaCalendarPlus />, confirmee: <FaCheck />, annulee: <FaTimes />,
  acompte: <FaMoneyBillWave />, demande: <FaUndo />, rembourse: <FaUndo />,
};

/**
 * Vue d'ensemble : indicateurs, réservations à traiter, activité récente, revenus, résidences.
 */
const AdminDashboard = () => {
  const navigate = useNavigate();
  const { residences, getStats } = useResidences();
  const { reservations, demandes, enAttente, loading } = useAdminReservations();
  const [stats, setStats] = useState(null);
  const annee = new Date().getFullYear();

  useEffect(() => {
    getStats(annee).then(setStats).catch(() => setStats(null));
  }, [getStats, annee, reservations.length]);

  const r = stats?.resume;
  const mois = stats?.mois || [];
  const jusqua = r?.moisCourant || 12;
  const variation = r && r.revenusMoisPrecedent ? Math.round(((r.revenusMoisCourant - r.revenusMoisPrecedent) / r.revenusMoisPrecedent) * 100) : null;

  const acomptesPayes = reservations.filter(x => x.acompte?.paye);
  const acomptesEncaisses = acomptesPayes.reduce((t, x) => t + (Number(x.acompte.montant) || 0), 0);
  const acomptesAttendus = reservations.filter(x => x.statut === 'confirmee' && x.acompte && !x.acompte.paye && x.acompte.possible);

  // File « à traiter » : du plus urgent au moins urgent
  const aTraiter = useMemo(() => {
    const probleme = reservations.filter(x => x.acompte?.doublons?.length || ['a_rembourser', 'echec'].includes(x.acompte?.remboursement?.statut));
    return [
      ...demandes.map(x => ({ x, type: 'demande', libelle: 'Annulation', classe: 'demande' })),
      ...probleme.map(x => ({ x, type: 'probleme', libelle: x.acompte?.doublons?.length ? 'Paiement en double' : 'Remboursement à traiter', classe: 'demande' })),
      ...enAttente.filter(x => x.demandeAnnulation?.statut !== 'en_attente').map(x => ({ x, type: 'attente', libelle: 'À confirmer', classe: 'attente' })),
    ];
  }, [reservations, demandes, enAttente]);

  const flux = useMemo(() => activites(reservations).slice(0, 7), [reservations]);

  const statuts = ['disponible', 'réservé', 'occupé', 'maintenance'].map(s => ({
    s, n: residences.filter(x => x.availability?.status === s).length,
  }));
  const libelleStatut = { disponible: 'Disponibles', 'réservé': 'Dates prises', 'occupé': 'Occupées', maintenance: 'Maintenance' };

  const topResidences = useMemo(() => {
    const parId = new Map((stats?.residences || []).map(x => [String(x.id ?? x.residenceId), x]));
    return [...residences]
      .map(res => ({ res, st: parId.get(String(res.id)) }))
      .sort((a, b) => (b.st?.revenus || 0) - (a.st?.revenus || 0))
      .slice(0, 4);
  }, [residences, stats]);

  const heure = new Date().getHours();
  const salut = heure < 18 ? 'Bonjour' : 'Bonsoir';
  const aujourdHui = new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });

  return (
    <div className="dash">
      <div className="admin-page-header">
        <div>
          <h1>{salut}</h1>
          <p>Nous sommes le {aujourdHui}. {aTraiter.length ? `${aTraiter.length} élément${aTraiter.length > 1 ? 's' : ''} attend${aTraiter.length > 1 ? 'ent' : ''} votre décision.` : 'Tout est à jour.'}</p>
        </div>
        <div className="dash-actions">
          <Link to="/admin/calendrier" className="adm-btn">Calendrier</Link>
          <Link to="/admin/reservations" className="adm-btn principal">Réservations <FaArrowRight /></Link>
        </div>
      </div>

      {/* Indicateurs */}
      <section className="dash-kpis" aria-label="Indicateurs clés">
        <article className="adm-carte kpi">
          <div className="kpi-tete"><span className="kpi-icone vert"><FaWallet /></span><span>Revenus de {r?.moisCourant ? NOMS_MOIS[r.moisCourant - 1] : 'ce mois'}</span></div>
          <p className="kpi-valeur">{r ? fcfa(r.revenusMoisCourant ?? 0) : '…'}</p>
          <div className="kpi-pied">
            {variation !== null ? (
              <span className={`kpi-variation ${variation >= 0 ? 'hausse' : 'baisse'}`}>
                {variation >= 0 ? <FaArrowUp /> : <FaArrowDown />} {Math.abs(variation)} %
              </span>
            ) : <span className="kpi-note">Nuits confirmées du mois</span>}
            <span className="kpi-trend vert"><Tendance valeurs={mois.map(m => m.revenus)} jusqua={jusqua} /></span>
          </div>
        </article>

        <article className="adm-carte kpi">
          <div className="kpi-tete"><span className="kpi-icone or"><FaBed /></span><span>Taux d'occupation {annee}</span></div>
          <p className="kpi-valeur">{r ? `${String(r.tauxOccupation).replace('.', ',')} %` : '…'}</p>
          <div className="kpi-pied">
            <span className="kpi-note">{r ? `${r.nuitsOccupees} nuits · séjour moyen ${String(r.dureeMoyenne).replace('.', ',')} n.` : ''}</span>
            <span className="kpi-trend or"><Tendance valeurs={mois.map(m => m.occupation)} jusqua={jusqua} /></span>
          </div>
        </article>

        <article className="adm-carte kpi cliquable" onClick={() => navigate('/admin/reservations')}>
          <div className="kpi-tete"><span className="kpi-icone orange"><FaInbox /></span><span>À traiter</span></div>
          <p className="kpi-valeur">{loading ? '…' : aTraiter.length}</p>
          <div className="kpi-pied">
            <span className="kpi-note">{enAttente.length} à confirmer · {demandes.length} annulation{demandes.length > 1 ? 's' : ''}</span>
          </div>
        </article>

        <article className="adm-carte kpi">
          <div className="kpi-tete"><span className="kpi-icone bleu"><FaCoins /></span><span>Acomptes encaissés</span></div>
          <p className="kpi-valeur">{fcfa(acomptesEncaisses)}</p>
          <div className="kpi-pied">
            <span className="kpi-note">{acomptesPayes.length} reçu{acomptesPayes.length > 1 ? 's' : ''} · {acomptesAttendus.length} en attente</span>
          </div>
        </article>
      </section>

      <div className="dash-grille">
        {/* À traiter en priorité */}
        <section className="adm-carte dash-file">
          <div className="adm-carte-tete">
            <h2>À traiter en priorité</h2>
            <Link to="/admin/reservations" className="adm-lien">Toutes les réservations <FaArrowRight /></Link>
          </div>
          {loading ? <p className="adm-vide">Chargement…</p> : aTraiter.length === 0 ? (
            <p className="adm-vide"><FaCheck /> Rien à traiter pour le moment.</p>
          ) : (
            <div className="adm-table-cadre">
              <table className="adm-table cartes">
                <thead>
                  <tr><th>Client</th><th>Résidence</th><th>Séjour</th><th>Montant</th><th>Action</th><th aria-label="Ouvrir" /></tr>
                </thead>
                <tbody>
                  {aTraiter.slice(0, 6).map(({ x, type, libelle, classe }) => (
                    <tr key={`${type}-${x.id}`} onClick={() => navigate(`/admin/reservations?id=${encodeURIComponent(x.id)}`)}>
                      <td data-label="Client"><span className="adm-principal">{x.client.prenom} {x.client.nom}</span><span className="adm-secondaire">reçue {ilYA(x.dateCreation)}</span></td>
                      <td data-label="Résidence">{x.residence?.nom}</td>
                      <td data-label="Séjour">{dateCourte(x.dates.arrivee)} → {dateCourte(x.dates.depart)}</td>
                      <td data-label="Montant">{fcfa(x.prixTotal)}</td>
                      <td data-label="Action"><span className={`adm-badge ${classe}`}>{type === 'probleme' && <FaExclamationTriangle />}{libelle}</span></td>
                      <td className="dash-chevron sans-label"><FaArrowRight /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* Activité récente */}
        <section className="adm-carte dash-activite">
          <div className="adm-carte-tete"><h2>Activité récente</h2></div>
          {flux.length === 0 ? <p className="adm-vide">Aucune activité pour l'instant.</p> : (
            <ol className="flux">
              {flux.map((e, i) => (
                <li key={i} className={`flux-${e.type}`}>
                  <span className="flux-icone">{ICONES_ACTIVITE[e.type]}</span>
                  <div><p>{e.texte}</p><time dateTime={new Date(e.le).toISOString()}>{ilYA(e.le)}</time></div>
                </li>
              ))}
            </ol>
          )}
        </section>

        {/* Revenus */}
        <section className="adm-carte dash-revenus viz-root">
          <div className="adm-carte-tete">
            <h2>Revenus {annee}</h2>
            <Link to="/admin/statistiques" className="adm-lien">Statistiques <FaArrowRight /></Link>
          </div>
          {r ? (
            <>
              <p className="dash-total"><strong>{fcfa(r.revenusAnnee)}</strong> encaissés sur l'année · {fcfa(r.revenusPrevisionnels)} à venir</p>
              <BarChart donnees={mois.map(m => ({ label: m.libelle.slice(0, 3), valeur: m.revenus }))} titre="Revenus par mois" format={formatFCFA} couleur="var(--serie-marque)" />
            </>
          ) : <p className="adm-vide">Chargement…</p>}
        </section>

        {/* État des résidences */}
        <section className="adm-carte dash-etat">
          <div className="adm-carte-tete">
            <h2>Résidences</h2>
            <Link to="/admin/residences" className="adm-lien">Gérer <FaArrowRight /></Link>
          </div>
          <div className="etat-barre" role="img" aria-label={statuts.map(x => `${x.n} ${libelleStatut[x.s].toLowerCase()}`).join(', ')}>
            {statuts.filter(x => x.n).map(x => <span key={x.s} className={`etat-${x.s === 'réservé' ? 'reserve' : x.s === 'occupé' ? 'occupe' : x.s}`} style={{ flex: x.n }} />)}
          </div>
          <ul className="etat-legende">
            {statuts.map(x => (
              <li key={x.s}><span className={`etat-point etat-${x.s === 'réservé' ? 'reserve' : x.s === 'occupé' ? 'occupe' : x.s}`} />{libelleStatut[x.s]}<b>{x.n}</b></li>
            ))}
          </ul>
        </section>
      </div>

      {/* Vos résidences */}
      <section className="dash-residences">
        <div className="adm-carte-tete">
          <h2>Vos résidences les plus rentables</h2>
          <Link to="/admin/residences" className="adm-lien">Toutes ({residences.length}) <FaArrowRight /></Link>
        </div>
        <div className="dash-res-grille">
          {topResidences.map(({ res, st }) => (
            <Link key={res.id} to="/admin/calendrier" className="adm-carte dash-res">
              <div className="dash-res-photo">{res.images?.[0] && <img src={res.images[0]} alt="" loading="lazy" />}</div>
              <div className="dash-res-corps">
                <div className="dash-res-tete"><strong>{res.name}</strong><span>{Number(res.price).toLocaleString('fr-FR')} <small>/ nuit</small></span></div>
                <p>{res.location}</p>
                <ul>
                  <li><b>{st ? fcfa(st.revenus) : '0 FCFA'}</b> revenus {annee}</li>
                  <li><b>{st ? `${String(st.occupation).replace('.', ',')} %` : '0 %'}</b> occupation</li>
                </ul>
              </div>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
};

export default AdminDashboard;
