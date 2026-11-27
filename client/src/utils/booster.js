/**
 * Booster de visibilité côté site public.
 * Un booster « tout le site » est déjà compté par le serveur (residence.sponsored, recommendation).
 * Un booster ciblé (quartier ou ville) ne s'applique qu'aux recherches de sa zone : residence.boost.
 */
const norm = (v) => String(v || '').trim().toLowerCase();

/** Le booster ciblé s'applique-t-il à cette recherche ? contexte = { ville, quartier, texte } */
export const boostIci = (residence, contexte = {}) => {
  const b = residence?.boost;
  if (!b?.cible) return null;
  const cible = norm(b.cible);
  return [contexte.quartier, contexte.ville, contexte.texte].some(v => norm(v) === cible) ? b : null;
};

/** Score d'affichage dans cette recherche (recommandation + bonus ciblé éventuel) */
export const scoreIci = (residence, contexte) => (residence.recommendation || 0) + (boostIci(residence, contexte)?.bonus || 0);

/** « Sponsorisé » est-il affiché ici ? */
export const sponsoriseIci = (residence, contexte) => Boolean(residence.sponsored || boostIci(residence, contexte));
