import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { FaEye, FaEyeSlash } from 'react-icons/fa';
import { API_ENDPOINTS, apiRequest } from '../config/api';
import { useResidences } from '../context/ResidencesContext';
import LogoBabi from '../components/LogoBabi';
import './AdminLogin.css';

const MIN_MDP = 10;

/** Un gestionnaire crée le compte de son entreprise ; la plateforme le valide ensuite. */
const AdminInscription = () => {
  const navigate = useNavigate();
  const { connectWithToken, isAdmin } = useResidences();
  const [f, setF] = useState({ entreprise: '', prenom: '', nom: '', email: '', telephone: '', motDePasse: '', confirmation: '' });
  const [voir, setVoir] = useState(false);
  const [erreur, setErreur] = useState('');
  const [enCours, setEnCours] = useState(false);

  useEffect(() => { document.title = 'Créer un compte entreprise · BABI RESIDENCE'; }, []);
  useEffect(() => { if (isAdmin) navigate('/admin/dashboard', { replace: true }); }, [isAdmin, navigate]);

  const champ = (e) => { setF(v => ({ ...v, [e.target.name]: e.target.value })); setErreur(''); };

  const envoyer = async (e) => {
    e.preventDefault();
    if (f.motDePasse.length < MIN_MDP) return setErreur(`Le mot de passe doit contenir au moins ${MIN_MDP} caractères.`);
    if (f.motDePasse !== f.confirmation) return setErreur('Les deux mots de passe ne sont pas identiques.');
    setEnCours(true);
    try {
      const { confirmation, ...corps } = f;
      const res = await apiRequest(API_ENDPOINTS.companies.signup, { method: 'POST', body: corps });
      connectWithToken(res.data.token);
      navigate('/admin/dashboard', { replace: true });
    } catch (error) {
      setErreur(error.message);
      setEnCours(false);
    }
  };

  return (
    <div className="admin-login-page">
      <div className="admin-login-container">
        <div className="admin-login-header">
          <div className="admin-logo">
            <LogoBabi className="admin-login-embleme" />
            <span className="surtitre">Espace gestionnaires</span>
            <h2>Publiez vos résidences</h2>
            <p>Créez le compte de votre entreprise : vos résidences, vos réservations, vos paiements, sur BABI RESIDENCE.</p>
          </div>
        </div>

        <div className="admin-login-form">
          <h3>Créer un compte entreprise</h3>
          <p className="admin-login-sous-titre">Gratuit. Votre entreprise est vérifiée par notre équipe avant que vos résidences apparaissent sur le site.</p>

          {erreur && <div className="error-message" role="alert">{erreur}</div>}

          <form onSubmit={envoyer} noValidate={false}>
            <div className="form-group">
              <label htmlFor="ins-entreprise">Nom de l'entreprise</label>
              <input id="ins-entreprise" name="entreprise" value={f.entreprise} onChange={champ} required minLength={2} maxLength={80} autoComplete="organization" placeholder="Ex. Villas Lagune" />
            </div>
            <div className="form-ligne-2">
              <div className="form-group">
                <label htmlFor="ins-prenom">Prénom</label>
                <input id="ins-prenom" name="prenom" value={f.prenom} onChange={champ} required minLength={2} maxLength={60} autoComplete="given-name" />
              </div>
              <div className="form-group">
                <label htmlFor="ins-nom">Nom</label>
                <input id="ins-nom" name="nom" value={f.nom} onChange={champ} required minLength={2} maxLength={60} autoComplete="family-name" />
              </div>
            </div>
            <div className="form-group">
              <label htmlFor="ins-email">Email professionnel</label>
              <input id="ins-email" name="email" type="email" value={f.email} onChange={champ} required maxLength={254} autoComplete="email" placeholder="vous@entreprise.com" />
            </div>
            <div className="form-group">
              <label htmlFor="ins-tel">Téléphone</label>
              <input id="ins-tel" name="telephone" type="tel" value={f.telephone} onChange={champ} required maxLength={30} autoComplete="tel" placeholder="+225 07 00 00 00 00" />
            </div>
            <div className="form-group">
              <label htmlFor="ins-mdp">Mot de passe</label>
              <div className="password-input-container">
                <input id="ins-mdp" name="motDePasse" type={voir ? 'text' : 'password'} value={f.motDePasse} onChange={champ} required minLength={MIN_MDP} maxLength={200} autoComplete="new-password" aria-describedby="ins-mdp-aide" />
                <button type="button" className="password-toggle" onClick={() => setVoir(v => !v)} aria-label={voir ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}>
                  {voir ? <FaEyeSlash /> : <FaEye />}
                </button>
              </div>
              <small id="ins-mdp-aide" className="form-aide">{MIN_MDP} caractères minimum.</small>
            </div>
            <div className="form-group">
              <label htmlFor="ins-confirmation">Confirmer le mot de passe</label>
              <input id="ins-confirmation" name="confirmation" type={voir ? 'text' : 'password'} value={f.confirmation} onChange={champ} required autoComplete="new-password" />
            </div>

            <button type="submit" className="btn btn-primary btn-login" disabled={enCours}>
              {enCours ? 'Création du compte…' : 'Créer mon compte'}
            </button>
          </form>

          <div className="admin-login-footer">
            <p className="admin-login-inscription">Déjà inscrit ? <Link to="/admin/login">Se connecter</Link></p>
            <button type="button" className="btn btn-outline btn-back" onClick={() => navigate('/')}>Retour au site</button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AdminInscription;
