import React, { useState, useEffect } from 'react';
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

        {/* Grille des résidences */}
        {displayed.length > 0 ? (
          <div className="rc-grille">
            {displayed.map((residence, index) => (
              <ResidenceCard
                key={residence.id}
                residence={residence}
                eager={index < 3}
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
