import React, { useCallback, useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { FaCheckCircle, FaExclamationTriangle, FaSave } from 'react-icons/fa';
import { API_ENDPOINTS } from '../config/api';
import { useResidences } from '../context/ResidencesContext';
import { useCompte } from '../context/CompteContext';
import { Badge, STATUTS_DETTE, STATUTS_REVERSEMENT, dateCourte, fcfa } from './AdminFinancesPage';
import './AdminFinances.css';

const STATUTS_BENEFICIAIRE = { a_verifier: ['En cours de vérification', 'attente'], verifie: ['Vérifiées', 'confirmee'], refuse: ['Refusées', 'annulee'] };

/**
 * Entreprise : ses revenus. Les clients paient la plateforme ; la part de l'entreprise
 * (montant moins la commission) est reversée à la main 24 h après l'arrivée du client.
 */
const AdminRevenusPage = () => {
  const { adminRequest } = useResidences();
  const { compte } = useCompte();
  const [d, setD] = useState(null);
  const [f, setF] = useState({ type: 'mobile_money', operateur: '', beneficiaire: '', destination: '' });
  const [msg, setMsg] = useState({ ok: '', erreur: '' });
  const [enCours, setEnCours] = useState(false);

  const charger = useCallback(async () => {
    try {
      const r = (await adminRequest(API_ENDPOINTS.admin.revenus())).data;
      setD(r);
      if (r?.beneficiaire) setF({ type: r.beneficiaire.type, operateur: r.beneficiaire.operateur || '', beneficiaire: r.beneficiaire.beneficiaire, destination: r.beneficiaire.destination });
    } catch (e) { setMsg({ ok: '', erreur: e.message }); }
  }, [adminRequest]);
  useEffect(() => { charger(); }, [charger]);

  if (compte?.entreprise?.principale) return <Navigate to="/admin/finances" replace />;
  if (!d) return <p className="verif-chargement">{msg.erreur || 'Chargement…'}</p>;

  const enregistrer = async (e) => {
    e.preventDefault();
    setEnCours(true); setMsg({ ok: '', erreur: '' });
    try {
      setD((await adminRequest(API_ENDPOINTS.admin.revenus('/beneficiaire'), { method: 'PUT', body: f })).data);
      setMsg({ ok: 'Coordonnées enregistrées. BABI RESIDENCE les vérifie avant le prochain reversement.', erreur: '' });
    } catch (err) { setMsg({ ok: '', erreur: err.message }); } finally { setEnCours(false); }
  };

  return (
    <div className="finances-page">
      <header className="admin-page-header">
        <div>
          <h1>Revenus</h1>
          <p>Vos clients paient sur BABI RESIDENCE. Votre part, moins la commission, vous est reversée 24 h après l'arrivée du client.</p>
        </div>
      </header>
      {msg.erreur && <p className="params-msg erreur" role="alert"><FaExclamationTriangle /> {msg.erreur}</p>}
      {msg.ok && <p className="params-msg ok" role="status"><FaCheckCircle /> {msg.ok}</p>}

      <div className="fin-kpis">
        <div className="adm-carte fin-kpi vert"><p>Prochain reversement possible</p><strong>{fcfa(d.versable)}</strong><small>Versé à la main par BABI RESIDENCE</small></div>
        <div className="adm-carte fin-kpi"><p>À venir</p><strong>{fcfa(d.enAttente)}</strong><small>Séjours pas encore commencés</small></div>
        <div className="adm-carte fin-kpi"><p>Déjà reversé</p><strong>{fcfa(d.totalVerse)}</strong>{d.bloque > 0 && <small>{fcfa(d.bloque)} bloqués (annulation ou litige en cours)</small>}</div>
        <div className="adm-carte fin-kpi or"><p>Commissions BABI</p><strong>{fcfa(d.totalCommissions)}</strong><small>Prélevées sur les paiements</small></div>
      </div>

      <section className="adm-carte fin-bloc">
        <h2>Où recevoir vos reversements</h2>
        {d.beneficiaire && <p><Badge table={STATUTS_BENEFICIAIRE} valeur={d.beneficiaire.statut} />{d.beneficiaire.motif && <small className="fin-motif"> {d.beneficiaire.motif}</small>}</p>}
        <p className="verif-aide">Le compte doit être au nom de votre entreprise ou de son gérant. Toute modification est revérifiée par BABI RESIDENCE avant le reversement suivant.</p>
        {/* Le compte de reversement est réservé au propriétaire du compte de l'entreprise */}
        {compte?.utilisateur?.role !== 'proprietaire' ? (
          <p className="verif-aide">{d.beneficiaire ? <>Reversements sur : <b>{d.types[d.beneficiaire.type]?.libelle || d.beneficiaire.type}</b> · {d.beneficiaire.beneficiaire}. </> : null}Seul un propriétaire du compte de l’entreprise peut modifier ce compte.</p>
        ) : (
        <form className="fin-benef" onSubmit={enregistrer}>
          <label>Moyen
            <select value={f.type} onChange={(e) => setF(v => ({ ...v, type: e.target.value }))}>
              {Object.entries(d.types).map(([k, t]) => <option key={k} value={k}>{t.libelle}</option>)}
            </select>
          </label>
          {f.type !== 'pispi' && <label>{f.type === 'mobile_money' ? 'Opérateur' : 'Banque'}<input value={f.operateur} maxLength={40} onChange={(e) => setF(v => ({ ...v, operateur: e.target.value }))} placeholder={f.type === 'mobile_money' ? 'Wave, Orange Money, MTN…' : 'Nom de la banque'} /></label>}
          <label>Titulaire du compte<input required minLength={2} maxLength={100} value={f.beneficiaire} onChange={(e) => setF(v => ({ ...v, beneficiaire: e.target.value }))} /></label>
          <label>{d.types[f.type]?.aide ? d.types[f.type].aide.charAt(0).toUpperCase() + d.types[f.type].aide.slice(1) : 'Coordonnées'}<input required maxLength={60} value={f.destination} onChange={(e) => setF(v => ({ ...v, destination: e.target.value }))} /></label>
          <button type="submit" className="adm-btn principal" disabled={enCours}><FaSave /> Enregistrer</button>
        </form>
        )}
      </section>

      <div className="adm-carte fin-tableau">
        <h2>Par séjour</h2>
        <table>
          <thead><tr><th>Séjour</th><th>Arrivée</th><th>Payé par le client</th><th>Commission</th><th>Votre part</th><th>Reversé</th><th>Statut</th></tr></thead>
          <tbody>
            {d.dettes.length === 0 && <tr><td colSpan={7} className="ent-vide">Aucun paiement pour l'instant.</td></tr>}
            {d.dettes.map(x => (
              <tr key={x.reservationId}>
                <td><b>{x.residence}</b><small>{x.client}</small></td><td>{dateCourte(x.arrivee)}</td>
                <td>{fcfa(x.brut)}{x.rembourse > 0 && <small>{fcfa(x.rembourse)} remboursés</small>}</td><td>{fcfa(x.commission)}</td>
                <td><b>{fcfa(x.du)}</b></td><td>{fcfa(x.verse)}</td><td><Badge table={STATUTS_DETTE} valeur={x.statut} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="adm-carte fin-tableau">
        <h2>Reversements</h2>
        <table>
          <thead><tr><th>Référence</th><th>Date</th><th>Montant</th><th>Statut</th></tr></thead>
          <tbody>
            {d.reversements.length === 0 && <tr><td colSpan={4} className="ent-vide">Aucun reversement pour l'instant.</td></tr>}
            {d.reversements.map(p => <tr key={p.id}><td><code>{p.reference}</code></td><td>{dateCourte(p.executeLe || p.demandeLe)}</td><td><b>{fcfa(p.montant)}</b>{p.referenceExterne && <small>Réf. {p.referenceExterne}</small>}</td><td><Badge table={STATUTS_REVERSEMENT} valeur={p.statut} /></td></tr>)}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default AdminRevenusPage;
