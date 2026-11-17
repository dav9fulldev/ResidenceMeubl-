const AIService = require('./AIService');
const ResidenceService = require('./ResidenceService');
const db = require('../db');

/**
 * Recherche intelligente en langage naturel et suggestions de résidences similaires.
 *
 * 1. Les critères chiffrés sont extraits de la phrase (personnes, chambres, budget)
 *    et appliqués strictement.
 * 2. Les résidences restantes sont classées par proximité de sens (Voyage AI),
 *    ou par mots-clés si l'IA n'est pas disponible.
 */

const MOTS_NOMBRES = {
  un: 1, une: 1, deux: 2, trois: 3, quatre: 4, cinq: 5, six: 6, sept: 7, huit: 8, neuf: 9, dix: 10,
};

const sansAccents = (texte) => texte.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

const lireNombre = (valeur) => {
  if (!valeur) return null;
  const v = valeur.trim();
  return MOTS_NOMBRES[v] ?? (Number.isFinite(parseInt(v, 10)) ? parseInt(v, 10) : null);
};

const NOMBRE = '(\\d+|un|une|deux|trois|quatre|cinq|six|sept|huit|neuf|dix)';

// Montants dictés à l'oral : « cinquante mille » → « 50000 »
const DIZAINES = {
  dix: 10, vingt: 20, trente: 30, quarante: 40, cinquante: 50, soixante: 60,
  'soixante-dix': 70, 'quatre-vingt': 80, 'quatre-vingts': 80, 'quatre-vingt-dix': 90, cent: 100,
};
const montantsEnChiffres = (t) => t.replace(
  /\b(soixante-dix|quatre-vingt-dix|quatre-vingts?|dix|vingt|trente|quarante|cinquante|soixante|cent)(?:[\s-]+(?:et[\s-]+)?(un|deux|trois|quatre|cinq|six|sept|huit|neuf))?\s+mille\b/g,
  (_, dizaine, unite) => String((DIZAINES[dizaine] + (unite ? MOTS_NOMBRES[unite] : 0)) * 1000)
);

