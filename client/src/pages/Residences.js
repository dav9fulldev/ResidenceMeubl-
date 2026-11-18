import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { FaCalendarAlt, FaTimes } from 'react-icons/fa';
import { API_ENDPOINTS } from '../config/api';
import { useResidences } from '../context/ResidencesContext';
import SmartSearch, { CriteresCompris } from '../components/SmartSearch';
import ResidenceCard from '../components/ResidenceCard';
import './Residences.css';

const Residences = () => {
  const [searchQuery, setSearchQuery] = useState('');
  const [filters, setFilters] = useState({
    priceMin: '',
    priceMax: '',
    bedrooms: '',
    city: '',
    availability: ''
  });
  const [showFilters, setShowFilters] = useState(false);
  // Résultat de la recherche intelligente (null = liste classique)
  const [aiResult, setAiResult] = useState(null);
  const { residences, searchResidences } = useResidences();
  const [filteredResidences, setFilteredResidences] = useState(residences);

  // Critères venus de la recherche de l'accueil : dates, personnes, quartier
  const [params, setParams] = useSearchParams();
  const arrivee = params.get('arrivee') || '';
  const depart = params.get('depart') || '';
  const personnes = Number(params.get('personnes')) || 0;
  const quartier = params.get('quartier') || '';
  const [libres, setLibres] = useState(null); // ids libres sur les dates (null = pas de dates)
  const [verifDates, setVerifDates] = useState(false);

  useEffect(() => {
    if (!arrivee || !depart) { setLibres(null); return undefined; }
    let actif = true;
    setVerifDates(true);
    fetch(`${API_ENDPOINTS.residences.available}?arrivee=${arrivee}&depart=${depart}`)
      .then(r => (r.ok ? r.json() : null))
      .then(j => { if (actif) setLibres(j?.data?.ids ? new Set(j.data.ids.map(Number)) : null); })
      .catch(() => { if (actif) setLibres(null); })
      .finally(() => { if (actif) setVerifDates(false); });
    return () => { actif = false; };
  }, [arrivee, depart]);

  const criteres = (r) => (!libres || libres.has(Number(r.id)))
    && (!personnes || Number(r.maxGuests) >= personnes)
    && (!quartier || r.neighborhood === quartier);
  const effacerCriteres = () => setParams({}, { replace: true });
  const dateLisible = (d) => new Date(`${d}T00:00:00`).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' });
  const requete = new URLSearchParams(Object.entries({ arrivee, depart, personnes: personnes || '' }).filter(([, v]) => v)).toString();

  // Filtrage en direct pour un ou deux mots (« Cocody », « studio »).
  // Une phrase complète n'est pas filtrée mot à mot : elle part à l'IA avec Entrée.
  const motsSignificatifs = searchQuery.trim().split(/\s+/).filter(m => m.length > 2);
  const estUnePhrase = motsSignificatifs.length > 2;
  const rechercheDirecte = estUnePhrase ? '' : searchQuery;

  useEffect(() => {
    setFilteredResidences(searchResidences(rechercheDirecte, filters));
  }, [rechercheDirecte, filters, searchResidences, residences]);

  // Liste affichée : résultats IA (ou suggestions proches), auxquels s'appliquent aussi les filtres
  const idsFiltres = new Set(searchResidences('', filters).map(r => r.id));
  const displayed = aiResult
    ? (aiResult.resultats.length > 0 ? aiResult.resultats : aiResult.suggestions).filter(r => idsFiltres.has(r.id))
    : filteredResidences;
  const affichees = displayed.filter(criteres);
  const activeFilters = Object.values(filters).filter(v => v !== '' && v !== null && v !== undefined).length;

  const handleFilterChange = (e) => {
    const { name, value } = e.target;
    setFilters(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const clearFilters = () => {
    setFilters({
      priceMin: '',
      priceMax: '',
      bedrooms: '',
      city: '',
      availability: ''
    });
    setSearchQuery('');
    setAiResult(null);
    setParams({}, { replace: true });
  };

  const cities = [...new Set(residences.map(r => r.city))];
  const bedroomOptions = [1, 2, 3, 4, 5];

  return (
    <div className="residences-page">
      <div className="container">
        {/* En-tête de la page */}
        <div className="page-header">
          <h1>Nos Résidences</h1>
          <p>Découvrez notre sélection de résidences meublées d'exception</p>
        </div>

        {/* Barre de recherche unique : filtrage en direct + IA (Entrée, Trouver, micro) */}
        <SmartSearch
          query={searchQuery}
          onQueryChange={setSearchQuery}
          onResult={setAiResult}
          active={Boolean(aiResult)}
          onToggleFilters={() => setShowFilters(v => !v)}
          filtersOpen={showFilters}
          activeFilters={activeFilters}
        />

        {/* Panneau de filtres */}
        {showFilters && (
          <div className="filters-panel">
            <div className="filters-grid">
              <div className="filter-group">
                <label>Prix minimum (FCFA)</label>
                <input
                  type="number"
                  name="priceMin"
                  value={filters.priceMin}
                  onChange={handleFilterChange}
                  placeholder="0"
                  className="filter-input"
                />
              </div>

              <div className="filter-group">
                <label>Prix maximum (FCFA)</label>
                <input
                  type="number"
                  name="priceMax"
                  value={filters.priceMax}
                  onChange={handleFilterChange}
                  placeholder="100000"
                  className="filter-input"
                />
              </div>

              <div className="filter-group">
                <label>Nombre de chambres</label>
                <select
                  name="bedrooms"
                  value={filters.bedrooms}
                  onChange={handleFilterChange}
                  className="filter-select"
                >
                  <option value="">Toutes</option>
                  {bedroomOptions.map(num => (
                    <option key={num} value={num}>{num}+ chambres</option>
                  ))}
                </select>
              </div>

              <div className="filter-group">
                <label>Ville</label>
                <select
                  name="city"
                  value={filters.city}
                  onChange={handleFilterChange}
                  className="filter-select"
                >
                  <option value="">Toutes les villes</option>
                  {cities.map(city => (
                    <option key={city} value={city}>{city}</option>
                  ))}
                </select>
              </div>

              <div className="filter-group">
                <label>Disponibilité</label>
                <select
                  name="availability"
                  value={filters.availability}
                  onChange={handleFilterChange}
                  className="filter-select"
                >
                  <option value="">Toutes les disponibilités</option>
                  <option value="disponible">Disponible</option>
                  <option value="occupé">Occupé</option>
                  <option value="réservé">Réservé</option>
                  <option value="maintenance">Maintenance</option>
                </select>
              </div>
            </div>

            <div className="filters-actions">
              <button className="btn btn-secondary" onClick={clearFilters}>
                Effacer les filtres
              </button>
            </div>
          </div>
        )}

        {/* Résultats de recherche */}
        {aiResult ? (
          <CriteresCompris result={aiResult} count={displayed.length} />
        ) : (
        <div className="results-info">
          <p>
            {filteredResidences.length} résidence{filteredResidences.length > 1 ? 's' : ''} trouvée{filteredResidences.length > 1 ? 's' : ''}
            {rechercheDirecte && ` pour "${rechercheDirecte}"`}
            {estUnePhrase && ' · appuyez sur Entrée pour lancer la recherche intelligente ✨'}
          </p>
        </div>
        )}

        {(arrivee || personnes || quartier) && (
          <div className="criteres-actifs" role="status">
            <FaCalendarAlt aria-hidden="true" />
            <p>
              {arrivee && depart ? <>Libres du <b>{dateLisible(arrivee)}</b> au <b>{dateLisible(depart)}</b></> : 'Toutes dates'}
              {personnes ? <> · <b>{personnes} personne{personnes > 1 ? 's' : ''}</b></> : null}
              {quartier ? <> · <b>{quartier}</b></> : null}
              {verifDates ? ' · vérification…' : ` · ${affichees.length} résultat${affichees.length > 1 ? 's' : ''}`}
            </p>
            <button type="button" className="criteres-effacer" onClick={effacerCriteres}><FaTimes aria-hidden="true" /> Effacer</button>
          </div>
        )}

        {/* Grille des résidences */}
        {affichees.length > 0 ? (
          <div className="rc-grille">
            {affichees.map((residence, index) => (
              <ResidenceCard
                key={residence.id}
                residence={residence}
                eager={index < 3}
                requete={requete}
                libreAuxDates={Boolean(libres)}
                badge={aiResult?.mode === 'ia' && aiResult.resultats.length > 0
                  ? (residence.id === displayed[0].id
                    ? '✨ Meilleur choix'
                    : `✨ Correspondance ${Math.round(Math.max(0, residence.score) / displayed[0].score * 100)} %`)
                  : null}
              />
            ))}
          </div>
        ) : (
          <div className="no-results">
            <div className="no-results-content">
              <h3>Aucune résidence trouvée</h3>
              <p>
                {searchQuery 
                  ? `Aucune résidence ne correspond à votre recherche "${searchQuery}"`
                  : 'Aucune résidence ne correspond à vos critères de filtrage'
                }
              </p>
              <button className="btn btn-primary" onClick={clearFilters}>
                Effacer les filtres
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default Residences;
