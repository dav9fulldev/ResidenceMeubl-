import React from 'react';
import { Link } from 'react-router-dom';
import { FaStar, FaBed, FaBath, FaUsers, FaArrowRight, FaMapMarkerAlt } from 'react-icons/fa';
import { useResidences } from '../context/ResidencesContext';
import videoScript from '../assets/videos/video_script.mp4';
import './Home.css';

const Home = () => {
  const { residences } = useResidences();
  // Prendre les 3 premières résidences comme vedettes
  const featuredResidences = residences.slice(0, 3);

  return (
    <div className="home">
      {/* Section Héro */}
      <section className="hero">
        {/* Vidéo en arrière-plan */}
        <video 
          className="hero-video" 
          autoPlay 
          muted 
          loop 
          playsInline
          preload="auto"
          className="hero-video"
        >
          <source src={videoScript} type="video/mp4" />
          Votre navigateur ne supporte pas la lecture de vidéos.
        </video>
        
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
          
          <div className="residences-grid">
            {featuredResidences.map((residence) => (
              <div key={residence.id} className="residence-card">
                <div className="residence-image">
                  <img 
                    src={residence.images[0]} 
                    alt={residence.name}
                    className="residence-img"
                  />
                  
                  {/* Badge de disponibilité */}
                  <div className={`availability-badge ${residence.availability.status}`}>
                    {residence.availability.status === 'disponible' && <span>✓ Disponible</span>}
                    {residence.availability.status === 'occupé' && <span>👤 Occupé</span>}
                    {residence.availability.status === 'réservé' && <span>⏰ Réservé</span>}
                    {residence.availability.status === 'maintenance' && <span>🔧 Maintenance</span>}
                  </div>
                  
                  <div className="residence-badge">
                    <FaStar />
                    <span>{residence.rating}</span>
                  </div>
                </div>
                
                <div className="residence-content">
                  <h3>{residence.name}</h3>
                  <p className="residence-location">
                    <FaMapMarkerAlt />
                    {residence.location}
                  </p>
                  
                  <div className="residence-details">
                    <span><FaBed /> {residence.bedrooms} chambres</span>
                    <span><FaBath /> {residence.bathrooms} sdb</span>
                    <span><FaUsers /> {residence.maxGuests} pers.</span>
                  </div>
                  
                  <p className="residence-description">
                    {residence.description.substring(0, 100)}...
                  </p>
                  
                  <div className="residence-footer">
                    <div className="residence-price">
                      <span className="price">{residence.price.toLocaleString()}</span>
                      <span className="currency">{residence.currency}</span>
                      <span className="period">/{residence.period}</span>
                    </div>
                    
                    <div className="residence-actions">
                      <Link 
                        to={`/residence/${residence.id}`}
                        className="btn btn-outline"
                      >
                        Voir détails
                      </Link>
                      <Link 
                        to={`/reservation?residence=${residence.id}`}
                        className="btn btn-primary"
                      >
                        Réserver
                      </Link>
                    </div>
                  </div>
                </div>
              </div>
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