// Extrait les critères chiffrés d'une phrase libre
function extraireCriteres(question) {
  const t = montantsEnChiffres(sansAccents(question));
  const criteres = {};

  const personnes =
    t.match(new RegExp(`${NOMBRE}\\s*(personnes?|pers\\b|adultes?|voyageurs?|invites?|people|guests?)`)) ||
    t.match(new RegExp(`famille\\s+de\\s+${NOMBRE}`)) ||
    // « pour 4 » / « pour deux » — mais pas « pour un étudiant » ni « pour une semaine »
    t.match(/\bpour\s+(\d+|deux|trois|quatre|cinq|six|sept|huit|neuf|dix)\b(?!\s*(nuits?|jours?|semaines?|mois|chambres?))/);
  if (personnes) criteres.personnes = lireNombre(personnes[1]);

  const chambres = t.match(new RegExp(`${NOMBRE}\\s*(chambres?|bedrooms?)`));
  if (chambres) criteres.chambres = lireNombre(chambres[1]);

  // Budget : « moins de 50 000 », « max 50k », « budget 40000 fcfa », « 35 mille par nuit »
  const budget = t.match(
    /(moins de|max(?:imum)?|budget(?: de| max)?|jusqu'?a|pas plus de|under|below|<)\s*:?\s*(\d[\d\s.]*)\s*(k|mille)?/
  ) || t.match(/(\d[\d\s.]*)\s*(k|mille)?\s*(f|fcfa|cfa|francs)\b/);
  if (budget) {
    const brut = budget[1].match(/\d/) ? budget[1] : budget[2];
    const multiplicateur = (budget[1].match(/\d/) ? budget[2] : budget[3]) ? 1000 : 1;
    const montant = parseInt(brut.replace(/[\s.]/g, ''), 10) * multiplicateur;
    if (Number.isFinite(montant) && montant > 0) criteres.budgetMax = montant;
  }

  return criteres;
}

const respecteCriteres = (r, c) =>
  (!c.personnes || r.capacite >= c.personnes) &&
  (!c.chambres || r.nombreChambres >= c.chambres) &&
  (!c.budgetMax || r.prix <= c.budgetMax);

// Texte décrivant une résidence, utilisé pour la vectoriser
const texteResidence = (r) => [
  `${r.nom}.`,
  `${r.typeAppartement} à ${r.quartier}, ${r.ville} (${r.localisation}).`,
  r.description,
  r.equipements?.length ? `Équipements : ${r.equipements.join(', ')}.` : '',
  `${r.nombreChambres} chambre(s), ${r.nombreSallesDeBain} salle(s) de bain, jusqu'à ${r.capacite} personnes.`,
  `${r.prix} FCFA par nuit.`,
].filter(Boolean).join(' ');

// Score par mots-clés (repli quand l'IA est indisponible)
const scoreMotsCles = (question, r) => {
  const mots = sansAccents(question).split(/[^a-z0-9]+/).filter(m => m.length > 2);
  if (mots.length === 0) return 0;
  const texte = sansAccents(texteResidence(r));
  return mots.filter(m => texte.includes(m)).length / mots.length;
};

class SmartSearchService {
  constructor() {
    this.syncEnCours = null;
    this.syncARelancer = false;
  }

  get collection() {
    return db.collection('residence_embeddings');
  }

  /**
   * Met à jour les vecteurs des résidences dont le texte a changé.
   * Peut être appelée sans attendre (après une modification admin) : les appels
   * simultanés sont regroupés.
   */
  async synchroniser() {
    if (!AIService.estActive()) return { misesAJour: 0 };
    if (this.syncEnCours) {
      this.syncARelancer = true;
      return this.syncEnCours;
    }

    this.syncEnCours = (async () => {
      try {
        const residences = await ResidenceService.getAllResidencesAdmin();
        const existants = new Map(
          (await this.collection.find({}, { projection: { residenceId: 1, empreinte: 1 } }).toArray())
            .map(e => [e.residenceId, e.empreinte])
        );

        const aFaire = residences
          .map(r => ({ r, texte: texteResidence(r) }))
          .map(x => ({ ...x, empreinte: AIService.empreinte(x.texte) }))
          .filter(x => existants.get(x.r.id) !== x.empreinte);

        // Par lots de 100 textes
        for (let i = 0; i < aFaire.length; i += 100) {
          const lot = aFaire.slice(i, i + 100);
          const vecteurs = await AIService.vectoriser(lot.map(x => x.texte), 'document');
          await this.collection.bulkWrite(lot.map((x, j) => ({
            updateOne: {
              filter: { residenceId: x.r.id },
              update: { $set: { residenceId: x.r.id, empreinte: x.empreinte, modele: AIService.model, vecteur: vecteurs[j] } },
              upsert: true,
            },
          })));
        }

        // Supprimer les vecteurs des résidences supprimées
        const ids = residences.map(r => r.id);
        await this.collection.deleteMany({ residenceId: { $nin: ids } });

        if (aFaire.length) console.log(`🧠 ${aFaire.length} résidence(s) vectorisée(s) avec ${AIService.model}`);
        return { misesAJour: aFaire.length };
      } finally {
        this.syncEnCours = null;
        if (this.syncARelancer) {
          this.syncARelancer = false;
          this.synchroniserEnFond();
        }
      }
    })();

    return this.syncEnCours;
  }

  // Lance la synchronisation sans bloquer la requête en cours
  synchroniserEnFond() {
    this.synchroniser().catch(e => console.error('⚠️ Vectorisation des résidences impossible :', e.message));
  }

  async vecteurs() {
    const docs = await this.collection.find({}, { projection: { _id: 0, residenceId: 1, vecteur: 1 } }).toArray();
    return new Map(docs.map(d => [d.residenceId, d.vecteur]));
  }

  /**
   * Recherche en langage naturel.
   * @returns {{ mode: 'ia'|'mots-cles', criteres, resultats, suggestions }}
   */
  async rechercher(question, limite = 10) {
    const criteres = extraireCriteres(question);
    const residences = (await ResidenceService.getAllResidences())
      .filter(r => r.disponibilite.statut !== 'maintenance');

    let mode = 'mots-cles';
    let scores = new Map(residences.map(r => [r.id, scoreMotsCles(question, r)]));

    if (AIService.estActive()) {
      try {
        const [requete, vecteurs] = await Promise.all([
          AIService.vectoriserRequete(question),
          this.vecteurs(),
        ]);
        if (residences.some(r => vecteurs.has(r.id))) {
          scores = new Map(residences.map(r => [
            r.id,
            vecteurs.has(r.id) ? AIService.cosinus(requete, vecteurs.get(r.id)) : 0,
          ]));
          mode = 'ia';
        }
      } catch (error) {
        console.error('⚠️ Recherche IA indisponible, repli sur les mots-clés :', error.message);
      }
    }

    const classees = residences
      .map(r => ({ ...r, score: Math.round(scores.get(r.id) * 1000) / 1000 }))
      .sort((a, b) => b.score - a.score);

    const resultats = classees.filter(r => respecteCriteres(r, criteres)).slice(0, limite);
    // Si rien ne remplit tous les critères, proposer les plus proches
    const suggestions = resultats.length === 0 ? classees.slice(0, 3) : [];

    return { mode, criteres, resultats, suggestions };
  }

  /**
   * Résidences les plus proches d'une résidence donnée.
   */
  async similaires(residenceId, limite = 3) {
    const residences = await ResidenceService.getAllResidences();
    const reference = residences.find(r => r.id === parseInt(residenceId));
    if (!reference) return null;

    const autres = residences.filter(r => r.id !== reference.id && r.disponibilite.statut !== 'maintenance');
    let score;

    const vecteurs = AIService.estActive() ? await this.vecteurs() : new Map();
    if (vecteurs.has(reference.id)) {
      const ref = vecteurs.get(reference.id);
      score = (r) => (vecteurs.has(r.id) ? AIService.cosinus(ref, vecteurs.get(r.id)) : 0);
    } else {
      // Repli : même quartier / type, capacité et prix proches
      score = (r) =>
        (r.quartier === reference.quartier ? 0.4 : 0) +
        (r.typeAppartement === reference.typeAppartement ? 0.2 : 0) +
        (r.ville === reference.ville ? 0.1 : 0) +
        0.3 * (1 - Math.min(1, Math.abs(r.prix - reference.prix) / reference.prix));
    }

    return autres
      .map(r => ({ ...r, score: Math.round(score(r) * 1000) / 1000 }))
      .sort((a, b) => b.score - a.score)
      .slice(0, limite);
  }
}

const service = new SmartSearchService();
service.extraireCriteres = extraireCriteres;
service.texteResidence = texteResidence;

module.exports = service;
