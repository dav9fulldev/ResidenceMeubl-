import React, { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { FaUserPlus, FaShieldAlt, FaCalendarCheck, FaMoneyBillWave, FaSignInAlt } from 'react-icons/fa';
import './DevenirHote.css';

const ETAPES = [
  [FaUserPlus, 'Créez le compte de votre entreprise', 'Gratuit, en quelques minutes. Notre équipe vérifie votre entreprise.'],
  [FaShieldAlt, 'Ajoutez et faites vérifier vos résidences', 'Photos, localisation et justificatifs : chaque annonce est vérifiée avant d\'être publiée.'],
  [FaCalendarCheck, 'Recevez des réservations', 'Vous confirmez les demandes, suivez votre calendrier et vos clients depuis votre espace.'],
  [FaMoneyBillWave, 'Soyez payé', 'Les clients paient en ligne sur BABI RESIDENCE ; votre part vous est reversée 24 h après leur arrivée.'],
];

/** Page d'accueil des gestionnaires de résidences : inscription ou connexion à leur espace. */
const DevenirHote = () => {
  useEffect(() => { document.title = 'Devenir hôte · BABI RESIDENCE'; }, []);
  return (
    <div className="hote-page">
      <section className="hote-hero">
        <p className="surtitre">Gestionnaires et propriétaires</p>
        <h1>Louez vos résidences meublées sur BABI RESIDENCE</h1>
        <p>Une vitrine vérifiée, des paiements sécurisés et un espace de gestion complet pour vos réservations à Abidjan.</p>
        <div className="hote-actions">
          <Link to="/admin/inscription" className="btn btn-primary"><FaUserPlus aria-hidden="true" /> Créer mon compte</Link>
          <Link to="/admin/login" className="btn btn-outline"><FaSignInAlt aria-hidden="true" /> J'ai déjà un compte</Link>
        </div>
      </section>
      <ol className="hote-etapes">
        {ETAPES.map(([Icone, titre, texte], i) => (
          <li key={titre}>
            <span className="hote-icone"><Icone aria-hidden="true" /></span>
            <span className="hote-num">{i + 1}</span>
            <h2>{titre}</h2>
            <p>{texte}</p>
          </li>
        ))}
      </ol>
      <p className="hote-note">Une commission est prélevée sur chaque paiement reçu ; elle vous est indiquée dans votre espace avant toute réservation.</p>
    </div>
  );
};

export default DevenirHote;
