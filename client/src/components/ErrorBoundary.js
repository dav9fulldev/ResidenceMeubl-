import React from 'react';

/**
 * Filet de sécurité : une erreur d'affichage montre un message et un bouton
 * « Recharger » au lieu d'une page blanche.
 */
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { erreur: null };
  }

  static getDerivedStateFromError(erreur) {
    return { erreur };
  }

  componentDidCatch(erreur, info) {
    console.error('Erreur d\'affichage :', erreur, info?.componentStack);
  }

  componentDidUpdate(prevProps) {
    // Changement de page : on retente l'affichage
    if (this.state.erreur && prevProps.cle !== this.props.cle) this.setState({ erreur: null });
  }

  render() {
    if (!this.state.erreur) return this.props.children;
    return (
      <div className="not-found" role="alert">
        <div className="not-found-carte">
          <h1>Un problème est survenu</h1>
          <p>Cette page n'a pas pu s'afficher. Rechargez-la ; si le problème continue, revenez à l'accueil.</p>
          <div className="not-found-actions">
            <button type="button" className="btn btn-primary" onClick={() => window.location.reload()}>Recharger</button>
            <a href="/" className="btn btn-outline">Accueil</a>
          </div>
        </div>
      </div>
    );
  }
}

export default ErrorBoundary;
