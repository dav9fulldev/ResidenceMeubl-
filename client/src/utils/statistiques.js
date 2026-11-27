import { API_ENDPOINTS } from '../config/api';

/**
 * Statistiques d'audience (résultats des boosters) : affichages des annonces et visites des fiches.
 * Envoi groupé, sans cookie ni donnée personnelle ; jamais bloquant.
 * Une annonce n'est comptée qu'une fois par page vue ; une fiche une fois par session.
 */
const enAttente = [];
const vusSurLaPage = new Set();
let minuterie = null;

const envoyer = (corps, quitter = false) => {
  try {
    fetch(API_ENDPOINTS.residences.stats, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corps), keepalive: quitter,
    }).catch(() => {});
  } catch { /* hors ligne : tant pis */ }
};

const vider = (quitter = false) => {
  clearTimeout(minuterie);
  minuterie = null;
  if (!enAttente.length) return;
  envoyer({ affichages: enAttente.splice(0, 50) }, quitter);
  if (enAttente.length) vider(quitter);
};

if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', () => vider(true));
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') vider(true); });
}

/** Une annonce (carte) est visible à l'écran */
export const compterAffichage = (id, sponsorise, cle) => {
  const k = `${cle || window.location.pathname + window.location.search}:${id}`;
  if (vusSurLaPage.has(k)) return;
  vusSurLaPage.add(k);
  enAttente.push({ id: Number(id), s: Boolean(sponsorise) });
  if (enAttente.length >= 50) vider();
  else if (!minuterie) minuterie = setTimeout(() => vider(), 4000);
};

/** La fiche d'une résidence est ouverte */
export const compterVisite = (id) => {
  const cle = `visite:${id}`;
  try {
    if (sessionStorage.getItem(cle)) return;
    sessionStorage.setItem(cle, '1');
  } catch { /* stockage indisponible : compté quand même */ }
  envoyer({ visite: Number(id) });
};
