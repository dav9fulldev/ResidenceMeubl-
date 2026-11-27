import React, { useCallback, useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { FaCheckCircle, FaExclamationTriangle, FaUserPlus } from 'react-icons/fa';
import { API_ENDPOINTS } from '../config/api';
import { useResidences } from '../context/ResidencesContext';
import { useCompte } from '../context/CompteContext';
import { Badge, dateCourte } from './AdminFinancesPage';
import './AdminFinances.css';
import './AdminBoosters.css';
import './AdminSettingsPage.css';

export const ROLES = {
  proprietaire: ['Propriétaire', 'Tout, y compris l’équipe et le compte de reversement'],
  gestionnaire: ['Gestionnaire', 'Résidences, réservations, calendrier, clients, avis et visibilité'],
};
const STATUTS = { actif: ['Actif', 'confirmee'], invitation: ['Invitation envoyée', 'attente'], invitation_expiree: ['Invitation expirée', 'annulee'] };
const VIDE = { prenom: '', nom: '', email: '', role: 'gestionnaire' };

/**
 * Partenaire : son équipe (plusieurs comptes pour une même entreprise).
 * Le propriétaire invite par email, change les rôles, retire un membre ; un gestionnaire voit la liste.
 */
const AdminEquipePage = () => {
  const { adminRequest } = useResidences();
  const { compte } = useCompte();
  const [d, setD] = useState(null);
  const [f, setF] = useState(VIDE);
  const [msg, setMsg] = useState({ ok: '', erreur: '' });
  const [enCours, setEnCours] = useState(false);

  const charger = useCallback(async () => {
    try { setD((await adminRequest(API_ENDPOINTS.admin.team())).data); } catch (e) { setMsg({ ok: '', erreur: e.message }); }
  }, [adminRequest]);
  useEffect(() => { charger(); }, [charger]);

  if (compte?.superAdmin) return <Navigate to="/admin/plateforme" replace />;
  const proprietaire = d?.role === 'proprietaire';

  const appel = async (chemin, options, succes) => {
    setEnCours(true); setMsg({ ok: '', erreur: '' });
    try {
      const r = await adminRequest(API_ENDPOINTS.admin.team(chemin), options);
      setD(v => ({ ...v, membres: r.data.membres }));
      setMsg({ ok: r.message || succes, erreur: '' });
      return true;
    } catch (e) { setMsg({ ok: '', erreur: e.message }); return false; } finally { setEnCours(false); }
  };

  const inviter = async (e) => {
    e.preventDefault();
    if (await appel('/invitations', { method: 'POST', body: f })) setF(VIDE);
  };
  const changerRole = (m, role) => appel(`/${encodeURIComponent(m.id)}/role`, { method: 'PUT', body: { role } }, `${m.prenom} ${m.nom} est maintenant ${ROLES[role][0].toLowerCase()}.`);
  const renvoyer = (m) => appel(`/${encodeURIComponent(m.id)}/invitation`, { method: 'POST' });
  const retirer = (m) => {
    const question = m.statut === 'actif' ? `Retirer l’accès de ${m.prenom} ${m.nom} à l’espace de l’entreprise ?` : `Annuler l’invitation de ${m.prenom} ${m.nom} ?`;
    if (window.confirm(question)) appel(`/${encodeURIComponent(m.id)}`, { method: 'DELETE' });
  };

  return (
    <div className="finances-page boosters-page equipe-page">
      <header className="admin-page-header">
        <div>
          <h1>Équipe</h1>
          <p>Donnez un accès à vos collaborateurs : chacun se connecte avec son propre email et son mot de passe. Les gestionnaires s’occupent du travail courant ; le compte de reversement et l’équipe restent réservés aux propriétaires.</p>
        </div>
      </header>
      {msg.erreur && <p className="params-msg erreur" role="alert"><FaExclamationTriangle /> {msg.erreur}</p>}
      {msg.ok && <p className="params-msg ok" role="status"><FaCheckCircle /> {msg.ok}</p>}

      {proprietaire && (
        <form className="adm-carte fin-bloc booster-saisie" onSubmit={inviter}>
          <h2>Inviter un collaborateur</h2>
          <div className="booster-champs">
            <label>Prénom<input required minLength={2} maxLength={60} value={f.prenom} onChange={(e) => setF(v => ({ ...v, prenom: e.target.value }))} autoComplete="off" /></label>
            <label>Nom<input required minLength={2} maxLength={60} value={f.nom} onChange={(e) => setF(v => ({ ...v, nom: e.target.value }))} autoComplete="off" /></label>
            <label>Email<input type="email" required maxLength={254} value={f.email} onChange={(e) => setF(v => ({ ...v, email: e.target.value }))} autoComplete="off" placeholder="collegue@entreprise.com" /></label>
            <label>Rôle
              <select value={f.role} onChange={(e) => setF(v => ({ ...v, role: e.target.value }))}>
                {Object.entries(ROLES).map(([k, [libelle]]) => <option key={k} value={k}>{libelle}</option>)}
              </select>
            </label>
          </div>
          <p className="verif-aide">{ROLES[f.role][1]}. La personne reçoit un lien valable 7 jours pour choisir son mot de passe.</p>
          <div className="booster-actions">
            <button type="submit" className="adm-btn principal" disabled={enCours}><FaUserPlus /> Envoyer l’invitation</button>
          </div>
        </form>
      )}

      <div className="adm-carte fin-tableau">
        <h2>Membres</h2>
        <table>
          <thead><tr><th>Personne</th><th>Rôle</th><th>Statut</th>{proprietaire && <th><span className="sr-seul">Actions</span></th>}</tr></thead>
          <tbody>
            {!d && <tr><td colSpan={4} className="ent-vide">Chargement…</td></tr>}
            {d?.membres.map(m => (
              <tr key={m.id}>
                <td><b>{m.prenom} {m.nom}{m.id === d.moi ? ' (vous)' : ''}</b><small>{m.email}</small></td>
                <td>
                  {proprietaire && m.id !== d.moi ? (
                    <select aria-label={`Rôle de ${m.prenom} ${m.nom}`} value={m.role} disabled={enCours} onChange={(e) => changerRole(m, e.target.value)}>
                      {Object.entries(ROLES).map(([k, [libelle]]) => <option key={k} value={k}>{libelle}</option>)}
                    </select>
                  ) : (ROLES[m.role]?.[0] || m.role)}
                </td>
                <td>
                  <Badge table={STATUTS} valeur={m.statut} />
                  {m.statut === 'actif' ? <small>Depuis le {dateCourte(m.creeLe)}</small> : m.invitationExpireLe && <small>{m.statut === 'invitation' ? 'Valable jusqu’au' : 'Expirée le'} {dateCourte(m.invitationExpireLe)}</small>}
                </td>
                {proprietaire && (
                  <td className="booster-actions">
                    {m.statut !== 'actif' && <button type="button" className="adm-btn" disabled={enCours} onClick={() => renvoyer(m)}>Renvoyer</button>}
                    {m.id !== d.moi && <button type="button" className="adm-btn" disabled={enCours} onClick={() => retirer(m)}>{m.statut === 'actif' ? 'Retirer' : 'Annuler'}</button>}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default AdminEquipePage;
