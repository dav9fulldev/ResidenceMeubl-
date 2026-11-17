import { useCallback, useEffect, useRef, useState } from 'react';

const getRecognitionClass = () =>
  typeof window !== 'undefined' && (window.SpeechRecognition || window.webkitSpeechRecognition);

const MESSAGES_ERREUR = {
  'not-allowed': 'Autorisez l\'accès au micro dans votre navigateur pour parler.',
  'service-not-allowed': 'Autorisez l\'accès au micro dans votre navigateur pour parler.',
  'no-speech': 'Je n\'ai rien entendu. Appuyez sur le micro et parlez.',
  'audio-capture': 'Aucun micro détecté sur cet appareil.',
  network: 'La reconnaissance vocale nécessite une connexion internet.',
};

/**
 * Dictée vocale avec la Web Speech API du navigateur (gratuit, sans clé).
 * - onInterim(texte) : texte en cours de dictée (affiché en direct)
 * - onFinal(texte)   : phrase terminée
 */
export default function useVoiceInput({ lang = 'fr-FR', onInterim, onFinal }) {
  const [listening, setListening] = useState(false);
  const [error, setError] = useState('');
  const recognitionRef = useRef(null);
  const callbacks = useRef({ onInterim, onFinal });
  callbacks.current = { onInterim, onFinal };

  const supported = Boolean(getRecognitionClass());

  const stop = useCallback(() => {
    recognitionRef.current?.stop();
  }, []);

  const start = useCallback(() => {
    const Recognition = getRecognitionClass();
    if (!Recognition) return;

    recognitionRef.current?.abort();
    const recognition = new Recognition();
    recognition.lang = lang;
    recognition.interimResults = true;
    recognition.continuous = false; // s'arrête tout seul à la fin de la phrase
    recognition.maxAlternatives = 1;

    let texteFinal = '';

    recognition.onstart = () => {
      setError('');
      setListening(true);
    };
    recognition.onresult = (event) => {
      let interim = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) texteFinal += transcript;
        else interim += transcript;
      }
      callbacks.current.onInterim?.((texteFinal + interim).trim());
    };
    recognition.onerror = (event) => {
      if (event.error !== 'aborted') {
        setError(MESSAGES_ERREUR[event.error] || 'La dictée vocale a échoué, réessayez ou écrivez votre demande.');
      }
    };
    recognition.onend = () => {
      setListening(false);
      recognitionRef.current = null;
      if (texteFinal.trim()) callbacks.current.onFinal?.(texteFinal.trim());
    };

    recognitionRef.current = recognition;
    try {
      recognition.start();
    } catch {
      setError('Impossible de démarrer le micro, réessayez.');
    }
  }, [lang]);

  // Couper le micro si le composant disparaît
  useEffect(() => () => recognitionRef.current?.abort(), []);

  return { supported, listening, error, start, stop };
}
