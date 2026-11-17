import React, { useState } from 'react';
import { FaMagic, FaTimes, FaMicrophone, FaStop } from 'react-icons/fa';
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
 * Recherche en langage naturel.
 * Appelle onResult({ question, mode, criteres, resultats, suggestions }) ou onResult(null) pour réinitialiser.
 */
const SmartSearch = ({ onResult, active }) => {
  const { smartSearch, offline } = useResidences();
  const [question, setQuestion] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const lancer = async (texte) => {
    const q = (texte ?? question).trim();
    if (q.length < 3) return;
    setQuestion(q);
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
    onInterim: setQuestion,
    onFinal: (texte) => lancer(texte),
  });

  const reinitialiser = () => {
    setQuestion('');
    setError('');
    onResult(null);
  };

  if (offline) return null;

  return (
    <section className="smart-search" aria-labelledby="smart-search-title">
      <h2 id="smart-search-title"><FaMagic /> Décrivez votre séjour idéal</h2>
      <p className="smart-search-hint">
        {voice.supported ? 'Écrivez ou dites' : 'Écrivez'} ce que vous cherchez : nombre de personnes, budget, ambiance, quartier… notre IA trouve les résidences qui correspondent.
      </p>

      <form
        className="smart-search-form"
        onSubmit={(e) => { e.preventDefault(); lancer(); }}
      >
        <div className={`smart-search-input ${voice.listening ? 'listening' : ''}`}>
          <input
            type="text"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder={voice.listening
              ? 'Je vous écoute…'
              : 'Ex. : un appartement calme pour 4 personnes près du Plateau, moins de 60 000 FCFA'}
            maxLength={300}
            aria-label="Décrivez votre recherche"
          />
          {voice.supported && (
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
        <button type="submit" className="btn btn-primary" disabled={loading || question.trim().length < 3}>
          {loading ? 'Recherche…' : 'Trouver'}
        </button>
        {active && (
          <button type="button" className="btn btn-outline" onClick={reinitialiser}>
            <FaTimes /> Tout afficher
          </button>
        )}
      </form>

      {!active && (
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
export const CriteresCompris = ({ result }) => {
  if (!result) return null;
  const { criteres, mode, resultats, question } = result;
  const puces = [
    criteres.personnes && `${criteres.personnes} personne${criteres.personnes > 1 ? 's' : ''} ou plus`,
    criteres.chambres && `${criteres.chambres} chambre${criteres.chambres > 1 ? 's' : ''} ou plus`,
    criteres.budgetMax && `jusqu'à ${criteres.budgetMax.toLocaleString('fr-FR')} FCFA / nuit`,
  ].filter(Boolean);

  return (
    <div className="smart-search-summary">
      <p>
        {resultats.length > 0
          ? <>{resultats.length} résidence{resultats.length > 1 ? 's' : ''} pour « {question} », de la plus pertinente à la moins pertinente</>
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
