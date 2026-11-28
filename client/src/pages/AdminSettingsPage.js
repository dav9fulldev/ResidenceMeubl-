import React, { useEffect, useState } from 'react';
import {
  FaBuilding, FaAddressBook, FaCoins, FaEnvelope, FaCreditCard, FaSave, FaCheckCircle, FaExclamationTriangle, FaUserLock,
} from 'react-icons/fa';
import { useResidences } from '../context/ResidencesContext';
import { useCompte } from '../context/CompteContext';
import { API_ENDPOINTS } from '../config/api';
import MoyensPaiement from '../components/admin/MoyensPaiement';
import './AdminSettingsPage.css';

// pour : 'plateforme' (administrateur du site) et/ou 'entreprise' (responsable)
const CATEGORIES_TOUTES = [
  { cle: 'etablissement', icone: <FaBuilding />, titre: 'Identité du site', resume: 'Nom et phrase de présentation', pour: ['plateforme'] },
  { cle: 'etablissement', icone: <FaBuilding />, titre: 'Entreprise', resume: 'Nom affiché aux clients', pour: ['entreprise'] },
  { cle: 'coordonnees', icone: <FaAddressBook />, titre: 'Coordonnées et réseaux', resume: 'Pied de page du site, réseaux sociaux', pour: ['plateforme'] },
  { cle: 'coordonnees', icone: <FaAddressBook />, titre: 'Coordonnées', resume: 'Téléphone, WhatsApp, email, adresse', pour: ['entreprise'] },
  { cle: 'remboursements', icone: <FaCoins />, titre: 'Acompte et remboursements', resume: 'Montant de l\'acompte, règles d\'annulation', pour: ['entreprise'] },
  { cle: 'emails', icone: <FaEnvelope />, titre: 'Emails', resume: 'Destinataire des alertes', pour: ['plateforme', 'entreprise'] },
  { cle: 'paiement', icone: <FaCreditCard />, titre: 'Moyens de paiement', resume: 'PI-SPI, GeniusPay…', pour: ['plateforme'] },
  { cle: 'compte', icone: <FaUserLock />, titre: 'Mon compte', resume: 'Identifiant et mot de passe', pour: ['entreprise'] },
];

const CHAMPS_ACOMPTE = [
  { cle: 'acomptePourcentage', label: 'Acompte demandé', unite: '% du séjour', min: 1, max: 100 },
  { cle: 'remboursableApresPaiementJours', label: 'Remboursement intégral pendant', unite: 'jours après le paiement', min: 0, max: 365 },
  { cle: 'remboursementPourcentage', label: 'Part remboursée après ce délai', unite: '% de l\'acompte', min: 0, max: 100 },
  { cle: 'nonRemboursableAvantArriveeJours', label: 'Aucun remboursement à moins de', unite: 'jours de l\'arrivée', min: 0, max: 365 },
];

const CLES_ETAB_PLATEFORME = ['nom', 'slogan'];
const CLES_COORD_PLATEFORME = ['telephone', 'whatsapp', 'email', 'adresse', 'facebook', 'instagram', 'tiktok', 'x'];
const CLES_ETAB_ENTREPRISE = ['nom'];
const CLES_COORD_ENTREPRISE = ['telephone', 'whatsapp', 'email', 'adresse'];
const fcfa = (n) => `${Math.round(n).toLocaleString('fr-FR')} FCFA`;

