import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import {
  FaCheckCircle, FaExclamationTriangle, FaRocket, FaTimes, FaMobileAlt, FaUniversity, FaBed, FaUsers, FaMapMarkerAlt,
  FaEye, FaCalendarCheck, FaGlobeAfrica, FaMapPin, FaCity, FaChevronDown, FaChevronUp, FaRedo, FaReceipt, FaPrint,
} from 'react-icons/fa';
import { API_ENDPOINTS } from '../config/api';
import { useResidences } from '../context/ResidencesContext';
import { useCompte } from '../context/CompteContext';
import { Badge, dateCourte, fcfa } from './AdminFinancesPage';
import './AdminFinances.css';
import './AdminBoosters.css';

export const STATUTS_BOOSTER = {
  en_attente: ['En attente du paiement', 'attente'], actif: ['Actif', 'confirmee'], programme: ['Programmé', 'attente'], termine: ['Terminé', 'neutre'],
  refuse: ['Refusé', 'annulee'], annule: ['Annulé', 'neutre'], arrete: ['Arrêté', 'annulee'],
};
const ICONES_OBJECTIF = { visites: <FaEye />, reservations: <FaCalendarCheck /> };
const AIDES_OBJECTIF = {
  visites: 'Faire découvrir la résidence : on mesure les visites de sa fiche.',
  reservations: 'Remplir le calendrier : on mesure les réservations reçues pendant le booster.',
};
const ICONES_AUDIENCE = { tout: <FaGlobeAfrica />, quartier: <FaMapPin />, ville: <FaCity /> };
const FACTEUR_AUDIENCE = { tout: 1, ville: 0.6, quartier: 0.35 };
const nombre = (n) => Math.round(n).toLocaleString('fr-FR');
const MOYENS_PAIEMENT = { geniuspay: 'Paiement en ligne (GeniusPay)', mobile_money: 'Mobile Money', virement: 'Virement', especes: 'Espèces', autre: 'Autre' };
const jourLong = (d) => d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });

/** Bonus de classement selon le budget par jour (même règle que le serveur) */
const bonusPour = (budget, r) => {
  const t = Math.min(1, Math.max(0, (budget - r.budgetMin) / ((r.budgetMax - r.budgetMin) || 1)));
  return r.bonusMin + (r.bonusMax - r.bonusMin) * t;
};

/** Estimation (fourchette) des affichages et des visites, d'après la fréquentation des 14 derniers jours */
const estimer = (residence, audience, budget, duree, reglages) => {
  if (!residence) return null;
  const base = residence.affichagesJour > 0 ? residence.affichagesJour : 30;
  const parJour = base * FACTEUR_AUDIENCE[audience] * (1 + bonusPour(budget, reglages) * 2.5);
  const taux = residence.tauxVisite > 0 ? residence.tauxVisite : 0.05;
  const total = parJour * duree;
  return { affichages: [total * 0.75, total * 1.25], visites: [total * taux * 0.75, total * taux * 1.25], donnees: residence.affichagesJour > 0 };
};

/**
 * Partenaire : booster de visibilité, sur le modèle du « Booster la publication » de Facebook.
 * Résidence → objectif → audience → budget par jour et durée (estimation) → récapitulatif et aperçu
 * → paiement (GeniusPay, ou virement / espèces) → résultats de chaque booster → prolonger.
 */
