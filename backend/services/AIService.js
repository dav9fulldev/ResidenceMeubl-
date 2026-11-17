const crypto = require('crypto');

/**
 * Accès aux modèles d'embedding Voyage AI (via MongoDB Atlas « AI Model APIs »).
 *
 * Variables d'environnement :
 *  - VOYAGE_API_KEY : clé créée dans Atlas > AI Model APIs (obligatoire pour activer l'IA)
 *  - VOYAGE_API_URL : défaut https://ai.mongodb.com/v1
 *                     (https://api.voyageai.com/v1 pour une clé créée sur voyageai.com)
 *  - VOYAGE_MODEL   : défaut voyage-4-lite
 *
 * Sans clé, estActive() renvoie false et le reste de l'application
 * utilise la recherche classique par mots-clés.
 */
const URL_PAR_DEFAUT = 'https://ai.mongodb.com/v1';

/**
 * Normalise VOYAGE_API_URL : accepte « ai.mongodb.com », « https://ai.mongodb.com »,
 * « https://ai.mongodb.com/v1 » ou l'adresse complète « …/v1/embeddings ».
 */
function urlBase(valeur) {
  let url = (valeur || '').trim().replace(/^['"]|['"]$/g, '');
  if (!url) return URL_PAR_DEFAUT;
  if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
  url = url.replace(/\/+$/, '').replace(/\/embeddings$/, '');
  if (!/\/v\d+$/.test(new URL(url).pathname)) url += '/v1';
  return url;
}

const DIMENSION = 512;
const DELAI_MS = 8000;
const TAILLE_CACHE = 200;

class AIService {
  constructor() {
    this.cache = new Map(); // requêtes déjà vectorisées (économise le quota)
  }

  get model() {
    return process.env.VOYAGE_MODEL || 'voyage-4-lite';
  }

  estActive() {
    return Boolean(process.env.VOYAGE_API_KEY);
  }

  /**
   * Vectorise une liste de textes.
   * @param {string[]} textes
   * @param {'document'|'query'} type
   * @returns {Promise<number[][]>}
   */
  async vectoriser(textes, type) {
    if (!this.estActive()) throw new Error('VOYAGE_API_KEY non configurée');

    const url = `${urlBase(process.env.VOYAGE_API_URL)}/embeddings`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.VOYAGE_API_KEY}`,
      },
      body: JSON.stringify({
        input: textes,
        model: this.model,
        input_type: type,
        output_dimension: DIMENSION,
      }),
      signal: AbortSignal.timeout(DELAI_MS),
    });

    if (!response.ok) {
      let detail = '';
      try { detail = (await response.json()).detail || ''; } catch { /* corps vide */ }
      throw new Error(`Voyage AI ${response.status}${detail ? ` : ${detail}` : ''}`);
    }

    const { data } = await response.json();
    return data.sort((a, b) => a.index - b.index).map(d => d.embedding);
  }

  // Vectorise une recherche de client, avec cache
  async vectoriserRequete(texte) {
    const cle = texte.trim().toLowerCase();
    if (this.cache.has(cle)) return this.cache.get(cle);

    const [vecteur] = await this.vectoriser([texte], 'query');
    if (this.cache.size >= TAILLE_CACHE) {
      this.cache.delete(this.cache.keys().next().value);
    }
    this.cache.set(cle, vecteur);
    return vecteur;
  }

  // Empreinte d'un texte, pour savoir si une résidence doit être revectorisée
  empreinte(texte) {
    return crypto.createHash('sha256').update(`${this.model}|${DIMENSION}|${texte}`).digest('hex');
  }
}

// Similarité cosinus entre deux vecteurs
const cosinus = (a, b) => {
  let produit = 0;
  let normeA = 0;
  let normeB = 0;
  for (let i = 0; i < a.length; i++) {
    produit += a[i] * b[i];
    normeA += a[i] * a[i];
    normeB += b[i] * b[i];
  }
  return normeA && normeB ? produit / Math.sqrt(normeA * normeB) : 0;
};

const service = new AIService();
service.cosinus = cosinus;
service.urlBase = urlBase;

module.exports = service;
