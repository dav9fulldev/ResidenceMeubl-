/**
 * Tests de l'API — exécuter avec : npm test
 * Utilise le lanceur de tests intégré à Node (node:test), sans dépendance supplémentaire.
 */
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');

// Configuration de test (avant de charger l'application).
// Identifiants générés au hasard à chaque lancement : aucun mot de passe écrit en dur.
const { randomBytes } = require('node:crypto');
const ADMIN_TEST = { username: 'admin-test', password: randomBytes(12).toString('hex') };
const MAUVAIS_MDP = randomBytes(12).toString('hex');
process.env.NODE_ENV = 'test';
process.env.ADMIN_USERNAME = ADMIN_TEST.username;
process.env.ADMIN_PASSWORD = ADMIN_TEST.password;

const { MongoMemoryServer } = require('mongodb-memory-server');
const db = require('../db');
const app = require('../server');
const ReservationService = require('../services/ReservationService');

// Pas d'envoi d'email réel pendant les tests : on note les emails « envoyés »
const emailsStatut = [];
ReservationService.emailService.sendReservationEmail = async () => true;
ReservationService.emailService.sendStatusEmail = async (reservation) => {
  emailsStatut.push({ id: reservation.id, statut: reservation.statut, to: reservation.client.email });
};

let server;
let baseUrl;

let mongo;

before(async () => {
  // Vraie base MongoDB lancée en mémoire pour les tests
  mongo = await MongoMemoryServer.create();
  await db.connect(mongo.getUri(), 'sankofart-test');

  server = app.listen(0);
  await new Promise(resolve => server.once('listening', resolve));
  baseUrl = `http://localhost:${server.address().port}`;
});

after(async () => {
  server.close();
  await db.close();
  await mongo.stop();
});

let jetonAdmin;
const connexionAdmin = async () => {
  if (!jetonAdmin) {
    const res = await api('/api/admin/login', {
      method: 'POST',
      body: ADMIN_TEST,
    });
    jetonAdmin = res.body.data.token;
  }
  return { Authorization: `Bearer ${jetonAdmin}` };
};

const jourDansNJours = (n) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
};

const api = async (path, options = {}) => {
  const res = await fetch(baseUrl + path, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...options.headers },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  return { status: res.status, body: await res.json() };
};

const nouvelleReservation = (overrides = {}) => ({
  residenceId: 1,
  nom: 'Kouassi',
  prenom: 'Awa',
  email: 'awa@example.com',
  telephone: '0700000000',
  dateArrivee: jourDansNJours(10),
  dateDepart: jourDansNJours(13),
  nombrePersonnes: 2,
  ...overrides,
});

test('GET /api/residences/types et /villes ne sont plus capturées par /:id', async () => {
  const types = await api('/api/residences/types');
  assert.equal(types.status, 200);
  assert.ok(types.body.data.includes('Villa Prestige'));

  const villes = await api('/api/residences/villes');
  assert.equal(villes.status, 200);
  assert.ok(villes.body.data.includes('Abidjan'));
});

test('GET /api/residences/:id fonctionne toujours', async () => {
  const res = await api('/api/residences/1');
  assert.equal(res.status, 200);
  assert.equal(res.body.data.id, 1);
});

test('cycle de réservation : prix, chevauchement, annulation', async () => {
  // 1. Création : 3 nuits à 45 000 FCFA
  const creation = await api('/api/reservations', { method: 'POST', body: nouvelleReservation() });
  assert.equal(creation.status, 201, JSON.stringify(creation.body));
  const id = creation.body.data.id;

  const detail = await api(`/api/reservations/${id}`);
  assert.equal(detail.body.data.prixTotal, 135000);

  // 2. Les mêmes dates ne sont plus disponibles
  const doublon = await api('/api/reservations', {
    method: 'POST',
    body: nouvelleReservation({ dateArrivee: jourDansNJours(11), dateDepart: jourDansNJours(12) }),
  });
  assert.equal(doublon.status, 400);
  assert.match(doublon.body.message, /pas disponible/);

  const dispo = await api('/api/residences/check-disponibilite', {
    method: 'POST',
    body: { residenceId: 1, dateArrivee: jourDansNJours(12), dateDepart: jourDansNJours(14) },
  });
  assert.equal(dispo.body.data.disponible, false);

  // Arriver le jour du départ précédent est autorisé
  const enchaine = await api('/api/residences/check-disponibilite', {
    method: 'POST',
    body: { residenceId: 1, dateArrivee: jourDansNJours(13), dateDepart: jourDansNJours(15) },
  });
  assert.equal(enchaine.body.data.disponible, true);

  // 3. Après annulation, les dates se libèrent
  const annulation = await api(`/api/reservations/${id}/status`, {
    method: 'PUT',
    headers: await connexionAdmin(),
    body: { statut: 'annulee' },
  });
  assert.equal(annulation.status, 200);
  assert.equal(annulation.body.data.emailEnvoye, true);
  assert.deepEqual(emailsStatut.at(-1), { id, statut: 'annulee', to: 'awa@example.com' });

  // Remettre le même statut ne renvoie pas d'email
  const nbEmails = emailsStatut.length;
  const memeStatut = await api(`/api/reservations/${id}/status`, {
    method: 'PUT',
    headers: await connexionAdmin(),
    body: { statut: 'annulee' },
  });
  assert.equal(memeStatut.body.data.emailEnvoye, false);
  assert.equal(emailsStatut.length, nbEmails);

  const rebook = await api('/api/reservations', { method: 'POST', body: nouvelleReservation() });
  assert.equal(rebook.status, 201, JSON.stringify(rebook.body));
});

