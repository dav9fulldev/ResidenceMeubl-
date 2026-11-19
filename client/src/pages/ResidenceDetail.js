import React, { useState, useEffect } from 'react';
import { useParams, Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  FaStar, FaBed, FaBath, FaUsers, FaMapMarkerAlt, FaArrowLeft, FaCheck, FaHeart, FaRegHeart,
  FaChevronLeft, FaChevronRight, FaWifi, FaSnowflake, FaUtensils, FaShieldAlt, FaParking, FaLeaf,
  FaSwimmingPool, FaArrowsAltV, FaTv, FaFan, FaConciergeBell, FaDumbbell, FaPaintBrush, FaMountain,
  FaChair, FaTimes, FaImages, FaShower,
} from 'react-icons/fa';
import { useResidences } from '../context/ResidencesContext';
import { useFavorites } from '../context/FavoritesContext';
import AvailabilityStatus from '../components/AvailabilityStatus';
import SimilarResidences from '../components/SimilarResidences';
import NotFound from './NotFound';
import './ResidenceDetail.css';

// Icône d'un équipement d'après son nom
const ICONES_EQUIPEMENTS = [
  [/wifi|internet/i, FaWifi], [/clim/i, FaSnowflake], [/cuisine/i, FaUtensils], [/s[ée]curit|gardien/i, FaShieldAlt],
  [/parking|garage/i, FaParking], [/jardin/i, FaLeaf], [/piscine/i, FaSwimmingPool], [/ascenseur/i, FaArrowsAltV],
  [/tv|t[ée]l[ée]/i, FaTv], [/ventil/i, FaFan], [/concierg|service/i, FaConciergeBell], [/sport|gym/i, FaDumbbell],
  [/d[ée]co/i, FaPaintBrush], [/vue/i, FaMountain], [/terrasse|balcon/i, FaChair], [/douche|bain/i, FaShower],
];
const iconeEquipement = (nom) => (ICONES_EQUIPEMENTS.find(([re]) => re.test(nom))?.[1]) || FaCheck;

const ResidenceDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { getResidenceById, loading } = useResidences();
  const [activeImage, setActiveImage] = useState(0);
  const [visionneuse, setVisionneuse] = useState(false);
  const [params] = useSearchParams();
  const aujourdHui = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  const [dates, setDates] = useState({ arrivee: params.get('arrivee') || '', depart: params.get('depart') || '', personnes: params.get('personnes') || '' });
  const { addToFavorites, removeFromFavorites, isFavorite } = useFavorites();

  const residence = loading ? null : getResidenceById(id);

  useEffect(() => {
    setActiveImage(0);
    window.scrollTo(0, 0);
  }, [id]);

  // Visionneuse plein écran : flèches du clavier et Échap
  useEffect(() => {
    if (!visionneuse) return undefined;
    const n = residence?.images?.length || 1;
    const touche = (e) => {
      if (e.key === 'Escape') setVisionneuse(false);
      if (e.key === 'ArrowRight') setActiveImage(i => (i + 1) % n);
      if (e.key === 'ArrowLeft') setActiveImage(i => (i - 1 + n) % n);
    };
    document.addEventListener('keydown', touche);
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', touche); document.body.style.overflow = ''; };
  }, [visionneuse, residence]);

  useEffect(() => {
    if (residence) document.title = `${residence.name} · BABI RESIDENCE`;
  }, [residence]);

  if (loading) {
    return (
      <div className="residence-detail-page" aria-busy="true">
        <div className="container">
          <div className="rd-squelette rd-squelette-titre" />
          <div className="rd-squelette rd-squelette-photo" />
          <p className="rd-chargement">Chargement de la résidence…</p>
        </div>
      </div>
    );
  }

  if (!residence) {
    return <NotFound titre="Résidence introuvable" message="Cette résidence n'existe pas ou n'est plus proposée. Découvrez nos autres résidences disponibles." />;
  }

  const favori = isFavorite(residence.id);
  const images = residence.images?.length ? residence.images : [];
  const enMaintenance = residence.availability?.status === 'maintenance';
  const minStay = residence.availability?.minStay || 1;
  const nuits = dates.arrivee && dates.depart && dates.depart > dates.arrivee
    ? Math.round((Date.parse(`${dates.depart}T00:00:00Z`) - Date.parse(`${dates.arrivee}T00:00:00Z`)) / 86400000) : 0;
  const reserver = () => {
    const q = new URLSearchParams({ residence: residence.id });
    if (dates.arrivee && dates.depart && dates.depart > dates.arrivee) { q.set('arrivee', dates.arrivee); q.set('depart', dates.depart); }
    if (dates.personnes) q.set('personnes', dates.personnes);
    navigate(`/reservation?${q.toString()}`);
  };
  const departMin = (() => {
    if (!dates.arrivee) return aujourdHui;
    const d = new Date(`${dates.arrivee}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + minStay);
    return d.toISOString().slice(0, 10);
  })();
  const ouvrir = (i) => { setActiveImage(i); setVisionneuse(true); };
  const basculerFavori = () => (favori ? removeFromFavorites(residence.id) : addToFavorites(residence));
  const changerImage = (pas) => setActiveImage(i => (i + pas + images.length) % images.length);
  const prix = `${Number(residence.price).toLocaleString('fr-FR')} ${residence.currency || 'FCFA'}`;

  return (
    <div className="residence-detail-page">
      <div className="container">
        <Link to="/residences" className="rd-retour">
          <FaArrowLeft aria-hidden="true" /> Toutes les résidences
        </Link>

        {/* En-tête */}
        <header className="rd-entete">
          <div>
            <h1>{residence.name}</h1>
            <p className="rd-sous-titre">
              {residence.rating ? (
                <span className="rd-note"><FaStar aria-hidden="true" /> {residence.rating}{residence.reviews ? ` · ${residence.reviews} avis` : ''}</span>
              ) : null}
              <span><FaMapMarkerAlt aria-hidden="true" /> {residence.location}{residence.neighborhood ? `, ${residence.neighborhood}` : ''}</span>
              {residence.reference && <span className="rd-ref">Réf. {residence.reference}</span>}
            </p>
          </div>
          <button
            type="button"
            className={`rd-favori ${favori ? 'actif' : ''}`}
            onClick={basculerFavori}
            aria-pressed={favori}
          >
            {favori ? <FaHeart aria-hidden="true" /> : <FaRegHeart aria-hidden="true" />}
            <span>{favori ? 'Dans vos favoris' : 'Ajouter aux favoris'}</span>
          </button>
        </header>

        {/* Galerie en mosaïque */}
        {images.length > 0 && (
          <div className={`rd-mosaique n${Math.min(images.length, 5)}`}>
            {images.slice(0, 5).map((image, i) => (
              <button type="button" key={i} className={`rd-tuile t${i}`} onClick={() => ouvrir(i)} aria-label={`Agrandir la photo ${i + 1} sur ${images.length}`}>
                <img src={image} alt={i === 0 ? residence.name : ''} loading={i === 0 ? 'eager' : 'lazy'} />
                {i === 4 && images.length > 5 && <span className="rd-plus">+{images.length - 5}</span>}
              </button>
            ))}
            <button type="button" className="rd-toutes" onClick={() => ouvrir(0)}><FaImages aria-hidden="true" /> {images.length} photo{images.length > 1 ? 's' : ''}</button>
          </div>
        )}

        {/* Visionneuse plein écran */}
        {visionneuse && images.length > 0 && (
          <div className="rd-visionneuse" role="dialog" aria-modal="true" aria-label={`Photos de ${residence.name}`} onClick={() => setVisionneuse(false)}>
            <button type="button" className="rd-v-fermer" onClick={() => setVisionneuse(false)} aria-label="Fermer"><FaTimes /></button>
            <img src={images[activeImage]} alt={`${residence.name}, photo ${activeImage + 1} sur ${images.length}`} onClick={(e) => e.stopPropagation()} />
            {images.length > 1 && (
              <>
                <button type="button" className="rd-fleche gauche" onClick={(e) => { e.stopPropagation(); changerImage(-1); }} aria-label="Photo précédente"><FaChevronLeft /></button>
                <button type="button" className="rd-fleche droite" onClick={(e) => { e.stopPropagation(); changerImage(1); }} aria-label="Photo suivante"><FaChevronRight /></button>
              </>
            )}
            <span className="rd-v-compteur">{activeImage + 1} / {images.length}</span>
          </div>
        )}

        <div className="rd-colonnes">
          <div className="rd-principal">
            {/* Caractéristiques */}
            <ul className="rd-specs">
              <li><FaBed aria-hidden="true" /><strong>{residence.bedrooms}</strong> chambre{residence.bedrooms > 1 ? 's' : ''}</li>
              <li><FaBath aria-hidden="true" /><strong>{residence.bathrooms}</strong> salle{residence.bathrooms > 1 ? 's' : ''} de bain</li>
              <li><FaUsers aria-hidden="true" /><strong>{residence.maxGuests}</strong> personne{residence.maxGuests > 1 ? 's' : ''} max</li>
              {residence.area && <li><span className="rd-m2" aria-hidden="true">m²</span><strong>{residence.area}</strong> m²</li>}
            </ul>

            <section className="rd-section">
              <h2>Description</h2>
              <p>{residence.description}</p>
            </section>

            {residence.amenities?.length > 0 && (
              <section className="rd-section">
                <h2>Équipements et services</h2>
                <ul className="rd-equipements">
                  {residence.amenities.map((amenity, index) => {
                    const Icone = iconeEquipement(amenity);
                    return <li key={index}><span className="rd-eq-icone"><Icone aria-hidden="true" /></span>{amenity}</li>;
                  })}
                </ul>
              </section>
            )}

            <section className="rd-section">
              <h2>Emplacement</h2>
              <p className="rd-lieu"><FaMapMarkerAlt aria-hidden="true" /> {residence.location}<br />
                <span>{[residence.neighborhood, residence.city].filter(Boolean).join(', ')}</span>
              </p>
            </section>
          </div>

          {/* Réservation (colonne qui reste visible sur ordinateur) */}
          <aside className="rd-reservation" aria-label="Réservation">
            <p className="rd-prix"><strong>{prix}</strong> / {residence.period || 'nuit'}</p>
            <p className="rd-prix-note">Prix par nuit, taxes incluses · séjour de {minStay} à {residence.availability?.maxStay || 30} nuits</p>
            {!enMaintenance && (
              <div className="rd-choix">
                <label><span>Arrivée</span><input type="date" min={aujourdHui} value={dates.arrivee}
                  onChange={(e) => setDates(d => ({ ...d, arrivee: e.target.value, depart: d.depart && d.depart <= e.target.value ? '' : d.depart }))} /></label>
                <label><span>Départ</span><input type="date" min={departMin} value={dates.depart} onChange={(e) => setDates(d => ({ ...d, depart: e.target.value }))} /></label>
                <label className="large"><span>Personnes</span>
                  <select value={dates.personnes} onChange={(e) => setDates(d => ({ ...d, personnes: e.target.value }))}>
                    <option value="">Choisir</option>
                    {Array.from({ length: residence.maxGuests || 4 }, (_, i) => i + 1).map(n => <option key={n} value={n}>{n} personne{n > 1 ? 's' : ''}</option>)}
                  </select>
                </label>
              </div>
            )}
            {nuits > 0 && (
              <p className="rd-total"><span>{prix} × {nuits} nuit{nuits > 1 ? 's' : ''}</span><b>{(nuits * Number(residence.price)).toLocaleString('fr-FR')} FCFA</b></p>
            )}
            <AvailabilityStatus availability={residence.availability} onReserve={reserver} />
            {!enMaintenance && <p className="rd-rassurance">Aucun paiement avant notre confirmation</p>}
          </aside>
        </div>

        <SimilarResidences residenceId={residence.id} />
      </div>

      {/* Téléphone : barre de réservation fixe */}
      <div className="rd-barre">
        <p><strong>{prix}</strong><span> / {residence.period || 'nuit'}</span></p>
        <button type="button" className="btn btn-primary" onClick={reserver} disabled={enMaintenance}>
          {enMaintenance ? 'En maintenance' : 'Réserver'}
        </button>
      </div>
    </div>
  );
};

export default ResidenceDetail;
