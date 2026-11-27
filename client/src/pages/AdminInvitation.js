import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { FaEye, FaEyeSlash } from 'react-icons/fa';
import { API_ENDPOINTS, apiRequest } from '../config/api';
import { useResidences } from '../context/ResidencesContext';
import PanneauMarque from '../components/PanneauMarque';
import './AdminLogin.css';

const MIN_MDP = 10;

/**
 * Invitation dans l'équipe d'un partenaire (lien reçu par email, ?jeton=…) :
 * l'invité vérifie son nom, choisit son mot de passe et arrive dans l'espace de l'entreprise.
 */
const AdminInvitation = () => {
  const [params] = useSearchParams();
  const jeton = params.get('jeton') || '';
  const navigate = useNavigate();
  const { connectWithToken } = useResidences();
  const [invitation, setInvitation] = useState(null);
  const [f, setF] = useState({ prenom: '', nom: '', telephone: '', motDePasse: '', confirmation: '' });
  const [voir, setVoir] = useState(false);
  const [erreur, setErreur] = useState('');
  const [invalide, setInvalide] = useState(false);
  const [enCours, setEnCours] = useState(false);

  useEffect(() => { document.title = 'Invitation · BABI RESIDENCE'; }, []);
  useEffect(() => {
    let actif = true;
    apiRequest(API_ENDPOINTS.companies.invitation, { method: 'POST', body: { jeton } })
      .then(r => { if (actif) { setInvitation(r.data); setF(v => ({ ...v, prenom: r.data.prenom, nom: r.data.nom })); } })
      .catch(e => { if (actif) { setErreur(e.message); setInvalide(true); } });
    return () => { actif = false; };
  }, [jeton]);

  const accepter = async (e) => {
    e.preventDefault();
    if (f.motDePasse.length < MIN_MDP) return setErreur(`Le mot de passe doit contenir au moins ${MIN_MDP} caractères.`);
    if (f.motDePasse !== f.confirmation) return setErreur('Les deux mots de passe ne sont pas identiques.');
    setEnCours(true); setErreur('');
    try {
      const { confirmation, ...corps } = f;
      const r = await apiRequest(API_ENDPOINTS.companies.acceptInvitation, { method: 'POST', body: { jeton, ...corps } });
      connectWithToken(r.data.token);
      navigate('/admin/dashboard', { replace: true });
    } catch (error) { setErreur(error.message); setEnCours(false); }
  };

  const champ = (e) => { setF(v => ({ ...v, [e.target.name]: e.target.value })); setErreur(''); };

  return (
    <div className="admin-login-page">
      <div className="admin-login-container">
        <PanneauMarque mention="Espace partenaires" />

        <div className="admin-login-form">
          <h3>{invitation ? `Rejoindre ${invitation.entreprise}` : 'Invitation'}</h3>
          {erreur && <div className="error-message" role="alert">{erreur}</div>}
          {!invitation && !invalide && <p className="admin-login-sous-titre" role="status">Chargement de l’invitation…</p>}

          {invitation && (
            <>
              <p className="admin-login-sous-titre">
                Vous êtes invité comme <b>{invitation.role === 'proprietaire' ? 'propriétaire' : 'gestionnaire'}</b> avec l’adresse <b>{invitation.email}</b>. Choisissez votre mot de passe (au moins {MIN_MDP} caractères).
              </p>
              <form onSubmit={accepter}>
                <div className="form-group">
                  <label htmlFor="inv-prenom">Prénom</label>
                  <input id="inv-prenom" name="prenom" value={f.prenom} onChange={champ} required minLength={2} maxLength={60} autoComplete="given-name" />
                </div>
                <div className="form-group">
                  <label htmlFor="inv-nom">Nom</label>
                  <input id="inv-nom" name="nom" value={f.nom} onChange={champ} required minLength={2} maxLength={60} autoComplete="family-name" />
                </div>
                <div className="form-group">
                  <label htmlFor="inv-tel">Téléphone (facultatif)</label>
                  <input id="inv-tel" name="telephone" type="tel" value={f.telephone} onChange={champ} maxLength={30} autoComplete="tel" placeholder="+225 07 00 00 00 00" />
                </div>
                <div className="form-group">
                  <label htmlFor="inv-mdp">Mot de passe</label>
                  <div className="password-input-container">
                    <input id="inv-mdp" name="motDePasse" type={voir ? 'text' : 'password'} value={f.motDePasse} onChange={champ} required minLength={MIN_MDP} maxLength={200} autoComplete="new-password" />
                    <button type="button" className="password-toggle" onClick={() => setVoir(v => !v)} aria-label={voir ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}>
                      {voir ? <FaEyeSlash /> : <FaEye />}
                    </button>
                  </div>
                </div>
                <div className="form-group">
                  <label htmlFor="inv-confirmation">Confirmer le mot de passe</label>
                  <input id="inv-confirmation" name="confirmation" type={voir ? 'text' : 'password'} value={f.confirmation} onChange={champ} required maxLength={200} autoComplete="new-password" />
                </div>
                <button type="submit" className="btn btn-primary btn-login" disabled={enCours}>{enCours ? 'Création…' : 'Accepter et accéder à l’espace'}</button>
              </form>
            </>
          )}

          <div className="admin-login-footer">
            <p><Link to="/admin/login" className="admin-login-lien">J’ai déjà un compte : me connecter</Link></p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AdminInvitation;