test('capacité et durée de séjour sont vérifiées', async () => {
  const tropDeMonde = await api('/api/reservations', {
    method: 'POST',
    body: nouvelleReservation({ residenceId: 1, nombrePersonnes: 9, dateArrivee: jourDansNJours(40), dateDepart: jourDansNJours(42) }),
  });
  assert.equal(tropDeMonde.status, 400);
  assert.match(tropDeMonde.body.message, /maximum 4 personnes/);

  const tropLong = await api('/api/reservations', {
    method: 'POST',
    body: nouvelleReservation({ dateArrivee: jourDansNJours(50), dateDepart: jourDansNJours(90) }),
  });
  assert.equal(tropLong.status, 400);
  assert.match(tropLong.body.message, /durée du séjour/);
});

test('les routes admin refusent les requêtes sans jeton valide', async () => {
  assert.equal((await api('/api/reservations')).status, 401);
  assert.equal((await api('/api/reservations/stats')).status, 401);
  assert.equal((await api('/api/admin/residences')).status, 401);
  assert.equal((await api('/api/admin/residences', { headers: { Authorization: 'Bearer faux.jeton' } })).status, 401);

  const mauvaisMdp = await api('/api/admin/login', {
    method: 'POST',
    body: { username: ADMIN_TEST.username, password: MAUVAIS_MDP },
  });
  assert.equal(mauvaisMdp.status, 401);
  assert.equal(mauvaisMdp.body.data, undefined);
});

test('un admin connecté voit les réservations et gère les résidences', async () => {
  const headers = await connexionAdmin();

  const liste = await api('/api/reservations', { headers });
  assert.equal(liste.status, 200);
  assert.ok(Array.isArray(liste.body.data));

  // Création
  const creation = await api('/api/admin/residences', {
    method: 'POST',
    headers,
    body: {
      nom: 'Résidence Test', reference: 'TEST-001', typeAppartement: 'Studio',
      localisation: 'Rue test, Bingerville', ville: 'Bingerville', quartier: 'Centre',
      prix: 20000, nombreChambres: 1, capacite: 2,
    },
  });
  assert.equal(creation.status, 201, JSON.stringify(creation.body));
  const id = creation.body.data.id;

  // Données invalides
  const invalide = await api('/api/admin/residences', { method: 'POST', headers, body: { nom: 'X' } });
  assert.equal(invalide.status, 400);

  // Maintenance : la résidence n'est plus réservable
  const maintenance = await api(`/api/admin/residences/${id}/status`, {
    method: 'PUT', headers, body: { statut: 'maintenance' },
  });
  assert.equal(maintenance.status, 200);
  assert.equal(maintenance.body.data.disponibilite.statut, 'maintenance');

  const resa = await api('/api/reservations', {
    method: 'POST',
    body: nouvelleReservation({ residenceId: id, nombrePersonnes: 1 }),
  });
  assert.equal(resa.status, 400);

  // Modification puis suppression
  const modif = await api(`/api/admin/residences/${id}`, { method: 'PUT', headers, body: { prix: 25000 } });
  assert.equal(modif.body.data.prix, 25000);

  assert.equal((await api(`/api/admin/residences/${id}`, { method: 'DELETE', headers })).status, 200);
  assert.equal((await api(`/api/residences/${id}`)).status, 404);
});

