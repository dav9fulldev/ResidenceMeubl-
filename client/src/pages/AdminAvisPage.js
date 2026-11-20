import React, { useCallback, useEffect, useState } from 'react';
import { FaCheckCircle, FaExclamationTriangle, FaEyeSlash, FaEye, FaReply } from 'react-icons/fa';
import { API_ENDPOINTS } from '../config/api';
import { useResidences } from '../context/ResidencesContext';
import { useCompte } from '../context/CompteContext';
import { CRITERES, Etoiles } from '../components/Avis';
import { dateCourte } from './AdminFinancesPage';
import './AdminFinances.css';
import './AdminAvisPage.css';

/**
 * Service de notation (back-office).
 *  - partenaire : avis sur ses résidences, réponse publique
 *  - plateforme : tous les avis, masquage d'un avis abusif (motif obligatoire)
 */
const AdminAvisPage = () => {
  const { adminRequest } = useResidences();
  const { compte } = useCompte();
  const plateforme = Boolean(compte?.superAdmin);
  const [liste, setListe] = useState(null);
  const [msg, setMsg] = useState({ ok: '', erreur: '' });
  const [edition, setEdition] = useState(null); // { id, texte } réponse en cours
  const [masquage, setMasquage] = useState(null); // { id, motif }
  const [enCours, setEnCours] = useState(false);

  const charger = useCallback(async () => {
    try { setListe((await adminRequest(API_ENDPOINTS.admin.reviews())).data); } catch (e) { setMsg({ ok: '', erreur: e.message }); }
  }, [adminRequest]);
  useEffect(() => { charger(); }, [charger]);

  const agir = async (chemin, body, ok) => {
    setEnCours(true);
    setMsg({ ok: '', erreur: '' });
    try {
      await adminRequest(API_ENDPOINTS.admin.reviews(chemin), { method: 'PUT', body });
      setEdition(null);
      setMasquage(null);
      setMsg({ ok, erreur: '' });
      await charger();
    } catch (e) { setMsg({ ok: '', erreur: e.message }); } finally { setEnCours(false); }
  };

  const visibles = liste?.filter(a => !a.masque) || [];
  const moyenne = visibles.length ? (visibles.reduce((s, a) => s + a.note, 0) / visibles.length) : null;
  const sansReponse = visibles.filter(a => !a.reponse).length;

  return (
    <div className="finances-page avis-admin">
      <header className="admin-page-header">
        <div>
          <h1>Avis</h1>
          <p>{plateforme
            ? 'Notes laissées par les voyageurs après leur séjour, sur toutes les résidences. Masquez un avis abusif : il ne compte plus dans la moyenne.'
            : 'Notes laissées par vos voyageurs après leur séjour. Votre réponse est publique, sous l\'avis, sur la fiche de la résidence.'}</p>
        </div>
      </header>
      {msg.erreur && <p className="params-msg erreur" role="alert"><FaExclamationTriangle /> {msg.erreur}</p>}
      {msg.ok && <p className="params-msg ok" role="status"><FaCheckCircle /> {msg.ok}</p>}

      {liste && (
        <div className="fin-kpis">
          <div className="adm-carte fin-kpi or"><p>Note moyenne</p><strong>{moyenne ? moyenne.toLocaleString('fr-FR', { maximumFractionDigits: 1 }) : '—'}</strong><small>{visibles.length} avis visible{visibles.length > 1 ? 's' : ''}</small></div>
          <div className="adm-carte fin-kpi"><p>Sans réponse</p><strong>{sansReponse}</strong><small>{plateforme ? 'réponses des partenaires' : 'répondre montre votre sérieux'}</small></div>
          {plateforme && <div className="adm-carte fin-kpi"><p>Masqués</p><strong>{liste.length - visibles.length}</strong><small>avis abusifs retirés</small></div>}
        </div>
      )}

      {liste?.length === 0 && <p className="adm-carte avis-admin-vide">Aucun avis pour l'instant. Les voyageurs sont invités à noter leur séjour par email le lendemain de leur départ.</p>}

      <div className="avis-admin-liste">
        {liste?.map(a => (
          <article key={a.id} className={`adm-carte avis-admin-carte${a.masque ? ' masque' : ''}`}>
            <header>
              <div>
                <h2>{a.residence}</h2>
                <p>{a.auteur} · {dateCourte(a.creeLe)}{plateforme && a.entreprise ? ` · ${a.entreprise}` : ''}</p>
              </div>
              <Etoiles note={a.note} />
            </header>
            <ul className="avis-admin-criteres">
              {Object.entries(CRITERES).map(([k, libelle]) => <li key={k}>{libelle} <b>{a.criteres[k]}/5</b></li>)}
            </ul>
            {a.commentaire ? <p className="avis-admin-texte">« {a.commentaire} »</p> : <p className="avis-admin-texte vide">Pas de commentaire.</p>}

            {a.masque && <p className="avis-admin-masque"><FaEyeSlash aria-hidden="true" /> Masqué le {dateCourte(a.masque.le)} : {a.masque.motif}</p>}

            {a.reponse && edition?.id !== a.id && (
              <div className="avis-admin-reponse"><p><b>Réponse du partenaire</b> · {dateCourte(a.reponse.le)}</p><p>{a.reponse.texte}</p></div>
            )}

            {!plateforme && edition?.id === a.id && (
              <form className="avis-admin-form" onSubmit={(e) => { e.preventDefault(); agir(`/${a.id}/reponse`, { texte: edition.texte }, edition.texte.trim() ? 'Réponse publiée.' : 'Réponse retirée.'); }}>
                <label htmlFor={`reponse-${a.id}`}>Votre réponse publique</label>
                <textarea id={`reponse-${a.id}`} rows={3} maxLength={1000} value={edition.texte} onChange={(e) => setEdition({ ...edition, texte: e.target.value })}
                  placeholder="Remerciez le voyageur, répondez à une remarque…" />
                <div className="avis-admin-actions">
                  <button type="submit" className="adm-btn principal" disabled={enCours}>Publier</button>
                  <button type="button" className="adm-btn" onClick={() => setEdition(null)}>Annuler</button>
                </div>
              </form>
            )}

            {plateforme && masquage?.id === a.id && (
              <form className="avis-admin-form" onSubmit={(e) => { e.preventDefault(); agir(`/${a.id}/masquage`, { masque: true, motif: masquage.motif }, 'Avis masqué.'); }}>
                <label htmlFor={`motif-${a.id}`}>Motif du masquage</label>
                <input id={`motif-${a.id}`} required minLength={5} maxLength={300} value={masquage.motif} onChange={(e) => setMasquage({ ...masquage, motif: e.target.value })}
                  placeholder="Propos injurieux, données personnelles, hors sujet…" />
                <div className="avis-admin-actions">
                  <button type="submit" className="adm-btn danger" disabled={enCours}>Masquer l'avis</button>
                  <button type="button" className="adm-btn" onClick={() => setMasquage(null)}>Annuler</button>
                </div>
              </form>
            )}

            {edition?.id !== a.id && masquage?.id !== a.id && (
              <div className="avis-admin-actions">
                {!plateforme && !a.masque && (
                  <button type="button" className="adm-btn" onClick={() => setEdition({ id: a.id, texte: a.reponse?.texte || '' })}>
                    <FaReply aria-hidden="true" /> {a.reponse ? 'Modifier la réponse' : 'Répondre'}
                  </button>
                )}
                {plateforme && (a.masque
                  ? <button type="button" className="adm-btn" disabled={enCours} onClick={() => agir(`/${a.id}/masquage`, { masque: false }, 'Avis de nouveau visible.')}><FaEye aria-hidden="true" /> Réafficher</button>
                  : <button type="button" className="adm-btn" onClick={() => setMasquage({ id: a.id, motif: '' })}><FaEyeSlash aria-hidden="true" /> Masquer</button>)}
              </div>
            )}
          </article>
        ))}
      </div>
    </div>
  );
};

export default AdminAvisPage;
