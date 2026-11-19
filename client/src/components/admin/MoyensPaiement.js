import React, { useCallback, useEffect, useState } from 'react';
import { FaCopy, FaExclamationTriangle, FaCheckCircle, FaChevronDown, FaPlus } from 'react-icons/fa';
import { useResidences } from '../../context/ResidencesContext';
import { API_ENDPOINTS } from '../../config/api';
import './MoyensPaiement.css';

const CAPACITES = {
  acompte: 'Paiement de l\'acompte',
  remboursementAutomatique: 'Remboursement automatique',
  remboursementPartiel: 'Remboursement partiel',
};

function etatMoyen(m) {
  if (m.aVenir) return { libelle: 'Bientôt disponible', classe: 'neutre' };
  if (!m.configure) return { libelle: 'Configuration incomplète', classe: 'attente' };
  return m.actif ? { libelle: 'Actif', classe: 'confirmee' } : { libelle: 'Désactivé', classe: 'annulee' };
}

/**
 * Clés d'un prestataire propres à l'entreprise (l'argent arrive sur son compte).
 * Les secrets ne sont jamais renvoyés : laisser vide = garder la valeur enregistrée.
 */
const ClesForm = ({ moyen, onEnregistre }) => {
  const { adminRequest } = useResidences();
  const [valeurs, setValeurs] = useState(() => Object.fromEntries(moyen.cles.map(c => [c.nom, c.secret ? '' : c.valeur || ''])));
  const [etat, setEtat] = useState({ enCours: false, ok: '', erreur: '' });

  const enregistrer = async (ev) => {
    ev.preventDefault();
    setEtat({ enCours: true, ok: '', erreur: '' });
    try {
      const r = await adminRequest(API_ENDPOINTS.admin.paymentKeys(moyen.id), { method: 'PUT', body: valeurs });
      setValeurs(v => Object.fromEntries(Object.entries(v).map(([k, x]) => [k, moyen.cles.find(c => c.nom === k)?.secret ? '' : x])));
      setEtat({ enCours: false, ok: r.data.moyen?.configure ? 'Clés enregistrées. Vous pouvez activer ce moyen de paiement.' : 'Clés enregistrées. Complétez les champs manquants pour l\'activer.', erreur: '' });
      onEnregistre();
    } catch (e) {
      setEtat({ enCours: false, ok: '', erreur: e.message });
    }
  };

  return (
    <form className="mp-cles" onSubmit={enregistrer} autoComplete="off">
      <p className="params-note">Vos propres identifiants {moyen.nom} : les paiements de vos clients arrivent directement sur votre compte. Ils sont chiffrés et ne sont jamais réaffichés.</p>
      {moyen.cles.map(c => (
        <div className="params-champ" key={c.nom}>
          <label htmlFor={`cle-${c.nom}`}>{c.libelle}{c.facultatif ? '' : ' *'}</label>
          <input
            id={`cle-${c.nom}`}
            type={c.secret ? 'password' : 'text'}
            value={valeurs[c.nom]}
            onChange={(ev) => setValeurs(v => ({ ...v, [c.nom]: ev.target.value }))}
            placeholder={c.secret && c.defini ? `Enregistré (${c.apercu}) : laisser vide pour garder` : ''}
            autoComplete="off"
            spellCheck={false}
          />
        </div>
      ))}
      {etat.ok && <p className="params-msg ok" role="status"><FaCheckCircle /> {etat.ok}</p>}
      {etat.erreur && <p className="params-msg erreur" role="alert"><FaExclamationTriangle /> {etat.erreur}</p>}
      <button type="submit" className="btn btn-primary" disabled={etat.enCours}>{etat.enCours ? 'Enregistrement…' : `Enregistrer mes clés ${moyen.nom}`}</button>
    </form>
  );
};

/**
 * Paramètres > Moyens de paiement : chaque moyen intégré, son état et son activation.
 * Un nouveau moyen (ex. GeniusPay) apparaît ici dès que son module existe côté serveur.
 */