test('les résidences créées sont enregistrées en base avec un identifiant unique', async () => {
  const headers = await connexionAdmin();
  const creation = await api('/api/admin/residences', {
    method: 'POST',
    headers,
    body: {
      nom: 'Résidence Persistante', reference: 'TEST-002', typeAppartement: 'Studio',
      localisation: 'Rue test', ville: 'Abidjan', quartier: 'Riviera',
      prix: 30000, nombreChambres: 1, capacite: 2,
    },
  });
  assert.equal(creation.status, 201);
  assert.ok(creation.body.data.id > 10, 'les identifiants continuent après le catalogue initial');

  // Référence déjà utilisée
  const doublon = await api('/api/admin/residences', {
    method: 'POST', headers, body: { ...creation.body.data, id: undefined },
  });
  assert.equal(doublon.status, 400);
  assert.match(doublon.body.message, /référence existe déjà/);

  // Lecture directe en base, indépendante de l'API
  const enBase = await db.collection('residences').findOne({ reference: 'TEST-002' });
  assert.equal(enBase.nom, 'Résidence Persistante');

  const stats = await api('/api/reservations/stats', { headers });
  assert.equal(stats.status, 200);
  assert.ok(stats.body.data.total >= 2);
});

test('le statut affiché suit les réservations confirmées', async () => {
  const headers = await connexionAdmin();
  const statutDe = async (id) => (await api(`/api/residences/${id}`)).body.data.disponibilite;

  // Résidence 5 : disponible au départ
  assert.equal((await statutDe(5)).statut, 'disponible');

  // Réservation à venir : en attente → pas de changement
  const futur = await api('/api/reservations', {
    method: 'POST',
    body: nouvelleReservation({ residenceId: 5, dateArrivee: jourDansNJours(20), dateDepart: jourDansNJours(23) }),
  });
  assert.equal(futur.status, 201, JSON.stringify(futur.body));
  assert.equal((await statutDe(5)).statut, 'disponible');

  // Confirmée → « réservé » avec les dates
  await api(`/api/reservations/${futur.body.data.id}/status`, { method: 'PUT', headers, body: { statut: 'confirmee' } });
  let dispo = await statutDe(5);
  assert.equal(dispo.statut, 'réservé');
  assert.equal(dispo.arrivee, jourDansNJours(20));

  // Le nom du client n'est jamais exposé publiquement…
  assert.equal(dispo.occupant, undefined);
  const liste = (await api('/api/residences')).body.data;
  assert.ok(liste.every(r => r.disponibilite.occupant === undefined));
  assert.ok(!JSON.stringify(liste).includes('Kouassi'));
  // …mais l'admin le voit
  const vueAdmin = (await api('/api/admin/residences', { headers })).body.data.find(r => r.id === 5);
  assert.equal(vueAdmin.disponibilite.occupant, 'Awa Kouassi');

  // Séjour en cours confirmé → « occupé », prioritaire sur le séjour à venir
  const enCours = await api('/api/reservations', {
    method: 'POST',
    body: nouvelleReservation({ residenceId: 5, dateArrivee: jourDansNJours(0), dateDepart: jourDansNJours(2) }),
  });
  assert.equal(enCours.status, 201, JSON.stringify(enCours.body));
  await api(`/api/reservations/${enCours.body.data.id}/status`, { method: 'PUT', headers, body: { statut: 'confirmee' } });
  dispo = await statutDe(5);
  assert.equal(dispo.statut, 'occupé');
  assert.equal(dispo.prochaineDisponibilite, jourDansNJours(2));

  // L'admin voit la réservation responsable ; le public non
  const admin5 = (await api('/api/admin/residences', { headers })).body.data.find(r => r.id === 5);
  assert.equal(admin5.disponibilite.reservationId, enCours.body.data.id);
  assert.equal((await statutDe(5)).reservationId, undefined);

  // Forcer « disponible » est refusé avec une explication
  const force = await api('/api/admin/residences/5/status', { method: 'PUT', headers, body: { statut: 'disponible' } });
  assert.equal(force.status, 400);
  assert.match(force.body.message, /Annulez cette réservation/);

  // Annulations → retour à « disponible »
  await api(`/api/reservations/${enCours.body.data.id}/status`, { method: 'PUT', headers, body: { statut: 'annulee' } });
  await api(`/api/reservations/${futur.body.data.id}/status`, { method: 'PUT', headers, body: { statut: 'annulee' } });
  assert.equal((await statutDe(5)).statut, 'disponible');

  // La maintenance posée à la main reste prioritaire
  await api('/api/admin/residences/7/status', { method: 'PUT', headers, body: { statut: 'maintenance' } });
  assert.equal((await api('/api/admin/residences', { headers })).body.data.find(r => r.id === 7).disponibilite.statut, 'maintenance');
});

