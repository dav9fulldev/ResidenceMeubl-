import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { FaArrowRight } from 'react-icons/fa';
import { useResidences } from '../context/ResidencesContext';
import ResidenceCard from '../components/ResidenceCard';
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
  const { residences } = useResidences();
  // Prendre les 3 premières résidences comme vedettes
  const featuredResidences = residences.slice(0, 3);

  return (
    <div className="home">
      {/* Section Héro */}
      <section className="hero">
        {/* Vidéo en arrière-plan */}
        <HeroVideo />
        
        {/* Overlay sombre */}
        <div className="hero-overlay"></div>
        
        <div className="hero-content">
          <div className="hero-text">
            <h1>Découvrez le Luxe et le Confort</h1>
            <p>Des résidences meublées d'exception au cœur de la Côte d'Ivoire. 
               Votre séjour parfait commence ici.</p>
            <div className="hero-buttons">
              <Link to="/residences" className="btn btn-primary">
                Voir nos résidences
                <FaArrowRight />
              </Link>
              <Link to="/residences" className="btn btn-secondary">
                Réserver maintenant
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Section Avantages */}
      <section className="features">
        <div className="container">
          <h2>Pourquoi choisir Sankofart Résidence ?</h2>
          <div className="features-grid">
            <div className="feature-card">
              <div className="feature-icon">🏠</div>
              <h3>Résidences de Qualité</h3>
              <p>Des appartements meublés avec soin, offrant tout le confort moderne.</p>
            </div>
            <div className="feature-card">
              <div className="feature-icon">📍</div>
              <h3>Emplacements Premium</h3>
              <p>Situées dans les meilleurs quartiers d'Abidjan, proches de tout.</p>
            </div>
            <div className="feature-card">
              <div className="feature-icon">🔒</div>
              <h3>Sécurité Garantie</h3>
              <p>Environnements sécurisés avec surveillance 24h/24 pour votre tranquillité.</p>
            </div>
            <div className="feature-card">
              <div className="feature-icon">💎</div>
              <h3>Service Premium</h3>
              <p>Une équipe dédiée pour répondre à tous vos besoins et demandes.</p>
            </div>
          </div>
        </div>
      </section>

      {/* Section Résidences Vedettes */}
      <section className="featured-residences">
        <div className="container">
          <div className="section-header">
            <h2>Nos Résidences Vedettes</h2>
            <p>Découvrez une sélection de nos meilleures résidences</p>
          </div>
          
          <div className="rc-grille featured-grid">
            {featuredResidences.map((residence) => (
              <ResidenceCard key={residence.id} residence={residence} />
            ))}
          </div>

          <div className="view-all-container">
            <Link to="/residences" className="btn btn-secondary btn-large">
              Voir toutes nos résidences
              <FaArrowRight />
            </Link>
          </div>
        </div>
      </section>

      {/* Section CTA */}
      <section className="cta">
        <div className="container">
          <div className="cta-content">
            <h2>Prêt pour un séjour inoubliable ?</h2>
            <p>Réservez dès maintenant votre résidence de luxe et profitez d'un confort exceptionnel.</p>
            <Link to="/residences" className="btn btn-primary btn-large">
              Réserver maintenant
              <FaArrowRight />
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
};

export default Home;
