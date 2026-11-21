import React, { useCallback, useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { FaExclamationTriangle, FaSearch } from 'react-icons/fa';
import { API_ENDPOINTS } from '../config/api';
import { useResidences } from '../context/ResidencesContext';
import { useCompte } from '../context/CompteContext';
import { Badge, dateCourte } from './AdminFinancesPage';
import './AdminFinances.css';

const STATUTS_COMPTE = { actif: ['Mot de passe choisi', 'confirmee'], sans_mot_de_passe: ['Sans mot de passe', 'attente'] };

/**
 * Utilisateurs de la plateforme (module « Service client ») : les voyageurs qui réservent.
 * Pour BABI RESIDENCE ce sont des utilisateurs ; ce sont les clients des partenaires
 * (les clients de BABI RESIDENCE sont les partenaires). Compte créé à la première réservation,
 * mot de passe choisi depuis l'email reçu.
 */
const AdminUtilisateursPage = () => {
  const { adminRequest } = useResidences();
  const { compte } = useCompte();
  const [liste, setListe] = useState(null);
  const [recherche, setRecherche] = useState('');
  const [erreur, setErreur] = useState('');

  const charger = useCallback(async (q = '') => {
    try {
      setListe((await adminRequest(API_ENDPOINTS.admin.users(q))).data);
      setErreur('');
    } catch (e) { setErreur(e.message); }
  }, [adminRequest]);
  useEffect(() => { charger(); }, [charger]);

  if (compte && !compte.superAdmin) return <Navigate to="/admin/dashboard" replace />;

  const actifs = liste?.filter(c => c.statut === 'actif').length || 0;

  return (
    <div className="finances-page">
      <header className="admin-page-header">
        <div>
          <h1>Utilisateurs</h1>
          <p>Les voyageurs qui réservent sur BABI RESIDENCE : clients de nos partenaires. Leur compte est créé automatiquement à la première réservation ; ils choisissent leur mot de passe depuis l'email reçu.</p>
        </div>
      </header>
      {erreur && <p className="params-msg erreur" role="alert"><FaExclamationTriangle /> {erreur}</p>}

      {liste && (
        <div className="fin-kpis">
          <div className="adm-carte fin-kpi"><p>Utilisateurs</p><strong>{liste.length}</strong><small>{recherche ? 'pour cette recherche' : 'comptes créés'}</small></div>
          <div className="adm-carte fin-kpi vert"><p>Avec mot de passe</p><strong>{actifs}</strong><small>se connectent seuls</small></div>
          <div className="adm-carte fin-kpi"><p>Sans mot de passe</p><strong>{liste.length - actifs}</strong><small>n'ont pas encore ouvert le lien</small></div>
        </div>
      )}

      <form className="clients-recherche" onSubmit={(e) => { e.preventDefault(); charger(recherche); }} role="search">
        <input id="clients-q" type="search" value={recherche} onChange={(e) => setRecherche(e.target.value)} placeholder="Nom, email ou téléphone" aria-label="Rechercher un utilisateur" maxLength={80} />
        <button type="submit" className="adm-btn principal"><FaSearch /> Rechercher</button>
      </form>

      <div className="adm-carte fin-tableau">
        <table>
          <thead><tr><th>Utilisateur</th><th>Téléphone</th><th>Compte</th><th>Réservations</th><th>Créé le</th><th>Dernière connexion</th></tr></thead>
          <tbody>
            {!liste && <tr><td colSpan={6} className="ent-vide">Chargement…</td></tr>}
            {liste?.length === 0 && <tr><td colSpan={6} className="ent-vide">Aucun utilisateur{recherche ? ' pour cette recherche' : ' pour l\'instant'}.</td></tr>}
            {liste?.map(c => (
              <tr key={c.id}>
                <td><b>{c.prenom} {c.nom}</b><small>{c.email}</small></td>
                <td>{c.telephone || '—'}</td>
                <td><Badge table={STATUTS_COMPTE} valeur={c.statut} /></td>
                <td>{c.reservations}{c.derniereReservationLe && <small>dernière le {dateCourte(c.derniereReservationLe)}</small>}</td>
                <td>{dateCourte(c.creeLe)}</td>
                <td>{c.derniereConnexionLe ? dateCourte(c.derniereConnexionLe) : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default AdminUtilisateursPage;
