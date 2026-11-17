import React, { useEffect, useState } from 'react';
import { FaSave } from 'react-icons/fa';
import { useResidences } from '../context/ResidencesContext';
import './AdminSettingsPage.css';

const CHAMPS = [
  {
    cle: 'acomptePourcentage', label: 'Acompte demandé', unite: '% du séjour', min: 1, max: 100,
    aide: 'Part du prix total payée par le client après confirmation.',
  },
  {
    cle: 'remboursableApresPaiementJours', label: 'Remboursement intégral pendant', unite: 'jours après le paiement', min: 0, max: 365,
    aide: 'Annulation demandée dans ce délai : l\'acompte est remboursé en entier.',
  },
  {
    cle: 'remboursementPourcentage', label: 'Part remboursée après ce délai', unite: '% de l\'acompte', min: 0, max: 100,
    aide: '0 = plus rien après le délai, 100 = toujours en entier.',
  },
  {
    cle: 'nonRemboursableAvantArriveeJours', label: 'Non remboursable avant l\'arrivée', unite: 'jours', min: 0, max: 365,
    aide: 'Aucun remboursement si l\'annulation arrive moins de ce nombre de jours avant l\'arrivée.',
  },
];

const fcfa = (n) => `${Math.round(n).toLocaleString('fr-FR')} FCFA`;

/** Paramètres de l'acompte et de la politique de remboursement. */
const AdminSettingsPage = () => {
  const { getSettings, updateSettings } = useResidences();
  const [valeurs, setValeurs] = useState(null);
  const [initiales, setInitiales] = useState(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [enregistrement, setEnregistrement] = useState(false);

  useEffect(() => {
    getSettings()
      .then((v) => { setValeurs(v); setInitiales(v); })
      .catch((err) => setError(err.message));
  }, [getSettings]);

  const modifie = valeurs && initiales && CHAMPS.some(c => Number(valeurs[c.cle]) !== Number(initiales[c.cle]));

  const enregistrer = async (e) => {
    e.preventDefault();
    setError('');
    setNotice('');
    setEnregistrement(true);
    try {
      const donnees = Object.fromEntries(CHAMPS.map(c => [c.cle, Number(valeurs[c.cle])]));
      const v = await updateSettings(donnees);
      setValeurs(v);
      setInitiales(v);
      setNotice('Paramètres enregistrés. Ils s\'appliquent immédiatement.');
    } catch (err) {
      setError(err.message);
    } finally {
      setEnregistrement(false);
    }
  };

  // Exemple concret : séjour de 100 000 FCFA
  const exemple = valeurs && (() => {
    const acompte = Math.round(100000 * Number(valeurs.acomptePourcentage || 0) / 100);
    const rembourse = Math.floor(acompte * Number(valeurs.remboursementPourcentage || 0) / 100);
    return { acompte, rembourse };
  })();

  return (
    <div className="admin-settings-page">
      <div className="admin-page-header">
        <div>
          <h1>Paramètres</h1>
          <p>Acompte et politique de remboursement en cas d'annulation.</p>
        </div>
      </div>

      {error && <div className="alert alert-error" role="alert">{error}</div>}
      {notice && <div className="alert alert-success" role="status">{notice}</div>}

      {!valeurs ? (
        !error && <p>Chargement…</p>
      ) : (
        <form className="parametres-form" onSubmit={enregistrer}>
          {CHAMPS.map(c => (
            <div className="parametre" key={c.cle}>
              <label htmlFor={c.cle}>{c.label}</label>
              <div className="parametre-saisie">
                <input
                  id={c.cle}
                  type="number"
                  inputMode="numeric"
                  min={c.min}
                  max={c.max}
                  step="1"
                  required
                  value={valeurs[c.cle]}
                  onChange={(e) => setValeurs(v => ({ ...v, [c.cle]: e.target.value }))}
                />
                <span>{c.unite}</span>
              </div>
              <p className="parametre-aide">{c.aide}</p>
            </div>
          ))}

          {exemple && (
            <div className="parametres-exemple">
              <strong>Exemple pour un séjour de 100 000 FCFA</strong>
              <p>Le client paie un acompte de <b>{fcfa(exemple.acompte)}</b>. S'il annule :</p>
              <ul>
                <li>dans les {valeurs.remboursableApresPaiementJours} jour(s) suivant le paiement : il reçoit <b>{fcfa(exemple.acompte)}</b> (100 %) ;</li>
                <li>plus tard : il reçoit <b>{fcfa(exemple.rembourse)}</b> ({valeurs.remboursementPourcentage} %) ;</li>
                <li>à moins de {valeurs.nonRemboursableAvantArriveeJours} jour(s) de l'arrivée : il ne reçoit rien.</li>
              </ul>
              <p className="parametre-aide">Les acomptes déjà payés suivent les paramètres en vigueur au moment de l'annulation.</p>
            </div>
          )}

          <button type="submit" className="btn btn-primary" disabled={!modifie || enregistrement}>
            <FaSave /> {enregistrement ? 'Enregistrement…' : 'Enregistrer'}
          </button>
        </form>
      )}
    </div>
  );
};

export default AdminSettingsPage;
