import React, { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  FaArrowRight, FaCalendarAlt, FaUsers, FaMapMarkerAlt, FaSearch, FaCouch, FaMapMarkedAlt, FaShieldAlt, FaHeadset, FaPhone,
} from 'react-icons/fa';
import { useResidences } from '../context/ResidencesContext';
import ResidenceCard from '../components/ResidenceCard';
import useEtablissement from '../hooks/useEtablissement';
import './Home.css';

// Vidéo légère sur téléphone (720p, ~1 Mo), plus nette sur ordinateur (1080p, ~2,4 Mo), sans son
const VIDEO_MOBILE = '/videos/hero-mobile.mp4';
const VIDEO_DESKTOP = '/videos/hero-desktop.mp4';
const POSTER = '/images/hero-poster.jpg';

/**
 * Vidéo d'ambiance en lecture automatique.
 * Safari exige l'attribut « muted » réel (React ne l'écrit pas) : on le pose à la main.
 * Si la lecture est refusée (mode Économie d'énergie de l'iPhone, données réduites…),
 * on affiche l'image fixe au lieu d'une vidéo figée avec un bouton ▶, puis on retente
 * au premier toucher de l'écran.
 */
const HeroVideo = () => {
  const ref = useRef(null);
  const [bloquee, setBloquee] = useState(false);

  useEffect(() => {
    const video = ref.current;
    if (!video) return undefined;

    const reduireAnimations = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reduireAnimations) {
      setBloquee(true);
      return undefined;
    }

    video.muted = true;
    video.defaultMuted = true;
    video.setAttribute('muted', '');
    video.setAttribute('playsinline', '');
    video.setAttribute('webkit-playsinline', '');

    const mobile = window.matchMedia?.('(max-width: 768px)').matches;
    video.src = mobile ? VIDEO_MOBILE : VIDEO_DESKTOP;

    const lancer = () => {
      const promesse = video.play();
      if (promesse?.then) {
        promesse.then(() => setBloquee(false)).catch(() => setBloquee(true));
      }
    };

    // Nouvelle tentative au premier geste du visiteur (autorisé même en économie d'énergie)
    const auPremierGeste = () => lancer();
    // Dès que la vidéo joue vraiment, on l'affiche (même après un premier refus)
    const enLecture = () => setBloquee(false);
    video.addEventListener('playing', enLecture);
    window.addEventListener('touchstart', auPremierGeste, { once: true, passive: true });
    window.addEventListener('click', auPremierGeste, { once: true });

    lancer();
    return () => {
      window.removeEventListener('touchstart', auPremierGeste);
      window.removeEventListener('click', auPremierGeste);
      video.removeEventListener('playing', enLecture);
    };
  }, []);

  return (
    <video
      ref={ref}
      className={`hero-video ${bloquee ? 'hero-video--poster' : ''}`}
      muted
      loop
      playsInline
      preload="metadata"
      poster={POSTER}
      controls={false}
      disablePictureInPicture
      aria-hidden="true"
      tabIndex={-1}
    />
  );
};

