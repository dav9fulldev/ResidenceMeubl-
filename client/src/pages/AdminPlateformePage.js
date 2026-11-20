import React, { useCallback, useEffect, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { FaBuilding, FaShieldAlt, FaFlag, FaCoins, FaCalendarAlt, FaExchangeAlt, FaCheckCircle, FaExclamationTriangle, FaArrowRight } from 'react-icons/fa';
import { API_BASE_URL } from '../config/api';
import { useResidences } from '../context/ResidencesContext';
import { useCompte } from '../context/CompteContext';
import { fcfa } from './AdminFinancesPage';
import './AdminFinances.css';

/** Administrateur de la plateforme : vue d'ensemble (il ne gère pas de résidences lui-même). */
const AdminPlateformePage = () => {
  const { adminRequest } = useResidences();
  const { compte, recharger } = useCompte();
  const [d, setD] = useState(null);
  const [erreur, setErreur] = useState('');

  const charger = useCallback(async () => {
    try { setD((await adminRequest(`${API_BASE_URL}/admin/plateforme/apercu`)).data); } catch (e) { setErreur(e.message); }
  }, [adminRequest]);
  useEffect(() => { charger(); }, [charger]);

  if (compte && !compte.superAdmin) return <Navigate to="/admin/dashboard" replace />;
  if (!d) return <p className="verif-chargement">{erreur || 'Chargement…'}</p>;

  const carte = (to, icone, titre, valeur, note, alerte) => (
    <Link to={to} className={`adm-carte fin-kpi plat-kpi ${alerte ? 'alerte' : ''}`}>
      <p>{icone} {titre}</p><strong>{valeur}</strong>{note && <small>{note}</small>}<span className="plat-lien">Ouvrir <FaArrowRight aria-hidden="true" /></span>
    </Link>
  );

  return (
    <div className="finances-page">
      <header className="admin-page-header">
        <div>
          <h1>Plateforme BABI RESIDENCE</h1>
          <p>Les entreprises gèrent leurs résidences ; vous validez les entreprises et les annonces, et vous suivez l'argent.</p>
        </div>
      </header>

      {d.residencesPlateforme > 0 && !d.transfertFait && <Transfert nombre={d.residencesPlateforme} adminRequest={adminRequest} apres={() => { charger(); recharger(); }} />}

      <div className="fin-kpis">
        {carte('/admin/entreprises', <FaBuilding />, 'Entreprises à valider', d.entreprises.aValider, `${d.entreprises.validees} validée(s) · ${d.entreprises.suspendues} suspendue(s)`, d.entreprises.aValider > 0)}
        {carte('/admin/verifications', <FaShieldAlt />, 'Résidences à vérifier', d.verifications.aExaminer, `${d.residences.verifiee || 0} publiée(s) · ${d.residences.brouillon || 0} en préparation`, d.verifications.aExaminer > 0)}
        {carte('/admin/verifications', <FaFlag />, 'Signalements', d.verifications.signalements, 'Annonces signalées par des visiteurs', d.verifications.signalements > 0)}
        {carte('/admin/finances', <FaCalendarAlt />, 'Réservations ce mois-ci', d.reservations.ceMois, `${d.reservations.total} au total`)}
        {carte('/admin/finances', <FaCoins />, 'Encaissé ce mois-ci', fcfa(d.finances.encaisseMois), `Commissions : ${fcfa(d.finances.commissionsMois)}`)}
        {carte('/admin/finances', <FaCoins />, 'À reverser aux entreprises', fcfa(d.finances.versable), `${d.finances.reversementsEnAttente.nombre} reversement(s) en attente`, d.finances.reversementsEnAttente.nombre > 0)}
      </div>
      <p className={d.finances.balanceEquilibree ? 'fin-ok' : 'fin-alerte'}>{d.finances.balanceEquilibree ? <><FaCheckCircle /> Registre financier équilibré</> : <><FaExclamationTriangle /> Registre financier déséquilibré : ouvrez Finances → Rapprochement</>}</p>
    </div>
  );
};

/** Confie les résidences de la plateforme à « BABI RESIDENCE Gestion » avec un compte responsable. */
const Transfert = ({ nombre, adminRequest, apres }) => {
  const [f, setF] = useState({ prenom: '', nom: '', email: '', telephone: '', motDePasse: '' });
  const [etat, setEtat] = useState({ enCours: false, erreur: '', ok: '' });
  const champ = (cle, props = {}) => <input value={f[cle]} onChange={(e) => setF(v => ({ ...v, [cle]: e.target.value }))} required {...props} />;
  const envoyer = async (e) => {
    e.preventDefault();
    if (!window.confirm(`Confier les ${nombre} résidences et leurs réservations à « BABI RESIDENCE Gestion » ? Vous ne les gérerez plus depuis ce compte.`)) return;
    setEtat({ enCours: true, erreur: '', ok: '' });
    try {
      const r = (await adminRequest(`${API_BASE_URL}/admin/plateforme/transfert`, { method: 'POST', body: f })).data;
      setEtat({ enCours: false, erreur: '', ok: `${r.residences} résidence(s) et ${r.reservations} réservation(s) transférées. Connectez-vous avec ${f.email} pour les gérer.` });
      apres();
    } catch (err) { setEtat({ enCours: false, erreur: err.message, ok: '' }); }
  };
  return (
    <section className="adm-carte fin-bloc plat-transfert">
      <h2><FaExchangeAlt aria-hidden="true" /> {nombre} résidence(s) encore rattachée(s) à ce compte</h2>
      <p className="verif-aide">Ce compte sert à administrer la plateforme. Confiez ces résidences à l'entreprise « BABI RESIDENCE Gestion » (sans commission) : créez ici son compte responsable, avec une autre adresse email. Réservations, règles d'acompte et coordonnées suivent ; rien ne change pour les clients.</p>
      {etat.erreur && <p className="params-msg erreur" role="alert"><FaExclamationTriangle /> {etat.erreur}</p>}
      {etat.ok && <p className="params-msg ok" role="status"><FaCheckCircle /> {etat.ok}</p>}
      <form className="fin-benef" onSubmit={envoyer}>
        <label>Prénom{champ('prenom', { minLength: 2, maxLength: 60, autoComplete: 'off' })}</label>
        <label>Nom{champ('nom', { minLength: 2, maxLength: 60, autoComplete: 'off' })}</label>
        <label>Email du responsable{champ('email', { type: 'email', maxLength: 254, autoComplete: 'off' })}</label>
        <label>Téléphone{champ('telephone', { type: 'tel', maxLength: 30 })}</label>
        <label>Mot de passe (10 caractères minimum){champ('motDePasse', { type: 'password', minLength: 10, maxLength: 200, autoComplete: 'new-password' })}</label>
        <button type="submit" className="adm-btn principal" disabled={etat.enCours}><FaExchangeAlt /> {etat.enCours ? 'Transfert…' : 'Créer le compte et transférer'}</button>
      </form>
    </section>
  );
};

export default AdminPlateformePage;
