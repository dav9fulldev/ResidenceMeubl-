import React, { useEffect, useRef, useState } from 'react';
import { API_ENDPOINTS, apiRequest } from '../config/api';

const DELAI_RENVOI = 60;

/**
 * Vérification de l'email d'un partenaire : saisie du code à 6 chiffres reçu par email.
 * Utilisé après l'inscription et à la connexion d'un compte pas encore vérifié.
 * onVerifie(token) est appelé quand le code est bon (la session est ouverte).
 */
const VerificationEmail = ({ email, onVerifie, onRetour }) => {
  const [code, setCode] = useState('');
  const [erreur, setErreur] = useState('');
  const [info, setInfo] = useState('');
  const [enCours, setEnCours] = useState(false);
  const [attente, setAttente] = useState(DELAI_RENVOI);
  const champ = useRef(null);

  useEffect(() => { champ.current?.focus(); }, []);
  useEffect(() => {
    if (attente <= 0) return undefined;
    const t = setTimeout(() => setAttente(a => a - 1), 1000);
    return () => clearTimeout(t);
  }, [attente]);

  const valider = async (e) => {
    e.preventDefault();
    if (!/^\d{6}$/.test(code)) return setErreur('Saisissez les 6 chiffres du code reçu par email.');
    setEnCours(true); setErreur(''); setInfo('');
    try {
      const r = await apiRequest(API_ENDPOINTS.companies.verifyEmail, { method: 'POST', body: { email, code } });
      onVerifie(r.data.token);
    } catch (err) {
      setErreur(err.message);
      setEnCours(false);
    }
  };

  const renvoyer = async () => {
    setErreur(''); setInfo('');
    try {
      const r = await apiRequest(API_ENDPOINTS.companies.resendCode, { method: 'POST', body: { email } });
      setInfo(r.message);
      setCode('');
      setAttente(DELAI_RENVOI);
    } catch (err) {
      setErreur(err.message);
    }
  };

  return (
    <div className="verification-email">
      <h3>Vérifiez votre email</h3>
      <p className="admin-login-sous-titre">
        Un code à 6 chiffres vient d’être envoyé à <b>{email}</b>. Il est valable 15 minutes.
      </p>
      {erreur && <div className="error-message" role="alert">{erreur}</div>}
      {info && <div className="succes-message" role="status">{info}</div>}
      <form onSubmit={valider}>
        <div className="form-group">
          <label htmlFor="code-verification">Code de vérification</label>
          <input
            ref={champ}
            id="code-verification"
            className="code-verification"
            value={code}
            onChange={(e) => { setCode(e.target.value.replace(/\D/g, '').slice(0, 6)); setErreur(''); }}
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="\d{6}"
            maxLength={6}
            placeholder="000000"
            required
          />
        </div>
        <button type="submit" className="btn btn-primary btn-login" disabled={enCours || code.length !== 6}>
          {enCours ? 'Vérification…' : 'Valider mon email'}
        </button>
      </form>
      <p className="verification-email-renvoi">
        Rien reçu ? Pensez aux courriers indésirables.{' '}
        {attente > 0
          ? <span>Nouveau code possible dans {attente} s.</span>
          : <button type="button" className="admin-login-lien btn-texte" onClick={renvoyer}>Renvoyer un code</button>}
      </p>
      {onRetour && <p className="verification-email-renvoi"><button type="button" className="admin-login-lien btn-texte" onClick={onRetour}>Retour</button></p>}
    </div>
  );
};

export default VerificationEmail;