const Home = () => {
  const navigate = useNavigate();
  const { residences } = useResidences();
  const etab = useEtablissement();
  const aujourdHui = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  const [recherche, setRecherche] = useState({ arrivee: '', depart: '', personnes: '2', quartier: '' });

  // Résidences disponibles d'abord, puis les mieux notées
  const ordre = { disponible: 0, 'réservé': 1, 'occupé': 2, maintenance: 3 };
  const vedettes = [...residences]
    .filter(r => r.availability?.status !== 'maintenance')
    .sort((a, b) => (ordre[a.availability?.status] ?? 9) - (ordre[b.availability?.status] ?? 9) || (b.rating || 0) - (a.rating || 0))
    .slice(0, 6);
  const quartiers = [...new Set(residences.map(r => r.neighborhood).filter(Boolean))].sort();
  const noteMoyenne = residences.length
    ? (residences.reduce((t, r) => t + (Number(r.rating) || 0), 0) / residences.length).toFixed(1).replace('.', ',')
    : null;
  const departMin = (() => {
    if (!recherche.arrivee) return aujourdHui;
    const d = new Date(`${recherche.arrivee}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + 1);
    return d.toISOString().slice(0, 10);
  })();

  const chercher = (e) => {
    e.preventDefault();
    const p = new URLSearchParams();
    if (recherche.arrivee && recherche.depart && recherche.depart > recherche.arrivee) {
      p.set('arrivee', recherche.arrivee);
      p.set('depart', recherche.depart);
    }
    if (recherche.personnes) p.set('personnes', recherche.personnes);
    if (recherche.quartier) p.set('quartier', recherche.quartier);
    navigate(`/residences?${p.toString()}`);
  };

  const maj = (cle) => (e) => setRecherche(v => {
    const n = { ...v, [cle]: e.target.value };
    if (cle === 'arrivee' && n.depart && n.depart <= n.arrivee) n.depart = '';
    return n;
  });

  return (
    <div className="home">
      {/* Héro */}
      <section className="hero">
        <HeroVideo />
        <div className="hero-overlay"></div>
        <div className="hero-content">
          <div className="hero-text">
            <span className="surtitre hero-surtitre">Réservez. Séjournez. Profitez.</span>
            <h1>Le confort d'un hôtel, la liberté d'un chez-soi</h1>
            <p>{String(etab.slogan || '').replace(/[.!\s]+$/, '')}. Appartements et villas entièrement équipés, réservés en quelques minutes, sans paiement avant notre confirmation.</p>
          </div>
        </div>
      </section>

      {/* Recherche par dates */}
      <div className="container">
        <form className="home-recherche" onSubmit={chercher} aria-label="Rechercher une résidence disponible">
          <label className="hr-champ">
            <span><FaCalendarAlt aria-hidden="true" /> Arrivée</span>
            <input type="date" min={aujourdHui} value={recherche.arrivee} onChange={maj('arrivee')} />
          </label>
          <label className="hr-champ">
            <span><FaCalendarAlt aria-hidden="true" /> Départ</span>
            <input type="date" min={departMin} value={recherche.depart} onChange={maj('depart')} />
          </label>
          <label className="hr-champ">
            <span><FaUsers aria-hidden="true" /> Personnes</span>
            <select value={recherche.personnes} onChange={maj('personnes')}>
              {[1, 2, 3, 4, 5, 6, 7, 8].map(n => <option key={n} value={n}>{n} personne{n > 1 ? 's' : ''}</option>)}
            </select>
          </label>
          <label className="hr-champ">
            <span><FaMapMarkerAlt aria-hidden="true" /> Quartier</span>
            <select value={recherche.quartier} onChange={maj('quartier')}>
              <option value="">Tous les quartiers</option>
              {quartiers.map(q => <option key={q} value={q}>{q}</option>)}
            </select>
          </label>
          <button type="submit" className="btn btn-primary hr-bouton">
            <FaSearch aria-hidden="true" /> Voir les disponibilités
          </button>
        </form>

        {/* Chiffres clés */}
        {residences.length > 0 && (
          <ul className="home-chiffres">
            <li><b>{residences.length}</b><span>résidences meublées</span></li>
            <li><b>{quartiers.length}</b><span>quartiers d'Abidjan</span></li>
            {noteMoyenne && <li><b>{noteMoyenne}<small>/5</small></b><span>note moyenne</span></li>}
            <li><b>0 FCFA</b><span>à payer avant confirmation</span></li>
          </ul>
        )}
      </div>

      {/* Résidences mises en avant */}
      <section className="featured-residences">
        <div className="container">
          <div className="section-header">
            <span className="surtitre">Disponibles en ce moment</span>
            <h2>Nos résidences</h2>
            <p>Une sélection de logements prêts à vous accueillir, du studio à la villa.</p>
          </div>
          <div className="rc-grille featured-grid">
            {vedettes.map((residence, i) => (
              <ResidenceCard key={residence.id} residence={residence} eager={i < 3} />
            ))}
          </div>
          <div className="view-all-container">
            <Link to="/residences" className="btn btn-outline btn-large">
              Voir les {residences.length || ''} résidences
              <FaArrowRight />
            </Link>
          </div>
        </div>
      </section>

      {/* Atouts */}
      <section className="features">
        <div className="container">
          <div className="section-header">
            <span className="surtitre">Pourquoi choisir BABI RESIDENCE</span>
            <h2>Un séjour sans souci</h2>
          </div>
          <div className="features-grid">
            <div className="feature-card">
              <span className="feature-icone"><FaCouch /></span>
              <h3>Entièrement équipées</h3>
              <p>Climatisation, WiFi, cuisine équipée : vous posez vos valises, tout est prêt.</p>
            </div>
            <div className="feature-card">
              <span className="feature-icone"><FaMapMarkedAlt /></span>
              <h3>Quartiers recherchés</h3>
              <p>Cocody, Plateau, Riviera… au plus près des affaires et des loisirs.</p>
            </div>
            <div className="feature-card">
              <span className="feature-icone"><FaShieldAlt /></span>
              <h3>Paiement sécurisé</h3>
              <p>Acompte réglé par PI-SPI (BCEAO) seulement après notre confirmation.</p>
            </div>
            <div className="feature-card">
              <span className="feature-icone"><FaHeadset /></span>
              <h3>Une équipe disponible</h3>
              <p>Un interlocuteur joignable avant et pendant votre séjour.</p>
            </div>
          </div>
        </div>
      </section>

      {/* Appel à l'action */}
      <section className="cta">
        <div className="container">
          <div className="cta-content">
            <h2>Votre prochain séjour commence ici</h2>
            <p>Choisissez vos dates : nous confirmons la disponibilité, puis vous réglez l'acompte en toute sécurité.</p>
            <div className="cta-boutons">
              <Link to="/residences" className="btn btn-gold btn-large">
                Réserver une résidence
                <FaArrowRight />
              </Link>
              {etab.telephone && (
                <a href={`tel:${String(etab.telephone).replace(/[^\d+]/g, '')}`} className="btn btn-large cta-tel">
                  <FaPhone aria-hidden="true" /> {etab.telephone}
                </a>
              )}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};

export default Home;