const MoyensPaiement = () => {
  const { getPaymentMethods, setPaymentMethodActive } = useResidences();
  const [donnees, setDonnees] = useState(null);
  const [ouvert, setOuvert] = useState(null);
  const [enCours, setEnCours] = useState(null);
  const [message, setMessage] = useState({ ok: '', erreur: '' });

  const charger = useCallback(() => getPaymentMethods().then(setDonnees).catch(e => setMessage({ ok: '', erreur: e.message })), [getPaymentMethods]);
  useEffect(() => { charger(); }, [charger]);

  const basculer = async (m) => {
    const actif = !m.actif;
    if (!actif && !window.confirm(`Désactiver ${m.nom} ? Les clients ne pourront plus payer leur acompte avec ce moyen.`)) return;
    setEnCours(m.id); setMessage({ ok: '', erreur: '' });
    try {
      const r = await setPaymentMethodActive(m.id, actif);
      setDonnees(d => ({ ...d, mode: r.mode, moyens: d.moyens.map(x => (x.id === m.id ? r.moyen : x)) }));
      setMessage({ ok: `${m.nom} ${actif ? 'activé' : 'désactivé'}.`, erreur: '' });
    } catch (e) {
      setMessage({ ok: '', erreur: e.message });
    } finally {
      setEnCours(null);
    }
  };

  if (!donnees) return <p className="params-note">{message.erreur || 'Chargement…'}</p>;
  const nbActifs = donnees.moyens.filter(m => m.actif).length;

  return (
    <div className="params-form">
      {donnees.mode === 'simulation' ? (
        <p className="mp-resume alerte"><FaExclamationTriangle /> Mode démonstration : les paiements d'acompte sont simulés, aucun argent ne circule.</p>
      ) : (
        <p className={`mp-resume ${nbActifs ? 'ok' : 'alerte'}`}>
          {nbActifs
            ? <><FaCheckCircle /> {nbActifs} moyen{nbActifs > 1 ? 's' : ''} de paiement proposé{nbActifs > 1 ? 's' : ''} aux clients pour l'acompte.</>
            : <><FaExclamationTriangle /> Aucun moyen de paiement actif : les clients ne peuvent pas payer d'acompte en ligne.</>}
        </p>
      )}

      {message.ok && <p className="params-msg ok" role="status"><FaCheckCircle /> {message.ok}</p>}
      {message.erreur && <p className="params-msg erreur" role="alert"><FaExclamationTriangle /> {message.erreur}</p>}

      <ul className="mp-liste">
        {donnees.moyens.map(m => {
          const e = etatMoyen(m);
          const deplie = ouvert === m.id;
          return (
            <li key={m.id} className={`mp-moyen ${m.actif ? 'actif' : ''} ${m.aVenir ? 'a-venir' : ''}`}>
              <div className="mp-tete">
                {m.logo
                  ? <span className="mp-logo mp-logo-image"><img src={m.logo} alt={`Logo ${m.nom}`} /></span>
                  : <span className={`mp-logo mp-logo-${m.id}`} aria-hidden="true">{m.nom.slice(0, 2).toUpperCase()}</span>}
                <div className="mp-identite">
                  <p><b>{m.nom}</b> <span>· {m.organisme}</span></p>
                  <ul className="mp-modes">{m.modes.map(x => <li key={x}>{x}</li>)}</ul>
                </div>
                {m.environnement === 'sandbox' && <span className="adm-badge attente">Test (sandbox)</span>}
                <span className={`adm-badge ${e.classe}`}>{e.libelle}</span>
                <label className={`mp-interrupteur ${!m.activable ? 'bloque' : ''}`} title={m.activable ? '' : (m.aVenir ? 'Intégration à venir' : (donnees.clesParEntreprise ? 'Saisissez d\'abord vos clés (Détails)' : 'À configurer sur le serveur'))}>
                  <input
                    type="checkbox"
                    role="switch"
                    checked={m.actif}
                    disabled={!m.activable || enCours === m.id}
                    onChange={() => basculer(m)}
                    aria-label={`${m.actif ? 'Désactiver' : 'Activer'} ${m.nom}`}
                  />
                  <span aria-hidden="true" />
                </label>
              </div>

              <button type="button" className="mp-details-bouton" onClick={() => setOuvert(deplie ? null : m.id)} aria-expanded={deplie}>
                Détails <FaChevronDown className={deplie ? 'tourne' : ''} />
              </button>

              {deplie && (
                <div className="mp-details">
                  <p>{m.description}</p>
                  <ul className="mp-capacites">
                    {Object.entries(CAPACITES).map(([cle, libelle]) => (
                      <li key={cle} className={m.capacites?.[cle] ? 'oui' : 'non'}>{m.capacites?.[cle] ? '✓' : '—'} {libelle}</li>
                    ))}
                  </ul>
                  {m.aVenir && <p className="params-note">L'intégration de {m.nom} est prévue. Une fois développée et ses identifiants ajoutés sur Render, il pourra être activé ici.</p>}
                  {!m.aVenir && !donnees.clesParEntreprise && m.problemes?.length > 0 && (
                    <ul className="params-problemes">{m.problemes.map(p => <li key={p}><FaExclamationTriangle /> {p}</li>)}</ul>
                  )}
                  {!m.aVenir && !donnees.clesParEntreprise && m.variables?.length > 0 && (
                    <p className="params-note">Identifiants sur le serveur (Render) : {m.variables.join(', ')}.</p>
                  )}
                  {!m.aVenir && donnees.clesParEntreprise && m.cles && (
                    donnees.chiffrementDisponible
                      ? <ClesForm moyen={m} onEnregistre={charger} />
                      : <p className="params-note">L'enregistrement des clés n'est pas encore disponible sur ce serveur. Contactez BABI RESIDENCE.</p>
                  )}
                  {m.id === 'geniuspay' && donnees.webhooks?.geniuspay && (
                    <div className="params-champ">
                      <label htmlFor="mp-webhook-gp">Adresse du webhook à enregistrer chez GeniusPay</label>
                      <div className="params-unite">
                        <input id="mp-webhook-gp" readOnly value={donnees.webhooks.geniuspay} onFocus={(ev) => ev.target.select()} />
                        <button type="button" className="adm-btn" onClick={() => navigator.clipboard?.writeText(donnees.webhooks.geniuspay)} aria-label="Copier l'adresse"><FaCopy /></button>
                      </div>
                      <p>Évènements : payment.success, payment.failed, payment.cancelled, payment.expired. Les remboursements GeniusPay se font depuis leur tableau de bord.</p>
                    </div>
                  )}
                  {m.id === 'pispi' && (
                    <div className="params-champ">
                      <label htmlFor="mp-webhook">Adresse de notification à déclarer chez PI-SPI {donnees.webhookSecretDefini ? '' : '(signature non configurée)'}</label>
                      <div className="params-unite">
                        <input id="mp-webhook" readOnly value={donnees.webhookUrl} onFocus={(ev) => ev.target.select()} />
                        <button type="button" className="adm-btn" onClick={() => navigator.clipboard?.writeText(donnees.webhookUrl)} aria-label="Copier l'adresse"><FaCopy /></button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>

      <div className="mp-ajout">
        <FaPlus aria-hidden="true" />
        {donnees.clesParEntreprise
          ? <p><b>Comment ça marche</b>Ouvrez « Détails », saisissez les identifiants de votre compte {donnees.moyens.filter(m => !m.aVenir).map(m => m.nom).join(' ou ')}, déclarez l'adresse du webhook chez le prestataire, puis activez le moyen. Sans moyen actif, vos clients règlent sur place.</p>
          : <p><b>Ajouter un moyen de paiement</b>Chaque moyen (GeniusPay, Mobile Money, carte…) s'intègre côté serveur, puis apparaît dans cette liste pour être activé. Les identifiants restent sur Render par sécurité.</p>}
      </div>
    </div>
  );
};

export default MoyensPaiement;
