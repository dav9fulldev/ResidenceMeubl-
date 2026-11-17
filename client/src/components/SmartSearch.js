import React, { useState } from 'react';
import { FaMagic, FaTimes, FaMicrophone, FaStop, FaSearch, FaFilter } from 'react-icons/fa';
import { useResidences } from '../context/ResidencesContext';
import useVoiceInput from '../hooks/useVoiceInput';
import './SmartSearch.css';

const EXEMPLES = [
  'Une villa avec jardin pour une famille de 6',
  'Studio calme pas cher, moins de 30 000 FCFA',
  'Appartement avec vue sur la mer pour 2',
  'Luxury apartment for a business trip',
];

/**
 * Barre de recherche unique.
 * - Saisie : la page filtre la liste en direct (mots-clés), via onQueryChange
 * - Entrée, bouton « Trouver » ou micro : recherche IA, résultat transmis à onResult
 * onResult(null) revient à la liste classique.
 */
const SmartSearch = ({ query, onQueryChange, onResult, active, onToggleFilters, filtersOpen, activeFilters = 0 }) => {
  const { smartSearch, offline } = useResidences();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const lancer = async (texte) => {
    const q = (texte ?? query).trim();
    if (q.length < 3) return;
    onQueryChange(q);
    setLoading(true);
    setError('');
    try {
      onResult({ question: q, ...(await smartSearch(q)) });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Dictée vocale : le texte s'écrit en direct, la recherche part à la fin de la phrase
  const voice = useVoiceInput({
    lang: 'fr-FR',
    onInterim: onQueryChange,
    onFinal: (texte) => lancer(texte),
  });

  const changerTexte = (valeur) => {
    onQueryChange(valeur);
    setError('');
    if (active) onResult(null); // on modifie la phrase : retour au filtrage en direct
  };

  const effacer = () => {
    changerTexte('');
  };

  const iaDisponible = !offline;

  return (
    <section className="smart-search" aria-labelledby="smart-search-title">
      <h2 id="smart-search-title"><FaMagic /> Trouvez votre résidence</h2>
      <p className="smart-search-hint">
        Tapez un quartier ou un type de logement, ou décrivez votre séjour
        {voice.supported && iaDisponible ? ' (à l\'écrit ou au micro)' : ''} : notre IA trouve les résidences qui correspondent.
      </p>

      <form
        className="smart-search-form"
        role="search"
        onSubmit={(e) => { e.preventDefault(); if (iaDisponible) lancer(); }}
      >
        <div className={`smart-search-input ${voice.listening ? 'listening' : ''}`}>
          <FaSearch className="smart-search-icon" aria-hidden="true" />
          <input
            type="search"
            value={query}
            onChange={(e) => changerTexte(e.target.value)}
            placeholder={voice.listening
              ? 'Je vous écoute…'
              : 'Quartier, type ou décrivez votre séjour…'}
            maxLength={300}
            aria-label="Rechercher une résidence"
            enterKeyHint="search"
          />
          {query && !voice.listening && (
            <button type="button" className="clear-button" onClick={effacer} aria-label="Effacer la recherche">
              <FaTimes />
            </button>
          )}
          {voice.supported && iaDisponible && (
            <button
              type="button"
              className={`mic-button ${voice.listening ? 'active' : ''}`}
              onClick={voice.listening ? voice.stop : voice.start}
              disabled={loading}
              aria-pressed={voice.listening}
              aria-label={voice.listening ? 'Arrêter la dictée' : 'Dicter votre recherche'}
              title={voice.listening
                ? 'Arrêter la dictée'
                : 'Dicter votre recherche (la voix est transcrite par le service de reconnaissance vocale de votre navigateur)'}
            >
              {voice.listening ? <FaStop /> : <FaMicrophone />}
            </button>
          )}
        </div>
        {iaDisponible && (
          <button type="submit" className="btn btn-primary" disabled={loading || query.trim().length < 3}>
            {loading ? 'Recherche…' : 'Trouver'}
          </button>
        )}
        <button
          type="button"
          className={`btn btn-outline filters-button ${filtersOpen ? 'open' : ''}`}
          onClick={onToggleFilters}
          aria-expanded={filtersOpen}
        >
          <FaFilter /> Filtres{activeFilters > 0 ? ` (${activeFilters})` : ''}
        </button>
      </form>

      {!active && !query && iaDisponible && (
        <div className="smart-search-examples">
          {EXEMPLES.map((ex) => (
            <button key={ex} type="button" className="example-chip" onClick={() => lancer(ex)} disabled={loading}>
              {ex}
            </button>
          ))}
        </div>
      )}

      {voice.listening && (
        <p className="voice-status" role="status">🎙️ Parlez… la recherche se lance quand vous vous arrêtez.</p>
      )}
      {(error || voice.error) && <div className="error-message" role="alert">{error || voice.error}</div>}
    </section>
  );
};

// Résumé des critères compris, affiché au-dessus des résultats
export const CriteresCompris = ({ result, count }) => {
  if (!result) return null;
  const { criteres, mode, resultats, question } = result;
  const nombre = count ?? resultats.length;
  const puces = [
    criteres.personnes && `${criteres.personnes} personne${criteres.personnes > 1 ? 's' : ''} ou plus`,
    criteres.chambres && `${criteres.chambres} chambre${criteres.chambres > 1 ? 's' : ''} ou plus`,
    criteres.budgetMax && `jusqu'à ${criteres.budgetMax.toLocaleString('fr-FR')} FCFA / nuit`,
  ].filter(Boolean);

  return (
    <div className="smart-search-summary">
      <p>
        {resultats.length > 0
          ? <>{nombre} résidence{nombre > 1 ? 's' : ''} pour « {question} », de la plus pertinente à la moins pertinente</>
          : <>Aucune résidence ne remplit tous vos critères. Voici les plus proches de « {question} » :</>}
      </p>
      {(puces.length > 0 || mode) && (
        <div className="criteria-chips">
          {puces.map((p) => <span key={p} className="criteria-chip">{p}</span>)}
          <span className={`mode-chip ${mode}`}>
            {mode === 'ia' ? '✨ Classement par IA' : 'Recherche par mots-clés'}
          </span>
        </div>
      )}
    </div>
  );
};

export default SmartSearch;
