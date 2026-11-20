import React, { useCallback, useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import {
  FaCheck, FaTimes, FaPaperPlane, FaFileUpload, FaDownload, FaSync, FaExclamationTriangle, FaCheckCircle, FaUndo, FaLock, FaLockOpen,
} from 'react-icons/fa';
import { API_ENDPOINTS } from '../config/api';
import { useResidences } from '../context/ResidencesContext';
import { useCompte } from '../context/CompteContext';
import { ouvrirPrive } from '../components/admin/FichierPrive';
import { fichierEnBase64 } from '../utils/fichiers';
import './AdminFinances.css';

export const fcfa = (n) => `${Math.round(Number(n) || 0).toLocaleString('fr-FR')} FCFA`;
export const dateCourte = (d) => (d ? new Date(d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' }) : '—');
export const STATUTS_DETTE = {
  EN_ATTENTE: ['Avant l\'arrivée + 24 h', 'attente'], ELIGIBLE: ['Versable', 'confirmee'], PARTIELLEMENT_VERSEE: ['Partiellement versée', 'demande'],
  VERSEE: ['Versée', 'neutre'], SOLDEE: ['Rien à verser', 'neutre'], A_DEDUIRE: ['Commission à déduire', 'attente'], BLOQUEE: ['Bloquée', 'annulee'], LITIGE: ['Litige', 'annulee'],
};
export const STATUTS_REVERSEMENT = {
  EN_ATTENTE_APPROBATION: ['À approuver', 'attente'], APPROUVE: ['Approuvé', 'demande'], EXECUTE: ['Exécuté, preuve à joindre', 'demande'],
  CONFIRME: ['Confirmé', 'confirmee'], REJETE: ['Rejeté', 'annulee'], ANNULE: ['Annulé', 'annulee'], ECHEC: ['Échec', 'annulee'],
};
const TYPES_TX = {
  PAIEMENT_CLIENT: 'Paiement client', PAIEMENT_EN_DOUBLE: 'Paiement en double', COMMISSION_SUR_PLACE: 'Commission (solde sur place)',
  REMBOURSEMENT_CLIENT: 'Remboursement', ANNULATION_COMMISSION: 'Commission rendue', REVERSEMENT_PROPRIETAIRE: 'Reversement', CONTREPASSATION: 'Contre-passation',
};
const TYPES_BENEF = { mobile_money: 'Mobile Money', virement: 'Virement', pispi: 'PI-SPI' };
const ONGLETS = [['apercu', 'Vue d\'ensemble'], ['reversements', 'Reversements'], ['dettes', 'Sommes dues'], ['registre', 'Registre'], ['rapprochement', 'Rapprochement'], ['reglages', 'Commission et journal']];
export const Badge = ({ table, valeur }) => {
  const [libelle, classe] = table[valeur] || [valeur, 'neutre'];
  return <span className={`adm-badge ${classe}`}>{libelle}</span>;
};

/** Plateforme : finances (encaissements, commissions, sommes dues, reversements manuels, registre, rapprochement). */
const AdminFinancesPage = () => {
  const { adminRequest } = useResidences();
  const { compte } = useCompte();
  const [onglet, setOnglet] = useState('apercu');
  const [d, setD] = useState({});
  const [msg, setMsg] = useState({ ok: '', erreur: '' });
  const [enCours, setEnCours] = useState(false);
  const appel = useCallback((chemin, options) => adminRequest(API_ENDPOINTS.admin.finance(chemin), options).then(r => r.data), [adminRequest]);

  const charger = useCallback(async () => {
    try {
      if (onglet === 'apercu') setD({ apercu: await appel('/apercu') });
      if (onglet === 'reversements') { const [entreprises, reversements] = await Promise.all([appel('/entreprises'), appel('/reversements')]); setD({ entreprises, reversements }); }
      if (onglet === 'dettes') setD({ dettes: await appel('/dettes') });
      if (onglet === 'registre') setD({ registre: await appel('/registre') });
      if (onglet === 'rapprochement') setD({ rapprochements: await appel('/rapprochements') });
      if (onglet === 'reglages') { const [commission, audit, webhooks] = await Promise.all([appel('/commission'), appel('/audit'), appel('/webhooks')]); setD({ commission, audit, webhooks }); }
    } catch (e) { setMsg({ ok: '', erreur: e.message }); }
  }, [appel, onglet]);
  useEffect(() => { setD({}); setMsg({ ok: '', erreur: '' }); charger(); }, [charger]);

  const agir = async (fn, ok) => {
    setEnCours(true); setMsg({ ok: '', erreur: '' });
    try { await fn(); setMsg({ ok, erreur: '' }); await charger(); } catch (e) { setMsg({ ok: '', erreur: e.message }); } finally { setEnCours(false); }
  };

  if (compte && !compte.superAdmin) return <Navigate to="/admin/dashboard" replace />;
  const a = d.apercu;

  return (
    <div className="finances-page">
      <header className="admin-page-header">
        <div>
          <h1>Finances</h1>
          <p>La plateforme encaisse les paiements, prélève sa commission et reverse à la main la part de chaque entreprise, 24 h après l'arrivée du client.</p>
        </div>
      </header>
      <div className="fin-onglets" role="tablist" aria-label="Rubriques">
        {ONGLETS.map(([cle, libelle]) => <button key={cle} type="button" role="tab" aria-selected={onglet === cle} className={onglet === cle ? 'actif' : ''} onClick={() => setOnglet(cle)}>{libelle}</button>)}
      </div>
      {msg.erreur && <p className="params-msg erreur" role="alert"><FaExclamationTriangle /> {msg.erreur}</p>}
      {msg.ok && <p className="params-msg ok" role="status"><FaCheckCircle /> {msg.ok}</p>}

      {onglet === 'apercu' && a && (
        <>
          <div className="fin-kpis">
            <Kpi titre="Encaissé auprès des clients" valeur={a.encaisse} note={`${a.paiementsReussis} paiement(s) réussi(s) · ${a.paiementsEchoues} échoué(s) ou expiré(s)`} />
            <Kpi titre="Commissions BABI" valeur={a.commissions} classe="or" note={`Séjours des résidences BABI : ${fcfa(a.revenuPlateforme)}`} />
            <Kpi titre="Versable maintenant" valeur={a.versable} classe="vert" note={`${fcfa(a.enAttenteDeDelai)} avant l'arrivée + 24 h · ${fcfa(a.bloque)} bloqués`} />
            <Kpi titre="Reversements à traiter" valeur={a.reversementsEnAttente.total} note={`${a.reversementsEnAttente.nombre} en attente · ${fcfa(a.reverse)} déjà reversés`} />
            <Kpi titre="Remboursé aux clients" valeur={a.rembourse} note={a.tropPercu > 0 ? `${fcfa(a.tropPercu)} reçus en double, à rendre` : 'Aucun paiement en double'} />
            <Kpi titre="Dû aux entreprises (total)" valeur={a.detteProprietaires} note="Montant comptabilisé, pas forcément versable" />
          </div>
          <div className="adm-carte fin-bloc">
            <h2>Fonds comptabilisés chez les prestataires</h2>
            <p className="verif-aide">Montants enregistrés dans le registre. Ils ne prouvent pas que l'argent est disponible : comparez avec les relevés GeniusPay et PI-SPI (onglet Rapprochement).</p>
            <ul className="fin-fonds">{a.fondsParPrestataire.map(f => <li key={f.fournisseur}><span>{f.fournisseur}</span><b>{fcfa(f.solde)}</b></li>)}</ul>
            <p className={a.balanceEquilibree ? 'fin-ok' : 'fin-alerte'}>{a.balanceEquilibree ? <><FaCheckCircle /> Registre équilibré (débits = crédits)</> : <><FaExclamationTriangle /> Registre déséquilibré : à examiner</>}</p>
            {a.dernierRapprochement && <p className="verif-aide">Dernier rapprochement le {dateCourte(a.dernierRapprochement.le)} : {a.dernierRapprochement.anomalies} anomalie(s).</p>}
          </div>
        </>
      )}

      {onglet === 'reversements' && d.entreprises && (
        <Reversements d={d} appel={appel} agir={agir} enCours={enCours} />
      )}

      {onglet === 'dettes' && d.dettes && (
        <div className="adm-carte fin-tableau">
          <table>
            <thead><tr><th>Réservation</th><th>Entreprise</th><th>Arrivée</th><th>Encaissé</th><th>Commission</th><th>Dû</th><th>Versé</th><th>Statut</th><th /></tr></thead>
            <tbody>
              {d.dettes.length === 0 && <tr><td colSpan={9} className="ent-vide">Aucune somme due.</td></tr>}
              {d.dettes.map(x => (
                <tr key={x.reservationId}>
                  <td><b>{x.residence}</b><small>{x.client} · {x.reservationId}</small></td>
                  <td>{x.entreprise}</td><td>{dateCourte(x.arrivee)}<small>versable dès le {dateCourte(x.eligibleLe)}</small></td>
                  <td>{fcfa(x.brut)}</td><td>{fcfa(x.commission)}</td><td>{fcfa(x.du)}</td><td>{fcfa(x.verse)}</td>
                  <td><Badge table={STATUTS_DETTE} valeur={x.statut} />{x.bloque && <small>{x.bloque.motif}</small>}</td>
                  <td>
                    {x.bloque
                      ? <button type="button" className="adm-btn" disabled={enCours} onClick={() => agir(() => appel(`/dettes/${encodeURIComponent(x.reservationId)}/blocage`, { method: 'PUT', body: { bloque: false } }), 'Somme débloquée.')}><FaLockOpen /> Débloquer</button>
                      : x.reste > 0 && <button type="button" className="adm-btn" disabled={enCours} onClick={() => { const motif = window.prompt('Motif du blocage (litige, plainte, vérification…)'); if (motif) agir(() => appel(`/dettes/${encodeURIComponent(x.reservationId)}/blocage`, { method: 'PUT', body: { bloque: true, motif } }), 'Somme bloquée : elle ne sera pas reversée.'); }}><FaLock /> Bloquer</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {onglet === 'registre' && d.registre && (
        <div className="adm-carte fin-tableau">
          <div className="fin-tete-tableau">
            <p className="verif-aide">{d.registre.total} opération(s). Une écriture n'est jamais modifiée : une erreur se corrige par une contre-passation.</p>
            <button type="button" className="adm-btn" onClick={() => ouvrirPrive(API_ENDPOINTS.admin.finance('/registre.csv'))}><FaDownload /> Exporter (CSV)</button>
          </div>
          <table>
            <thead><tr><th>Référence</th><th>Date</th><th>Opération</th><th>Montant</th><th>Écritures</th><th /></tr></thead>
            <tbody>
              {d.registre.transactions.map(t => (
                <tr key={t.id}>
                  <td><code>{t.reference}</code></td><td>{dateCourte(t.creeLe)}</td>
                  <td><b>{TYPES_TX[t.type] || t.type}</b><small>{t.libelle}{t.entreprise ? ` · ${t.entreprise}` : ''}</small></td>
                  <td>{fcfa(t.montant)}</td>
                  <td><ul className="fin-ecritures">{t.ecritures.map((e, i) => <li key={i}><span>{e.sens === 'DEBIT' ? 'D' : 'C'}</span> {e.compte}{e.fournisseur ? ` (${e.fournisseur})` : ''} <b>{e.montant.toLocaleString('fr-FR')}</b></li>)}</ul></td>
                  <td>{t.type !== 'CONTREPASSATION' && <button type="button" className="adm-btn discret" title="Contre-passer" disabled={enCours}
                    onClick={() => { const motif = window.prompt(`Contre-passer ${t.reference} ? Indiquez le motif :`); if (motif) agir(() => appel(`/registre/${t.id}/contrepassation`, { method: 'POST', body: { motif } }), 'Contre-passation enregistrée.'); }}><FaUndo /></button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {onglet === 'rapprochement' && d.rapprochements && (
        <Rapprochement d={d} appel={appel} agir={agir} enCours={enCours} />
      )}

      {onglet === 'reglages' && d.commission && (
        <Reglages d={d} appel={appel} agir={agir} enCours={enCours} />
      )}
    </div>
  );
};

const Kpi = ({ titre, valeur, note, classe = '' }) => (
  <div className={`adm-carte fin-kpi ${classe}`}><p>{titre}</p><strong>{fcfa(valeur)}</strong>{note && <small>{note}</small>}</div>
);

const Reversements = ({ d, appel, agir, enCours }) => {
  const [execution, setExecution] = useState(null); // { id, referenceExterne, source }
  return (
    <>
      <div className="adm-carte fin-tableau">
        <h2>Par entreprise</h2>
        <table>
          <thead><tr><th>Entreprise</th><th>Versable</th><th>En attente</th><th>Coordonnées de versement</th><th /></tr></thead>
          <tbody>
            {d.entreprises.length === 0 && <tr><td colSpan={5} className="ent-vide">Aucune entreprise.</td></tr>}
            {d.entreprises.map(e => (
              <tr key={e.id}>
                <td><b>{e.nom}</b></td><td><b>{fcfa(e.versable)}</b></td><td>{fcfa(e.enAttente)}{e.bloque > 0 && <small>{fcfa(e.bloque)} bloqués</small>}</td>
                <td>{e.beneficiaire ? <>{e.beneficiaire.beneficiaire}<small>{TYPES_BENEF[e.beneficiaire.type] || e.beneficiaire.type} {e.beneficiaire.operateur || ''} · {e.beneficiaire.destination}</small>
                  {e.beneficiaire.statut === 'verifie' ? <span className="adm-badge confirmee">Vérifiées</span> : (
                    <span className="fin-actions-ligne">
                      <button type="button" className="adm-btn principal" disabled={enCours} onClick={() => agir(() => appel(`/beneficiaires/${e.id}`, { method: 'PUT', body: { valide: true } }), 'Coordonnées vérifiées.')}><FaCheck /> Vérifier</button>
                      <button type="button" className="adm-btn" disabled={enCours} onClick={() => { const motif = window.prompt('Motif du refus'); if (motif) agir(() => appel(`/beneficiaires/${e.id}`, { method: 'PUT', body: { valide: false, motif } }), 'Coordonnées refusées.'); }}><FaTimes /> Refuser</button>
                    </span>
                  )}</> : <small>Non renseignées</small>}</td>
                <td>{e.reversementEnCours ? <Badge table={STATUTS_REVERSEMENT} valeur={e.reversementEnCours.statut} /> : (
                  <button type="button" className="adm-btn principal" disabled={enCours || e.versable <= 0 || e.beneficiaire?.statut !== 'verifie'}
                    onClick={() => window.confirm(`Préparer un reversement de ${fcfa(e.versable)} à ${e.nom} ?`) && agir(() => appel('/reversements', { method: 'POST', body: { entrepriseId: e.id } }), 'Reversement préparé : à approuver.')}><FaPaperPlane /> Préparer</button>
                )}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="adm-carte fin-tableau">
        <h2>Reversements</h2>
        <table>
          <thead><tr><th>Référence</th><th>Entreprise</th><th>Montant</th><th>Bénéficiaire</th><th>Statut</th><th>Actions</th></tr></thead>
          <tbody>
            {d.reversements.length === 0 && <tr><td colSpan={6} className="ent-vide">Aucun reversement.</td></tr>}
            {d.reversements.map(p => (
              <tr key={p.id}>
                <td><code>{p.reference}</code><small>{dateCourte(p.demandeLe)}</small></td><td>{p.entreprise}</td><td><b>{fcfa(p.montant)}</b></td>
                <td>{p.beneficiaire.beneficiaire}<small>{TYPES_BENEF[p.beneficiaire.type] || p.beneficiaire.type} {p.beneficiaire.operateur || ''} · {p.beneficiaire.destination}</small></td>
                <td><Badge table={STATUTS_REVERSEMENT} valeur={p.statut} />{p.referenceExterne && <small>Réf. {p.referenceExterne} ({p.source})</small>}{p.motif && <small>{p.motif}</small>}</td>
                <td className="fin-actions">
                  {p.statut === 'EN_ATTENTE_APPROBATION' && <button type="button" className="adm-btn principal" disabled={enCours} onClick={() => agir(() => appel(`/reversements/${p.id}`, { method: 'PUT', body: { action: 'approuver' } }), 'Reversement approuvé : effectuez le virement puis enregistrez-le.')}><FaCheck /> Approuver</button>}
                  {p.statut === 'APPROUVE' && <button type="button" className="adm-btn principal" disabled={enCours} onClick={() => setExecution({ id: p.id, referenceExterne: '', source: 'geniuspay', montant: p.montant })}><FaPaperPlane /> Enregistrer le virement</button>}
                  {p.statut === 'EXECUTE' && (
                    <label className="adm-btn">
                      <FaFileUpload /> {p.preuve ? 'Remplacer la preuve' : 'Joindre la preuve'}
                      <input type="file" hidden accept="application/pdf,image/*" onChange={async (ev) => { const f = ev.target.files?.[0]; ev.target.value = ''; if (f) agir(async () => appel(`/reversements/${p.id}/preuve`, { method: 'POST', body: { contenu: await fichierEnBase64(f), nom: f.name } }), 'Preuve jointe.'); }} />
                    </label>
                  )}
                  {p.preuve && <button type="button" className="adm-btn" onClick={() => ouvrirPrive(API_ENDPOINTS.admin.finance(`/reversements/${p.id}/preuve`))}><FaDownload /> Preuve</button>}
                  {p.statut === 'EXECUTE' && <button type="button" className="adm-btn principal" disabled={enCours || !p.preuve} onClick={() => agir(() => appel(`/reversements/${p.id}`, { method: 'PUT', body: { action: 'confirmer' } }), 'Reversement confirmé.')}><FaCheck /> Confirmer</button>}
                  {['EN_ATTENTE_APPROBATION', 'APPROUVE'].includes(p.statut) && <button type="button" className="adm-btn" disabled={enCours} onClick={() => { const motif = window.prompt('Motif du rejet'); if (motif) agir(() => appel(`/reversements/${p.id}`, { method: 'PUT', body: { action: 'rejeter', motif } }), 'Reversement rejeté.'); }}><FaTimes /> Rejeter</button>}
                  {p.statut === 'EXECUTE' && <button type="button" className="adm-btn danger" disabled={enCours} onClick={() => { const motif = window.prompt('Le virement a échoué ? Motif :'); if (motif) agir(() => appel(`/reversements/${p.id}`, { method: 'PUT', body: { action: 'echec', motif } }), 'Échec enregistré : écritures contre-passées, sommes à nouveau dues.'); }}>Échec</button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {execution && (
        <div className="admin-modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="exe-titre" onClick={() => setExecution(null)}>
          <form className="admin-modal fin-modal" onClick={(e) => e.stopPropagation()} onSubmit={(e) => { e.preventDefault(); agir(() => appel(`/reversements/${execution.id}`, { method: 'PUT', body: { action: 'executer', referenceExterne: execution.referenceExterne, source: execution.source } }), 'Virement enregistré : joignez la preuve puis confirmez.'); setExecution(null); }}>
            <h2 id="exe-titre">Virement de {fcfa(execution.montant)}</h2>
            <p className="verif-aide">Effectuez d'abord le virement depuis le tableau de bord du prestataire ou votre banque, puis enregistrez sa référence.</p>
            <label htmlFor="exe-ref">Référence de l'opération</label>
            <input id="exe-ref" required minLength={3} maxLength={80} value={execution.referenceExterne} onChange={(e) => setExecution(x => ({ ...x, referenceExterne: e.target.value }))} />
            <label htmlFor="exe-source">Fonds utilisés</label>
            <select id="exe-source" value={execution.source} onChange={(e) => setExecution(x => ({ ...x, source: e.target.value }))}>
              <option value="geniuspay">Solde GeniusPay (cash-out)</option>
              <option value="pispi">Compte PI-SPI</option>
              <option value="autre">Autre compte de la plateforme</option>
            </select>
            <div className="ent-actions">
              <button type="button" className="adm-btn" onClick={() => setExecution(null)}>Annuler</button>
              <button type="submit" className="adm-btn principal">Enregistrer</button>
            </div>
          </form>
        </div>
      )}
    </>
  );
};

const LIBELLES_ANOMALIES = {
  PAIEMENT_NON_COMPTABILISE: 'Paiement non comptabilisé', COMPTABILISE_SANS_PAIEMENT: 'Écriture sans paiement', ECART_MONTANT: 'Montant différent',
  ECART_DETTE: 'Sommes dues ≠ registre', BALANCE_DESEQUILIBREE: 'Registre déséquilibré', TROP_PERCU: 'Paiements en double à rendre',
  ECART_PRESTATAIRE: 'Différent chez le prestataire', INVERIFIABLE: 'Non vérifiable chez le prestataire',
};

const Rapprochement = ({ d, appel, agir, enCours }) => {
  const [prestataire, setPrestataire] = useState(false);
  const dernier = d.rapprochements[0];
  return (
    <div className="adm-carte fin-bloc">
      <h2>Rapprochement</h2>
      <p className="verif-aide">Compare le registre aux paiements des réservations, les sommes dues au solde de chaque entreprise, et vérifie l'équilibre du registre. En option, chaque paiement est revérifié chez GeniusPay ou PI-SPI (100 au plus, appels aux prestataires).</p>
      <label className="fin-option"><input type="checkbox" checked={prestataire} onChange={(e) => setPrestataire(e.target.checked)} /> Revérifier chez les prestataires</label>
      <button type="button" className="adm-btn principal" disabled={enCours} onClick={() => agir(() => appel('/rapprochements', { method: 'POST', body: { verifierPrestataire: prestataire } }), 'Rapprochement terminé.')}><FaSync /> {enCours ? 'En cours…' : 'Lancer le rapprochement'}</button>
      {dernier && (
        <div className="fin-rappro">
          <p><b>{dateCourte(dernier.creeLe)}</b> · {dernier.paiements} paiement(s) · {dernier.verifierPrestataire ? `${dernier.verifiesChezPrestataire} revérifié(s) chez les prestataires · ` : ''}
            {dernier.statut === 'CONFORME' ? <span className="adm-badge confirmee">Conforme</span> : <span className="adm-badge annulee">{dernier.anomalies.length} anomalie(s)</span>}</p>
          {dernier.anomalies.length > 0 && (
            <ul className="fin-anomalies">
              {dernier.anomalies.map((x, i) => <li key={i}><b>{LIBELLES_ANOMALIES[x.type] || x.type}</b> {x.reservationId ? `· ${x.reservationId}` : ''}{x.reference ? ` · ${x.reference}` : ''}{x.montant != null ? ` · ${fcfa(x.montant)}` : ''}{x.registre != null ? ` (registre : ${fcfa(x.registre)})` : ''}{x.statutPrestataire ? ` · prestataire : ${x.statutPrestataire}` : ''}{x.erreur ? ` · ${x.erreur}` : ''}</li>)}
            </ul>
          )}
        </div>
      )}
    </div>
  );
};

const Reglages = ({ d, appel, agir, enCours }) => {
  const [taux, setTaux] = useState(String(d.commission.tauxPourcent));
  return (
    <>
      <div className="adm-carte fin-bloc">
        <h2>Commission</h2>
        <p className="verif-aide">Prélevée sur chaque paiement d'un client d'une entreprise. Un nouveau taux s'applique aux réservations créées ensuite ; les réservations existantes gardent le leur.</p>
        <form className="fin-taux" onSubmit={(e) => { e.preventDefault(); if (window.confirm(`Appliquer ${taux} % aux nouvelles réservations ?`)) agir(() => appel('/commission', { method: 'PUT', body: { tauxPourcent: Number(String(taux).replace(',', '.')) } }), 'Nouveau taux enregistré.'); }}>
          <label htmlFor="taux">Taux</label>
          <input id="taux" inputMode="decimal" value={taux} onChange={(e) => setTaux(e.target.value)} /> <span>%</span>
          <button type="submit" className="adm-btn principal" disabled={enCours}>Enregistrer</button>
        </form>
        <ul className="fin-historique">{d.commission.historique.map((h, i) => <li key={i}>{h.tauxPourcent} % depuis le {dateCourte(h.actifDepuis)} <small>{h.par}</small></li>)}</ul>
      </div>
      <div className="adm-carte fin-tableau">
        <h2>Journal des opérations financières</h2>
        <table>
          <thead><tr><th>Date</th><th>Action</th><th>Par</th><th>Détails</th></tr></thead>
          <tbody>{d.audit.map((x, i) => <tr key={i}><td>{new Date(x.le).toLocaleString('fr-FR')}</td><td>{x.action}</td><td><small>{x.par}</small></td><td><small>{Object.entries(x.details || {}).map(([k, v]) => `${k} : ${v}`).join(' · ')}</small></td></tr>)}</tbody>
        </table>
      </div>
      <div className="adm-carte fin-tableau">
        <h2>Notifications des prestataires (webhooks)</h2>
        <table>
          <thead><tr><th>Reçue</th><th>Prestataire</th><th>Référence</th><th>Réceptions</th><th>Statut</th></tr></thead>
          <tbody>{d.webhooks.map(w => <tr key={w.id}><td>{new Date(w.derniereReceptionLe).toLocaleString('fr-FR')}</td><td>{w.fournisseur}</td><td><small>{w.reference || '—'}</small></td><td>{w.receptions}</td><td><span className={`adm-badge ${w.statut === 'TRAITE' ? 'confirmee' : w.statut === 'RECU' ? 'demande' : 'annulee'}`}>{w.statut}</span></td></tr>)}</tbody>
        </table>
      </div>
    </>
  );
};

export default AdminFinancesPage;