const AdminVisibilitePage = () => {
  const { adminRequest } = useResidences();
  const { compte } = useCompte();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [d, setD] = useState(null);
  const [f, setF] = useState({ residenceId: '', objectif: 'visites', audience: 'tout', budgetJour: 1000, duree: 7 });
  const [msg, setMsg] = useState({ ok: '', erreur: '' });
  const [paiement, setPaiement] = useState(null); // { booster?: vue existante, moyen: 'en_ligne' | 'hors_ligne', erreur? }
  const [enCours, setEnCours] = useState(false);
  const [retour, setRetour] = useState(null);
  const [ouvert, setOuvert] = useState(null); // booster dont on lit les résultats
  const [recu, setRecu] = useState(null); // booster dont on affiche le reçu
  const dialogue = useRef(null);
  const haut = useRef(null);

  const charger = useCallback(async () => {
    try {
      const r = (await adminRequest(API_ENDPOINTS.admin.boosters())).data;
      setD(r);
      setF(v => ({ ...v, budgetJour: Math.min(Math.max(v.budgetJour, r.reglages.budgetMin), r.reglages.budgetMax) }));
    } catch (e) { setMsg({ ok: '', erreur: e.message }); }
  }, [adminRequest]);
  useEffect(() => { if (compte && !compte.superAdmin) charger(); }, [charger, compte]);

  // Retour de la page de paiement GeniusPay : le serveur relit le paiement chez GeniusPay
  useEffect(() => {
    const id = searchParams.get('booster');
    if (searchParams.get('paiement') !== 'geniuspay' || !id || !compte || compte.superAdmin) return undefined;
    const echec = searchParams.get('echec') === '1';
    navigate('/admin/visibilite', { replace: true });
    let actif = true;
    setRetour({ etat: 'verif', message: 'Vérification de votre paiement…' });
    (async () => {
      for (let i = 0; i < 12 && actif; i += 1) {
        try {
          const b = (await adminRequest(API_ENDPOINTS.admin.boosters(`/${id}/paiement`))).data;
          if (['actif', 'programme'].includes(b.statut)) {
            if (actif) setRetour({ etat: 'ok', message: b.statut === 'programme'
              ? `Paiement reçu : la prolongation de « ${b.residenceNom} » est programmée du ${dateCourte(b.debut)} au ${dateCourte(b.fin)}.`
              : `Paiement reçu : « ${b.residenceNom} » est boostée du ${dateCourte(b.debut)} au ${dateCourte(b.fin)}.` });
            charger();
            return;
          }
          if (b.paiementEnLigne?.statut === 'echec') { if (actif) setRetour({ etat: 'echec', message: `${b.paiementEnLigne.raison}. Vous pouvez réessayer depuis « Mes boosters ».` }); charger(); return; }
        } catch { /* réseau : nouvel essai */ }
        await new Promise(r => setTimeout(r, 3000));
      }
      if (actif) {
        setRetour(echec
          ? { etat: 'echec', message: 'Le paiement n’a pas abouti. Vous pouvez réessayer depuis « Mes boosters ».' }
          : { etat: 'attente', message: 'Paiement en cours de confirmation : le booster s’activera dès que GeniusPay l’aura validé.' });
        charger();
      }
    })();
    return () => { actif = false; };
  }, [searchParams, compte, adminRequest, navigate, charger]);

  useEffect(() => {
    if (!paiement) return undefined;
    dialogue.current?.focus();
    const echap = (e) => { if (e.key === 'Escape' && !enCours) setPaiement(null); };
    document.addEventListener('keydown', echap);
    return () => document.removeEventListener('keydown', echap);
  }, [paiement, enCours]);

  const residence = useMemo(() => d?.residences.find(r => String(r.id) === String(f.residenceId)) || null, [d, f.residenceId]);
  const estimation = useMemo(() => (d ? estimer(residence, f.audience, f.budgetJour, f.duree, d.reglages) : null), [d, residence, f]);

  if (compte?.superAdmin) return <Navigate to="/admin/boosters" replace />;

  const champ = (k, v) => setF(x => ({ ...x, [k]: v }));
  const total = f.budgetJour * f.duree;
  const cibleAudience = (a) => (a === 'quartier' ? residence?.quartier : a === 'ville' ? residence?.ville : null);

  const prolonger = (b) => {
    // Un booster des anciennes formules (ex. 15 jours, 600 FCFA par jour) est ramené aux valeurs
    // proposées aujourd'hui : durée la plus proche, budget au pas de 500 dans les bornes
    const r = d.reglages;
    const duree = r.durees.reduce((m, n) => (Math.abs(n - b.duree) < Math.abs(m - b.duree) ? n : m), r.durees[0]);
    const budgetJour = Math.min(r.budgetMax, Math.max(r.budgetMin, Math.round(b.budgetJour / r.pas) * r.pas));
    setF({ residenceId: String(b.residenceId), objectif: b.objectif, audience: b.audience, budgetJour, duree });
    setMsg({ ok: 'Campagne préremplie : vérifiez puis payez. Le nouveau booster commencera à la fin de l’actuel.', erreur: '' });
    haut.current?.scrollIntoView({ behavior: 'smooth' });
  };

  // Impression du reçu seul (le reste de la page est masqué pendant l'impression)
  const imprimerRecu = () => {
    document.body.classList.add('impression-recu');
    const fin = () => { document.body.classList.remove('impression-recu'); window.removeEventListener('afterprint', fin); };
    window.addEventListener('afterprint', fin);
    window.print();
  };

  const payer = async () => {
    setEnCours(true); setMsg({ ok: '', erreur: '' });
    try {
      let b = paiement.booster;
      if (!b) {
        b = (await adminRequest(API_ENDPOINTS.admin.boosters(), { method: 'POST', body: {
          residenceId: Number(f.residenceId), objectif: f.objectif, audience: f.audience, budgetJour: Number(f.budgetJour), duree: Number(f.duree),
        } })).data;
      }
      if (paiement.moyen === 'en_ligne') {
        const r = await adminRequest(API_ENDPOINTS.admin.boosters(`/${b.id}/paiement`), { method: 'POST' });
        window.location.href = r.data.checkoutUrl; // page de paiement sécurisée GeniusPay
        return;
      }
      setPaiement(null);
      setMsg({ ok: `Demande ${b.reference} enregistrée. Réglez ${fcfa(b.montant)} par virement ou en espèces : BABI RESIDENCE active le booster dès réception.`, erreur: '' });
      await charger();
    } catch (err) {
      // L'erreur reste visible dans la fenêtre de paiement (la page peut être loin du haut)
      setPaiement(p => (p ? { ...p, erreur: err.message } : p));
      await charger();
    }
    setEnCours(false);
  };

  const annuler = async (id) => {
    setMsg({ ok: '', erreur: '' });
    try { await adminRequest(API_ENDPOINTS.admin.boosters(`/${id}`), { method: 'DELETE' }); setMsg({ ok: 'Demande annulée.', erreur: '' }); await charger(); } catch (err) { setMsg({ ok: '', erreur: err.message }); }
  };

  const enAttente = residence && d?.boosters.find(b => b.statut === 'en_attente' && b.residenceId === residence.id);
  const montantPaiement = paiement?.booster ? paiement.booster.montant : total;

  return (
    <div className="finances-page boosters-page" ref={haut}>
      <header className="admin-page-header">
        <div>
          <h1>Visibilité</h1>
          <p>Boostez une résidence : elle est proposée plus haut aux voyageurs que vous ciblez, en plus de sa note, avec la mention « Sponsorisé ».</p>
        </div>
      </header>
      {msg.erreur && <p className="params-msg erreur" role="alert"><FaExclamationTriangle /> {msg.erreur}</p>}
      {msg.ok && <p className="params-msg ok" role="status"><FaCheckCircle /> {msg.ok}</p>}
      {retour && (
        <p className={`params-msg ${retour.etat === 'echec' ? 'erreur' : 'ok'} booster-retour`} role="status" aria-live="polite">
          {retour.etat === 'verif' ? <span className="booster-spinner" aria-hidden="true" /> : retour.etat === 'echec' ? <FaExclamationTriangle /> : <FaCheckCircle />} {retour.message}
        </p>
      )}

      {d && (
        <>
          <div className="booster-creation">
            <div className="booster-etapes">
              <section className="adm-carte fin-bloc">
                <h2><span className="booster-num">1</span> Résidence</h2>
                <label className="sr-seul" htmlFor="booster-residence">Résidence à booster</label>
                <select id="booster-residence" value={f.residenceId} onChange={(e) => champ('residenceId', e.target.value)}>
                  <option value="">Choisir une résidence publiée</option>
                  {d.residences.map(r => <option key={r.id} value={r.id}>{r.nom}</option>)}
                </select>
                {d.residences.length === 0 && <p className="verif-aide">Aucune résidence publiée : une résidence doit être vérifiée avant d’être boostée.</p>}
              </section>

              <section className="adm-carte fin-bloc">
                <h2><span className="booster-num">2</span> Objectif</h2>
                <p className="verif-aide">Quel résultat attendez-vous de ce booster ?</p>
                <div className="booster-choix" role="radiogroup" aria-label="Objectif">
                  {Object.entries(d.objectifs).map(([k, libelle]) => (
                    <label key={k} className={`booster-option${f.objectif === k ? ' choisie' : ''}`}>
                      <input type="radio" name="objectif" checked={f.objectif === k} onChange={() => champ('objectif', k)} />
                      <span className="booster-option-icone" aria-hidden="true">{ICONES_OBJECTIF[k]}</span>
                      <span><b>{libelle}</b><small>{AIDES_OBJECTIF[k]}</small></span>
                    </label>
                  ))}
                </div>
              </section>

              <section className="adm-carte fin-bloc">
                <h2><span className="booster-num">3</span> Audience</h2>
                <p className="verif-aide">Qui doit voir votre résidence plus haut ?</p>
                <div className="booster-choix" role="radiogroup" aria-label="Audience">
                  {Object.entries(d.audiences).map(([k, libelle]) => {
                    const cible = cibleAudience(k);
                    const indispo = k !== 'tout' && residence && !cible;
                    return (
                      <label key={k} className={`booster-option${f.audience === k ? ' choisie' : ''}${indispo ? ' indisponible' : ''}`}>
                        <input type="radio" name="audience" checked={f.audience === k} disabled={indispo} onChange={() => champ('audience', k)} />
                        <span className="booster-option-icone" aria-hidden="true">{ICONES_AUDIENCE[k]}</span>
                        <span>
                          <b>{libelle}{cible ? ` : ${cible}` : ''}</b>
                          <small>{k === 'tout' ? 'Accueil, catalogue et toutes les recherches.' : 'Seulement quand un voyageur cherche dans cette zone : plus ciblé.'}</small>
                        </span>
                      </label>
                    );
                  })}
                </div>
              </section>

              <section className="adm-carte fin-bloc">
                <h2><span className="booster-num">4</span> Budget et durée</h2>
                <div className="booster-budget">
                  <label htmlFor="booster-budget">Budget par jour <strong>{fcfa(f.budgetJour)}</strong></label>
                  <input id="booster-budget" type="range" min={d.reglages.budgetMin} max={d.reglages.budgetMax} step={d.reglages.pas}
                    value={f.budgetJour} onChange={(e) => champ('budgetJour', Number(e.target.value))} />
                  <p className="booster-bornes"><span>{fcfa(d.reglages.budgetMin)}</span><span>Plus le budget est élevé, plus la résidence remonte</span><span>{fcfa(d.reglages.budgetMax)}</span></p>
                </div>
                <p className="booster-sous-titre">Durée</p>
                <div className="booster-durees" role="radiogroup" aria-label="Durée">
                  {d.reglages.durees.map(n => (
                    <label key={n} className={`booster-duree-choix${f.duree === n ? ' choisie' : ''}`}>
                      <input type="radio" name="duree" checked={f.duree === n} onChange={() => champ('duree', n)} />
                      {n} jours
                    </label>
                  ))}
                </div>
                {estimation && (
                  <div className="booster-estimation" aria-live="polite">
                    <p><FaEye aria-hidden="true" /> <b>{nombre(estimation.affichages[0])} à {nombre(estimation.affichages[1])}</b> affichages estimés</p>
                    <p><FaMapMarkerAlt aria-hidden="true" /> <b>{nombre(estimation.visites[0])} à {nombre(estimation.visites[1])}</b> visites de la fiche estimées</p>
                    <small>{estimation.donnees ? 'D’après la fréquentation de la résidence sur les 14 derniers jours.' : 'Estimation de départ : la fréquentation de la résidence n’est pas encore mesurée.'} Ce n’est pas une garantie.</small>
                  </div>
                )}
              </section>

              <section className="adm-carte fin-bloc booster-recap">
                <h2>Récapitulatif</h2>
                <dl>
                  <div><dt>Objectif</dt><dd>{d.objectifs[f.objectif]}</dd></div>
                  <div><dt>Audience</dt><dd>{d.audiences[f.audience]}{cibleAudience(f.audience) ? ` : ${cibleAudience(f.audience)}` : ''}</dd></div>
                  <div><dt>Budget</dt><dd>{fcfa(f.budgetJour)} par jour × {f.duree} jours</dd></div>
                  <div><dt>Période</dt><dd>dès le paiement, jusqu’au {jourLong(new Date(Date.now() + f.duree * 86400000))} environ</dd></div>
                  <div className="total"><dt>Total</dt><dd>{fcfa(total)}</dd></div>
                </dl>
                <p className="verif-aide">Une résidence avec de mauvaises notes reste « Sponsorisé » mais ne remonte pas : la qualité passe d’abord.</p>
              </section>
            </div>

            <aside className="booster-apercu" aria-label="Aperçu de l'annonce">
              <div className="adm-carte fin-bloc">
                <h2>Aperçu de l’annonce</h2>
                {residence ? (
                  <article className="booster-annonce">
                    <div className="booster-annonce-photo">
                      {residence.photo ? <img src={residence.photo} alt="" /> : <span>Photo de la résidence</span>}
                    </div>
                    <div className="booster-annonce-corps">
                      <span className="rc-sponsorise">Sponsorisé</span>
                      <h3>{residence.nom}</h3>
                      <p><FaMapMarkerAlt aria-hidden="true" /> {residence.localisation}</p>
                      <p className="booster-annonce-specs">
                        {residence.nombreChambres ? <span><FaBed aria-hidden="true" /> {residence.nombreChambres} ch.</span> : null}
                        {residence.capacite ? <span><FaUsers aria-hidden="true" /> {residence.capacite} pers.</span> : null}
                      </p>
                      <p className="booster-annonce-prix"><b>{fcfa(residence.prix)}</b> / nuit</p>
                    </div>
                  </article>
                ) : <p className="booster-annonce-vide">Choisissez une résidence pour voir l’aperçu de son annonce.</p>}
                <p className="verif-aide">{f.audience === 'tout' ? 'Visible plus haut dans l’accueil, le catalogue et les recherches.' : `Visible plus haut quand un voyageur cherche « ${cibleAudience(f.audience) || '…'} ».`}</p>
              </div>
            </aside>
          </div>

          <div className="booster-barre">
            <p>{enAttente ? `Une demande (${enAttente.reference}) attend déjà un paiement pour cette résidence : payez-la ou annulez-la dans « Mes boosters ».` : 'En cliquant sur « Payer et booster », vous acceptez que la mention « Sponsorisé » apparaisse sur l’annonce pendant la durée choisie.'}</p>
            <button type="button" className="adm-btn principal" disabled={!f.residenceId || Boolean(enAttente)} onClick={() => setPaiement({ booster: null, moyen: d.paiementEnLigne ? 'en_ligne' : 'hors_ligne' })}>
              <FaRocket /> Payer et booster · {fcfa(total)}
            </button>
          </div>

          <div className="adm-carte fin-tableau">
            <h2>Mes boosters</h2>
            <table>
              <thead><tr><th>Référence</th><th>Résidence</th><th>Campagne</th><th>Montant</th><th>Période</th><th>Statut</th><th><span className="sr-seul">Actions</span></th></tr></thead>
              <tbody>
                {d.boosters.length === 0 && <tr><td colSpan={7} className="ent-vide">Aucun booster pour l’instant.</td></tr>}
                {d.boosters.map(b => {
                  const r = b.resultats;
                  // Prolongations : lien entre les boosters d'une même résidence ; « Prolonger » sur le dernier seulement
                  const suite = d.boosters.find(x => x.prolongationDe === b.reference && ['actif', 'programme'].includes(x.statut));
                  const dernier = !d.boosters.some(x => x.residenceId === b.residenceId && x.id !== b.id && ['actif', 'programme'].includes(x.statut) && new Date(x.fin) > new Date(b.fin));
                  const resultat = b.objectif === 'reservations' ? r?.reservations : r?.visites;
                  return (
                    <React.Fragment key={b.id}>
                      <tr>
                        <td><code>{b.reference}</code></td>
                        <td>{b.residenceNom}</td>
                        <td>{d.objectifs[b.objectif]}<small>{d.audiences[b.audience]}{b.cible ? ` : ${b.cible}` : ''} · {fcfa(b.budgetJour)}/jour</small></td>
                        <td>{fcfa(b.montant)}<small>{b.duree} jours</small></td>
                        <td>{b.debut ? `${dateCourte(b.debut)} → ${dateCourte(b.fin)}` : <small>demandé le {dateCourte(b.demandeLe)}</small>}</td>
                        <td>
                          <Badge table={STATUTS_BOOSTER} valeur={b.statut} />
                          {b.motif && <small>{b.motif}</small>}
                          {b.statut === 'en_attente' && b.paiementEnLigne?.statut === 'echec' && <small>{b.paiementEnLigne.raison}</small>}
                          {b.prolongationDe && <small>Prolongation de {b.prolongationDe}</small>}
                          {suite && <small>Prolongé par {suite.reference} jusqu’au {dateCourte(suite.fin)}</small>}
                        </td>
                        <td className="booster-actions">
                          {b.statut === 'en_attente' && <>
                            <button type="button" className="adm-btn principal" onClick={() => setPaiement({ booster: b, moyen: d.paiementEnLigne ? 'en_ligne' : 'hors_ligne' })}>Payer</button>
                            <button type="button" className="adm-btn" onClick={() => annuler(b.id)}>Annuler</button>
                          </>}
                          {r && <button type="button" className="adm-btn" aria-expanded={ouvert === b.id} onClick={() => setOuvert(o => (o === b.id ? null : b.id))}>
                            {ouvert === b.id ? <FaChevronUp aria-hidden="true" /> : <FaChevronDown aria-hidden="true" />} Résultats
                          </button>}
                          {b.paiement && <button type="button" className="adm-btn" onClick={() => setRecu(b)}><FaReceipt aria-hidden="true" /> Reçu</button>}
                          {['actif', 'programme', 'termine'].includes(b.statut) && dernier && !suite && <button type="button" className="adm-btn" onClick={() => prolonger(b)}><FaRedo aria-hidden="true" /> Prolonger</button>}
                        </td>
                      </tr>
                      {ouvert === b.id && r && (
                        <tr className="booster-resultats-ligne">
                          <td colSpan={7}>
                            <div className="booster-resultats">
                              <div><span>Affichages</span><strong>{nombre(r.affichages)}</strong><small>dont {nombre(r.affichagesSponsorises)} avec « Sponsorisé »</small></div>
                              <div><span>Visites de la fiche</span><strong>{nombre(r.visites)}</strong><small>taux de clic {r.affichages ? `${((r.visites / r.affichages) * 100).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} %` : '—'}</small></div>
                              <div><span>Réservations</span><strong>{nombre(r.reservations)}</strong><small>{fcfa(r.montantReservations)} de séjours</small></div>
                              <div className="principal"><span>Coût par {b.objectif === 'reservations' ? 'réservation' : 'visite'}</span><strong>{resultat ? fcfa(Math.round(b.montant / resultat)) : '—'}</strong><small>objectif : {d.objectifs[b.objectif].toLowerCase()}</small></div>
                            </div>
                            <small className="booster-resultats-note">Résultats mesurés pendant la période du booster{b.statut === 'actif' ? ', jusqu’à aujourd’hui' : ''}. Les réservations comptées sont celles reçues pour cette résidence pendant cette période.</small>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      {recu && (
        <div className="booster-voile" onClick={(e) => { if (e.target === e.currentTarget) setRecu(null); }}>
          <div className="booster-dialogue booster-recu" role="dialog" aria-modal="true" aria-labelledby="booster-recu-titre">
            <header>
              <h2 id="booster-recu-titre">Reçu {recu.reference}</h2>
              <button type="button" className="booster-fermer sans-impression" aria-label="Fermer" autoFocus onClick={() => setRecu(null)}><FaTimes /></button>
            </header>
            <p className="booster-dialogue-objet">BABI RESIDENCE · SimplTech Group, Abidjan</p>
            <dl className="booster-recu-lignes">
              <div><dt>Client</dt><dd>{compte?.entreprise?.nom}</dd></div>
              <div><dt>Objet</dt><dd>Booster de visibilité · {recu.residenceNom}</dd></div>
              <div><dt>Campagne</dt><dd>{d?.objectifs?.[recu.objectif]} · {fcfa(recu.budgetJour)} par jour × {recu.duree} jours</dd></div>
              <div><dt>Période</dt><dd>du {jourLong(new Date(recu.debut))} au {jourLong(new Date(recu.fin))}</dd></div>
              <div><dt>Moyen de paiement</dt><dd>{MOYENS_PAIEMENT[recu.paiement.moyen] || recu.paiement.moyen}</dd></div>
              <div><dt>Référence du paiement</dt><dd><code>{recu.paiement.reference}</code></dd></div>
              <div className="total"><dt>Montant payé</dt><dd>{fcfa(recu.paiement.montant ?? recu.montant)}</dd></div>
            </dl>
            <footer className="sans-impression">
              <small>Ce reçu est aussi envoyé par email au moment du paiement.</small>
              <button type="button" className="adm-btn principal" onClick={imprimerRecu}><FaPrint aria-hidden="true" /> Imprimer ou enregistrer en PDF</button>
            </footer>
          </div>
        </div>
      )}

      {paiement && d && (
        <div className="booster-voile" onClick={(e) => { if (e.target === e.currentTarget && !enCours) setPaiement(null); }}>
          <div className="booster-dialogue" role="dialog" aria-modal="true" aria-labelledby="booster-dialogue-titre" tabIndex={-1} ref={dialogue}>
            <header>
              <h2 id="booster-dialogue-titre">Payer le booster</h2>
              <button type="button" className="booster-fermer" aria-label="Fermer" disabled={enCours} onClick={() => setPaiement(null)}><FaTimes /></button>
            </header>
            <p className="booster-dialogue-objet">
              {paiement.booster ? `${paiement.booster.residenceNom} · ${paiement.booster.duree} jours` : `${residence?.nom} · ${fcfa(f.budgetJour)} par jour × ${f.duree} jours`}
            </p>
            <div className="booster-montant"><span>Montant à payer</span><strong>{fcfa(montantPaiement)}</strong></div>
            {paiement.erreur && <p className="params-msg erreur" role="alert"><FaExclamationTriangle /> {paiement.erreur}</p>}

            <h3>Sélectionnez le moyen de paiement</h3>
            <div className="booster-moyens" role="radiogroup" aria-label="Moyen de paiement">
              <label className={`booster-moyen${paiement.moyen === 'en_ligne' ? ' choisi' : ''}${d.paiementEnLigne ? '' : ' indisponible'}`}>
                <input type="radio" name="moyen" checked={paiement.moyen === 'en_ligne'} disabled={!d.paiementEnLigne} onChange={() => setPaiement(p => ({ ...p, moyen: 'en_ligne', erreur: null }))} />
                <FaMobileAlt aria-hidden="true" />
                <span><b>Mobile Money ou carte bancaire</b><small>Wave, Orange Money, MTN, Moov, Visa, Mastercard · activation immédiate</small>{!d.paiementEnLigne && <small>Indisponible pour le moment</small>}</span>
              </label>
              <label className={`booster-moyen${paiement.moyen === 'hors_ligne' ? ' choisi' : ''}`}>
                <input type="radio" name="moyen" checked={paiement.moyen === 'hors_ligne'} onChange={() => setPaiement(p => ({ ...p, moyen: 'hors_ligne', erreur: null }))} />
                <FaUniversity aria-hidden="true" />
                <span><b>Virement ou espèces</b><small>BABI RESIDENCE active le booster après réception du paiement</small></span>
              </label>
            </div>

            <footer>
              <small>{paiement.moyen === 'en_ligne' ? 'Vous allez être redirigé vers la page de paiement sécurisée GeniusPay.' : 'Votre demande est transmise à BABI RESIDENCE.'}</small>
              <button type="button" className="adm-btn principal" disabled={enCours} onClick={payer}>
                {enCours ? 'Patientez…' : paiement.moyen === 'en_ligne' ? 'Payer maintenant' : 'Envoyer la demande'}
              </button>
            </footer>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminVisibilitePage;