// ---------- Recherche intelligente ----------
const AIService = require('../services/AIService');
const SmartSearchService = require('../services/SmartSearchService');

test('les critères chiffrés sont compris dans une phrase libre', () => {
  const c = SmartSearchService.extraireCriteres;
  assert.deepEqual(c('Un appart calme pour une famille de 5, moins de 60 000 FCFA'), { personnes: 5, budgetMax: 60000 });
  assert.deepEqual(c('3 chambres pour six personnes, budget 80k'), { personnes: 6, chambres: 3, budgetMax: 80000 });
  assert.deepEqual(c('studio pas cher pour 2 nuits'), {});
  assert.deepEqual(c('pour deux, max 35 mille'), { personnes: 2, budgetMax: 35000 });
  assert.deepEqual(c('quelque chose à 45.000 f la nuit'), { budgetMax: 45000 });
  assert.deepEqual(c('studio pour un étudiant, moins de 30 000'), { budgetMax: 30000 });
  assert.deepEqual(c('pour une semaine en famille de 4'), { personnes: 4 });
  assert.deepEqual(c('pour 3 nuits'), {});
  // Phrases dictées à l'oral
  assert.deepEqual(c('une villa pour cinq personnes moins de cinquante mille francs'), { personnes: 5, budgetMax: 50000 });
  assert.deepEqual(c('budget soixante-cinq mille'), { budgetMax: 65000 });
});

test("l'adresse Voyage est normalisée quelle que soit la forme saisie", () => {
  const u = AIService.urlBase;
  const attendu = 'https://ai.mongodb.com/v1';
  assert.equal(u(undefined), attendu);
  assert.equal(u(''), attendu);
  assert.equal(u('ai.mongodb.com'), attendu);
  assert.equal(u('https://ai.mongodb.com/'), attendu);
  assert.equal(u('https://ai.mongodb.com/v1'), attendu);
  assert.equal(u('https://ai.mongodb.com/v1/embeddings'), attendu);
  assert.equal(u(' "https://api.voyageai.com/v1/" '), 'https://api.voyageai.com/v1');

  // Clé collée avec espaces ou guillemets
  const avant = process.env.VOYAGE_API_KEY;
  process.env.VOYAGE_API_KEY = '  "cle-123"\n';
  assert.equal(AIService.cle, 'cle-123');
  process.env.VOYAGE_API_KEY = '   ';
  assert.equal(AIService.estActive(), false);
  if (avant === undefined) delete process.env.VOYAGE_API_KEY; else process.env.VOYAGE_API_KEY = avant;
});

test('derrière le relais Render, chaque visiteur a sa propre limite de réservations', async () => {
  // En production, Express doit lire la vraie IP dans X-Forwarded-For
  process.env.NODE_ENV = 'production';
  delete require.cache[require.resolve('../server')];
  const appProd = require('../server');
  process.env.NODE_ENV = 'test';
  assert.equal(appProd.get('trust proxy'), 1);
  assert.equal(app.get('trust proxy'), false, 'pas de relais en test / local');
});

test('sans clé Voyage, la recherche bascule sur les mots-clés', async () => {
  delete process.env.VOYAGE_API_KEY;
  const res = await api('/api/residences/recherche-ia', { method: 'POST', body: { question: 'villa avec piscine à Riviera' } });
  assert.equal(res.status, 200);
  assert.equal(res.body.data.mode, 'mots-cles');
  assert.ok(res.body.data.resultats.length > 0);
  assert.equal((await api('/api/residences/recherche-ia', { method: 'POST', body: { question: '' } })).status, 400);
});

