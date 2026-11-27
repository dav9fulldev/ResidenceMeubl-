import React, { useCallback, useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { FaCheckCircle, FaExclamationTriangle, FaRocket } from 'react-icons/fa';
import { API_ENDPOINTS } from '../config/api';
import { useResidences } from '../context/ResidencesContext';
import { useCompte } from '../context/CompteContext';
import { Badge, dateCourte, fcfa } from './AdminFinancesPage';
import './AdminFinances.css';
import './AdminBoosters.css';

export const STATUTS_BOOSTER = {
  en_attente: ['En attente du paiement', 'attente'], actif: ['Actif', 'confirmee'], termine: ['Terminé', 'neutre'],
  refuse: ['Refusé', 'annulee'], annule: ['Annulé', 'neutre'], arrete: ['Arrêté', 'annulee'],
};

/**
 * Partenaire : booster de visibilité. Il choisit une résidence et une durée ; BABI RESIDENCE
 * active le booster après réception du paiement. La résidence remonte dans le classement,
 * en plus de sa note, avec la mention « Sponsorisé ».
 */
const AdminVisibilitePage = () => {
  const { adminRequest } = useResidences();
  const { compte } = useCompte();
  const [d, setD] = useState(null);
  const [f, setF] = useState({ residenceId: '', duree: 7 });
  const [msg, setMsg] = useState({ ok: '', erreur: '' });
  const [enCours, setEnCours] = useState(false);

  const charger = useCallback(async () => {
    try { setD((await adminRequest(API_ENDPOINTS.admin.boosters())).data); } catch (e) { setMsg({ ok: '', erreur: e.message }); }
  }, [adminRequest]);
  useEffect(() => { if (compte && !compte.superAdmin) charger(); }, [charger, compte]);

  if (compte?.superAdmin) return <Navigate to="/admin/boosters" replace />;

  const demander = async (e) => {
    e.preventDefault();
    setEnCours(true); setMsg({ ok: '', erreur: '' });
    try {
      const r = await adminRequest(API_ENDPOINTS.admin.boosters(), { method: 'POST', body: { residenceId: Number(f.residenceId), duree: Number(f.duree) } });
      setMsg({ ok: r.message, erreur: '' });
      await charger();
    } catch (err) { setMsg({ ok: '', erreur: err.message }); } finally { setEnCours(false); }
  };

  const annuler = async (id) => {
    setMsg({ ok: '', erreur: '' });
    try { await adminRequest(API_ENDPOINTS.admin.boosters(`/${id}`), { method: 'DELETE' }); setMsg({ ok: 'Demande annulée.', erreur: '' }); await charger(); } catch (err) { setMsg({ ok: '', erreur: err.message }); }
  };

  return (
    <div className="finances-page boosters-page">
      <header className="admin-page-header">
        <div>
          <h1>Visibilité</h1>
          <p>Boostez une résidence : elle est proposée plus haut aux voyageurs, en plus de sa note, avec la mention « Sponsorisé ».</p>
        </div>
      </header>
      {msg.erreur && <p className="params-msg erreur" role="alert"><FaExclamationTriangle /> {msg.erreur}</p>}
      {msg.ok && <p className="params-msg ok" role="status"><FaCheckCircle /> {msg.ok}</p>}

      {d && (
        <>
          <div className="booster-formules" role="radiogroup" aria-label="Durée du booster">
            {d.durees.map(n => (
              <label key={n} className={`adm-carte booster-formule${Number(f.duree) === n ? ' choisie' : ''}`}>
                <input type="radio" name="duree" value={n} checked={Number(f.duree) === n} onChange={() => setF(v => ({ ...v, duree: n }))} />
                <span className="booster-duree">{n} jours</span>
                <strong>{fcfa(d.tarifs[n])}</strong>
                <small>{fcfa(Math.round(d.tarifs[n] / n))} par jour</small>
              </label>
            ))}
          </div>

          <form className="adm-carte fin-bloc booster-demande" onSubmit={demander}>
            <label>Résidence à booster
              <select required value={f.residenceId} onChange={(e) => setF(v => ({ ...v, residenceId: e.target.value }))}>
                <option value="">Choisir une résidence publiée</option>
                {d.residences.map(r => <option key={r.id} value={r.id}>{r.nom}</option>)}
              </select>
            </label>
            <button type="submit" className="adm-btn principal" disabled={enCours || !f.residenceId}><FaRocket /> Demander le booster ({fcfa(d.tarifs[f.duree])})</button>
            <p className="verif-aide">
              Après votre demande, BABI RESIDENCE vous contacte pour le règlement. Le booster démarre dès réception du paiement, pour {f.duree} jours.
              Une résidence avec de mauvaises notes reste « Sponsorisé » mais ne remonte pas : la qualité passe d’abord.
            </p>
            {d.residences.length === 0 && <p className="verif-aide">Aucune résidence publiée : une résidence doit être vérifiée avant d’être boostée.</p>}
          </form>

          <div className="adm-carte fin-tableau">
            <h2>Mes boosters</h2>
            <table>
              <thead><tr><th>Référence</th><th>Résidence</th><th>Durée</th><th>Montant</th><th>Période</th><th>Statut</th><th><span className="sr-seul">Action</span></th></tr></thead>
              <tbody>
                {d.boosters.length === 0 && <tr><td colSpan={7} className="ent-vide">Aucun booster pour l’instant.</td></tr>}
                {d.boosters.map(b => (
                  <tr key={b.id}>
                    <td><code>{b.reference}</code></td>
                    <td>{b.residenceNom}</td>
                    <td>{b.duree} jours</td>
                    <td>{fcfa(b.montant)}</td>
                    <td>{b.debut ? `${dateCourte(b.debut)} → ${dateCourte(b.fin)}` : <small>demandé le {dateCourte(b.demandeLe)}</small>}</td>
                    <td><Badge table={STATUTS_BOOSTER} valeur={b.statut} />{b.motif && <small>{b.motif}</small>}</td>
                    <td>{b.statut === 'en_attente' && <button type="button" className="adm-btn" onClick={() => annuler(b.id)}>Annuler</button>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
};

export default AdminVisibilitePage;
