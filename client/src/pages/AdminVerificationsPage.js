import React, { useCallback, useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import {
  FaCheck, FaTimes, FaBan, FaUndo, FaSearch, FaQuestionCircle, FaExternalLinkAlt, FaFlag, FaCheckCircle, FaExclamationTriangle,
} from 'react-icons/fa';
import { API_ENDPOINTS } from '../config/api';
import { useResidences } from '../context/ResidencesContext';
import { useCompte } from '../context/CompteContext';
import { VERIFICATION } from '../components/AdminPanel';
import { ImagePrivee, ouvrirPrive } from '../components/admin/FichierPrive';
import { carte, distanceClasse, distanceTexte } from './AdminVerificationDossier';
import './AdminVerification.css';

const ONGLETS = [['', 'À traiter'], ['verifiee', 'Vérifiées'], ['refusee', 'Refusées'], ['suspendue', 'Suspendues'], ['signalements', 'Signalements']];
const MOTIFS = { fausse_annonce: 'Fausse annonce', photos_trompeuses: 'Photos trompeuses', adresse: 'Adresse fausse', paiement_hors_plateforme: 'Paiement hors plateforme', autre: 'Autre' };
const date = (d) => (d ? new Date(d).toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—');

// Points à contrôler avant de vérifier une résidence
const CONTROLES = [
  'Les photos de l\'annonce ne se retrouvent pas ailleurs sur Internet (recherche d\'image Google Lens).',
  'Le code est lisible sur les photos prises sur place.',
  'Les photos sur place ont été prises près de l\'adresse déclarée et correspondent à l\'annonce.',
  'Le nom sur la pièce d\'identité correspond au gestionnaire inscrit.',
  'Le justificatif autorise bien la location de ce logement, à cette adresse.',
  'Le prix est cohérent avec le quartier (un prix très bas est un signal d\'alerte).',
];

/** Plateforme : file des résidences à vérifier, examen du dossier, décisions, signalements des visiteurs. */
const AdminVerificationsPage = () => {
  const { adminRequest } = useResidences();
  const { compte, recharger } = useCompte();
  const [onglet, setOnglet] = useState('');
  const [liste, setListe] = useState(null);
  const [choisie, setChoisie] = useState(null);
  const [motif, setMotif] = useState('');
  const [erreur, setErreur] = useState('');
  const [ok, setOk] = useState('');
  const [enCours, setEnCours] = useState(false);

  const charger = useCallback(async () => {
    setErreur('');
    try {
      setListe((await adminRequest(onglet === 'signalements' ? API_ENDPOINTS.admin.reports() : API_ENDPOINTS.admin.verifications(onglet))).data);
    } catch (e) { setErreur(e.message); }
  }, [adminRequest, onglet]);
  useEffect(() => { setListe(null); setChoisie(null); charger(); }, [charger]);

  const ouvrir = async (id) => {
    setErreur(''); setOk(''); setMotif('');
    try { setChoisie((await adminRequest(API_ENDPOINTS.admin.platformVerification(id))).data); } catch (e) { setErreur(e.message); }
  };

  const decider = async (actionNom, messageOk) => {
    setEnCours(true); setErreur(''); setOk('');
    try {
      const r = (await adminRequest(API_ENDPOINTS.admin.platformVerification(choisie.residence.id), { method: 'PUT', body: { action: actionNom, motif } })).data;
      setChoisie(r); setMotif(''); setOk(messageOk);
      charger(); recharger();
    } catch (e) { setErreur(e.message); } finally { setEnCours(false); }
  };

  const traiterSignalement = async (id) => {
    try { await adminRequest(API_ENDPOINTS.admin.report(id), { method: 'PUT' }); charger(); recharger(); } catch (e) { setErreur(e.message); }
  };

  if (compte && !compte.superAdmin) return <Navigate to="/admin/dashboard" replace />;
  const s = choisie?.statut;

  return (
    <div className="verifs-page">
      <header className="admin-page-header">
        <div>
          <h1>Vérifications</h1>
          <p>Une résidence d'entreprise n'est publiée qu'après votre vérification. Les visiteurs peuvent signaler une annonce.</p>
        </div>
      </header>

      <div className="ent-filtres" role="tablist" aria-label="Filtrer">
        {ONGLETS.map(([cle, libelle]) => (
          <button key={cle || 'traiter'} type="button" role="tab" aria-selected={onglet === cle} className={onglet === cle ? 'actif' : ''} onClick={() => setOnglet(cle)}>{libelle}</button>
        ))}
      </div>
      {erreur && <p className="params-msg erreur" role="alert"><FaExclamationTriangle /> {erreur}</p>}
      {!liste && !erreur && <p className="ent-vide">Chargement…</p>}

      {onglet === 'signalements' && liste && (
        liste.length === 0 ? <p className="ent-vide">Aucun signalement en attente.</p> : (
          <ul className="verifs-signalements">
            {liste.map(x => (
              <li key={x.id} className="adm-carte">
                <div className="verifs-sig-tete">
                  <span className="adm-badge annulee"><FaFlag aria-hidden="true" /> {MOTIFS[x.motif] || x.motif}</span>
                  <span>{date(x.creeLe)}</span>
                </div>
                <p><b>{x.residence}</b> · {x.entreprise || '—'} {x.statutResidence ? `· ${VERIFICATION[x.statutResidence]?.libelle || x.statutResidence}` : ''}</p>
                {x.message && <blockquote>{x.message}</blockquote>}
                {x.email && <p className="verifs-contact">Contact : <a href={`mailto:${x.email}`}>{x.email}</a></p>}
                <div className="verif-actions">
                  <button type="button" className="adm-btn" onClick={() => { setOnglet(''); setTimeout(() => ouvrir(x.residenceId), 0); }}><FaSearch /> Ouvrir le dossier</button>
                  <button type="button" className="adm-btn principal" onClick={() => traiterSignalement(x.id)}><FaCheck /> Marquer comme traité</button>
                </div>
              </li>
            ))}
          </ul>
        )
      )}

      {onglet !== 'signalements' && liste && (
        <div className={`adm-maitre-detail ${choisie ? '' : 'sans-detail'}`}>
          <ul className="verifs-liste">
            {liste.length === 0 && <li className="ent-vide">Rien dans cette catégorie.</li>}
            {liste.map(r => (
              <li key={r.id}>
                <button type="button" className={`adm-carte verifs-ligne ${choisie?.residence.id === r.id ? 'choisie' : ''}`} onClick={() => ouvrir(r.id)}>
                  {r.photo ? <img src={r.photo} alt="" loading="lazy" /> : <span className="verifs-sans-photo" />}
                  <span className="verifs-texte">
                    <b>{r.nom}</b>
                    <small>{r.entreprise || '—'} · {r.quartier}, {r.ville}</small>
                    <small>Envoyé : {date(r.soumiseLe)}</small>
                  </span>
                  <span className="verifs-etat">
                    <span className={`adm-badge ${VERIFICATION[r.statut]?.classe || 'neutre'}`}>{r.libelle}</span>
                    {r.signalements > 0 && <span className="adm-badge annulee"><FaFlag aria-hidden="true" /> {r.signalements}</span>}
                  </span>
                </button>
              </li>
            ))}
          </ul>

          {choisie && (
            <aside className="adm-carte adm-panneau verifs-detail" aria-label={`Dossier de ${choisie.residence.nom}`}>
              <div className="cal-panneau-tete">
                <div>
                  <p className="surtitre">{choisie.residence.entreprise}</p>
                  <h2>{choisie.residence.nom}</h2>
                  <p className="verifs-adresse">{choisie.residence.localisation} · {choisie.residence.quartier}, {choisie.residence.ville} · {Number(choisie.residence.prix).toLocaleString('fr-FR')} FCFA / nuit</p>
                </div>
                <button type="button" className="resa-fermer" onClick={() => setChoisie(null)} aria-label="Fermer"><FaTimes /></button>
              </div>
              <span className={`adm-badge ${VERIFICATION[s]?.classe || 'neutre'}`}>{VERIFICATION[s]?.libelle || s}</span>
              {ok && <p className="params-msg ok" role="status"><FaCheckCircle /> {ok}</p>}
              {choisie.manquants.length > 0 && <p className="params-msg erreur">Incomplet : {choisie.manquants.join(' ; ')}</p>}

              <h3>Photos de l'annonce ({choisie.residence.photos.length})</h3>
              <div className="verif-photos petites">
                {choisie.residence.photos.map(u => <a key={u} href={u} target="_blank" rel="noopener noreferrer"><img src={u} alt="" loading="lazy" /></a>)}
              </div>

              <h3>Photos sur place · code <code>{choisie.code}</code></h3>
              <div className="verif-preuves-liste">
                {choisie.preuves.map(p => (
                  <figure key={p.id}>
                    <ImagePrivee url={API_ENDPOINTS.admin.platformVerificationFile(choisie.residence.id, p.id)} alt={choisie.types.preuves[p.type]?.libelle || p.type} />
                    <figcaption className={`verif-distance ${distanceClasse(p.distanceM)}`}>
                      {choisie.types.preuves[p.type]?.libelle.split(',')[0]} · {distanceTexte(p.distanceM)}
                      {p.gps && <> · <a href={carte(p.gps)} target="_blank" rel="noopener noreferrer">carte</a></>}
                    </figcaption>
                  </figure>
                ))}
              </div>

              <h3>Localisation déclarée</h3>
              {choisie.gps
                ? <a className="verif-lien" href={carte(choisie.gps)} target="_blank" rel="noopener noreferrer"><FaExternalLinkAlt aria-hidden="true" /> {choisie.gps.lat}, {choisie.gps.lng} (Google Maps)</a>
                : <p className="verif-aide">Non renseignée.</p>}

              <h3>Justificatifs</h3>
              <ul className="verifs-docs">
                {choisie.documents.length === 0 && <li className="verif-aide">Aucun.</li>}
                {choisie.documents.map(f => (
                  <li key={f.id}><button type="button" className="verif-nom" onClick={() => ouvrirPrive(API_ENDPOINTS.admin.platformVerificationFile(choisie.residence.id, f.id))}>{choisie.types.documents[f.type]?.libelle.split('(')[0]} — {f.nom}</button></li>
                ))}
              </ul>

              <details className="verifs-controles" open={['en_attente', 'en_verification'].includes(s)}>
                <summary><FaQuestionCircle aria-hidden="true" /> Points à contrôler</summary>
                <ul>{CONTROLES.map(c => <li key={c}>{c}</li>)}</ul>
              </details>

              <label className="verifs-motif" htmlFor="motif">Message au gestionnaire (obligatoire pour compléter, refuser ou suspendre)</label>
              <textarea id="motif" rows={3} maxLength={500} value={motif} onChange={(e) => setMotif(e.target.value)} />

              <div className="verif-actions">
                {s === 'en_attente' && <button type="button" className="adm-btn" disabled={enCours} onClick={() => decider('examiner', 'Dossier en cours d\'examen (le gestionnaire ne peut plus le modifier).')}><FaSearch /> Examiner</button>}
                {['en_attente', 'en_verification', 'a_completer'].includes(s) && <button type="button" className="adm-btn principal" disabled={enCours} onClick={() => decider('verifier', 'Résidence vérifiée : elle est publiée.')}><FaCheck /> Vérifier et publier</button>}
                {['en_attente', 'en_verification'].includes(s) && <button type="button" className="adm-btn" disabled={enCours} onClick={() => decider('completer', 'Compléments demandés au gestionnaire.')}><FaQuestionCircle /> Demander des compléments</button>}
                {['en_attente', 'en_verification', 'a_completer'].includes(s) && <button type="button" className="adm-btn danger" disabled={enCours} onClick={() => decider('refuser', 'Résidence refusée.')}><FaTimes /> Refuser</button>}
                {['verifiee', 'en_attente', 'en_verification', 'a_completer'].includes(s) && <button type="button" className="adm-btn danger" disabled={enCours} onClick={() => decider('suspendre', 'Résidence suspendue : retirée du site.')}><FaBan /> Suspendre</button>}
                {s === 'suspendue' && <button type="button" className="adm-btn principal" disabled={enCours} onClick={() => decider('retablir', 'Résidence rétablie.')}><FaUndo /> Rétablir</button>}
              </div>

              {choisie.historique.length > 0 && (
                <ol className="verif-historique">
                  {[...choisie.historique].reverse().map((h, i) => (
                    <li key={i}><span>{date(h.le)}</span> <b>{VERIFICATION[h.statut]?.libelle || h.statut}</b> ({h.par}){h.motif ? ` — ${h.motif}` : ''}</li>
                  ))}
                </ol>
              )}
            </aside>
          )}
        </div>
      )}
    </div>
  );
};

export default AdminVerificationsPage;
