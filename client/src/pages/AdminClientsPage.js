import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { FaExclamationTriangle, FaChevronDown, FaChevronUp } from 'react-icons/fa';
import { API_ENDPOINTS } from '../config/api';
import { useResidences } from '../context/ResidencesContext';
import { useCompte } from '../context/CompteContext';
import { Badge, dateCourte, fcfa } from './AdminFinancesPage';
import './AdminFinances.css';

const STATUTS = { en_attente: ['En attente', 'attente'], confirmee: ['Confirmée', 'confirmee'], annulee: ['Annulée', 'annulee'] };
const jour = (d) => (d ? new Date(`${d}T00:00:00`).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' }) : '—');

/**
 * Partenaire : ses clients, c'est-à-dire les voyageurs qui ont réservé ses résidences
 * (pour la plateforme, ce sont des utilisateurs). Construit à partir de ses seules réservations.
 */
const AdminClientsPage = () => {
  const { adminRequest } = useResidences();
  const { compte } = useCompte();
  const [liste, setListe] = useState(null);
  const [recherche, setRecherche] = useState('');
  const [ouvert, setOuvert] = useState(null);
  const [erreur, setErreur] = useState('');

  const charger = useCallback(async () => {
    try { setListe((await adminRequest(API_ENDPOINTS.admin.partnerClients)).data); } catch (e) { setErreur(e.message); }
  }, [adminRequest]);
  useEffect(() => { if (compte && !compte.superAdmin) charger(); }, [charger, compte]);

  const filtres = useMemo(() => {
    const q = recherche.trim().toLowerCase();
    if (!liste || !q) return liste;
    return liste.filter(c => [c.prenom, c.nom, c.email, c.telephone].some(v => String(v || '').toLowerCase().includes(q)));
  }, [liste, recherche]);

  if (compte?.superAdmin) return <Navigate to="/admin/utilisateurs" replace />;

  const fideles = liste?.filter(c => c.sejours > 1).length || 0;
  const aVenir = liste?.filter(c => c.prochainSejour).length || 0;

  return (
    <div className="finances-page">
      <header className="admin-page-header">
        <div>
          <h1>Clients</h1>
          <p>Les voyageurs qui ont réservé vos résidences, avec leurs séjours et leurs coordonnées.</p>
        </div>
      </header>
      {erreur && <p className="params-msg erreur" role="alert"><FaExclamationTriangle /> {erreur}</p>}

      {liste && (
        <div className="fin-kpis">
          <div className="adm-carte fin-kpi"><p>Clients</p><strong>{liste.length}</strong><small>au moins une réservation</small></div>
          <div className="adm-carte fin-kpi vert"><p>Fidèles</p><strong>{fideles}</strong><small>plus d'un séjour confirmé</small></div>
          <div className="adm-carte fin-kpi or"><p>Arrivées à venir</p><strong>{aVenir}</strong><small>clients avec un séjour prévu</small></div>
        </div>
      )}

      <div className="clients-recherche">
        <input type="search" value={recherche} onChange={(e) => setRecherche(e.target.value)} placeholder="Nom, email ou téléphone" aria-label="Rechercher un client" maxLength={80} />
      </div>

      <div className="adm-carte fin-tableau">
        <table>
          <thead><tr><th>Client</th><th>Téléphone</th><th>Séjours</th><th>Montant</th><th>Dernier séjour</th><th>Prochain séjour</th><th><span className="sr-seul">Détail</span></th></tr></thead>
          <tbody>
            {!liste && !erreur && <tr><td colSpan={7} className="ent-vide">Chargement…</td></tr>}
            {filtres?.length === 0 && <tr><td colSpan={7} className="ent-vide">{recherche ? 'Aucun client pour cette recherche.' : 'Pas encore de client : ils apparaîtront ici dès leur première réservation.'}</td></tr>}
            {filtres?.map(c => (
              <React.Fragment key={c.email}>
                <tr>
                  <td><b>{c.prenom} {c.nom}</b><small><a href={`mailto:${c.email}`}>{c.email}</a></small></td>
                  <td>{c.telephone ? <a href={`tel:${c.telephone}`}>{c.telephone}</a> : '—'}</td>
                  <td>{c.sejours}<small>{c.reservations} réservation{c.reservations > 1 ? 's' : ''}</small></td>
                  <td>{fcfa(c.montant)}</td>
                  <td>{jour(c.dernierSejour)}</td>
                  <td>{c.prochainSejour ? <b>{jour(c.prochainSejour)}</b> : '—'}</td>
                  <td>
                    <button type="button" className="adm-btn" aria-expanded={ouvert === c.email} onClick={() => setOuvert(o => (o === c.email ? null : c.email))}>
                      {ouvert === c.email ? <FaChevronUp aria-hidden="true" /> : <FaChevronDown aria-hidden="true" />} Séjours
                    </button>
                  </td>
                </tr>
                {ouvert === c.email && (
                  <tr className="clients-detail">
                    <td colSpan={7}>
                      <ul>
                        {c.detail.map(d => (
                          <li key={d.id}>
                            <b>{d.residence}</b> · du {jour(d.arrivee)} au {jour(d.depart)} · {fcfa(d.prixTotal)}
                            {d.voyageur && <> · pour {d.voyageur}</>} <Badge table={STATUTS} valeur={d.statut} />
                          </li>
                        ))}
                      </ul>
                      <small>Client depuis le {dateCourte(c.premiereLe)}</small>
                    </td>
                  </tr>
                )}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default AdminClientsPage;
