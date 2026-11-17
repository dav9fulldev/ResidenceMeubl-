import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FaLock, FaUser, FaEye, FaEyeSlash } from 'react-icons/fa';
import { useResidences } from '../context/ResidencesContext';
import './AdminLogin.css';

const AdminLogin = () => {
  const navigate = useNavigate();
  const { loginAdmin, isAdmin } = useResidences();

  // Déjà connecté (application installée rouverte) : aller directement au back-office
  useEffect(() => {
    if (isAdmin) navigate('/admin/dashboard', { replace: true });
  }, [isAdmin, navigate]);
  const [credentials, setCredentials] = useState({
    username: '',
    password: ''
  });
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setCredentials(prev => ({
      ...prev,
      [name]: value
    }));
    setError(''); // Effacer l'erreur quand l'utilisateur tape
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    const result = await loginAdmin(credentials.username, credentials.password);
    setIsLoading(false);

    if (result.success) {
      navigate('/admin/dashboard');
    } else {
      setError(result.message || 'Identifiants incorrects. Veuillez réessayer.');
    }
  };

  const togglePasswordVisibility = () => {
    setShowPassword(prev => !prev);
  };

  return (
    <div className="admin-login-page">
      <div className="admin-login-container">
        <div className="admin-login-header">
          <div className="admin-logo">
            <h1>🛠️</h1>
            <h2>Administration</h2>
            <p>Sankofart Résidence</p>
          </div>
        </div>

        <div className="admin-login-form">
          <h3>Connexion Administrateur</h3>
          
          {error && (
            <div className="error-message">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label htmlFor="username">
                <FaUser />
                Nom d'utilisateur
              </label>
              <input
                type="text"
                id="username"
                name="username"
                value={credentials.username}
                onChange={handleInputChange}
                placeholder="Entrez votre nom d'utilisateur"
                required
                autoComplete="username"
              />
            </div>

            <div className="form-group">
              <label htmlFor="password">
                <FaLock />
                Mot de passe
              </label>
              <div className="password-input-container">
                <input
                  type={showPassword ? 'text' : 'password'}
                  id="password"
                  name="password"
                  value={credentials.password}
                  onChange={handleInputChange}
                  placeholder="Entrez votre mot de passe"
                  required
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  className="password-toggle"
                  onClick={togglePasswordVisibility}
                  aria-label={showPassword ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
                >
                  {showPassword ? <FaEyeSlash /> : <FaEye />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              className="btn btn-primary btn-login"
              disabled={isLoading}
            >
              {isLoading ? 'Connexion...' : 'Se connecter'}
            </button>
          </form>

          <div className="admin-login-footer">
            <p>Accès réservé au personnel autorisé</p>
            <button
              className="btn btn-outline btn-back"
              onClick={() => navigate('/')}
            >
              Retour au site
            </button>
          </div>
        </div>

        <div className="admin-login-info">
          <div className="info-card">
            <h4>🔒 Sécurité</h4>
            <p>Cette zone est protégée et accessible uniquement aux administrateurs autorisés.</p>
          </div>
          <div className="info-card">
            <h4>📊 Gestion</h4>
            <p>Gérez les résidences, les disponibilités et les réservations en temps réel.</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AdminLogin;