test('avec Voyage, les résidences sont classées par le sens et filtrées par critères', async (t) => {
  // Fausse IA déterministe : chaque mot active une dimension du vecteur
  const vecteurMots = (texte) => {
    const v = new Array(512).fill(0);
    for (const mot of texte.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').split(/[^a-z]+/)) {
      if (mot.length > 3) v[[...mot].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) % 512, 7)] += 1;
    }
    return v;
  };
  process.env.VOYAGE_API_KEY = 'cle-de-test';
  const appels = [];
  t.mock.method(AIService, 'vectoriser', async (textes, type) => {
    appels.push(type);
    return textes.map(vecteurMots);
  });
  t.after(() => { delete process.env.VOYAGE_API_KEY; });

  const sync = await SmartSearchService.synchroniser();
  assert.ok(sync.misesAJour >= 10);
  // Deuxième passage : rien n'a changé, aucun nouvel appel
  assert.equal((await SmartSearchService.synchroniser()).misesAJour, 0);

  const res = await api('/api/residences/recherche-ia', {
    method: 'POST',
    body: { question: 'Une villa prestige avec jardin pour une famille de 6, moins de 90 000' },
  });
  const { mode, criteres, resultats } = res.body.data;
  assert.equal(mode, 'ia');
  assert.deepEqual(criteres, { personnes: 6, budgetMax: 90000 });
  assert.ok(resultats.length > 0);
  assert.ok(resultats.every(r => r.capacite >= 6 && r.prix <= 90000));
  assert.ok(resultats.every(r => r.disponibilite.occupant === undefined), 'pas de nom de client');
  assert.ok(resultats.every((r, i) => i === 0 || resultats[i - 1].score >= r.score), 'trié par pertinence');
  assert.ok(appels.includes('query'));

  // Critères impossibles : aucun résultat mais des suggestions
  const impossible = await api('/api/residences/recherche-ia', { method: 'POST', body: { question: 'villa pour 40 personnes' } });
  assert.equal(impossible.body.data.resultats.length, 0);
  assert.equal(impossible.body.data.suggestions.length, 3);

  // Résidences similaires
  const similaires = await api('/api/residences/1/similaires');
  assert.equal(similaires.status, 200);
  assert.equal(similaires.body.data.length, 3);
  assert.ok(similaires.body.data.every(r => r.id !== 1));

  // Voyage en panne : repli automatique
  AIService.vectoriser.mock.mockImplementation(async () => { throw new Error('Voyage AI 503'); });
  AIService.cache.clear();
  const panne = await api('/api/residences/recherche-ia', { method: 'POST', body: { question: 'studio économique' } });
  assert.equal(panne.status, 200);
  assert.equal(panne.body.data.mode, 'mots-cles');
});

test("l'IP du visiteur est lue dans l'en-tête configuré (Cloudflare sur Render)", () => {
  const { clientIp } = require('../middleware/clientIp');
  const req = { ip: '10.195.55.6', headers: { 'cf-connecting-ip': '41.202.10.7' } };

  delete process.env.CLIENT_IP_HEADER;
  assert.equal(clientIp(req), '10.195.55.6', 'en-tête ignoré sans configuration');

  process.env.CLIENT_IP_HEADER = 'CF-Connecting-IP';
  assert.equal(clientIp(req), '41.202.10.7');
  assert.equal(clientIp({ ip: '10.0.0.1', headers: { 'cf-connecting-ip': 'pas-une-ip' } }), '10.0.0.1');
  assert.equal(clientIp({ ip: '10.0.0.1', headers: {} }), '10.0.0.1');
  delete process.env.CLIENT_IP_HEADER;
});

test("avec BREVO_API_KEY, les emails partent par l'API Brevo (HTTPS, pas de SMTP)", async (t) => {
  const EmailService = require('../services/EmailService');
  const env = { BREVO_API_KEY: process.env.BREVO_API_KEY, EMAIL_FROM: process.env.EMAIL_FROM };
  process.env.BREVO_API_KEY = ' cle-brevo-test ';
  process.env.EMAIL_FROM = 'contact@exemple.com';
  t.after(() => {
    for (const [k, v] of Object.entries(env)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
  });

  const appels = [];
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    appels.push({ url, options });
    return new Response(JSON.stringify({ messageId: 'x' }), { status: 201 });
  });

  const service = new EmailService();
  assert.equal(service.mode, 'brevo');
  await service.envoyer({ to: 'client@exemple.com', subject: 'Sujet', html: '<p>Bonjour</p>', replyTo: 'contact@exemple.com' });

  assert.equal(appels.length, 1);
  assert.equal(appels[0].url, 'https://api.brevo.com/v3/smtp/email');
  assert.equal(appels[0].options.headers['api-key'], 'cle-brevo-test');
  const corps = JSON.parse(appels[0].options.body);
  assert.deepEqual(corps.sender, { name: 'Sankofart Résidence', email: 'contact@exemple.com' });
  assert.deepEqual(corps.to, [{ email: 'client@exemple.com' }]);
  assert.equal(corps.htmlContent, '<p>Bonjour</p>');

  // Erreur Brevo remontée clairement
  globalThis.fetch.mock.mockImplementation(async () => new Response(JSON.stringify({ message: 'sender not valid' }), { status: 400 }));
  await assert.rejects(service.envoyer({ to: 'a@b.c', subject: 's', html: 'h' }), /Brevo 400 : sender not valid/);
});
