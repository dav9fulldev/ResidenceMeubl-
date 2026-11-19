import React from 'react';
import LogoBabi from './LogoBabi';

/**
 * Panneau de marque des pages de connexion et d'inscription :
 * emblème, nom BABI RESIDENCE, slogan et vagues aux couleurs de la marque.
 */
const PanneauMarque = ({ children }) => (
  <div className="admin-login-header">
    <div className="marque">
      <LogoBabi className="marque-embleme" titre="BABI RESIDENCE" />
      <p className="marque-nom" aria-hidden="true"><span>BABI</span><span>RESIDENCE</span></p>
      <span className="marque-trait" aria-hidden="true" />
      <p className="marque-slogan">Réservez <i>•</i> Séjournez <i>•</i> Profitez</p>
      {children && <div className="marque-texte">{children}</div>}
    </div>
    <svg className="marque-vagues" viewBox="0 0 500 120" preserveAspectRatio="none" aria-hidden="true">
      <path d="M0 52 C120 8 260 96 500 40 L500 62 C280 116 130 34 0 78 Z" fill="#E0A526" />
      <path d="M0 80 C140 34 270 120 500 62 L500 92 C280 146 140 66 0 112 Z" fill="#12284C" />
    </svg>
  </div>
);

export default PanneauMarque;