/** Paramètres du back-office, par catégories. */
const AdminSettingsPage = () => {
  const { getSettings, updateSettings, getEstablishment, updateEstablishment, adminRequest } = useResidences();
  const { compte, recharger } = useCompte();
  const [mdp, setMdp] = useState({ actuel: '', nouveau: '', confirmation: '' });
  // « Mon compte » : gestionnaires seulement (l'administrateur de la plateforme se règle sur le serveur)
  const role = compte?.superAdmin ? 'plateforme' : 'entreprise';
  const categories = CATEGORIES_TOUTES.filter(c => c.pour.includes(role));
  const CLES_ETAB = role === 'plateforme' ? CLES_ETAB_PLATEFORME : CLES_ETAB_ENTREPRISE;
  const CLES_COORD = role === 'plateforme' ? CLES_COORD_PLATEFORME : CLES_COORD_ENTREPRISE;
  const [categorie, setCategorie] = useState('etablissement');
  const [acompte, setAcompte] = useState(null);
  const [acompteInitial, setAcompteInitial] = useState(null);
  const [etab, setEtab] = useState(null);
  const [etabInitial, setEtabInitial] = useState(null);
  const [etat, setEtat] = useState({ erreur: '', ok: '', enCours: false });

  useEffect(() => {
    getSettings().then(v => { setAcompte(v); setAcompteInitial(v); }).catch(e => setEtat(s => ({ ...s, erreur: e.message })));
    getEstablishment().then(v => { setEtab(v); setEtabInitial(v); }).catch(e => setEtat(s => ({ ...s, erreur: e.message })));
  }, [getSettings, getEstablishment]);

  const enregistrer = async (fn, ok) => {
    setEtat({ erreur: '', ok: '', enCours: true });
    try {
      await fn();
      setEtat({ erreur: '', ok, enCours: false });
    } catch (e) {
      setEtat({ erreur: e.message, ok: '', enCours: false });
    }
  };

  const sauverEtab = (cles) => enregistrer(async () => {
    const v = await updateEstablishment(Object.fromEntries(cles.map(k => [k, etab[k]])));
    setEtab(v); setEtabInitial(v);
  }, 'Enregistré. Le site affiche déjà les nouvelles informations.');

  const sauverAcompte = () => enregistrer(async () => {
    const v = await updateSettings(Object.fromEntries(CHAMPS_ACOMPTE.map(c => [c.cle, Number(acompte[c.cle])])));
    setAcompte(v); setAcompteInitial(v);
  }, 'Règles enregistrées. Elles s\'appliquent immédiatement.');

  const modifie = (a, b, cles) => Boolean(a && b && cles.some(k => String(a[k] ?? '') !== String(b[k] ?? '')));
  const champ = (cle, props = {}) => (
    <input id={`f-${cle}`} value={etab?.[cle] ?? ''} onChange={(e) => setEtab(v => ({ ...v, [cle]: e.target.value }))} {...props} />
  );
  const choisir = (cle) => { setCategorie(cle); setEtat({ erreur: '', ok: '', enCours: false }); };

  // Exemple des paliers pour un séjour de 100 000 FCFA
  const ex = acompte && (() => {
    const a = Math.round(100000 * Number(acompte.acomptePourcentage || 0) / 100);
    return { a, partiel: Math.floor(a * Number(acompte.remboursementPourcentage || 0) / 100) };
  })();

  const cat = categories.find(c => c.cle === categorie) || categories[0];

  const changerMdp = (ev) => {
    ev.preventDefault();
    if (mdp.nouveau !== mdp.confirmation) { setEtat({ erreur: 'Les deux nouveaux mots de passe ne sont pas identiques.', ok: '', enCours: false }); return; }
    enregistrer(async () => {
      await adminRequest(API_ENDPOINTS.admin.password, { method: 'PUT', body: { actuel: mdp.actuel, nouveau: mdp.nouveau } });
      setMdp({ actuel: '', nouveau: '', confirmation: '' });
    }, 'Mot de passe modifié.');
  };
  const bouton = (actif) => (
    <div className="params-pied">
      <button type="submit" className="adm-btn principal" disabled={!actif || etat.enCours}><FaSave /> Enregistrer</button>
    </div>
  );

  return (
    <div className="params">
      <div className="admin-page-header">
        <div>
          <h1>Paramètres</h1>
          <p>{role === 'plateforme' ? 'Le site : identité, coordonnées et réseaux du pied de page, alertes, moyens de paiement.' : 'Votre entreprise : nom et coordonnées pour vos clients, règles d\'acompte, alertes, mot de passe.'}</p>
        </div>
      </div>

      <div className="params-cadre">
        <nav className="params-nav" aria-label="Catégories de paramètres">
          {categories.map(c => (
            <button key={c.cle} type="button" className={`params-nav-lien ${categorie === c.cle ? 'actif' : ''}`}
              onClick={() => choisir(c.cle)} aria-current={categorie === c.cle ? 'page' : undefined}>
              <span className="params-nav-icone">{c.icone}</span>
              <span><b>{c.titre}</b><small>{c.resume}</small></span>
            </button>
          ))}
        </nav>

        <section className="adm-carte params-contenu" aria-labelledby="params-titre">
          <header className="params-tete">
            <span className="params-tete-icone">{cat.icone}</span>
            <div><h2 id="params-titre">{cat.titre}</h2><p>{cat.resume}</p></div>
          </header>

          {etat.erreur && <p className="params-msg erreur" role="alert"><FaExclamationTriangle /> {etat.erreur}</p>}
          {etat.ok && <p className="params-msg ok" role="status"><FaCheckCircle /> {etat.ok}</p>}

          {categorie === 'etablissement' && etab && (
            <form className="params-form" onSubmit={(e) => { e.preventDefault(); sauverEtab(CLES_ETAB); }}>
              <div className="params-champ">
                <label htmlFor="f-nom">{role === 'plateforme' ? 'Nom du site' : 'Nom de l\'entreprise'}</label>
                {champ('nom', { required: true, maxLength: 80 })}
                <p>{role === 'plateforme' ? 'Affiché sur le site et comme expéditeur des emails de la plateforme.' : 'Affiché sur vos résidences (« Proposé par ») et dans les emails à vos clients.'}</p>
              </div>
              {role === 'plateforme' && <div className="params-champ">
                <label htmlFor="f-slogan">Phrase de présentation</label>
                {champ('slogan', { maxLength: 160 })}
                <p>Une phrase courte qui résume l'offre, reprise sur la page d'accueil.</p>
              </div>}
              {role === 'plateforme' ? (
                <div className="params-apercu">
                  <p className="surtitre">Aperçu</p>
                  <p className="params-apercu-nom">{etab.nom || '—'}</p>
                  <p>{etab.slogan}</p>
                </div>
              ) : (
                <>
                  <div className="params-apercu-entreprise">
                    <p className="surtitre">Ce que voient vos clients</p>
                    <p>Sur la fiche de vos résidences : <b>Proposé par {etab.nom || '—'}</b></p>
                    <p>Dans les emails de leurs réservations : l'expéditeur « {etab.nom || '—'} »</p>
                  </div>
                  <p className="params-note">Le nom, le logo, les coordonnées et les réseaux sociaux du site BABI RESIDENCE sont gérés par l'administrateur de la plateforme : ce champ ne les modifie pas.</p>
                </>
              )}
              {bouton(modifie(etab, etabInitial, CLES_ETAB))}
            </form>
          )}

          {categorie === 'coordonnees' && etab && (
            <form className="params-form" onSubmit={(e) => { e.preventDefault(); sauverEtab(CLES_COORD); }}>
              <div className="params-grille">
                <div className="params-champ"><label htmlFor="f-telephone">Téléphone</label>{champ('telephone', { type: 'tel', inputMode: 'tel' })}</div>
                <div className="params-champ"><label htmlFor="f-whatsapp">WhatsApp</label>{champ('whatsapp', { type: 'tel', inputMode: 'tel', placeholder: '+225 07 00 00 00 00' })}</div>
                <div className="params-champ"><label htmlFor="f-email">Email de contact</label>{champ('email', { type: 'email' })}</div>
                <div className="params-champ"><label htmlFor="f-adresse">Adresse</label>{champ('adresse')}</div>
              </div>
              {role === 'plateforme' && <>
              <h3 className="params-sous-titre">Réseaux sociaux</h3>
              <p className="params-note">Laissez vide pour masquer un réseau sur le site. Adresse complète, commençant par https://.</p>
              <div className="params-grille">
                <div className="params-champ"><label htmlFor="f-facebook">Facebook</label>{champ('facebook', { type: 'url', placeholder: 'https://www.facebook.com/…' })}</div>
                <div className="params-champ"><label htmlFor="f-instagram">Instagram</label>{champ('instagram', { type: 'url', placeholder: 'https://www.instagram.com/…' })}</div>
                <div className="params-champ"><label htmlFor="f-tiktok">TikTok</label>{champ('tiktok', { type: 'url', placeholder: 'https://www.tiktok.com/@…' })}</div>
                <div className="params-champ"><label htmlFor="f-x">X (Twitter)</label>{champ('x', { type: 'url', placeholder: 'https://x.com/…' })}</div>
              </div>
              </>}
              {bouton(modifie(etab, etabInitial, CLES_COORD))}
            </form>
          )}

          {categorie === 'remboursements' && acompte && (
            <form className="params-form" onSubmit={(e) => { e.preventDefault(); sauverAcompte(); }}>
              <div className="params-grille">
                {CHAMPS_ACOMPTE.map(c => (
                  <div key={c.cle} className="params-champ">
                    <label htmlFor={`f-${c.cle}`}>{c.label}</label>
                    <div className="params-unite">
                      <input id={`f-${c.cle}`} type="number" inputMode="numeric" min={c.min} max={c.max} step="1" required
                        value={acompte[c.cle]} onChange={(e) => setAcompte(v => ({ ...v, [c.cle]: e.target.value }))} />
                      <span>{c.unite}</span>
                    </div>
                  </div>
                ))}
              </div>
              {ex && (
                <div className="params-paliers">
                  <p className="surtitre">Exemple : séjour de 100 000 FCFA, acompte de {fcfa(ex.a)}</p>
                  <ol>
                    <li className="vert"><b>100 %</b><span>{fcfa(ex.a)} rendus</span><small>annulation dans les {acompte.remboursableApresPaiementJours} jours suivant le paiement</small></li>
                    <li className="or"><b>{acompte.remboursementPourcentage} %</b><span>{fcfa(ex.partiel)} rendus</span><small>annulation plus tardive</small></li>
                    <li className="rouge"><b>0 %</b><span>rien n'est rendu</span><small>moins de {acompte.nonRemboursableAvantArriveeJours} jours avant l'arrivée</small></li>
                  </ol>
                  <p className="params-note">Les acomptes déjà payés suivent les règles en vigueur au moment de la demande d'annulation.</p>
                </div>
              )}
              {bouton(modifie(acompte, acompteInitial, CHAMPS_ACOMPTE.map(c => c.cle)))}
            </form>
          )}

          {categorie === 'emails' && etab && (
            <form className="params-form" onSubmit={(e) => { e.preventDefault(); sauverEtab(['emailNotifications']); }}>
              <div className="params-champ">
                <label htmlFor="f-emailNotifications">Recevoir les alertes à</label>
                {champ('emailNotifications', { type: 'email', placeholder: 'Adresse définie sur le serveur (ADMIN_EMAIL)' })}
                <p>Nouvelle réservation, demande d'annulation, acompte reçu. Vide : l'adresse configurée sur le serveur.</p>
              </div>
              <div className="params-liste">
                <p className="surtitre">Emails envoyés aux clients</p>
                <ul>
                  <li>Demande de réservation reçue</li>
                  <li>Réservation confirmée ou refusée</li>
                  <li>Acompte reçu</li>
                  <li>Décision sur une demande d'annulation</li>
                  <li>Remboursement effectué</li>
                  <li>Lien d'accès à « Mes réservations »</li>
                  <li>Rappel la veille de l'arrivée (adresse et vos coordonnées)</li>
                </ul>
              </div>
              {bouton(modifie(etab, etabInitial, ['emailNotifications']))}
            </form>
          )}
          {categorie === 'emails' && role === 'entreprise' && compte?.utilisateur?.preferences && (
            <div className="params-form">
              <div className="params-champ">
                <label className="params-case">
                  <input type="checkbox" checked={compte.utilisateur.preferences.resumeHebdo} disabled={etat.enCours}
                    onChange={(e) => {
                      const resumeHebdo = e.target.checked;
                      enregistrer(async () => {
                        await adminRequest(API_ENDPOINTS.admin.preferences, { method: 'PUT', body: { resumeHebdo } });
                        await recharger();
                      }, resumeHebdo ? 'Vous recevrez le résumé chaque lundi matin.' : 'Vous ne recevrez plus le résumé de la semaine.');
                    }} />
                  <span><b>Résumé de la semaine</b> : chaque lundi matin, vos réservations, votre taux d'occupation, les avis reçus et les arrivées à venir.</span>
                </label>
                <p>Ce réglage ne concerne que votre compte ({compte.utilisateur.email}).</p>
              </div>
            </div>
          )}

          {categorie === 'paiement' && <MoyensPaiement />}

          {categorie === 'compte' && compte?.utilisateur && (
            <form className="params-form" onSubmit={changerMdp}>
              <div className="params-champ">
                <label htmlFor="f-identifiant">Identifiant de connexion</label>
                <input id="f-identifiant" value={compte.utilisateur.email || ''} readOnly />
              </div>
              <div className="params-champ">
                <label htmlFor="f-mdp-actuel">Mot de passe actuel</label>
                <input id="f-mdp-actuel" type="password" autoComplete="current-password" required value={mdp.actuel} onChange={(e) => setMdp(v => ({ ...v, actuel: e.target.value }))} />
              </div>
              <div className="params-champ">
                <label htmlFor="f-mdp-nouveau">Nouveau mot de passe</label>
                <input id="f-mdp-nouveau" type="password" autoComplete="new-password" required minLength={10} value={mdp.nouveau} onChange={(e) => setMdp(v => ({ ...v, nouveau: e.target.value }))} />
                <p>10 caractères minimum.</p>
              </div>
              <div className="params-champ">
                <label htmlFor="f-mdp-confirmation">Confirmer le nouveau mot de passe</label>
                <input id="f-mdp-confirmation" type="password" autoComplete="new-password" required value={mdp.confirmation} onChange={(e) => setMdp(v => ({ ...v, confirmation: e.target.value }))} />
              </div>
              {bouton(mdp.actuel && mdp.nouveau.length >= 10 && mdp.confirmation)}
            </form>
          )}
        </section>
      </div>
    </div>
  );
};

export default AdminSettingsPage;
