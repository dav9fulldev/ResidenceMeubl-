import { useCallback, useEffect, useState } from 'react';

const lireThemeSauvegarde = () => {
  try {
    const t = localStorage.getItem('theme');
    return t === 'light' || t === 'dark' ? t : null;
  } catch {
    return null;
  }
};

const themeSysteme = () =>
  (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');

/**
 * Thème clair / sombre.
 * Par défaut : réglage du téléphone ou de l'ordinateur ; le choix du visiteur est mémorisé.
 */
export default function useTheme() {
  const [theme, setTheme] = useState(
    () => document.documentElement.getAttribute('data-theme') || lireThemeSauvegarde() || themeSysteme()
  );

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  // Suivre le système tant que le visiteur n'a rien choisi
  useEffect(() => {
    if (!window.matchMedia) return undefined;
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = (e) => {
      if (!lireThemeSauvegarde()) setTheme(e.matches ? 'dark' : 'light');
    };
    media.addEventListener?.('change', onChange);
    return () => media.removeEventListener?.('change', onChange);
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme((actuel) => {
      const suivant = actuel === 'dark' ? 'light' : 'dark';
      try { localStorage.setItem('theme', suivant); } catch { /* stockage indisponible */ }
      return suivant;
    });
  }, []);

  return { theme, toggleTheme };
}
