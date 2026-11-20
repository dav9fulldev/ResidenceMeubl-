import React, { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { FaEye, FaEyeSlash } from 'react-icons/fa';
import { API_ENDPOINTS, apiRequest } from '../config/api';
import PanneauMarque from '../components/PanneauMarque';
import './AdminLogin.css';

const MIN_MDP = 10;

/**
 * Mot de passe oublié (partenaires).
 *  - sans jeton : saisie de l'email, envoi du lien
 *  - avec ?jeton=… (lien reçu par email) : choix du nouveau mot de passe
 */
const AdminMotDePasse = () => {
  const [params] = useSearchParams();
  const jeton = params.get('jeton');
  const [email, setEmail] = useState('');
  const [mdp, setMdp] = useState({ motDePasse: '', confirmation: '' });
  const [voir, setVoir] = useState(false);
  const [erreur, setErreur] = useState('');
  const [succes, setSucces] = useState('');
  const [enCours, setEnCours] = useState(false);

  useEffect(() => { document.title = 'Mot de passe oublié · BABI RESIDENCE'; }, []);

  const demander = async (e) => {
    e.preventDefault();
    setEnCours(true); setErreur('');
    try {
      const res = await apiRequest(API_ENDPOINTS.companies.forgotPassword, { method: 'POST', body: { email } });
      setSucces(res.message);
    } catch (error) { setErreur(error.message); } finally { setEnCours(false); }
  };

  const reinitialiser = async (e) => {
    e.preventDefault();
    if (mdp.motDePasse.length < MIN_MDP) return setErreur(`Le mot de passe doit contenir au moins ${MIN_MDP} caractères.`);
    if (mdp.motDePasse !== mdp.confirmation) return setErreur('Les deux mots de passe ne sont pas identiques.');
    setEnCours(true); setErreur('');
    try {
      const res = await apiRequest(API_ENDPOINTS.companies.resetPassword, { method: 'POST', body: { jeton, motDePasse: mdp.motDePasse } });
      setSucces(res.message);
    } catch (error) { setErreur(error.message); } finally { setEnCours(false); }
  };

  const champMdp = (e) => { setMdp(v => ({ ...v, [e.target.name]: e.target.value })); setErreur(''); };

  return (
    <div className="admin-login-page">
      <div className="admin-login-container">
        <PanneauMarque mention="Espace partenaires" />

        <div className="admin-login-form">
          <h3>{jeton ? 'Nouveau mot de passe' : 'Mot de passe oublié'}</h3>

          {erreur && <div className="error-message" role="alert">{erreur}</div>}
          {succes && <div className="succes-message" role="status">{succes}</div>}

          {!succes && !jeton && (
            <>
              <p className="admin-login-sous-titre">Indiquez l'email de votre compte partenaire : nous vous envoyons un lien pour choisir un nouveau mot de passe.</p>
              <form onSubmit={demander}>
                <div className="form-group">
                  <label htmlFor="mdp-email">Email</label>
                  <input id="mdp-email" type="email" value={email} onChange={(e) => { setEmail(e.target.value); setErreur(''); }} required maxLength={254} autoComplete="email" placeholder="vous@entreprise.com" />
                </div>
                <button type="submit" className="btn btn-primary btn-login" disabled={enCours}>{enCours ? 'Envoi…' : 'Recevoir le lien'}</button>
              </form>
            </>
          )}

          {!succes && jeton && (
            <>
              <p className="admin-login-sous-titre">Au moins {MIN_MDP} caractères. Vos sessions ouvertes sur d'autres appareils seront fermées.</p>
              <form onSubmit={reinitialiser}>
                <div className="form-group">
                  <label htmlFor="mdp-nouveau">Nouveau mot de passe</label>
                  <div className="password-input-container">
                    <input id="mdp-nouveau" name="motDePasse" type={voir ? 'text' : 'password'} value={mdp.motDePasse} onChange={champMdp} required minLength={MIN_MDP} maxLength={200} autoComplete="new-password" />
                    <button type="button" className="password-toggle" onClick={() => setVoir(v => !v)} aria-label={voir ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}>
                      {voir ? <FaEyeSlash /> : <FaEye />}
                    </button>
                  </div>
                </div>
                <div className="form-group">
                  <label htmlFor="mdp-confirmation">Confirmer le mot de passe</label>
                  <input id="mdp-confirmation" name="confirmation" type={voir ? 'text' : 'password'} value={mdp.confirmation} onChange={champMdp} required maxLength={200} autoComplete="new-password" />
                </div>
                <button type="submit" className="btn btn-primary btn-login" disabled={enCours}>{enCours ? 'Enregistrement…' : 'Enregistrer'}</button>
              </form>
            </>
          )}

          <div className="admin-login-footer">
            {jeton && erreur && <p><Link to="/admin/mot-de-passe" className="admin-login-lien">Demander un nouveau lien</Link></p>}
            <p><Link to="/admin/login" className="admin-login-lien">Retour à la connexion</Link></p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AdminMotDePasse;
