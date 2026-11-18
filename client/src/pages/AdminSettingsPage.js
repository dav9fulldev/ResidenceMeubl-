import React, { useEffect, useState } from 'react';
import {
  FaBuilding, FaAddressBook, FaCoins, FaEnvelope, FaCreditCard, FaSave, FaCheckCircle, FaExclamationTriangle, FaCopy,
} from 'react-icons/fa';
import { useResidences } from '../context/ResidencesContext';
import './AdminSettingsPage.css';

const CATEGORIES = [
  { cle: 'etablissement', icone: <FaBuilding />, titre: 'Établissement', resume: 'Nom et présentation' },
  { cle: 'coordonnees', icone: <FaAddressBook />, titre: 'Coordonnées et réseaux', resume: 'Téléphone, email, adresse, réseaux sociaux' },
  { cle: 'remboursements', icone: <FaCoins />, titre: 'Acompte et remboursements', resume: 'Montant de l\'acompte, règles d\'annulation' },
  { cle: 'emails', icone: <FaEnvelope />, titre: 'Emails', resume: 'Destinataire des alertes' },
  { cle: 'paiement', icone: <FaCreditCard />, titre: 'Moyens de paiement', resume: 'PI-SPI (BCEAO)' },
];

const CHAMPS_ACOMPTE = [
  { cle: 'acomptePourcentage', label: 'Acompte demandé', unite: '% du séjour', min: 1, max: 100 },
  { cle: 'remboursableApresPaiementJours', label: 'Remboursement intégral pendant', unite: 'jours après le paiement', min: 0, max: 365 },
  { cle: 'remboursementPourcentage', label: 'Part remboursée après ce délai', unite: '% de l\'acompte', min: 0, max: 100 },
  { cle: 'nonRemboursableAvantArriveeJours', label: 'Aucun remboursement à moins de', unite: 'jours de l\'arrivée', min: 0, max: 365 },
];

const CLES_ETAB = ['nom', 'slogan'];
const CLES_COORD = ['telephone', 'whatsapp', 'email', 'adresse', 'facebook', 'instagram', 'tiktok', 'x'];
const fcfa = (n) => `${Math.round(n).toLocaleString('fr-FR')} FCFA`;

/** Paramètres du back-office, par catégories. */
const AdminSettingsPage = () => {
  const { getSettings, updateSettings, getEstablishment, updateEstablishment, getPaymentConfig } = useResidences();
  const [categorie, setCategorie] = useState('etablissement');
  const [acompte, setAcompte] = useState(null);
  const [acompteInitial, setAcompteInitial] = useState(null);
  const [etab, setEtab] = useState(null);
  const [etabInitial, setEtabInitial] = useState(null);
  const [paiement, setPaiement] = useState(null);
  const [etat, setEtat] = useState({ erreur: '', ok: '', enCours: false });

  useEffect(() => {
    getSettings().then(v => { setAcompte(v); setAcompteInitial(v); }).catch(e => setEtat(s => ({ ...s, erreur: e.message })));
    getEstablishment().then(v => { setEtab(v); setEtabInitial(v); }).catch(e => setEtat(s => ({ ...s, erreur: e.message })));
    getPaymentConfig().then(setPaiement).catch(() => setPaiement(null));
  }, [getSettings, getEstablishment, getPaymentConfig]);

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

  const cat = CATEGORIES.find(c => c.cle === categorie);
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
          <p>Votre établissement, vos règles d'acompte et vos moyens de paiement.</p>
        </div>
      </div>

      <div className="params-cadre">
        <nav className="params-nav" aria-label="Catégories de paramètres">
          {CATEGORIES.map(c => (
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
                <label htmlFor="f-nom">Nom de l'établissement</label>
                {champ('nom', { required: true, maxLength: 80 })}
                <p>Affiché sur le site et comme expéditeur des emails.</p>
              </div>
              <div className="params-champ">
                <label htmlFor="f-slogan">Phrase de présentation</label>
                {champ('slogan', { maxLength: 160 })}
                <p>Une phrase courte qui résume votre offre, reprise sur la page d'accueil.</p>
              </div>
              <div className="params-apercu">
                <p className="surtitre">Aperçu</p>
                <p className="params-apercu-nom">{etab.nom || '—'}</p>
                <p>{etab.slogan}</p>
              </div>
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
              <h3 className="params-sous-titre">Réseaux sociaux</h3>
              <p className="params-note">Laissez vide pour masquer un réseau sur le site. Adresse complète, commençant par https://.</p>
              <div className="params-grille">
                <div className="params-champ"><label htmlFor="f-facebook">Facebook</label>{champ('facebook', { type: 'url', placeholder: 'https://www.facebook.com/…' })}</div>
                <div className="params-champ"><label htmlFor="f-instagram">Instagram</label>{champ('instagram', { type: 'url', placeholder: 'https://www.instagram.com/…' })}</div>
                <div className="params-champ"><label htmlFor="f-tiktok">TikTok</label>{champ('tiktok', { type: 'url', placeholder: 'https://www.tiktok.com/@…' })}</div>
                <div className="params-champ"><label htmlFor="f-x">X (Twitter)</label>{champ('x', { type: 'url', placeholder: 'https://x.com/…' })}</div>
              </div>
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
                </ul>
              </div>
              {bouton(modifie(etab, etabInitial, ['emailNotifications']))}
            </form>
          )}

          {categorie === 'paiement' && (
            <div className="params-form">
              {!paiement ? <p className="params-note">Chargement…</p> : (
                <>
                  <div className={`params-moyen ${paiement.mode === 'pispi' ? 'actif' : ''}`}>
                    <span className="params-moyen-logo">PI</span>
                    <div>
                      <b>PI-SPI · BCEAO</b>
                      <p>QR code et demande de paiement, remboursements automatiques.</p>
                    </div>
                    <span className={`adm-badge ${paiement.mode === 'pispi' ? 'confirmee' : paiement.mode === 'simulation' ? 'attente' : 'annulee'}`}>
                      {paiement.mode === 'pispi' ? 'Actif' : paiement.mode === 'simulation' ? 'Simulation' : 'Désactivé'}
                    </span>
                  </div>
                  <dl className="adm-infos">
                    <div><dt>Acompte</dt><dd>{paiement.pourcentage} % du séjour</dd></div>
                    <div><dt>Signature des notifications</dt><dd>{paiement.webhookSecretDefini ? 'Configurée' : 'Manquante'}</dd></div>
                    <div><dt>Configuration</dt><dd>{paiement.problemes?.length ? `${paiement.problemes.length} point(s) à corriger` : 'Complète'}</dd></div>
                  </dl>
                  {paiement.problemes?.length > 0 && (
                    <ul className="params-problemes">{paiement.problemes.map(p => <li key={p}><FaExclamationTriangle /> {p}</li>)}</ul>
                  )}
                  <div className="params-champ">
                    <label htmlFor="f-webhook">Adresse de notification à déclarer chez PI-SPI</label>
                    <div className="params-unite">
                      <input id="f-webhook" readOnly value={paiement.webhookUrl} onFocus={(e) => e.target.select()} />
                      <button type="button" className="adm-btn" onClick={() => navigator.clipboard?.writeText(paiement.webhookUrl)} aria-label="Copier l'adresse"><FaCopy /></button>
                    </div>
                  </div>
                  <p className="params-note">Les identifiants PI-SPI restent sur le serveur (Render) par sécurité : ils ne se modifient pas ici.</p>
                </>
              )}
            </div>
          )}
        </section>
      </div>
    </div>
  );
};

export default AdminSettingsPage;
