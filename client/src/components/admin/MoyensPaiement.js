import React, { useCallback, useEffect, useState } from 'react';
import { FaCopy, FaExclamationTriangle, FaCheckCircle, FaChevronDown, FaPlus } from 'react-icons/fa';
import { useResidences } from '../../context/ResidencesContext';
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
                <span className={`mp-logo mp-logo-${m.id}`} aria-hidden="true">{m.nom.slice(0, 2).toUpperCase()}</span>
                <div className="mp-identite">
                  <p><b>{m.nom}</b> <span>· {m.organisme}</span></p>
                  <ul className="mp-modes">{m.modes.map(x => <li key={x}>{x}</li>)}</ul>
                </div>
                <span className={`adm-badge ${e.classe}`}>{e.libelle}</span>
                <label className={`mp-interrupteur ${!m.activable ? 'bloque' : ''}`} title={m.activable ? '' : (m.aVenir ? 'Intégration à venir' : 'À configurer sur le serveur')}>
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
                  {!m.aVenir && m.problemes?.length > 0 && (
                    <ul className="params-problemes">{m.problemes.map(p => <li key={p}><FaExclamationTriangle /> {p}</li>)}</ul>
                  )}
                  {!m.aVenir && m.variables?.length > 0 && (
                    <p className="params-note">Identifiants sur le serveur (Render) : {m.variables.join(', ')}.</p>
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
        <p><b>Ajouter un moyen de paiement</b>Chaque moyen (GeniusPay, Mobile Money, carte…) s'intègre côté serveur, puis apparaît dans cette liste pour être activé. Les identifiants restent sur Render par sécurité.</p>
      </div>
    </div>
  );
};

export default MoyensPaiement;
