import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { FaCheckCircle, FaExclamationTriangle, FaRocket, FaTimes, FaMobileAlt, FaUniversity, FaBed, FaUsers, FaMapMarkerAlt } from 'react-icons/fa';
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
const jourLong = (d) => d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });

/**
 * Partenaire : booster de visibilité, sur le modèle des publicités Facebook.
 * Création à gauche (résidence, durée, récapitulatif), aperçu de l'annonce à droite,
 * puis « Payer et booster » : paiement en ligne GeniusPay (Mobile Money, carte), activation
 * automatique ; ou virement / espèces, activé par BABI RESIDENCE après réception.
 */
const AdminVisibilitePage = () => {
  const { adminRequest } = useResidences();
  const { compte } = useCompte();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [d, setD] = useState(null);
  const [f, setF] = useState({ residenceId: '', duree: 7 });
  const [msg, setMsg] = useState({ ok: '', erreur: '' });
  const [paiement, setPaiement] = useState(null); // { booster?: vue existante, moyen: 'en_ligne' | 'hors_ligne' }
  const [enCours, setEnCours] = useState(false);
  const [retour, setRetour] = useState(null); // vérification au retour de GeniusPay
  const dialogue = useRef(null);

  const charger = useCallback(async () => {
    try { setD((await adminRequest(API_ENDPOINTS.admin.boosters())).data); } catch (e) { setMsg({ ok: '', erreur: e.message }); }
  }, [adminRequest]);
  useEffect(() => { if (compte && !compte.superAdmin) charger(); }, [charger, compte]);

  // Retour de la page de paiement GeniusPay : on vérifie auprès du serveur (qui relit chez GeniusPay)
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
          if (b.statut === 'actif') { if (actif) setRetour({ etat: 'ok', message: `Paiement reçu : « ${b.residenceNom} » est boostée jusqu’au ${dateCourte(b.fin)}.` }); charger(); return; }
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

  // Fenêtre de paiement : Échap pour fermer, focus à l'ouverture
  useEffect(() => {
    if (!paiement) return undefined;
    dialogue.current?.focus();
    const echap = (e) => { if (e.key === 'Escape' && !enCours) setPaiement(null); };
    document.addEventListener('keydown', echap);
    return () => document.removeEventListener('keydown', echap);
  }, [paiement, enCours]);

  const residence = useMemo(() => d?.residences.find(r => String(r.id) === String(f.residenceId)) || null, [d, f.residenceId]);

  if (compte?.superAdmin) return <Navigate to="/admin/boosters" replace />;

  const ouvrirPaiement = (booster = null) => {
    setMsg({ ok: '', erreur: '' });
    setPaiement({ booster, moyen: d?.paiementEnLigne ? 'en_ligne' : 'hors_ligne' });
  };

  const payer = async () => {
    setEnCours(true); setMsg({ ok: '', erreur: '' });
    try {
      // Demande existante (bouton « Payer » d'un booster en attente) ou nouvelle demande
      let b = paiement.booster;
      if (!b) {
        const deja = d.boosters.find(x => x.statut === 'en_attente' && x.residenceId === Number(f.residenceId) && x.duree === Number(f.duree));
        b = deja || (await adminRequest(API_ENDPOINTS.admin.boosters(), { method: 'POST', body: { residenceId: Number(f.residenceId), duree: Number(f.duree) } })).data;
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
      setMsg({ ok: '', erreur: err.message });
      setPaiement(null);
    }
    setEnCours(false);
  };

  const annuler = async (id) => {
    setMsg({ ok: '', erreur: '' });
    try { await adminRequest(API_ENDPOINTS.admin.boosters(`/${id}`), { method: 'DELETE' }); setMsg({ ok: 'Demande annulée.', erreur: '' }); await charger(); } catch (err) { setMsg({ ok: '', erreur: err.message }); }
  };

  const montant = paiement?.booster ? paiement.booster.montant : d?.tarifs[f.duree];
  const duree = paiement?.booster ? paiement.booster.duree : Number(f.duree);
  const finEstimee = new Date(Date.now() + Number(f.duree) * 86400000);

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
                <h2>Résidence</h2>
                <label className="sr-seul" htmlFor="booster-residence">Résidence à booster</label>
                <select id="booster-residence" value={f.residenceId} onChange={(e) => setF(v => ({ ...v, residenceId: e.target.value }))}>
                  <option value="">Choisir une résidence publiée</option>
                  {d.residences.map(r => <option key={r.id} value={r.id}>{r.nom}</option>)}
                </select>
                {d.residences.length === 0 && <p className="verif-aide">Aucune résidence publiée : une résidence doit être vérifiée avant d’être boostée.</p>}
              </section>

              <section className="adm-carte fin-bloc">
                <h2>Durée et budget</h2>
                <div className="booster-formules" role="radiogroup" aria-label="Durée du booster">
                  {d.durees.map(n => (
                    <label key={n} className={`booster-formule${Number(f.duree) === n ? ' choisie' : ''}`}>
                      <input type="radio" name="duree" value={n} checked={Number(f.duree) === n} onChange={() => setF(v => ({ ...v, duree: n }))} />
                      <span className="booster-duree">{n} jours</span>
                      <strong>{fcfa(d.tarifs[n])}</strong>
                      <small>{fcfa(Math.round(d.tarifs[n] / n))} par jour</small>
                    </label>
                  ))}
                </div>
              </section>

              <section className="adm-carte fin-bloc booster-recap">
                <h2>Récapitulatif</h2>
                <dl>
                  <div><dt>Durée</dt><dd>{f.duree} jours</dd></div>
                  <div><dt>Début</dt><dd>dès la confirmation du paiement</dd></div>
                  <div><dt>Fin estimée</dt><dd>{jourLong(finEstimee)}</dd></div>
                  <div><dt>Placement</dt><dd>plus haut dans les résultats, mention « Sponsorisé »</dd></div>
                  <div className="total"><dt>Total</dt><dd>{fcfa(d.tarifs[f.duree])}</dd></div>
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
                <p className="verif-aide">C’est ainsi que les voyageurs verront votre résidence, placée plus haut dans l’accueil et le catalogue.</p>
              </div>
            </aside>
          </div>

          <div className="booster-barre">
            <p>En cliquant sur « Payer et booster », vous acceptez que la mention « Sponsorisé » apparaisse sur l’annonce pendant la durée choisie.</p>
            <button type="button" className="adm-btn principal" disabled={!f.residenceId} onClick={() => ouvrirPaiement()}><FaRocket /> Payer et booster</button>
          </div>

          <div className="adm-carte fin-tableau">
            <h2>Mes boosters</h2>
            <table>
              <thead><tr><th>Référence</th><th>Résidence</th><th>Durée</th><th>Montant</th><th>Période</th><th>Statut</th><th><span className="sr-seul">Actions</span></th></tr></thead>
              <tbody>
                {d.boosters.length === 0 && <tr><td colSpan={7} className="ent-vide">Aucun booster pour l’instant.</td></tr>}
                {d.boosters.map(b => (
                  <tr key={b.id}>
                    <td><code>{b.reference}</code></td>
                    <td>{b.residenceNom}</td>
                    <td>{b.duree} jours</td>
                    <td>{fcfa(b.montant)}</td>
                    <td>{b.debut ? `${dateCourte(b.debut)} → ${dateCourte(b.fin)}` : <small>demandé le {dateCourte(b.demandeLe)}</small>}</td>
                    <td>
                      <Badge table={STATUTS_BOOSTER} valeur={b.statut} />
                      {b.motif && <small>{b.motif}</small>}
                      {b.statut === 'en_attente' && b.paiementEnLigne?.statut === 'echec' && <small>{b.paiementEnLigne.raison}</small>}
                    </td>
                    <td className="booster-actions">
                      {b.statut === 'en_attente' && <>
                        <button type="button" className="adm-btn principal" onClick={() => ouvrirPaiement(b)}>Payer</button>
                        <button type="button" className="adm-btn" onClick={() => annuler(b.id)}>Annuler</button>
                      </>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {paiement && d && (
        <div className="booster-voile" onClick={(e) => { if (e.target === e.currentTarget && !enCours) setPaiement(null); }}>
          <div className="booster-dialogue" role="dialog" aria-modal="true" aria-labelledby="booster-dialogue-titre" tabIndex={-1} ref={dialogue}>
            <header>
              <h2 id="booster-dialogue-titre">Payer le booster</h2>
              <button type="button" className="booster-fermer" aria-label="Fermer" disabled={enCours} onClick={() => setPaiement(null)}><FaTimes /></button>
            </header>
            <p className="booster-dialogue-objet">{paiement.booster ? paiement.booster.residenceNom : residence?.nom} · {duree} jours</p>
            <div className="booster-montant"><span>Montant à payer</span><strong>{fcfa(montant)}</strong></div>

            <h3>Sélectionnez le moyen de paiement</h3>
            <div className="booster-moyens" role="radiogroup" aria-label="Moyen de paiement">
              <label className={`booster-moyen${paiement.moyen === 'en_ligne' ? ' choisi' : ''}${d.paiementEnLigne ? '' : ' indisponible'}`}>
                <input type="radio" name="moyen" checked={paiement.moyen === 'en_ligne'} disabled={!d.paiementEnLigne} onChange={() => setPaiement(p => ({ ...p, moyen: 'en_ligne' }))} />
                <FaMobileAlt aria-hidden="true" />
                <span><b>Mobile Money ou carte bancaire</b><small>Wave, Orange Money, MTN, Moov, Visa, Mastercard · activation immédiate</small>{!d.paiementEnLigne && <small>Indisponible pour le moment</small>}</span>
              </label>
              <label className={`booster-moyen${paiement.moyen === 'hors_ligne' ? ' choisi' : ''}`}>
                <input type="radio" name="moyen" checked={paiement.moyen === 'hors_ligne'} onChange={() => setPaiement(p => ({ ...p, moyen: 'hors_ligne' }))} />
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
