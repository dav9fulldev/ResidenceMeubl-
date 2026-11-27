import React, { useCallback, useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { FaCheckCircle, FaExclamationTriangle, FaSave } from 'react-icons/fa';
import { API_ENDPOINTS } from '../config/api';
import { useResidences } from '../context/ResidencesContext';
import { useCompte } from '../context/CompteContext';
import { Badge, dateCourte, fcfa } from './AdminFinancesPage';
import { STATUTS_BOOSTER } from './AdminVisibilitePage';
import './AdminFinances.css';
import './AdminBoosters.css';

// Activation manuelle (paiement hors plateforme) ; « geniuspay » = payé en ligne, activé automatiquement
const MOYENS = { mobile_money: 'Mobile Money', virement: 'Virement', especes: 'Espèces', autre: 'Autre' };
const LIBELLES_MOYENS = { ...MOYENS, geniuspay: 'GeniusPay (en ligne)' };

/**
 * Plateforme : boosters de visibilité. Le partenaire paie hors plateforme ; on active après réception
 * (moyen et référence notés au journal financier), on refuse ou on arrête avec un motif.
 * Réglages : budget par jour minimal et maximal proposé aux partenaires.
 */
const AdminBoostersPage = () => {
  const { adminRequest } = useResidences();
  const { compte } = useCompte();
  const [d, setD] = useState(null);
  const [reglages, setReglages] = useState(null);
  const [saisie, setSaisie] = useState(null); // { id, action, moyen, reference, motif }
  const [msg, setMsg] = useState({ ok: '', erreur: '' });
  const [enCours, setEnCours] = useState(false);

  const charger = useCallback(async () => {
    try {
      const r = (await adminRequest(API_ENDPOINTS.admin.platformBoosters())).data;
      setD(r);
      setReglages({ budgetMin: r.reglages.budgetMin, budgetMax: r.reglages.budgetMax });
    } catch (e) { setMsg({ ok: '', erreur: e.message }); }
  }, [adminRequest]);
  useEffect(() => { charger(); }, [charger]);

  if (compte && !compte.superAdmin) return <Navigate to="/admin/visibilite" replace />;

  const agir = async (e) => {
    e.preventDefault();
    setEnCours(true); setMsg({ ok: '', erreur: '' });
    try {
      await adminRequest(API_ENDPOINTS.admin.platformBoosters(`/${saisie.id}`), { method: 'PUT', body: saisie });
      setMsg({ ok: { activer: 'Booster activé.', refuser: 'Demande refusée.', arreter: 'Booster arrêté.' }[saisie.action], erreur: '' });
      setSaisie(null);
      await charger();
    } catch (err) { setMsg({ ok: '', erreur: err.message }); } finally { setEnCours(false); }
  };

  const enregistrerReglages = async (e) => {
    e.preventDefault();
    setMsg({ ok: '', erreur: '' });
    try {
      const r = (await adminRequest(API_ENDPOINTS.admin.platformBoosters('/reglages'), { method: 'PUT', body: { budgetMin: Number(reglages.budgetMin), budgetMax: Number(reglages.budgetMax) } })).data;
      setReglages({ budgetMin: r.budgetMin, budgetMax: r.budgetMax });
      setMsg({ ok: 'Réglages enregistrés : ils s’appliquent aux nouvelles campagnes.', erreur: '' });
    } catch (err) { setMsg({ ok: '', erreur: err.message }); }
  };

  const liste = d?.boosters || [];
  const attente = liste.filter(b => b.statut === 'en_attente');
  const actifs = liste.filter(b => ['actif', 'programme'].includes(b.statut)); // programmé = prolongation à venir
  const autres = liste.filter(b => !['en_attente', 'actif', 'programme'].includes(b.statut));
  const encaisse = liste.filter(b => b.paiement).reduce((s, b) => s + b.paiement.montant, 0);

  const ligne = (b) => (
    <tr key={b.id}>
      <td><code>{b.reference}</code><small>{dateCourte(b.demandeLe)}</small></td>
      <td><b>{b.entreprise}</b><small>{b.residenceNom}</small></td>
      <td>{fcfa(b.montant)}<small>{fcfa(b.budgetJour)}/jour × {b.duree} j · {d.objectifs[b.objectif]} · {d.audiences[b.audience]}{b.cible ? ` : ${b.cible}` : ''}</small></td>
      <td>{b.debut ? `${dateCourte(b.debut)} → ${dateCourte(b.fin)}` : '—'}{b.paiement && <small>{LIBELLES_MOYENS[b.paiement.moyen] || b.paiement.moyen} · {b.paiement.reference}</small>}</td>
      <td><Badge table={STATUTS_BOOSTER} valeur={b.statut} />{b.motif && <small>{b.motif}</small>}{b.prolongationDe && <small>Prolongation de {b.prolongationDe}</small>}</td>
      <td className="booster-actions">
        {b.statut === 'en_attente' && <>
          <button type="button" className="adm-btn principal" onClick={() => setSaisie({ id: b.id, action: 'activer', moyen: 'mobile_money', reference: '', motif: '' })}>Activer</button>
          <button type="button" className="adm-btn" onClick={() => setSaisie({ id: b.id, action: 'refuser', motif: '' })}>Refuser</button>
        </>}
        {['actif', 'programme'].includes(b.statut) && <button type="button" className="adm-btn" onClick={() => setSaisie({ id: b.id, action: 'arreter', motif: '' })}>Arrêter</button>}
      </td>
    </tr>
  );

  return (
    <div className="finances-page boosters-page">
      <header className="admin-page-header">
        <div>
          <h1>Boosters</h1>
          <p>Visibilité payée par les partenaires. Payés en ligne (GeniusPay), les boosters s’activent seuls ; payés par virement ou en espèces, activez-les ici après réception. La résidence remonte (bonus limité, jamais pour une résidence mal notée) avec la mention « Sponsorisé ».</p>
        </div>
      </header>
      {msg.erreur && <p className="params-msg erreur" role="alert"><FaExclamationTriangle /> {msg.erreur}</p>}
      {msg.ok && <p className="params-msg ok" role="status"><FaCheckCircle /> {msg.ok}</p>}

      {d && (
        <div className="fin-kpis">
          <div className="adm-carte fin-kpi or"><p>À activer</p><strong>{attente.length}</strong><small>demandes en attente du paiement</small></div>
          <div className="adm-carte fin-kpi vert"><p>Actifs</p><strong>{actifs.length}</strong><small>résidences sponsorisées</small></div>
          <div className="adm-carte fin-kpi"><p>Encaissé</p><strong>{fcfa(encaisse)}</strong><small>boosters payés</small></div>
        </div>
      )}

      {saisie && (
        <form className="adm-carte fin-bloc booster-saisie" onSubmit={agir}>
          <h2>{{ activer: 'Activer le booster', refuser: 'Refuser la demande', arreter: 'Arrêter le booster' }[saisie.action]} <code>{liste.find(b => b.id === saisie.id)?.reference}</code></h2>
          {saisie.action === 'activer' ? (
            <div className="booster-champs">
              <label>Moyen de paiement reçu
                <select value={saisie.moyen} onChange={(e) => setSaisie(s => ({ ...s, moyen: e.target.value }))}>
                  {Object.entries(MOYENS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </label>
              <label>Référence du paiement
                <input required minLength={3} maxLength={80} value={saisie.reference} onChange={(e) => setSaisie(s => ({ ...s, reference: e.target.value }))} placeholder="Ex. référence Wave, numéro de virement" />
              </label>
            </div>
          ) : (
            <label>Motif
              <input required minLength={3} maxLength={300} value={saisie.motif} onChange={(e) => setSaisie(s => ({ ...s, motif: e.target.value }))} placeholder="Paiement non reçu, demande du partenaire…" />
            </label>
          )}
          <div className="booster-actions">
            <button type="submit" className={`adm-btn ${saisie.action === 'activer' ? 'principal' : 'danger'}`} disabled={enCours}>Confirmer</button>
            <button type="button" className="adm-btn" onClick={() => setSaisie(null)}>Annuler</button>
          </div>
        </form>
      )}

      {[['À activer', attente, 'Aucune demande en attente.'], ['Actifs', actifs, 'Aucun booster actif.'], ['Historique', autres, 'Rien pour l’instant.']].map(([titre, l, vide]) => (
        <div key={titre} className="adm-carte fin-tableau">
          <h2>{titre}</h2>
          <table>
            <thead><tr><th>Référence</th><th>Partenaire</th><th>Campagne</th><th>Période et paiement</th><th>Statut</th><th><span className="sr-seul">Actions</span></th></tr></thead>
            <tbody>{l.length ? l.map(ligne) : <tr><td colSpan={6} className="ent-vide">{vide}</td></tr>}</tbody>
          </table>
        </div>
      ))}

      {reglages && (
        <form className="adm-carte fin-bloc" onSubmit={enregistrerReglages}>
          <h2>Budget par jour proposé aux partenaires</h2>
          <div className="booster-champs">
            <label>Minimum (FCFA par jour)
              <input type="number" min={500} step={500} required value={reglages.budgetMin} onChange={(e) => setReglages(r => ({ ...r, budgetMin: e.target.value }))} />
            </label>
            <label>Maximum (FCFA par jour)
              <input type="number" min={1000} step={500} required value={reglages.budgetMax} onChange={(e) => setReglages(r => ({ ...r, budgetMax: e.target.value }))} />
            </label>
          </div>
          <p className="verif-aide">Le bonus de classement va de +0,3 au budget minimal à +0,8 au budget maximal (sur une échelle de 1 à 5) ; une résidence mal notée n’en reçoit pas.</p>
          <button type="submit" className="adm-btn principal"><FaSave /> Enregistrer</button>
        </form>
      )}
    </div>
  );
};

export default AdminBoostersPage;
