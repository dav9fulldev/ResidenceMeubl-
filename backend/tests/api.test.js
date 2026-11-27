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

const { MongoMemoryReplSet } = require('mongodb-memory-server');
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
  // Replica set : indispensable aux transactions du module financier (comme MongoDB Atlas)
  mongo = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: 'wiredTiger' } });
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

// Vérification de l'email des partenaires : les codes « envoyés » sont notés ici
const codesVerification = new Map();
ReservationService.emailService.sendCodeVerification = async (u, code) => { codesVerification.set(u.email, code); };
/** Confirme l'email d'un partenaire inscrit avec le code reçu ; retourne les en-têtes de sa session */
const verifierEmailPartenaire = async (email) => {
  const e = String(email).toLowerCase();
  const r = await api('/api/entreprises/verification-email', { method: 'POST', body: { email: e, code: codesVerification.get(e) } });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  return { Authorization: `Bearer ${r.body.data.token}` };
};

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

  // Lecture d'une réservation : réservée à l'admin (coordonnées du client)
  const detail = await api(`/api/reservations/${id}`, { headers: await connexionAdmin() });
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
  assert.match(force.body.message, /demande l'annulation/);

  // Annulations → retour à « disponible »
  // L'admin ne peut pas annuler seul une réservation confirmée
  const direct = await api(`/api/reservations/${enCours.body.data.id}/status`, { method: 'PUT', headers, body: { statut: 'annulee' } });
  assert.equal(direct.status, 409);
  assert.match(direct.body.message, /demande/);
  // Annulation sur demande du client, acceptée par l'admin
  for (const id of [enCours.body.data.id, futur.body.data.id]) {
    const acces = await api('/api/client/acces', { method: 'POST', body: { email: 'awa@example.com', reference: id } });
    const h = { Authorization: `Bearer ${acces.body.data.token}` };
    assert.equal((await api(`/api/client/reservations/${id}/annulation`, { method: 'POST', headers: h, body: {} })).status, 200);
    assert.equal((await api(`/api/reservations/${id}/annulation`, { method: 'PUT', headers, body: { decision: 'accepter' } })).status, 200);
  }
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
  assert.deepEqual(corps.sender, { name: 'BABI RESIDENCE', email: 'contact@exemple.com' });
  assert.deepEqual(corps.to, [{ email: 'client@exemple.com' }]);
  assert.equal(corps.htmlContent, '<p>Bonjour</p>');

  // Erreur Brevo remontée clairement
  globalThis.fetch.mock.mockImplementation(async () => new Response(JSON.stringify({ message: 'sender not valid' }), { status: 400 }));
  await assert.rejects(service.envoyer({ to: 'a@b.c', subject: 's', html: 'h' }), /Brevo 400 : sender not valid/);
});

// ---------- Espace client et demande d'annulation ----------
test("le client sans compte retrouve sa réservation et demande l'annulation, l'admin décide", async () => {
  const es = ReservationService.emailService;
  const envois = [];
  es.sendDemandeAnnulationAdmin = async (r) => { envois.push(['admin', r.id]); };
  es.sendRefusAnnulation = async (r) => { envois.push(['refus', r.id, r.demandeAnnulation.reponse]); };
  es.sendLienMotDePasseClient = async (client) => { envois.push(['lien', client.email]); };
  const headersAdmin = await connexionAdmin();

  const email = 'koffi@example.com';
  const resa = (j1, j2) => api('/api/reservations', {
    method: 'POST',
    body: nouvelleReservation({ residenceId: 6, email, nom: 'Koffi', prenom: 'Ama', dateArrivee: jourDansNJours(j1), dateDepart: jourDansNJours(j2) }),
  });
  const c1 = await resa(60, 63);
  assert.equal(c1.status, 201, JSON.stringify(c1.body));
  const r1 = c1.body.data.id;
  const c2 = await resa(70, 73);
  assert.equal(c2.status, 201, JSON.stringify(c2.body));
  const r2 = c2.body.data.id;
  await api(`/api/reservations/${r1}/status`, { method: 'PUT', headers: headersAdmin, body: { statut: 'confirmee' } });

  // Accès par email + référence : mauvaise combinaison refusée
  assert.equal((await api('/api/client/acces', { method: 'POST', body: { email: 'autre@example.com', reference: r1 } })).status, 404);
  const acces = await api('/api/client/acces', { method: 'POST', body: { email: 'KOFFI@example.com ', reference: r1 } });
  assert.equal(acces.status, 200);
  const hRef = { Authorization: `Bearer ${acces.body.data.token}` };

  // Ce jeton ne voit que cette réservation et n'ouvre pas l'admin
  const liste1 = await api('/api/client/reservations', { headers: hRef });
  assert.deepEqual(liste1.body.data.map(r => r.id), [r1]);
  assert.equal(liste1.body.data[0].client, undefined, 'pas de données personnelles inutiles');
  assert.equal((await api('/api/reservations', { headers: hRef })).status, 401);
  assert.equal((await api('/api/admin/residences', { headers: hRef })).status, 401);
  assert.equal((await api(`/api/client/reservations/${r2}/annulation`, { method: 'POST', headers: hRef, body: {} })).status, 403);

  // Lien par email (Service client) : même réponse que l'adresse soit connue ou non
  const lienConnu = await api('/api/client/lien', { method: 'POST', body: { email } });
  const lienInconnu = await api('/api/client/lien', { method: 'POST', body: { email: 'inconnu@example.com' } });
  assert.equal(lienConnu.body.message, lienInconnu.body.message);
  await new Promise(r => setImmediate(r));
  assert.deepEqual(envois.filter(e => e[0] === 'lien'), [['lien', email]]);

  // Ancien lien « historique » (envoyé avant le Service client) : toutes les réservations
  const hTout = { Authorization: `Bearer ${require('../services/AuthService').creerJetonClient(email)}` };
  const historique = await api('/api/client/reservations', { headers: hTout });
  assert.deepEqual(historique.body.data.map(r => r.id).sort(), [r1, r2].sort());

  // Demande d'annulation sur la réservation confirmée
  const demande = await api(`/api/client/reservations/${r1}/annulation`, { method: 'POST', headers: hRef, body: { motif: 'Voyage reporté' } });
  assert.equal(demande.status, 200, JSON.stringify(demande.body));
  assert.equal(demande.body.data.demandeAnnulation.statut, 'en_attente');
  assert.equal(demande.body.data.statut, 'confirmee', 'la réservation reste active tant que l\'admin n\'a pas décidé');
  assert.equal(demande.body.data.peutDemanderAnnulation, false);
  assert.deepEqual(envois.at(-1), ['admin', r1]);
  assert.equal((await api(`/api/client/reservations/${r1}/annulation`, { method: 'POST', headers: hRef, body: {} })).status, 400, 'pas de doublon');

  // La résidence reste réservée pendant la demande
  assert.equal((await api('/api/residences/6')).body.data.disponibilite.statut, 'réservé');

  // L'admin voit la demande puis l'accepte
  const vueAdmin = (await api('/api/reservations', { headers: headersAdmin })).body.data.find(r => r.id === r1);
  assert.equal(vueAdmin.demandeAnnulation.motif, 'Voyage reporté');
  const nbStatut = emailsStatut.length;
  const accept = await api(`/api/reservations/${r1}/annulation`, { method: 'PUT', headers: headersAdmin, body: { decision: 'accepter' } });
  assert.equal(accept.status, 200, JSON.stringify(accept.body));
  assert.equal(accept.body.data.statut, 'annulee');
  assert.equal(accept.body.data.demandeAnnulation.statut, 'acceptee');
  assert.equal(emailsStatut.length, nbStatut + 1, 'email d\'annulation au client');
  assert.equal((await api('/api/residences/6')).body.data.disponibilite.statut, 'disponible', 'dates libérées');

  // Deuxième réservation : demande refusée avec un message
  const hTout2 = hTout;
  await api(`/api/client/reservations/${r2}/annulation`, { method: 'POST', headers: hTout2, body: {} });
  const refus = await api(`/api/reservations/${r2}/annulation`, { method: 'PUT', headers: headersAdmin, body: { decision: 'refuser', message: 'Délai dépassé' } });
  assert.equal(refus.body.data.statut, 'en_attente');
  assert.equal(refus.body.data.demandeAnnulation.statut, 'refusee');
  assert.deepEqual(envois.at(-1), ['refus', r2, 'Délai dépassé']);
  assert.equal((await api(`/api/reservations/${r2}/annulation`, { method: 'PUT', headers: headersAdmin, body: { decision: 'accepter' } })).status, 400, 'plus de demande en attente');

  // Après un refus, le client peut refaire une demande
  const apres = (await api('/api/client/reservations', { headers: hTout })).body.data.find(r => r.id === r2);
  assert.equal(apres.peutDemanderAnnulation, true);

  // Jeton client absent ou falsifié
  assert.equal((await api('/api/client/reservations')).status, 401);
  assert.equal((await api('/api/client/reservations', { headers: { Authorization: `Bearer ${jetonAdmin}` } })).status, 401, 'jeton admin ≠ jeton client');
});

// ---------- Statistiques et export ----------
test('statistiques : revenus par mois, cumul, occupation, et export CSV', async () => {
  const headers = await connexionAdmin();
  const col = db.collection('reservations');
  const base = (id, statut, arrivee, depart, prixTotal, extra = {}) => ({
    id, entrepriseId: 'babi', residenceId: 2, statut, prixTotal, dateCreation: new Date('2031-01-01'),
    residenceInfo: { id: 2, nom: 'Résidence 2', reference: 'RES-002' },
    client: { prenom: 'Test', nom: 'Stats', email: 'stats@example.com', telephone: '0700000000' },
    dates: { arrivee, depart }, details: { nombrePersonnes: 2 }, notes: '', demandeAnnulation: null, ...extra,
  });
  await col.insertMany([
    // 3 nuits à 30 000 : 2 nuits en mars, 1 en avril
    base('STAT_1', 'confirmee', '2031-03-30', '2031-04-02', 90000),
    // 2 nuits en avril
    base('STAT_2', 'confirmee', '2031-04-10', '2031-04-12', 50000),
    // En attente : prévisionnel seulement
    base('STAT_3', 'en_attente', '2031-04-20', '2031-04-22', 40000),
    // Annulée : ni revenu ni occupation ; nom dangereux pour Excel
    base('STAT_4', 'annulee', '2031-05-01', '2031-05-03', 70000, { client: { prenom: '=HYPERLINK("x")', nom: 'Pirate', email: 'p@example.com', telephone: '1' } }),
  ]);

  assert.equal((await api('/api/admin/statistiques?annee=2031')).status, 401, 'protégé');
  const res = await api('/api/admin/statistiques?annee=2031', { headers });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  const s = res.body.data;
  const m = (n) => s.mois[n - 1];

  assert.equal(m(3).revenus, 60000);
  assert.equal(m(4).revenus, 80000);           // 30 000 + 50 000
  assert.equal(m(4).revenusPrevisionnels, 40000);
  assert.equal(m(5).revenus, 0);
  assert.equal(m(3).cumul, 60000);
  assert.equal(m(4).cumul, 140000);
  assert.equal(m(12).cumul, 140000);
  assert.equal(m(3).reservations.confirmees, 1); // compté au mois d'arrivée
  assert.equal(m(4).reservations.confirmees, 1);
  assert.equal(m(4).reservations.enAttente, 1);
  assert.equal(m(5).reservations.annulees, 1);
  assert.equal(m(4).nuitsOccupees, 3);
  assert.ok(m(4).occupation > 0 && m(4).occupation < 100);

  assert.equal(s.resume.revenusAnnee, 140000);
  assert.equal(s.resume.confirmees, 2);
  assert.equal(s.resume.tauxAnnulation, 25);
  assert.equal(s.resume.panierMoyen, 70000);
  assert.equal(s.resume.dureeMoyenne, 2.5);
  assert.deepEqual(s.residences.map(r => [r.nom, r.revenus, r.nuits]), [['Résidence 2', 140000, 5]]);
  assert.ok(s.anneesDisponibles.includes(2031));

  assert.equal((await api('/api/admin/statistiques?annee=abc', { headers })).status, 400);

  // Export CSV
  const csvRes = await fetch(`${baseUrl}/api/admin/export/reservations.csv?annee=2031`, { headers });
  assert.equal(csvRes.status, 200);
  assert.match(csvRes.headers.get('content-type'), /text\/csv/);
  assert.match(csvRes.headers.get('content-disposition'), /reservations-babi-2031\.csv/);
  const octets = Buffer.from(await csvRes.arrayBuffer());
  assert.deepEqual([...octets.subarray(0, 3)], [0xEF, 0xBB, 0xBF], 'BOM UTF-8 pour Excel');
  const csv = octets.subarray(3).toString('utf8');
  const lignes = csv.trim().split('\r\n');
  assert.equal(lignes.length, 5, 'en-tête + 4 réservations');
  assert.match(lignes[0], /^Référence;Reçue le;Statut/);
  assert.ok(lignes.some(l => l.startsWith('STAT_1;') && l.includes(';Confirmée;') && l.includes(';3;2;90000;')));
  const pirate = lignes.find(l => l.startsWith('STAT_4;'));
  assert.ok(pirate.includes(`"'=HYPERLINK(""x"") Pirate"`), 'formule neutralisée : ' + pirate);
  assert.equal((await fetch(`${baseUrl}/api/admin/export/reservations.csv`)).status, 401);
});

test('une origine non autorisée ne reçoit pas les en-têtes CORS (sans erreur serveur)', async () => {
  const res = await fetch(`${baseUrl}/api/residences`, { headers: { Origin: 'https://site-inconnu.vercel.app' } });
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('access-control-allow-origin'), null, 'le navigateur bloquera la réponse');

  const ok = await fetch(`${baseUrl}/api/residences`, { headers: { Origin: 'http://localhost:3001' } });
  assert.equal(ok.headers.get('access-control-allow-origin'), 'http://localhost:3001');
});

// ---------- Acompte PI-SPI ----------
const PiSpi = require('../services/paiement/PiSpiClient');
const PaymentService = require('../services/paiement/PaymentService');
const { isValidPispiQrPayload } = require('@pi-spi/qrcode');
const crypto = require('node:crypto');

const ALIAS_PAYE = '3497a720-ab11-4973-9619-534e04f263a1';
const ALIAS_CLIENT = '9b1b3499-3e50-435b-b757-ac7a83d8aa96';

function configurerPiSpi(t, valeurs = {}) {
  const avant = {};
  const env = {
    PISPI_BASE_URL: 'https://participant.exemple.test/piz/v1',
    PISPI_TOKEN_URL: 'https://auth.exemple.test/oauth2/token',
    PISPI_CLIENT_ID: 'id-test', PISPI_CLIENT_SECRET: 'secret-test', PISPI_API_KEY: 'cle-test',
    PISPI_PAYEE_ALIAS: ALIAS_PAYE, PISPI_WEBHOOK_SECRET: 'secret-webhook-test', ...valeurs,
  };
  for (const [k, v] of Object.entries(env)) { avant[k] = process.env[k]; if (v === undefined) delete process.env[k]; else process.env[k] = v; }
  t.after(() => { for (const [k, v] of Object.entries(avant)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; } });
}

async function reservationConfirmee(residenceId, j1, j2, email) {
  const headersAdmin = await connexionAdmin();
  const c = await api('/api/reservations', { method: 'POST', body: nouvelleReservation({ residenceId, email, dateArrivee: jourDansNJours(j1), dateDepart: jourDansNJours(j2) }) });
  assert.equal(c.status, 201, JSON.stringify(c.body));
  const id = c.body.data.id;
  const acces = await api('/api/client/acces', { method: 'POST', body: { email, reference: id } });
  return { id, headersAdmin, headersClient: { Authorization: `Bearer ${acces.body.data.token}` } };
}

test('acompte : désactivé tant que PI-SPI n\'est pas configuré', async () => {
  delete process.env.PAIEMENT_MODE;
  const { id, headersClient } = await reservationConfirmee(1, 100, 103, 'nopay@example.com');
  const vue = (await api('/api/client/reservations', { headers: headersClient })).body.data[0];
  assert.equal(vue.acompte.mode, 'desactive');
  assert.equal(vue.acompte.possible, false);
  const res = await api(`/api/client/reservations/${id}/acompte`, { method: 'POST', headers: headersClient, body: { methode: 'qr' } });
  assert.equal(res.status, 503);
});

test('acompte en mode simulation : QR officiel, paiement, emails, statistiques', async (t) => {
  configurerPiSpi(t, { PAIEMENT_MODE: 'simulation', ACOMPTE_POURCENTAGE: '30' });
  const envois = [];
  ReservationService.emailService.sendAcompteRecu = async (r) => { envois.push(['client', r.id]); };
  ReservationService.emailService.sendAcompteRecuAdmin = async (r) => { envois.push(['admin', r.id]); };

  const { id, headersAdmin, headersClient } = await reservationConfirmee(1, 110, 113, 'simu@example.com');

  // Pas encore confirmée : impossible
  const tropTot = await api(`/api/client/reservations/${id}/acompte`, { method: 'POST', headers: headersClient, body: { methode: 'qr' } });
  assert.equal(tropTot.status, 400);

  await api(`/api/reservations/${id}/status`, { method: 'PUT', headers: headersAdmin, body: { statut: 'confirmee' } });
  const vue = (await api('/api/client/reservations', { headers: headersClient })).body.data[0];
  assert.equal(vue.acompte.possible, true);
  assert.equal(vue.acompte.montant, Math.ceil(vue.prixTotal * 0.3));

  const qr = await api(`/api/client/reservations/${id}/acompte`, { method: 'POST', headers: headersClient, body: { methode: 'qr' } });
  assert.equal(qr.status, 201, JSON.stringify(qr.body));
  const { txId, qrPayload, qrSvg, montant } = qr.body.data;
  assert.ok(txId.length <= 25 && /^[A-Z0-9]+$/.test(txId));
  assert.ok(isValidPispiQrPayload(qrPayload), 'payload QR valide selon le SDK officiel');
  assert.ok(qrPayload.includes('int.bceao.pi') && qrPayload.includes(txId) && qrPayload.includes(`54${String(montant).length.toString().padStart(2, '0')}${montant}`));
  assert.ok(qrPayload.includes('1103400'), 'QR dynamique (catégorie 400)');
  assert.match(qrSvg, /^<svg/);

  let suivi = await api(`/api/client/reservations/${id}/acompte/${txId}`, { headers: headersClient });
  assert.equal(suivi.body.data.statut, 'en_attente');

  const simule = await api(`/api/client/reservations/${id}/acompte/${txId}/simuler`, { method: 'POST', headers: headersClient });
  assert.equal(simule.status, 200, JSON.stringify(simule.body));
  assert.equal(simule.body.data.statut, 'paye');
  assert.equal(simule.body.data.acompte.paye, true);
  await new Promise(r => setTimeout(r, 20));
  assert.deepEqual(envois, [['client', id], ['admin', id]]);

  // Idempotent et pas de second paiement
  await api(`/api/client/reservations/${id}/acompte/${txId}/simuler`, { method: 'POST', headers: headersClient });
  assert.equal(envois.length, 2, 'emails envoyés une seule fois');
  assert.equal((await api(`/api/client/reservations/${id}/acompte`, { method: 'POST', headers: headersClient, body: { methode: 'qr' } })).status, 400);

  // Visible côté admin et dans les statistiques
  const admin = (await api('/api/reservations', { headers: headersAdmin })).body.data.find(r => r.id === id);
  assert.equal(admin.acompte.paye, true);
  const stats = (await api(`/api/admin/statistiques?annee=${new Date().getUTCFullYear()}`, { headers: headersAdmin })).body.data;
  assert.ok(stats.resume.acomptesEncaisses >= montant);
});

test('acompte en mode PI-SPI : demande de paiement 521, vérification, rejet', async (t) => {
  configurerPiSpi(t, { PAIEMENT_MODE: 'pispi' });
  ReservationService.emailService.sendAcompteRecu = async () => {};
  ReservationService.emailService.sendAcompteRecuAdmin = async () => {};
  const { id, headersAdmin, headersClient } = await reservationConfirmee(1, 120, 123, 'pispi@example.com');
  await api(`/api/reservations/${id}/status`, { method: 'PUT', headers: headersAdmin, body: { statut: 'confirmee' } });

  const envoyees = [];
  t.mock.method(PiSpi, 'creerDemandePaiement', async (args) => { envoyees.push(args); return { txId: args.txId, statut: 'ENVOYE' }; });
  let recu = null;
  t.mock.method(PiSpi, 'lirePaiementRecu', async () => recu);
  t.mock.method(PiSpi, 'lireDemandePaiement', async () => ({ statut: 'ENVOYE' }));

  // Adresse de paiement invalide
  const mauvais = await api(`/api/client/reservations/${id}/acompte`, { method: 'POST', headers: headersClient, body: { methode: 'demande', payeurAlias: '0701020304' } });
  assert.equal(mauvais.status, 400);
  assert.match(mauvais.body.message, /Adresse de paiement invalide/);

  const dem = await api(`/api/client/reservations/${id}/acompte`, { method: 'POST', headers: headersClient, body: { methode: 'demande', payeurAlias: ALIAS_CLIENT.toUpperCase() } });
  assert.equal(dem.status, 201, JSON.stringify(dem.body));
  const { txId, montant } = dem.body.data;
  assert.equal(envoyees[0].payeurAlias, ALIAS_CLIENT, 'adresse normalisée en minuscules');
  assert.equal(envoyees[0].montant, montant);

  // Pas encore payé
  let suivi = await api(`/api/client/reservations/${id}/acompte/${txId}`, { headers: headersClient });
  assert.equal(suivi.body.data.statut, 'en_attente');

  // PI-SPI indique le paiement irrévocable
  recu = { txId, statut: 'IRREVOCABLE', montant, end2endId: 'E2E-TEST-1', payeurNom: 'Awa Kouassi' };
  await new Promise(r => setTimeout(r, 3100)); // limite anti-rafale de 3 s
  suivi = await api(`/api/client/reservations/${id}/acompte/${txId}`, { headers: headersClient });
  assert.equal(suivi.body.data.statut, 'paye');
  assert.equal(suivi.body.data.acompte.paye, true);

  // La simulation est refusée en mode PI-SPI
  assert.equal((await api(`/api/client/reservations/${id}/acompte/${txId}/simuler`, { method: 'POST', headers: headersClient })).status, 403);

  // Rejet immédiat par PI-SPI (alias inconnu)
  const autre = await reservationConfirmee(1, 130, 133, 'pispi2@example.com');
  await api(`/api/reservations/${autre.id}/status`, { method: 'PUT', headers: headersAdmin, body: { statut: 'confirmee' } });
  PiSpi.creerDemandePaiement.mock.mockImplementation(async (args) => ({ txId: args.txId, statut: 'REJETE', statutRaison: 'BE23' }));
  const rejet = await api(`/api/client/reservations/${autre.id}/acompte`, { method: 'POST', headers: autre.headersClient, body: { methode: 'demande', payeurAlias: ALIAS_CLIENT } });
  assert.equal(rejet.status, 400);
  assert.match(rejet.body.message, /Adresse de paiement inconnue/);
});

test('webhook PI-SPI : signature HMAC obligatoire, puis vérification via l\'API', async (t) => {
  configurerPiSpi(t, { PAIEMENT_MODE: 'pispi' });
  ReservationService.emailService.sendAcompteRecu = async () => {};
  ReservationService.emailService.sendAcompteRecuAdmin = async () => {};
  const { id, headersAdmin, headersClient } = await reservationConfirmee(8, 140, 143, 'webhook@example.com');
  await api(`/api/reservations/${id}/status`, { method: 'PUT', headers: headersAdmin, body: { statut: 'confirmee' } });

  const qr = await api(`/api/client/reservations/${id}/acompte`, { method: 'POST', headers: headersClient, body: { methode: 'qr' } });
  const { txId, montant } = qr.body.data;
  assert.ok(qr.body.data.qrPayload.includes(ALIAS_PAYE), 'QR vers l\'alias de l\'établissement');
  t.mock.method(PiSpi, 'lirePaiementRecu', async () => ({ txId, statut: 'IRREVOCABLE', montant, end2endId: 'E2E-WEBHOOK' }));

  const corps = JSON.stringify({ data: [{ evCode: 'PAIEMENT_RECU', txId, montant, end2endId: 'E2E-WEBHOOK' }], meta: { total: 1 } });
  const envoyer = (signature) => fetch(`${baseUrl}/api/paiements/pispi/webhook`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', ...(signature ? { 'X-Signature': signature } : {}) }, body: corps,
  });

  assert.equal((await envoyer()).status, 401);
  assert.equal((await envoyer('sha256=00ff')).status, 401);
  // Montant modifié après signature → refusé
  const signature = crypto.createHmac('sha256', 'secret-webhook-test').update(corps).digest('hex');
  const altere = await fetch(`${baseUrl}/api/paiements/pispi/webhook`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Signature': signature }, body: corps.replace(`"montant":${montant}`, '"montant":1'),
  });
  assert.equal(altere.status, 401);

  assert.equal((await envoyer(`sha256=${signature}`)).status, 204);
  await new Promise(r => setTimeout(r, 100));
  const vue = (await api('/api/client/reservations', { headers: headersClient })).body.data[0];
  assert.equal(vue.acompte.paye, true);
  assert.equal(PiSpi.lirePaiementRecu.mock.callCount() >= 1, true, 'statut relu via l\'API avant validation');
});

test('client PI-SPI : jeton OAuth2 en cache, x-api-key, nouvel essai sur 401, 404 = rien reçu', async (t) => {
  configurerPiSpi(t);
  PiSpi.jeton = null;
  const appels = [];
  let jetonNumero = 0;
  let refuserUneFois = true;
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    appels.push({ url: String(url), options });
    if (String(url).includes('/oauth2/token')) {
      jetonNumero += 1;
      return new Response(JSON.stringify({ access_token: `jeton-${jetonNumero}`, expires_in: 3600 }), { status: 200 });
    }
    if (String(url).endsWith('/paiements-recus/INCONNU')) return new Response('', { status: 404 });
    if (refuserUneFois) { refuserUneFois = false; return new Response('', { status: 401 }); }
    return new Response(JSON.stringify({ txId: 'X', statut: 'IRREVOCABLE' }), { status: 200 });
  });

  const r1 = await PiSpi.lirePaiementRecu('ABC');
  assert.equal(r1.statut, 'IRREVOCABLE');
  const jeton = appels.find(a => a.url.includes('/oauth2/token'));
  const formulaire = new URLSearchParams(jeton.options.body.toString());
  assert.equal(formulaire.get('grant_type'), 'client_credentials');
  assert.equal(formulaire.get('client_id'), 'id-test');
  assert.match(formulaire.get('scope'), /piz\/paiement\.read/);
  const appelApi = appels.filter(a => a.url.startsWith('https://participant.exemple.test/piz/v1/paiements-recus/ABC'));
  assert.equal(appelApi.length, 2, 'nouvel essai après 401');
  assert.equal(appelApi[1].options.headers['x-api-key'], 'cle-test');
  assert.equal(appelApi[1].options.headers.Authorization, 'Bearer jeton-2');

  assert.equal(await PiSpi.lirePaiementRecu('INCONNU'), null);
  assert.equal(appels.filter(a => a.url.includes('/oauth2/token')).length, 2, 'jeton réutilisé');

  // Corps de la demande de paiement conforme à la spécification
  await PiSpi.creerDemandePaiement({ txId: 'SKFTEST', payeurAlias: ALIAS_CLIENT.toUpperCase(), montant: 15000.4, motif: 'Acompte' });
  const demande = appels.at(-1);
  const corps = JSON.parse(demande.options.body);
  assert.equal(demande.url, 'https://participant.exemple.test/piz/v1/demandes-paiements');
  assert.equal(PiSpi.urlAvecParticipant('https://api.test', 'CIC999'), 'https://api.test/CIC999');
  assert.equal(PiSpi.urlAvecParticipant('https://api.test/CIC999/', 'CIC999'), 'https://api.test/CIC999');
  assert.equal(corps.categorie, '521');
  assert.equal(corps.confirmation, false);
  assert.equal(corps.payeurAlias, ALIAS_CLIENT);
  assert.equal(corps.payeAlias, ALIAS_PAYE);
  assert.equal(corps.montant, 15000);
  assert.equal(corps.dateLimitePaiement, undefined, 'refusé par le sandbox pour la catégorie 521');
  assert.equal(demande.url.startsWith('https://participant.exemple.test/piz/v1/'), true);
});

test('acompte : demande réutilisée, paiement tardif accepté, doublon signalé', async (t) => {
  configurerPiSpi(t, { PAIEMENT_MODE: 'pispi' });
  ReservationService.emailService.sendAcompteRecu = async () => {};
  ReservationService.emailService.sendAcompteRecuAdmin = async () => {};
  const { id, headersAdmin, headersClient } = await reservationConfirmee(1, 150, 153, 'doublon@example.com');
  await api(`/api/reservations/${id}/status`, { method: 'PUT', headers: headersAdmin, body: { statut: 'confirmee' } });
  let envoyees = 0;
  t.mock.method(PiSpi, 'creerDemandePaiement', async (a) => { envoyees += 1; return { txId: a.txId, statut: 'ENVOYE' }; });
  t.mock.method(PiSpi, 'lireDemandePaiement', async () => ({ statut: 'ENVOYE' }));
  const payes = new Set();
  t.mock.method(PiSpi, 'lirePaiementRecu', async (txId) => (payes.has(txId) ? { txId, statut: 'IRREVOCABLE', montant: 999999, end2endId: 'E2E-' + txId } : null));

  const d1 = await api(`/api/client/reservations/${id}/acompte`, { method: 'POST', headers: headersClient, body: { methode: 'demande', payeurAlias: ALIAS_CLIENT } });
  const d2 = await api(`/api/client/reservations/${id}/acompte`, { method: 'POST', headers: headersClient, body: { methode: 'demande', payeurAlias: ALIAS_CLIENT } });
  assert.equal(d2.body.data.txId, d1.body.data.txId, 'même demande réutilisée');
  assert.equal(d2.body.data.dejaEnvoyee, true);
  assert.equal(envoyees, 1);

  // Le client génère aussi un QR, puis paie les deux
  const qr = await api(`/api/client/reservations/${id}/acompte`, { method: 'POST', headers: headersClient, body: { methode: 'qr' } });
  // La demande a expiré de notre côté mais est payée plus tard : acceptée
  await db.collection('reservations').updateOne({ id, 'paiements.txId': d1.body.data.txId }, { $set: { 'paiements.$.statut': 'expire' } });
  payes.add(d1.body.data.txId);
  await PaymentService.verifier(d1.body.data.txId, { forcer: true });
  let vue = (await api('/api/reservations', { headers: headersAdmin })).body.data.find(r => r.id === id);
  assert.equal(vue.acompte.paye, true);

  payes.add(qr.body.data.txId);
  await PaymentService.verifier(qr.body.data.txId, { forcer: true });
  vue = (await api('/api/reservations', { headers: headersAdmin })).body.data.find(r => r.id === id);
  assert.equal(vue.acompte.doublons.length, 1, 'doublon à rembourser signalé');
  assert.equal(vue.acompte.doublons[0].txId, qr.body.data.txId);
});

test('durée de séjour réglable par résidence (2 nuits par défaut, 1 possible)', async () => {
  const headers = await connexionAdmin();
  const r1 = (await api('/api/residences/1')).body.data;
  assert.equal(r1.disponibilite.sejourMin, 2, 'minimum par défaut');
  const uneNuit = () => api('/api/reservations', { method: 'POST', body: nouvelleReservation({ residenceId: 1, email: 'nuit@example.com', dateArrivee: jourDansNJours(200), dateDepart: jourDansNJours(201) }) });
  assert.equal((await uneNuit()).status, 400);

  assert.equal((await api('/api/admin/residences/1', { method: 'PUT', headers, body: { disponibilite: { sejourMin: 0, sejourMax: 30 } } })).status, 400);
  assert.equal((await api('/api/admin/residences/1', { method: 'PUT', headers, body: { disponibilite: { sejourMin: 5, sejourMax: 3 } } })).status, 400);
  const ok = await api('/api/admin/residences/1', { method: 'PUT', headers, body: { disponibilite: { sejourMin: 1, sejourMax: 30 } } });
  assert.equal(ok.status, 200);
  assert.notEqual(ok.body.data.disponibilite.statut, 'maintenance');
  assert.equal(ok.body.data.disponibilite.automatique ?? true, true, 'statut toujours calculé, pas figé à la main');
  assert.equal((await uneNuit()).status, 201);
  await api('/api/admin/residences/1', { method: 'PUT', headers, body: { disponibilite: { sejourMin: 2, sejourMax: 30 } } });
});

test('adresse de paiement : saisie mobile normalisée', () => {
  const n = PaymentService.normaliserAlias;
  const attendu = 'f0c7ac56-48e6-4bfb-86ee-91192a836d1e';
  assert.equal(n(' F0C7AC56-48E6-4BFB-86EE-91192A836D1E '), attendu);
  assert.equal(n('f0c7ac56\u201348e6\u20134bfb\u201386ee\u201391192a836d1e'), attendu, 'tirets iOS');
  assert.equal(n('f0c7ac5648e64bfb86ee91192a836d1e'), attendu, 'sans tirets');
  assert.equal(n('f0c7ac56 48e6 4bfb 86ee 91192a836d1e'), attendu, 'espaces');
  assert.ok(!PiSpi.UUID_V4.test(n('f0c7ac56-48e6-4bfb-86ee-911902a8')), 'faute de frappe toujours refusée');
});

test('annulation avec acompte payé → à rembourser ; le client peut nettoyer son historique', async (t) => {
  configurerPiSpi(t, { PAIEMENT_MODE: 'simulation' });
  ReservationService.emailService.sendAcompteRecu = async () => {};
  ReservationService.emailService.sendAcompteRecuAdmin = async () => {};
  const email = 'historique@example.com';
  const { id, headersAdmin, headersClient } = await reservationConfirmee(1, 160, 163, email);
  await api(`/api/reservations/${id}/status`, { method: 'PUT', headers: headersAdmin, body: { statut: 'confirmee' } });
  const qr = await api(`/api/client/reservations/${id}/acompte`, { method: 'POST', headers: headersClient, body: { methode: 'qr' } });
  await api(`/api/client/reservations/${id}/acompte/${qr.body.data.txId}/simuler`, { method: 'POST', headers: headersClient });

  // Pas d'annulation directe, même avec acompte
  assert.equal((await api(`/api/reservations/${id}/status`, { method: 'PUT', headers: headersAdmin, body: { statut: 'annulee' } })).status, 409);
  // Demande du client acceptée → remboursement à faire
  await api(`/api/client/reservations/${id}/annulation`, { method: 'POST', headers: headersClient, body: {} });
  await api(`/api/reservations/${id}/annulation`, { method: 'PUT', headers: headersAdmin, body: { decision: 'accepter' } });
  let vue = (await api('/api/reservations', { headers: headersAdmin })).body.data.find(r => r.id === id);
  assert.equal(vue.acompte.remboursement.statut, 'rembourse', 'remboursé automatiquement (simulation)');
  assert.equal((await api(`/api/reservations/${id}/remboursement`, { method: 'PUT', headers: headersAdmin, body: {} })).status, 404);

  // Historique : la réservation annulée peut être masquée par le client, pas par un autre
  const tokTout = { Authorization: `Bearer ${require('../services/AuthService').creerJetonClient(email)}` };
  let liste = (await api('/api/client/reservations', { headers: tokTout })).body.data;
  assert.equal(liste.find(r => r.id === id).peutMasquer, true);
  const masque = await api('/api/client/reservations/masquer', { method: 'POST', headers: tokTout, body: { ids: [id] } });
  assert.equal(masque.body.data.masquees, 1);
  liste = (await api('/api/client/reservations', { headers: tokTout })).body.data;
  assert.equal(liste.some(r => r.id === id), false);
  // Toujours visible côté admin
  vue = (await api('/api/reservations', { headers: headersAdmin })).body.data.find(r => r.id === id);
  assert.ok(vue);
  // Une réservation active ne peut pas être masquée
  const active = await reservationConfirmee(1, 170, 173, email);
  const rien = await api('/api/client/reservations/masquer', { method: 'POST', headers: tokTout, body: { ids: [active.id] } });
  assert.equal(rien.body.data.masquees, 0);
});

test('remboursement automatique PI-SPI : retour de fonds, rejet, relance, délai dépassé', async (t) => {
  configurerPiSpi(t, { PAIEMENT_MODE: 'pispi', ACOMPTE_REMBOURSEMENT_POURCENTAGE: '100' });
  const es = ReservationService.emailService;
  es.sendAcompteRecu = async () => {}; es.sendAcompteRecuAdmin = async () => {};
  const rembourses = [];
  es.sendRemboursementEffectue = async (r) => { rembourses.push(r.id); };

  const preparer = async (j) => {
    const { id, headersAdmin, headersClient } = await reservationConfirmee(1, j, j + 3, `remb${j}@example.com`);
    await api(`/api/reservations/${id}/status`, { method: 'PUT', headers: headersAdmin, body: { statut: 'confirmee' } });
    // Acompte payé (simulé en base, avec un end2endId PI-SPI)
    await db.collection('reservations').updateOne({ id }, { $set: { acompte: { paye: true, montant: 40500, payeLe: new Date(), txId: 'TX' + j, end2endId: 'E2E-' + j, methode: 'demande' } } });
    await api(`/api/client/reservations/${id}/annulation`, { method: 'POST', headers: headersClient, body: {} });
    return { id, headersAdmin };
  };
  const PiSpiLocal = require('../services/paiement/PiSpiClient');
  const RefundService = require('../services/paiement/RefundService');
  const retours = [];
  let reponseRetour = (e2e) => ({ end2endId: e2e, retourStatut: 'INITIE' });
  t.mock.method(PiSpiLocal, 'retournerFonds', async (e2e) => { retours.push(e2e); return reponseRetour(e2e); });
  let lecture = (e2e) => ({ end2endId: e2e, retourStatut: 'INITIE' });
  t.mock.method(PiSpiLocal, 'lirePaiement', async (e2e) => lecture(e2e));

  // 1. Acceptation → retour demandé, en cours, puis IRREVOCABLE
  const a = await preparer(300);
  await api(`/api/reservations/${a.id}/annulation`, { method: 'PUT', headers: a.headersAdmin, body: { decision: 'accepter' } });
  assert.deepEqual(retours, ['E2E-300']);
  let r = await db.collection('reservations').findOne({ id: a.id });
  assert.equal(r.acompte.remboursement.statut, 'en_cours');
  lecture = (e2e) => ({ end2endId: e2e, retourStatut: 'IRREVOCABLE', retourDateReponse: new Date().toISOString() });
  await RefundService.verifierEnCours();
  r = await db.collection('reservations').findOne({ id: a.id });
  assert.equal(r.acompte.remboursement.statut, 'rembourse');
  assert.equal(r.acompte.remboursement.automatique, true);
  await new Promise(res => setTimeout(res, 20));
  assert.deepEqual(rembourses, [a.id], 'email de remboursement envoyé une fois');
  await RefundService.verifierEnCours();
  assert.equal(rembourses.length, 1);

  // 2. Retour rejeté → échec, puis relance réussie par l'admin
  const b = await preparer(320);
  reponseRetour = (e2e) => ({ end2endId: e2e, retourStatut: 'REJETE', retourStatutRaison: 'AG10' });
  await api(`/api/reservations/${b.id}/annulation`, { method: 'PUT', headers: b.headersAdmin, body: { decision: 'accepter' } });
  r = await db.collection('reservations').findOne({ id: b.id });
  assert.equal(r.acompte.remboursement.statut, 'echec');
  assert.match(r.acompte.remboursement.raison, /désactivé/);
  reponseRetour = (e2e) => ({ end2endId: e2e, retourStatut: 'IRREVOCABLE' });
  const relance = await api(`/api/reservations/${b.id}/remboursement/relancer`, { method: 'POST', headers: b.headersAdmin });
  assert.equal(relance.status, 200, JSON.stringify(relance.body));
  assert.equal(relance.body.data.remboursement.statut, 'rembourse');
  assert.equal(relance.body.data.remboursement.tentatives, 2);

  // 3. Délai de 90 jours dépassé (403) → échec explicite
  const c = await preparer(340);
  PiSpiLocal.retournerFonds.mock.mockImplementation(async () => { throw new PiSpiLocal.ErreurPiSpi('Délai de retour de fonds dépassé', { status: 403 }); });
  await api(`/api/reservations/${c.id}/annulation`, { method: 'PUT', headers: c.headersAdmin, body: { decision: 'accepter' } });
  r = await db.collection('reservations').findOne({ id: c.id });
  assert.equal(r.acompte.remboursement.statut, 'echec');
  assert.match(r.acompte.remboursement.raison, /90 jours/);
});

test('politique de remboursement par paliers : 100 % pendant 5 jours, puis 50 %, rien à 3 jours de l\'arrivée', async (t) => {
  configurerPiSpi(t, { PAIEMENT_MODE: 'pispi' });
  const es = ReservationService.emailService;
  es.sendRemboursementEffectue = async () => {};
  const { politiqueRemboursement } = require('../services/paiement/acompte');
  const J = 86400000;
  const jour = (n) => new Date(Date.now() + n * J);
  const resa = (payeIlYa, arriveeDans) => ({
    acompte: { paye: true, payeLe: jour(-payeIlYa) },
    dates: { arrivee: jourDansNJours(arriveeDans) },
  });
  const p0 = politiqueRemboursement({ ...resa(0, 12), acompte: { ...resa(0, 12).acompte, montant: 25200 } });
  assert.equal(p0.pourcentage, 100, 'annulation le jour du paiement : remboursement intégral');
  assert.equal(p0.montant, 25200);
  assert.equal(p0.integral, true);
  assert.equal(p0.paliers, true);
  assert.equal(p0.montantPartiel, 12600);
  assert.equal(politiqueRemboursement(resa(1, 30)).pourcentage, 100, 'payé hier, arrivée dans 30 j');
  const p6 = politiqueRemboursement(resa(6, 30));
  assert.equal(p6.remboursable, true, 'payé il y a 6 j : remboursement partiel');
  assert.equal(p6.pourcentage, 50);
  assert.equal(politiqueRemboursement(resa(1, 2)).remboursable, false, 'arrivée dans 2 j');
  assert.match(politiqueRemboursement(resa(1, 2)).raison, /3 jours avant l'arrivée/);
  process.env.ACOMPTE_REMBOURSABLE_APRES_PAIEMENT_JOURS = '3';
  t.after(() => { delete process.env.ACOMPTE_REMBOURSABLE_APRES_PAIEMENT_JOURS; });
  assert.equal(politiqueRemboursement(resa(4, 30)).pourcentage, 50, 'délai réglable');
  // Sans palier partiel (0 %), plus rien après le délai
  process.env.ACOMPTE_REMBOURSEMENT_POURCENTAGE = '0';
  t.after(() => { delete process.env.ACOMPTE_REMBOURSEMENT_POURCENTAGE; });
  assert.equal(politiqueRemboursement(resa(6, 30)).remboursable, false);
  assert.match(politiqueRemboursement(resa(6, 30)).raison, /3 jours après le paiement/);

  // Annulation acceptée hors délai : pas de retour PI-SPI, acompte conservé ; l'admin peut rembourser quand même
  const PiSpiLocal = require('../services/paiement/PiSpiClient');
  const retours = [];
  t.mock.method(PiSpiLocal, 'retournerFonds', async (e2e) => { retours.push(e2e); return { end2endId: e2e, retourStatut: 'IRREVOCABLE' }; });
  const { id, headersAdmin, headersClient } = await reservationConfirmee(1, 400, 403, 'politique@example.com');
  await api(`/api/reservations/${id}/status`, { method: 'PUT', headers: headersAdmin, body: { statut: 'confirmee' } });
  await db.collection('reservations').updateOne({ id }, { $set: { acompte: { paye: true, montant: 40500, payeLe: jour(-10), txId: 'TXP', end2endId: 'E2E-P', methode: 'qr' } } });
  const vueClient = (await api('/api/client/reservations', { headers: headersClient })).body.data[0];
  assert.equal(vueClient.acompte.politique.remboursable, false);
  await api(`/api/client/reservations/${id}/annulation`, { method: 'POST', headers: headersClient, body: {} });
  await api(`/api/reservations/${id}/annulation`, { method: 'PUT', headers: headersAdmin, body: { decision: 'accepter' } });
  let r = await db.collection('reservations').findOne({ id });
  assert.equal(r.statut, 'annulee');
  assert.equal(r.acompte.remboursement.statut, 'non_remboursable');
  assert.deepEqual(retours, []);
  const geste = await api(`/api/reservations/${id}/remboursement/relancer`, { method: 'POST', headers: headersAdmin });
  assert.equal(geste.body.data.remboursement.statut, 'rembourse');
  assert.deepEqual(retours, ['E2E-P']);
});

test('paramètres réglables depuis le back-office (admin uniquement, valeurs contrôlées)', async (t) => {
  const Settings = require('../services/SettingsService');
  t.after(async () => { await db.collection('parametres').deleteMany({}); await Settings.charger(); });
  assert.equal((await api('/api/admin/parametres')).status, 401);
  const headersAdmin = await connexionAdmin();
  const lu = await api('/api/admin/parametres', { headers: headersAdmin });
  assert.equal(lu.status, 200);
  assert.deepEqual(lu.body.data, { acomptePourcentage: 30, remboursementPourcentage: 50, remboursableApresPaiementJours: 5, nonRemboursableAvantArriveeJours: 3 });
  const invalide = await api('/api/admin/parametres', { method: 'PUT', headers: headersAdmin, body: { remboursementPourcentage: 150 } });
  assert.equal(invalide.status, 400);
  const maj = await api('/api/admin/parametres', { method: 'PUT', headers: headersAdmin, body: { remboursementPourcentage: 40, nonRemboursableAvantArriveeJours: 7 } });
  assert.equal(maj.status, 200);
  assert.equal(maj.body.data.remboursementPourcentage, 40);
  assert.equal(maj.body.data.nonRemboursableAvantArriveeJours, 7);
  assert.equal(maj.body.data.acomptePourcentage, 30, 'les autres valeurs restent');
  // Pris en compte immédiatement (et après rechargement depuis la base)
  const acompte = require('../services/paiement/acompte');
  assert.equal(acompte.pourcentageRembourse(), 40);
  assert.equal(acompte.montantRembourse(40500), 16200);
  await Settings.charger();
  assert.equal(Settings.get('nonRemboursableAvantArriveeJours'), 7);
});

test('remboursement partiel (50 % par défaut) : paiement sortant vers l\'adresse du client', async (t) => {
  configurerPiSpi(t, { PAIEMENT_MODE: 'pispi' });
  const es = ReservationService.emailService;
  const emails = [];
  es.sendRemboursementEffectue = async (r) => { emails.push(r.acompte.remboursement.montant); };
  const PiSpiLocal = require('../services/paiement/PiSpiClient');
  const RefundService = require('../services/paiement/RefundService');
  const envois = [];
  t.mock.method(PiSpiLocal, 'retournerFonds', async () => { throw new Error('pas de retour intégral'); });
  t.mock.method(PiSpiLocal, 'lirePaiementRecu', async (txId) => ({ txId, payeurAlias: 'alias-client-lu', statut: 'IRREVOCABLE' }));
  t.mock.method(PiSpiLocal, 'envoyerPaiement', async (p) => { envois.push(p); return { txId: p.txId, statut: 'ENVOYE' }; });
  let statut = 'ENVOYE';
  t.mock.method(PiSpiLocal, 'lirePaiementEnvoye', async (txId) => ({ txId, statut, end2endId: 'E2E-RMB' }));

  const preparer = async (j, payeurAlias) => {
    const { id, headersAdmin, headersClient } = await reservationConfirmee(1, j, j + 3, `partiel${j}@example.com`);
    // Payé il y a 8 jours : au-delà du remboursement intégral → palier à 50 %
    await db.collection('reservations').updateOne({ id }, { $set: { acompte: { paye: true, montant: 40500, payeLe: new Date(Date.now() - 8 * 86400000), txId: 'TXP' + j, end2endId: 'E2E-P' + j, methode: 'demande', ...(payeurAlias ? { payeurAlias } : {}) } } });
    const vue = (await api('/api/client/reservations', { headers: headersClient })).body.data.find(r => r.id === id);
    assert.equal(vue.acompte.politique.montant, 20250, 'le client voit le montant qu\'il recevra');
    assert.equal(vue.acompte.politique.pourcentage, 50);
    await api(`/api/client/reservations/${id}/annulation`, { method: 'POST', headers: headersClient, body: {} });
    await api(`/api/reservations/${id}/annulation`, { method: 'PUT', headers: headersAdmin, body: { decision: 'accepter' } });
    return id;
  };

  // Alias connu (enregistré au paiement)
  const a = await preparer(500, 'alias-client-a');
  assert.equal(envois.length, 1);
  assert.equal(envois[0].payeAlias, 'alias-client-a');
  assert.equal(envois[0].montant, 20250);
  assert.match(envois[0].txId, /^RMB/);
  let r = await db.collection('reservations').findOne({ id: a });
  assert.equal(r.acompte.remboursement.statut, 'en_cours');
  assert.equal(r.acompte.remboursement.methode, 'paiement');
  assert.equal(r.acompte.remboursement.montant, 20250);
  assert.equal(r.acompte.remboursement.pourcentage, 50);
  statut = 'IRREVOCABLE';
  await RefundService.verifierEnCours();
  r = await db.collection('reservations').findOne({ id: a });
  assert.equal(r.acompte.remboursement.statut, 'rembourse');
  await new Promise(res => setTimeout(res, 20));
  assert.deepEqual(emails, [20250]);

  // Alias inconnu : relu sur le paiement reçu
  statut = 'ENVOYE';
  await preparer(520);
  assert.equal(envois[1].payeAlias, 'alias-client-lu');
  assert.equal(PiSpiLocal.retournerFonds.mock.callCount(), 0);

  // Annulation demandée le jour du paiement → remboursement intégral (retour de fonds)
  PiSpiLocal.retournerFonds.mock.mockImplementation(async (e2e) => ({ end2endId: e2e, retourStatut: 'IRREVOCABLE' }));
  const { id, headersAdmin, headersClient } = await reservationConfirmee(1, 540, 543, 'integral@example.com');
  await db.collection('reservations').updateOne({ id }, { $set: { acompte: { paye: true, montant: 25200, payeLe: new Date(), txId: 'TXI', end2endId: 'E2E-I', methode: 'demande' } } });
  await api(`/api/client/reservations/${id}/annulation`, { method: 'POST', headers: headersClient, body: {} });
  await api(`/api/reservations/${id}/annulation`, { method: 'PUT', headers: headersAdmin, body: { decision: 'accepter' } });
  r = await db.collection('reservations').findOne({ id });
  assert.equal(r.acompte.remboursement.statut, 'rembourse');
  assert.equal(r.acompte.remboursement.montant, 25200);
  assert.equal(r.acompte.remboursement.pourcentage, 100);
  assert.equal(r.acompte.remboursement.methode, 'retour');
  assert.equal(envois.length, 2, 'pas de paiement sortant pour un remboursement intégral');
});

test('établissement : réglable par l\'admin, partie publique sans l\'email des alertes', async (t) => {
  const Settings = require('../services/SettingsService');
  t.after(async () => { await db.collection('parametres').deleteMany({}); await Settings.charger(); });
  const pub = await api('/api/etablissement');
  assert.equal(pub.status, 200);
  assert.equal(pub.body.data.nom, 'BABI RESIDENCE');
  assert.equal(pub.body.data.acompte.pourcentage, 30);
  assert.equal('emailNotifications' in pub.body.data, false, 'champ privé non exposé');

  assert.equal((await api('/api/admin/etablissement', { method: 'PUT', body: { nom: 'X' } })).status, 401);
  const headersAdmin = await connexionAdmin();
  const mauvaisLien = await api('/api/admin/etablissement', { method: 'PUT', headers: headersAdmin, body: { facebook: 'facebook.com/sankofart' } });
  assert.equal(mauvaisLien.status, 400);
  assert.match(mauvaisLien.body.message, /https/);
  assert.equal((await api('/api/admin/etablissement', { method: 'PUT', headers: headersAdmin, body: { nom: '  ' } })).status, 400);
  const ok = await api('/api/admin/etablissement', { method: 'PUT', headers: headersAdmin, body: { instagram: 'https://www.instagram.com/sankofart', emailNotifications: 'alertes@example.com', inconnu: 'ignoré' } });
  assert.equal(ok.status, 200);
  assert.equal(ok.body.data.instagram, 'https://www.instagram.com/sankofart');
  assert.equal(ok.body.data.emailNotifications, 'alertes@example.com');
  const apres = (await api('/api/etablissement')).body.data;
  assert.equal(apres.instagram, 'https://www.instagram.com/sankofart');
  assert.equal(apres.emailNotifications, undefined);
  // Les alertes partent à l'adresse réglée dans le back-office
  assert.equal(ReservationService.emailService.destinataireAdmin, 'alertes@example.com');
});

test('disponibilités par dates : résidences libres, dates contrôlées ; statut daté', async () => {
  const mauvais = await api('/api/residences/disponibles?arrivee=2026-12-10&depart=2026-12-05');
  assert.equal(mauvais.status, 400);
  const { id, headersAdmin } = await reservationConfirmee(2, 600, 604, 'dispo@example.com');
  await api(`/api/reservations/${id}/status`, { method: 'PUT', headers: headersAdmin, body: { statut: 'confirmee' } });
  const debut = jourDansNJours(601); const fin = jourDansNJours(603);
  const libres = (await api(`/api/residences/disponibles?arrivee=${debut}&depart=${fin}`)).body.data.ids;
  assert.ok(Array.isArray(libres));
  assert.equal(libres.includes(2), false, 'résidence réservée sur ces dates exclue');
  assert.equal(libres.includes(1), true);
  const apres = (await api(`/api/residences/disponibles?arrivee=${jourDansNJours(604)}&depart=${jourDansNJours(606)}`)).body.data.ids;
  assert.equal(apres.includes(2), true, 'libre le jour du départ');
  const vue = (await api('/api/reservations', { headers: headersAdmin })).body.data.find(r => r.id === id);
  assert.ok(vue.statutLe, 'date du dernier changement de statut');
});

test('moyens de paiement : liste, GeniusPay non configuré non activable, PI-SPI désactivable', async (t) => {
  configurerPiSpi(t, { PAIEMENT_MODE: 'pispi' });
  const Settings = require('../services/SettingsService');
  t.after(async () => { await db.collection('parametres').deleteMany({}); await Settings.charger(); });
  const headersAdmin = await connexionAdmin();
  assert.equal((await api('/api/admin/paiements/moyens')).status, 401);

  const liste = (await api('/api/admin/paiements/moyens', { headers: headersAdmin })).body.data;
  const pispi = liste.moyens.find(m => m.id === 'pispi');
  const genius = liste.moyens.find(m => m.id === 'geniuspay');
  assert.ok(pispi && genius);
  assert.equal(pispi.configure, true);
  assert.equal(pispi.actif, true, 'PI-SPI actif par défaut');
  assert.equal(genius.aVenir, false);
  assert.equal(genius.actif, false, 'GeniusPay non configuré dans ce test');
  assert.equal(liste.mode, 'pispi');

  const refus = await api('/api/admin/paiements/moyens/geniuspay', { method: 'PUT', headers: headersAdmin, body: { actif: true } });
  assert.equal(refus.status, 400);
  assert.match(refus.body.message, /pas configuré/);
  assert.equal((await api('/api/admin/paiements/moyens/inconnu', { method: 'PUT', headers: headersAdmin, body: { actif: true } })).status, 404);

  // Désactiver PI-SPI : plus d'acompte demandé, le site public ne le propose plus
  const off = await api('/api/admin/paiements/moyens/pispi', { method: 'PUT', headers: headersAdmin, body: { actif: false } });
  assert.equal(off.status, 200);
  assert.equal(off.body.data.mode, 'desactive');
  assert.deepEqual((await api('/api/etablissement')).body.data.moyensPaiement, []);
  const on = await api('/api/admin/paiements/moyens/pispi', { method: 'PUT', headers: headersAdmin, body: { actif: true } });
  assert.equal(on.body.data.mode, 'pispi');
  assert.deepEqual((await api('/api/etablissement')).body.data.moyensPaiement.map(m => m.id), ['pispi']);
});


test('GeniusPay : page de paiement, webhook signé, acompte payé, remboursement à faire', async (t) => {
  const crypto = require('node:crypto');
  const Settings = require('../services/SettingsService');
  const GeniusPay = require('../services/paiement/GeniusPayClient');
  const PaymentService = require('../services/paiement/PaymentService');
  const env = { PAIEMENT_MODE: 'desactive', GENIUSPAY_API_KEY: 'pk_sandbox_test', GENIUSPAY_API_SECRET: 'sk_sandbox_test', GENIUSPAY_WEBHOOK_SECRET: 'whsec_test', FRONTEND_URL: 'https://site.exemple.ci' };
  const avant = {};
  for (const [k, v] of Object.entries(env)) { avant[k] = process.env[k]; process.env[k] = v; }
  t.after(async () => {
    for (const [k, v] of Object.entries(avant)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
    await db.collection('parametres').deleteMany({}); await Settings.charger();
  });
  ReservationService.emailService.sendAcompteRecu = async () => {};
  ReservationService.emailService.sendAcompteRecuAdmin = async () => {};

  const creations = [];
  let statutDistant = 'pending';
  t.mock.method(GeniusPay, 'creerPaiement', async (p) => { creations.push(p); return { reference: 'SANDBOX_REF1', checkout_url: 'https://geniuspay.ci/checkout/SANDBOX_REF1', expires_at: new Date(Date.now() + 864e5).toISOString(), environment: 'sandbox' }; });
  t.mock.method(GeniusPay, 'lirePaiement', async (ref) => ({ reference: ref, status: statutDistant, amount: 999999, customer: { name: 'Awa K' } }));

  const headersAdmin = await connexionAdmin();
  const active = await api('/api/admin/paiements/moyens/geniuspay', { method: 'PUT', headers: headersAdmin, body: { actif: true } });
  assert.equal(active.status, 200, JSON.stringify(active.body));
  assert.equal(active.body.data.moyen.actif, true);

  const { id, headersClient } = await reservationConfirmee(1, 700, 703, 'genius@example.com');
  await api(`/api/reservations/${id}/status`, { method: 'PUT', headers: headersAdmin, body: { statut: 'confirmee' } });
  const vue = (await api('/api/client/reservations', { headers: headersClient })).body.data.find(r => r.id === id);
  assert.deepEqual(vue.acompte.moyens, ['geniuspay'], 'seul GeniusPay est proposé (PI-SPI désactivé)');
  assert.equal(vue.acompte.possible, true);
  assert.equal((await api(`/api/client/reservations/${id}/acompte`, { method: 'POST', headers: headersClient, body: { methode: 'qr' } })).status, 503, 'PI-SPI indisponible');

  const dem = await api(`/api/client/reservations/${id}/acompte`, { method: 'POST', headers: headersClient, body: { methode: 'geniuspay' } });
  assert.equal(dem.status, 201, JSON.stringify(dem.body));
  assert.equal(dem.body.data.checkoutUrl, 'https://geniuspay.ci/checkout/SANDBOX_REF1');
  assert.equal(creations[0].amount === undefined ? creations[0].montant : creations[0].amount, vue.acompte.montant);
  assert.match(creations[0].successUrl, /^https:\/\/site\.exemple\.ci\/mes-reservations\?paiement=geniuspay/);
  const txId = dem.body.data.txId;
  const encore = await api(`/api/client/reservations/${id}/acompte`, { method: 'POST', headers: headersClient, body: { methode: 'geniuspay' } });
  assert.equal(encore.body.data.txId, txId, 'page de paiement réutilisée');
  assert.equal(creations.length, 1);

  // Webhook : signature fausse refusée, signature correcte acceptée → revérification via l'API
  const corps = JSON.stringify({ event: 'payment.success', data: { reference: 'SANDBOX_REF1', status: 'completed', metadata: { txId } } });
  const ts = String(Math.floor(Date.now() / 1000));
  const signe = crypto.createHmac('sha256', 'whsec_test').update(`${ts}.${corps}`).digest('hex');
  const faux = await fetch(`${baseUrl}/api/paiements/geniuspay/webhook`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Webhook-Signature': 'abc', 'X-Webhook-Timestamp': ts }, body: corps });
  assert.equal(faux.status, 401);
  statutDistant = 'completed';
  const vrai = await fetch(`${baseUrl}/api/paiements/geniuspay/webhook`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Webhook-Signature': signe, 'X-Webhook-Timestamp': ts }, body: corps });
  assert.equal(vrai.status, 200);
  await new Promise(res => setTimeout(res, 50));
  let r = await db.collection('reservations').findOne({ id });
  assert.equal(r.acompte.paye, true);
  assert.equal(r.acompte.methode, 'geniuspay');
  assert.equal(r.acompte.end2endId, 'SANDBOX_REF1');

  // Annulation acceptée : pas d'API de remboursement → à rembourser depuis GeniusPay
  await api(`/api/client/reservations/${id}/annulation`, { method: 'POST', headers: headersClient, body: {} });
  await api(`/api/reservations/${id}/annulation`, { method: 'PUT', headers: headersAdmin, body: { decision: 'accepter' } });
  r = await db.collection('reservations').findOne({ id });
  assert.equal(r.acompte.remboursement.statut, 'a_rembourser');
  assert.match(r.acompte.remboursement.raison, /GeniusPay/);
  assert.equal(PaymentService === require('../services/paiement/PaymentService'), true);
});

test('GeniusPay : signature des webhooks (corps brut, JSON réencodé comme PHP, horodatage)', () => {
  const crypto = require('node:crypto');
  const GeniusPay = require('../services/paiement/GeniusPayClient');
  const avant = process.env.GENIUSPAY_WEBHOOK_SECRET;
  process.env.GENIUSPAY_WEBHOOK_SECRET = 'whsec_x';
  try {
    const maintenant = 1_800_000_000_000;
    const ts = String(maintenant / 1000);
    const objet = { event: 'payment.success', data: { url: 'https://a.b/c', nom: 'Aïcha' } };
    const php = JSON.stringify(objet).replace(/\//g, '\\/').replace(/[\u007f-\uffff]/g, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`);
    const sig = (texte) => crypto.createHmac('sha256', 'whsec_x').update(`${ts}.${texte}`).digest('hex');
    const brut = JSON.stringify(objet, null, 2);
    assert.equal(GeniusPay.signatureValide(Buffer.from(brut), sig(brut), ts, maintenant), true, 'corps brut');
    assert.equal(GeniusPay.signatureValide(Buffer.from(brut), sig(php), ts, maintenant), true, 'json_encode PHP');
    assert.equal(GeniusPay.signatureValide(Buffer.from(brut), sig(brut), ts, maintenant + 301_000), false, 'trop ancien');
    assert.equal(GeniusPay.signatureValide(Buffer.from(brut), sig('autre'), ts, maintenant), false, 'mauvaise signature');
  } finally {
    if (avant === undefined) delete process.env.GENIUSPAY_WEBHOOK_SECRET; else process.env.GENIUSPAY_WEBHOOK_SECRET = avant;
  }
});

test('sécurité : réservation non lisible sans jeton admin, entrées contrôlées, en-têtes posés', async () => {
  const creation = await api('/api/reservations', { method: 'POST', body: nouvelleReservation({ residenceId: 8, email: 'secu@example.com', dateArrivee: jourDansNJours(200), dateDepart: jourDansNJours(203) }) });
  assert.equal(creation.status, 201, JSON.stringify(creation.body));
  const id = creation.body.data.id;

  // Fuite de données personnelles : plus de lecture publique d'une réservation
  const publique = await api(`/api/reservations/${id}`);
  assert.equal(publique.status, 401);
  assert.equal(JSON.stringify(publique.body).includes('secu@example.com'), false);
  const headersAdmin = await connexionAdmin();
  const admin = await api(`/api/reservations/${id}`, { headers: headersAdmin });
  assert.equal(admin.status, 200);
  assert.equal(admin.body.data.client.email, 'secu@example.com');

  // Entrées malveillantes refusées proprement (400), jamais d'erreur 500
  const cas = [
    ['email invalide', { email: 'pas-un-email' }],
    ['nom en objet', { nom: { $gt: '' } }],
    ['dates en objet', { dateArrivee: { $gt: '' }, dateDepart: { $gt: '' } }],
    ['date mal formée', { dateArrivee: '18/12/2026' }],
    ['nom trop long', { nom: 'A'.repeat(81) }],
    ['notes trop longues', { notes: 'B'.repeat(1001) }],
    ['personnes négatives', { nombrePersonnes: -3 }],
    ['résidence non numérique', { residenceId: 'abc' }],
    ['téléphone fantaisiste', { telephone: '<script>' }],
  ];
  for (const [nom, champs] of cas) {
    const r = await api('/api/reservations', { method: 'POST', body: nouvelleReservation({ residenceId: 8, dateArrivee: jourDansNJours(210), dateDepart: jourDansNJours(213), ...champs }) });
    assert.equal(r.status, 400, `${nom} : HTTP ${r.status}`);
  }
  // Requête énorme : 413, pas de traitement
  const enorme = await api('/api/reservations', { method: 'POST', body: nouvelleReservation({ notes: 'C'.repeat(200_000) }) });
  assert.equal(enorme.status, 413);
  // JSON cassé : 400
  const casse = await fetch(`${baseUrl}/api/reservations`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"nom":' });
  assert.equal(casse.status, 400);

  // En-têtes de sécurité, sans signature du serveur
  const r = await fetch(`${baseUrl}/api/residences`);
  assert.equal(r.headers.get('x-powered-by'), null);
  assert.equal(r.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(r.headers.get('x-frame-options'), 'DENY');
  assert.match(r.headers.get('content-security-policy'), /frame-ancestors 'none'/);
  assert.equal(r.headers.get('access-control-allow-credentials'), null);
});

test('solde du séjour : en ligne après l\'acompte, sur place par l\'admin, rappel, annulation', async (t) => {
  configurerPiSpi(t, { PAIEMENT_MODE: 'simulation', ACOMPTE_POURCENTAGE: '30' });
  const es = ReservationService.emailService;
  const envois = [];
  es.sendAcompteRecu = async () => {}; es.sendAcompteRecuAdmin = async () => {};
  es.sendSoldeRecu = async (r) => { envois.push(['solde-client', r.id]); };
  es.sendSoldeRecuAdmin = async (r) => { envois.push(['solde-admin', r.id]); };
  es.sendRappelSolde = async (r) => { envois.push(['rappel', r.id]); };
  es.sendRemboursementEffectue = async () => {};

  // --- 1. Solde payé en ligne ---
  const { id, headersAdmin, headersClient } = await reservationConfirmee(2, 2, 6, 'solde@example.com');
  await api(`/api/reservations/${id}/status`, { method: 'PUT', headers: headersAdmin, body: { statut: 'confirmee' } });
  let vue = (await api('/api/client/reservations', { headers: headersClient })).body.data.find(r => r.id === id);
  assert.equal(vue.solde.possible, false, 'pas de solde en ligne avant l\'acompte');
  assert.equal(vue.solde.montant, vue.prixTotal - vue.acompte.montant);
  assert.equal((await api(`/api/client/reservations/${id}/acompte`, { method: 'POST', headers: headersClient, body: { methode: 'qr', objet: 'solde' } })).status, 400);

  const ac = (await api(`/api/client/reservations/${id}/acompte`, { method: 'POST', headers: headersClient, body: { methode: 'qr' } })).body.data;
  await api(`/api/client/reservations/${id}/acompte/${ac.txId}/simuler`, { method: 'POST', headers: headersClient });
  vue = (await api('/api/client/reservations', { headers: headersClient })).body.data.find(r => r.id === id);
  assert.equal(vue.acompte.paye, true);
  assert.equal(vue.solde.possible, true);
  assert.equal(vue.solde.aRegler, true);

  // Rappel envoyé une seule fois (arrivée dans 2 jours)
  assert.equal(await ReservationService.envoyerRappelsSolde(), 1);
  assert.equal(await ReservationService.envoyerRappelsSolde(), 0);
  assert.deepEqual(envois.filter(e => e[0] === 'rappel').map(e => e[1]), [id]);

  const so = await api(`/api/client/reservations/${id}/acompte`, { method: 'POST', headers: headersClient, body: { methode: 'qr', objet: 'solde' } });
  assert.equal(so.status, 201, JSON.stringify(so.body));
  assert.equal(so.body.data.objet, 'solde');
  assert.equal(so.body.data.montant, vue.solde.montant);
  const suivi = (await api(`/api/client/reservations/${id}/acompte/${so.body.data.txId}/simuler`, { method: 'POST', headers: headersClient })).body.data;
  assert.equal(suivi.statut, 'paye');
  assert.equal(suivi.objet, 'solde');
  assert.equal(suivi.solde.paye, true);
  assert.equal(suivi.solde.enLigne, true);
  await new Promise(r => setTimeout(r, 20));
  assert.ok(envois.some(e => e[0] === 'solde-client') && envois.some(e => e[0] === 'solde-admin'));
  // L'acompte n'a pas été touché
  const enBase = await db.collection('reservations').findOne({ id });
  assert.equal(enBase.acompte.montant, vue.acompte.montant);
  assert.equal(enBase.solde.montant, vue.solde.montant);
  assert.equal((await api(`/api/client/reservations/${id}/acompte`, { method: 'POST', headers: headersClient, body: { methode: 'qr', objet: 'solde' } })).status, 400, 'déjà réglé');

  // Annulation acceptée : solde à rembourser, puis marqué rendu
  await api(`/api/client/reservations/${id}/annulation`, { method: 'POST', headers: headersClient, body: {} });
  await api(`/api/reservations/${id}/annulation`, { method: 'PUT', headers: headersAdmin, body: { decision: 'accepter' } });
  let admin = (await api('/api/reservations', { headers: headersAdmin })).body.data.find(r => r.id === id);
  assert.equal(admin.solde.remboursement.statut, 'a_rembourser');
  const rendu = await api(`/api/reservations/${id}/solde/remboursement`, { method: 'PUT', headers: headersAdmin, body: { reference: 'ESPECES-01' } });
  assert.equal(rendu.status, 200);
  assert.equal(rendu.body.data.solde.remboursement.statut, 'rembourse');

  // --- 2. Solde réglé sur place, enregistré par l'admin ---
  const b = await reservationConfirmee(3, 20, 23, 'surplace@example.com');
  await api(`/api/reservations/${b.id}/status`, { method: 'PUT', headers: headersAdmin, body: { statut: 'confirmee' } });
  assert.equal((await api(`/api/reservations/${b.id}/solde`, { method: 'PUT', body: { moyen: 'especes' } })).status, 401, 'admin uniquement');
  assert.equal((await api(`/api/reservations/${b.id}/solde`, { method: 'PUT', headers: headersAdmin, body: { moyen: 'bitcoin' } })).status, 400);
  const place = await api(`/api/reservations/${b.id}/solde`, { method: 'PUT', headers: headersAdmin, body: { moyen: 'mobile_money', reference: 'OM-123' } });
  assert.equal(place.status, 200, JSON.stringify(place.body));
  assert.equal(place.body.data.solde.paye, true);
  assert.equal(place.body.data.solde.enLigne, false);
  assert.equal(place.body.data.solde.libelleMoyen, 'Mobile Money');
  assert.equal((await api(`/api/reservations/${b.id}/solde`, { method: 'PUT', headers: headersAdmin, body: { moyen: 'especes' } })).status, 409, 'pas deux fois');
  const vueB = (await api('/api/client/reservations', { headers: b.headersClient })).body.data.find(r => r.id === b.id);
  assert.equal(vueB.solde.paye, true);
  assert.equal(vueB.solde.possible, false);
});

test('robustesse : email piégé (ReDoS) rejeté vite, clés spéciales ignorées dans les paramètres', async (t) => {
  const piege = `${'a'.repeat(50000)}@${'b.'.repeat(25000)}`;
  const debut = Date.now();
  const r = await api('/api/client/acces', { method: 'POST', body: { email: piege, reference: 'X' } });
  assert.equal(r.status, 400);
  assert.ok(Date.now() - debut < 1000, 'réponse immédiate');
  assert.equal((await api('/api/client/acces', { method: 'POST', body: { email: 'a@b', reference: 'X' } })).status, 400, 'domaine sans extension');

  const Settings = require('../services/SettingsService');
  t.after(async () => { await db.collection('parametres').deleteMany({}); await Settings.charger(); });
  const headersAdmin = await connexionAdmin();
  const brut = '{"__proto__":{"pollue":true},"constructor":{"x":1},"remboursementPourcentage":40}';
  const res = await fetch(`${baseUrl}/api/admin/parametres`, { method: 'PUT', headers: { ...headersAdmin, 'Content-Type': 'application/json' }, body: brut });
  assert.equal(res.status, 200);
  assert.equal(({}).pollue, undefined, 'aucune pollution du prototype');
  const doc = await db.collection('parametres').findOne({ _id: 'acompte' });
  assert.deepEqual(Object.keys(doc).filter(k => !['_id', 'modifieLe'].includes(k)), ['remboursementPourcentage']);
});

// ---------- Multi-entreprises ----------

test('multi-entreprises : inscription, cloisonnement des données, validation et suspension', async (t) => {
  const Settings = require('../services/SettingsService');
  const emails = ReservationService.emailService;
  const envoyes = [];
  for (const nom of ['sendBienvenueEntreprise', 'sendNouvelleEntrepriseAdmin', 'sendStatutEntreprise']) {
    const original = emails[nom];
    emails[nom] = async (...args) => { envoyes.push(nom); };
    t.after(() => { emails[nom] = original; });
  }
  t.after(async () => { await db.collection('parametres').deleteMany({}); await Settings.charger(); });

  const mdp = randomBytes(9).toString('hex');
  const inscription = {
    entreprise: 'Villas Lagune', prenom: 'Koffi', nom: 'Yao', email: 'Gestion@VillasLagune.ci', telephone: '+225 07 00 00 00 01', motDePasse: mdp,
  };

  // Inscription : validations
  assert.equal((await api('/api/entreprises/inscription', { method: 'POST', body: { ...inscription, motDePasse: 'court' } })).status, 400);
  assert.equal((await api('/api/entreprises/inscription', { method: 'POST', body: { ...inscription, email: 'pas-un-email' } })).status, 400);
  const ins = await api('/api/entreprises/inscription', { method: 'POST', body: inscription });
  assert.equal(ins.status, 201, JSON.stringify(ins.body));
  assert.equal(ins.body.data.entreprise.statut, 'en_attente');
  assert.equal(ins.body.data.email, 'gestion@villaslagune.ci');
  assert.equal(ins.body.data.verificationRequise, true);
  assert.ok(!('token' in ins.body.data), 'pas de session avant la vérification de l\'email');
  assert.equal((await api('/api/entreprises/inscription', { method: 'POST', body: inscription })).status, 409, 'email déjà utilisé');
  const enBase = await db.collection('utilisateurs').findOne({ email: 'gestion@villaslagune.ci' });
  assert.match(enBase.motDePasse, /^scrypt\$/, 'mot de passe haché');
  assert.equal(enBase.emailVerifie, false);
  assert.ok(enBase.verificationEmail.empreinte && !JSON.stringify(enBase).includes(codesVerification.get('gestion@villaslagune.ci')), 'code jamais stocké en clair');
  const entId = ins.body.data.entreprise.id;

  // Email non vérifié : pas de connexion, pas de validation possible ; bienvenue envoyée après la vérification
  const nonVerifie = await api('/api/admin/login', { method: 'POST', body: { email: inscription.email, password: mdp } });
  assert.equal(nonVerifie.status, 403);
  assert.equal(nonVerifie.body.code, 'EMAIL_NON_VERIFIE');
  assert.equal((await api(`/api/admin/plateforme/entreprises/${entId}/statut`, { method: 'PUT', headers: await connexionAdmin(), body: { statut: 'validee' } })).status, 409);
  assert.equal(envoyes.length, 0);
  await verifierEmailPartenaire(inscription.email);
  assert.deepEqual(envoyes.sort(), ['sendBienvenueEntreprise', 'sendNouvelleEntrepriseAdmin']);

  // Connexion par email (insensible à la casse) ; mauvais mot de passe refusé
  assert.equal((await api('/api/admin/login', { method: 'POST', body: { email: inscription.email, password: MAUVAIS_MDP } })).status, 401);
  const login = await api('/api/admin/login', { method: 'POST', body: { email: 'GESTION@villaslagune.ci', password: mdp } });
  assert.equal(login.status, 200);
  const g = { Authorization: `Bearer ${login.body.data.token}` };
  const moi = (await api('/api/admin/moi', { headers: g })).body.data;
  assert.equal(moi.superAdmin, false);
  assert.equal(moi.entreprise.id, entId);
  assert.equal(moi.entreprise.statut, 'en_attente');

  // Identité de l'entreprise reprise de l'inscription
  const etab = (await api('/api/admin/etablissement', { headers: g })).body.data;
  assert.equal(etab.nom, 'Villas Lagune');
  assert.equal(etab.emailNotifications, 'gestion@villaslagune.ci');

  // Le gestionnaire ne voit et ne touche que ses données
  const headersAdmin = await connexionAdmin();
  const residencesPlateforme = (await api('/api/admin/residences', { headers: headersAdmin })).body.data.length;
  assert.equal((await api('/api/admin/residences', { headers: g })).body.data.length, 0);
  assert.equal((await api('/api/admin/residences/1', { method: 'PUT', headers: g, body: { prix: 1 } })).status, 404, 'résidence d\'une autre entreprise');
  assert.equal((await api('/api/admin/residences/1/status', { method: 'PUT', headers: g, body: { statut: 'maintenance' } })).status, 404);
  assert.equal((await api('/api/admin/residences/1', { method: 'DELETE', headers: g })).status, 404);
  assert.ok(await db.collection('residences').findOne({ id: 1, prix: { $ne: 1 } }), 'intacte');
  assert.equal((await api('/api/reservations', { headers: g })).body.data.length, 0, 'aucune réservation des autres');
  const uneResa = await db.collection('reservations').findOne({ entrepriseId: 'babi' });
  if (uneResa) {
    assert.equal((await api(`/api/reservations/${uneResa.id}`, { headers: g })).status, 404);
    assert.equal((await api(`/api/reservations/${uneResa.id}/status`, { method: 'PUT', headers: g, body: { statut: 'confirmee' } })).status, 404);
  }
  assert.equal((await api('/api/admin/plateforme/entreprises', { headers: g })).status, 403, 'réservé à la plateforme');

  // Même référence qu'une résidence de la plateforme : autorisé (unique par entreprise)
  const fiche = {
    nom: 'Villa Lagune', reference: 'RES-001', typeAppartement: 'Villa', localisation: 'Assinie', ville: 'Abidjan', quartier: 'Assinie',
    prix: 80000, nombreChambres: 3, capacite: 6, photos: [], equipements: ['Piscine'],
  };
  const creee = await api('/api/admin/residences', { method: 'POST', headers: g, body: fiche });
  assert.equal(creee.status, 201, JSON.stringify(creee.body));
  assert.equal((await api('/api/admin/residences', { method: 'POST', headers: g, body: fiche })).status, 400, 'doublon dans la même entreprise');
  const idVilla = creee.body.data.id;
  assert.equal((await api('/api/admin/residences', { headers: headersAdmin })).body.data.length, residencesPlateforme, 'la plateforme ne la voit pas dans sa gestion');

  // Règles d'acompte propres à l'entreprise
  assert.equal((await api('/api/admin/parametres', { method: 'PUT', headers: g, body: { acomptePourcentage: 40 } })).status, 200);
  assert.equal((await api('/api/admin/parametres', { headers: headersAdmin })).body.data.acomptePourcentage, 30, 'la plateforme garde ses règles');

  // En attente de validation : invisible sur le site
  assert.equal((await api(`/api/residences/${idVilla}`)).status, 404);
  assert.ok(!(await api('/api/residences')).body.data.some(r => r.id === idVilla));

  // Validation par la plateforme
  const liste = (await api('/api/admin/plateforme/entreprises', { headers: headersAdmin })).body.data;
  const ligne = liste.find(e => e.id === entId);
  assert.equal(ligne.residences, 1);
  assert.equal(ligne.gestionnaires[0].email, 'gestion@villaslagune.ci');
  assert.ok(!('motDePasse' in ligne.gestionnaires[0]));
  assert.equal((await api('/api/admin/plateforme/entreprises/babi/statut', { method: 'PUT', headers: headersAdmin, body: { statut: 'suspendue' } })).status, 409, 'plateforme non suspendable');
  const valid = await api(`/api/admin/plateforme/entreprises/${entId}/statut`, { method: 'PUT', headers: headersAdmin, body: { statut: 'validee' } });
  assert.equal(valid.status, 200);
  for (let i = 0; i < 20 && !envoyes.includes('sendStatutEntreprise'); i++) await new Promise(r => setTimeout(r, 25));
  assert.ok(envoyes.includes('sendStatutEntreprise'), 'gestionnaire prévenu');
  // Résidence d'une entreprise : publiée seulement une fois vérifiée (voir test « vérification des résidences »)
  assert.equal((await api(`/api/residences/${idVilla}`)).status, 404, 'non vérifiée : invisible');
  await db.collection('residences').updateOne({ id: idVilla }, { $set: { statutVerification: 'verifiee' } });

  const publique = await api(`/api/residences/${idVilla}`);
  assert.equal(publique.status, 200);
  assert.equal(publique.body.data.entreprise.nom, 'Villas Lagune');
  assert.equal(publique.body.data.entreprise.acompte.pourcentage, 40);
  assert.equal((await api('/api/residences/1')).body.data.entreprise.acompte.pourcentage, 30);

  // Une réservation sur sa résidence lui revient
  const resa = await api('/api/reservations', { method: 'POST', body: nouvelleReservation({ residenceId: idVilla, dateArrivee: jourDansNJours(200), dateDepart: jourDansNJours(203), nombrePersonnes: 4 }) });
  assert.equal(resa.status, 201, JSON.stringify(resa.body));
  const idResa = resa.body.data.id || resa.body.data.reservation?.id;
  assert.equal((await db.collection('reservations').findOne({ id: idResa })).entrepriseId, entId);
  assert.ok((await api('/api/reservations', { headers: g })).body.data.some(r => r.id === idResa));
  assert.ok(!(await api('/api/reservations', { headers: headersAdmin })).body.data.some(r => r.id === idResa), 'pas chez la plateforme');
  assert.equal((await api(`/api/reservations/${idResa}/status`, { method: 'PUT', headers: g, body: { statut: 'confirmee' } })).status, 200);

  // Encaissement centralisé : les entreprises ne saisissent plus de clés et ne règlent pas les moyens de paiement
  assert.equal((await api('/api/admin/paiements/cles/geniuspay', { method: 'PUT', headers: g, body: { GENIUSPAY_API_KEY: 'pk_sandbox_abc123' } })).status, 409);
  assert.equal((await api('/api/admin/paiements/moyens/geniuspay', { method: 'PUT', headers: g, body: { actif: true } })).status, 403, 'réservé à la plateforme');
  const moyensG = (await api('/api/admin/paiements/moyens', { headers: g })).body.data;
  assert.equal(moyensG.encaissementPlateforme, true);
  assert.ok(moyensG.webhooks.geniuspay.endsWith('/api/paiements/geniuspay/webhook'), 'une seule adresse : celle de la plateforme');
  assert.ok(!('variables' in moyensG.moyens[0]), 'pas de détail technique pour les entreprises');
  // Webhook d'une entreprise inconnue
  assert.equal((await fetch(`${baseUrl}/api/paiements/geniuspay/webhook/ent_inconnue`, { method: 'POST', body: '{}' })).status, 404);

  // Mot de passe
  assert.equal((await api('/api/admin/moi/mot-de-passe', { method: 'PUT', headers: g, body: { actuel: MAUVAIS_MDP, nouveau: 'unnouveaumotdepasse' } })).status, 403);

  // Suspension : site et espace de gestion fermés
  assert.equal((await api(`/api/admin/plateforme/entreprises/${entId}/statut`, { method: 'PUT', headers: headersAdmin, body: { statut: 'suspendue', motif: 'Documents manquants' } })).status, 200);
  assert.equal((await api(`/api/residences/${idVilla}`)).status, 404);
  assert.equal((await api('/api/admin/residences', { headers: g })).status, 403);
  assert.equal((await api('/api/admin/login', { method: 'POST', body: { email: inscription.email, password: mdp } })).status, 403);
});

test('migration : les résidences de la plateforme restent vérifiées et publiées', async () => {
  const Verification = require('../services/VerificationService');
  // Cas de production : résidences de la plateforme passées en brouillon par l'ancienne migration
  await db.collection('residences').updateMany({ entrepriseId: 'babi' }, { $set: { statutVerification: 'brouillon' } });
  assert.equal((await api('/api/residences')).body.total, 0);
  await Verification.initialiser();
  const publiques = (await api('/api/residences')).body;
  assert.ok(publiques.total >= 10, `résidences de la plateforme republiées (${publiques.total})`);
});

test('vérification des résidences : dossier, photos, décision de la plateforme, signalements', async (t) => {
  const Verification = require('../services/VerificationService');
  const emails = ReservationService.emailService;
  const envoyes = [];
  for (const nom of ['sendBienvenueEntreprise', 'sendNouvelleEntrepriseAdmin', 'sendStatutEntreprise', 'sendAlerteVerification', 'sendDecisionVerification']) {
    const original = emails[nom];
    emails[nom] = async (...args) => { envoyes.push(nom); };
    t.after(() => { emails[nom] = original; });
  }
  const attendreEmail = async (nom) => { for (let i = 0; i < 20 && !envoyes.includes(nom); i++) await new Promise(r => setTimeout(r, 25)); return envoyes.includes(nom); };
  const headersAdmin = await connexionAdmin();

  // Deux entreprises validées
  const entreprise = async (nom, email) => {
    const mdp = randomBytes(9).toString('hex');
    const ins = await api('/api/entreprises/inscription', { method: 'POST', body: { entreprise: nom, prenom: 'Awa', nom: 'Test', email, telephone: '+225 07 00 00 00 09', motDePasse: mdp } });
    assert.equal(ins.status, 201, JSON.stringify(ins.body));
    const session = await verifierEmailPartenaire(email);
    await api(`/api/admin/plateforme/entreprises/${ins.body.data.entreprise.id}/statut`, { method: 'PUT', headers: headersAdmin, body: { statut: 'validee' } });
    return session;
  };
  const g = await entreprise('Cocotiers Verif', 'gestion@cocotiers-verif.ci');
  const autre = await entreprise('Autre Verif', 'gestion@autre-verif.ci');

  // Nouvelle résidence : brouillon, photos par adresse libre ignorées
  const creee = await api('/api/admin/residences', { method: 'POST', headers: g, body: {
    nom: 'Villa Cocotiers', reference: 'VC-1', typeAppartement: 'Villa', localisation: 'Rue des Cocotiers', ville: 'Abidjan', quartier: 'Riviera',
    prix: 70000, nombreChambres: 3, capacite: 6, photos: ['https://exemple.com/photo-volee.jpg'],
  } });
  assert.equal(creee.status, 201, JSON.stringify(creee.body));
  const id = creee.body.data.id;
  assert.equal(creee.body.data.statutVerification, 'brouillon');
  assert.deepEqual(creee.body.data.photos, [], 'photos externes refusées');
  assert.equal((await api(`/api/residences/${id}`)).status, 404, 'brouillon invisible');

  // Fichiers : type réel contrôlé
  const jpeg = Buffer.concat([Buffer.from([0xFF, 0xD8, 0xFF, 0xE0]), randomBytes(200)]).toString('base64');
  const pdf = Buffer.concat([Buffer.from('%PDF-1.4\n'), randomBytes(200)]).toString('base64');
  const faux = Buffer.from('<script>alert(1)</script> pas une image').toString('base64');
  assert.equal((await api(`/api/admin/residences/${id}/photos`, { method: 'POST', headers: g, body: { contenu: faux } })).status, 400);
  const urls = [];
  for (let i = 0; i < 3; i++) {
    const p = await api(`/api/admin/residences/${id}/photos`, { method: 'POST', headers: g, body: { contenu: jpeg } });
    assert.equal(p.status, 201, JSON.stringify(p.body));
    urls.push(p.body.data.url);
  }
  const photo = await fetch(`${baseUrl}/api/photos/${urls[0].split('/').pop()}`);
  assert.equal(photo.status, 200);
  assert.equal(photo.headers.get('content-type'), 'image/jpeg');
  assert.equal((await fetch(`${baseUrl}/api/photos/000000000000000000000000`)).status, 404);
  assert.equal((await api(`/api/admin/residences/${id}/photos`, { method: 'POST', headers: autre, body: { contenu: jpeg } })).status, 404, 'autre entreprise');

  // Dossier incomplet
  const incomplet = await api(`/api/admin/residences/${id}/verification/soumettre`, { method: 'POST', headers: g });
  assert.equal(incomplet.status, 400);
  assert.match(incomplet.body.message, /GPS/);
  const dossier0 = (await api(`/api/admin/residences/${id}/verification`, { headers: g })).body.data;
  assert.match(dossier0.code, /^[A-Z2-9]{6}$/);
  assert.equal((await api(`/api/admin/residences/${id}/verification`, { headers: autre })).status, 404, 'dossier privé');

  // Compléter : GPS, justificatifs, photos sur place géolocalisées
  assert.equal((await api(`/api/admin/residences/${id}/verification/gps`, { method: 'PUT', headers: g, body: { lat: 'x', lng: 2 } })).status, 400);
  assert.equal((await api(`/api/admin/residences/${id}/verification/gps`, { method: 'PUT', headers: g, body: { lat: 5.3600, lng: -3.9500 } })).status, 200);
  assert.equal((await api(`/api/admin/residences/${id}/verification/documents`, { method: 'POST', headers: g, body: { type: 'inconnu', contenu: pdf } })).status, 400);
  assert.equal((await api(`/api/admin/residences/${id}/verification/documents`, { method: 'POST', headers: g, body: { type: 'identite', nom: 'CNI.pdf', contenu: pdf } })).status, 201);
  const droit = await api(`/api/admin/residences/${id}/verification/documents`, { method: 'POST', headers: g, body: { type: 'droit', nom: 'Mandat.pdf', contenu: pdf } });
  assert.equal(droit.status, 201);
  assert.equal((await api(`/api/admin/residences/${id}/verification/preuves`, { method: 'POST', headers: g, body: { type: 'facade', contenu: pdf } })).status, 400, 'photo uniquement');
  assert.equal((await api(`/api/admin/residences/${id}/verification/preuves`, { method: 'POST', headers: g, body: { type: 'facade', contenu: jpeg, gps: { lat: 5.3605, lng: -3.9502, precision: 12 } } })).status, 201);
  const dossier = (await api(`/api/admin/residences/${id}/verification/preuves`, { method: 'POST', headers: g, body: { type: 'interieur', contenu: jpeg } })).body.data;
  assert.equal(dossier.manquants.length, 0, JSON.stringify(dossier.manquants));
  const facade = dossier.preuves.find(p => p.type === 'facade');
  assert.ok(facade.distanceM > 0 && facade.distanceM < 100, `distance ${facade.distanceM}`);

  // Justificatif : téléchargement réservé à l'entreprise et à la plateforme
  const idDoc = droit.body.data.documents.find(d => d.type === 'droit').id;
  const telechargement = await fetch(`${baseUrl}/api/admin/residences/${id}/verification/fichiers/${idDoc}`, { headers: g });
  assert.equal(telechargement.status, 200);
  assert.equal(telechargement.headers.get('content-type'), 'application/pdf');
  assert.match(telechargement.headers.get('content-disposition'), /^attachment/);
  assert.equal((await fetch(`${baseUrl}/api/admin/residences/${id}/verification/fichiers/${idDoc}`, { headers: autre })).status, 404);
  assert.equal((await fetch(`${baseUrl}/api/admin/residences/${id}/verification/fichiers/${idDoc}`)).status, 401);

  // Envoi, puis décision de la plateforme
  const soumis = await api(`/api/admin/residences/${id}/verification/soumettre`, { method: 'POST', headers: g });
  assert.equal(soumis.status, 200, JSON.stringify(soumis.body));
  assert.equal(soumis.body.data.statut, 'en_attente');
  assert.ok(await attendreEmail('sendAlerteVerification'), 'plateforme prévenue');
  assert.equal((await api('/api/admin/plateforme/verifications', { headers: g })).status, 403, 'réservé à la plateforme');
  const file = (await api('/api/admin/plateforme/verifications', { headers: headersAdmin })).body.data;
  assert.ok(file.some(v => v.id === id && v.entreprise === 'Cocotiers Verif'));
  assert.equal((await fetch(`${baseUrl}/api/admin/plateforme/verifications/${id}/fichiers/${idDoc}`, { headers: headersAdmin })).status, 200);
  assert.equal((await api(`/api/admin/plateforme/verifications/${id}`, { method: 'PUT', headers: headersAdmin, body: { action: 'completer' } })).status, 400, 'motif requis');
  assert.equal((await api(`/api/admin/plateforme/verifications/${id}`, { method: 'PUT', headers: headersAdmin, body: { action: 'examiner' } })).status, 200);
  assert.equal((await api(`/api/admin/residences/${id}/verification/gps`, { method: 'PUT', headers: g, body: { lat: 5.1, lng: -4 } })).status, 409, 'figé pendant l\'examen');
  const ok = await api(`/api/admin/plateforme/verifications/${id}`, { method: 'PUT', headers: headersAdmin, body: { action: 'verifier' } });
  assert.equal(ok.status, 200, JSON.stringify(ok.body));
  assert.ok(await attendreEmail('sendDecisionVerification'), 'gestionnaire prévenu');
  assert.equal((await api(`/api/residences/${id}`)).status, 200, 'vérifiée : publiée');
  assert.deepEqual(ok.body.data.historique.map(h => h.statut), ['en_attente', 'en_verification', 'verifiee']);

  // Changement d'adresse : retour en vérification, retrait du site
  const modif = await api(`/api/admin/residences/${id}`, { method: 'PUT', headers: g, body: { localisation: 'Autre rue, Bingerville' } });
  assert.equal(modif.status, 200);
  assert.equal(modif.body.data.statutVerification, 'en_attente');
  assert.equal((await api(`/api/residences/${id}`)).status, 404);
  await api(`/api/admin/plateforme/verifications/${id}`, { method: 'PUT', headers: headersAdmin, body: { action: 'verifier' } });

  // Signalement d'un visiteur
  assert.equal((await api(`/api/residences/${id}/signalement`, { method: 'POST', body: { motif: 'nimporte' } })).status, 400);
  const sig = await api(`/api/residences/${id}/signalement`, { method: 'POST', body: { motif: 'paiement_hors_plateforme', message: 'On m\'a demandé un dépôt Wave par WhatsApp', email: 'client@example.com' } });
  assert.equal(sig.status, 201);
  const signalements = (await api('/api/admin/plateforme/signalements', { headers: headersAdmin })).body.data;
  const s1 = signalements.find(x => x.residenceId === id);
  assert.equal(s1.motif, 'paiement_hors_plateforme');
  assert.equal((await api('/api/admin/plateforme/verifications/compteurs', { headers: headersAdmin })).body.data.signalements >= 1, true);
  assert.equal((await api(`/api/admin/plateforme/verifications/${id}`, { method: 'PUT', headers: headersAdmin, body: { action: 'suspendre', motif: 'Signalement : paiement hors plateforme' } })).status, 200);
  assert.equal((await api(`/api/residences/${id}`)).status, 404, 'suspendue : retirée');
  assert.equal((await api(`/api/admin/plateforme/signalements/${s1.id}`, { method: 'PUT', headers: headersAdmin })).status, 200);
  assert.ok(!(await api('/api/admin/plateforme/signalements', { headers: headersAdmin })).body.data.some(x => x.id === s1.id), 'traité');

  // Résidences de la plateforme : vérifiées d'office, non concernées
  assert.equal((await api('/api/admin/plateforme/verifications/1', { method: 'PUT', headers: headersAdmin, body: { action: 'suspendre', motif: 'test motif' } })).status, 409);
  assert.equal(Verification.distanceM({ lat: 5.36, lng: -3.95 }, { lat: 5.36, lng: -3.95 }), 0);

  // Suppression : dossier et fichiers effacés
  assert.equal((await api(`/api/admin/residences/${id}`, { method: 'DELETE', headers: g })).status, 200);
  assert.equal(await db.collection('verifications').countDocuments({ _id: id }), 0);
  assert.equal(await db.collection('justificatifs.files').countDocuments({ 'metadata.residenceId': id }), 0);
  assert.equal(await db.collection('photos.files').countDocuments({ 'metadata.residenceId': id }), 0);
});

// ---------- Module financier ----------

test('module financier : commission, registre en partie double, sommes dues, reversement manuel, remboursement, rapprochement', async (t) => {
  configurerPiSpi(t, { PAIEMENT_MODE: 'simulation', ACOMPTE_POURCENTAGE: '30' });
  const Finance = require('../services/finance');
  const Ledger = Finance.Ledger;
  const emails = ReservationService.emailService;
  for (const nom of ['sendBienvenueEntreprise', 'sendNouvelleEntrepriseAdmin', 'sendStatutEntreprise', 'sendAcompteRecu', 'sendAcompteRecuAdmin', 'sendAlerteFinance', 'sendDemandeAnnulationAdmin', 'sendRemboursementEffectue']) {
    const original = emails[nom];
    emails[nom] = async () => {};
    t.after(() => { emails[nom] = original; });
  }
  const headersAdmin = await connexionAdmin();

  // Entreprise validée et résidence vérifiée
  const mdp = randomBytes(9).toString('hex');
  const ins = await api('/api/entreprises/inscription', { method: 'POST', body: { entreprise: 'Finance Lagune', prenom: 'Ama', nom: 'Test', email: 'finance@lagune-test.ci', telephone: '+225 07 00 00 00 77', motDePasse: mdp } });
  const entId = ins.body.data.entreprise.id;
  const g = await verifierEmailPartenaire('finance@lagune-test.ci');
  await api(`/api/admin/plateforme/entreprises/${entId}/statut`, { method: 'PUT', headers: headersAdmin, body: { statut: 'validee' } });
  const res = await api('/api/admin/residences', { method: 'POST', headers: g, body: { nom: 'Villa Finance', reference: 'VF-1', typeAppartement: 'Villa', localisation: 'Rue A', ville: 'Abidjan', quartier: 'Cocody', prix: 50000, nombreChambres: 2, capacite: 4 } });
  const idRes = res.body.data.id;
  await db.collection('residences').updateOne({ id: idRes }, { $set: { statutVerification: 'verifiee' } });

  const payerAcompte = async (email, j1, j2) => {
    const c = await api('/api/reservations', { method: 'POST', body: nouvelleReservation({ residenceId: idRes, email, dateArrivee: jourDansNJours(j1), dateDepart: jourDansNJours(j2), nombrePersonnes: 2 }) });
    assert.equal(c.status, 201, JSON.stringify(c.body));
    const id = c.body.data.id;
    assert.equal((await api(`/api/reservations/${id}/status`, { method: 'PUT', headers: g, body: { statut: 'confirmee' } })).status, 200);
    const acces = await api('/api/client/acces', { method: 'POST', body: { email, reference: id } });
    const hc = { Authorization: `Bearer ${acces.body.data.token}` };
    const qr = await api(`/api/client/reservations/${id}/acompte`, { method: 'POST', headers: hc, body: { methode: 'qr' } });
    const { txId, montant } = qr.body.data;
    assert.equal((await api(`/api/client/reservations/${id}/acompte/${txId}/simuler`, { method: 'POST', headers: hc })).status, 200);
    return { id, txId, montant, hc };
  };

  // 1. Paiement de l'acompte : 3 nuits × 50 000 = 150 000 ; acompte 30 % = 45 000 ; commission 8 % = 3 600
  const r1 = await payerAcompte('client1@finance.ci', 300, 303);
  assert.equal(r1.montant, 45000);
  const doc1 = await db.collection('reservations').findOne({ id: r1.id });
  assert.equal(doc1.conditionsFinancieres.tauxCommissionPb, 800, 'taux figé à la création');
  const tx1 = await Ledger.transactions.findOne({ cle: `PAIEMENT:${r1.txId}` });
  assert.equal(tx1.type, 'PAIEMENT_CLIENT');
  const e1 = await Ledger.ecritures.find({ transactionId: tx1._id }).toArray();
  const ligne = (compte) => e1.find(e => e.compte === compte);
  assert.deepEqual([ligne('FONDS_PRESTATAIRE').sens, ligne('FONDS_PRESTATAIRE').montant, ligne('FONDS_PRESTATAIRE').fournisseur], ['DEBIT', 45000, 'simulation']);
  assert.equal(ligne('COMMISSION_BABI').montant, 3600);
  assert.equal(ligne('DETTE_PROPRIETAIRE').montant, 41400);
  assert.ok(e1.every(e => Number.isSafeInteger(e.montant)), 'montants entiers');

  // Idempotence : un second traitement du même paiement n'écrit rien
  assert.equal((await Finance.paiementConfirme(doc1, { txId: r1.txId, montant: 45000, objet: 'acompte' })).cree, false);
  assert.equal(await Ledger.transactions.countDocuments({ cle: `PAIEMENT:${r1.txId}` }), 1);
  let dette1 = await Finance.dettes.findOne({ _id: r1.id });
  assert.deepEqual([dette1.brut, dette1.commission, dette1.du, dette1.verse], [45000, 3600, 41400, 0]);
  assert.equal((await Finance.listerDettes({ entrepriseId: entId }))[0].statut, 'EN_ATTENTE', 'pas avant 24 h après l\'arrivée');
  assert.equal(Finance.eligibleLe('2031-06-10').toISOString(), '2031-06-11T14:00:00.000Z');

  // 2. Nouveau taux : n'affecte pas l'ancienne réservation
  assert.equal((await api('/api/admin/finance/commission', { method: 'PUT', headers: g, body: { tauxPourcent: 10 } })).status, 403, 'réservé à la plateforme');
  assert.equal((await api('/api/admin/finance/commission', { method: 'PUT', headers: headersAdmin, body: { tauxPourcent: 60 } })).status, 400);
  assert.equal((await api('/api/admin/finance/commission', { method: 'PUT', headers: headersAdmin, body: { tauxPourcent: 10 } })).status, 200);
  t.after(async () => { await db.collection('commission_rules').deleteMany({ tauxPb: 1000 }); });
  const r2 = await payerAcompte('client2@finance.ci', 320, 322); // 2 nuits = 100 000 ; acompte 30 000 ; 10 % = 3 000
  assert.equal((await db.collection('reservations').findOne({ id: r2.id })).conditionsFinancieres.tauxCommissionPb, 1000);
  assert.equal((await Finance.dettes.findOne({ _id: r2.id })).commission, 3000);

  // 3. Solde reçu sur place : la commission (au taux figé de 8 %) est déduite des sommes dues
  assert.equal((await api(`/api/reservations/${r1.id}/solde`, { method: 'PUT', headers: g, body: { moyen: 'especes' } })).status, 200);
  dette1 = await Finance.dettes.findOne({ _id: r1.id });
  assert.equal(dette1.commission, 3600 + 8400, 'commission 8 % de 105 000');
  assert.equal(dette1.du, 41400 - 8400);
  assert.ok(await Ledger.transactions.findOne({ cle: `SURPLACE:${r1.id}`, type: 'COMMISSION_SUR_PLACE' }));

  // 4. Remboursement : annulation dans les 5 jours, acompte rendu en entier, commission rendue
  const r3 = await payerAcompte('client3@finance.ci', 340, 342);
  await api(`/api/client/reservations/${r3.id}/annulation`, { method: 'POST', headers: r3.hc, body: { motif: 'Empêchement' } });
  assert.equal((await api(`/api/reservations/${r3.id}/annulation`, { method: 'PUT', headers: g, body: { decision: 'accepter' } })).status, 200);
  const remb = await Ledger.transactions.findOne({ cle: `REMBOURSEMENT:acompte:${r3.id}` });
  assert.equal(remb?.type, 'REMBOURSEMENT_CLIENT', 'remboursement comptabilisé');
  const d3 = await Finance.dettes.findOne({ _id: r3.id });
  assert.equal(d3.du, 0, 'plus rien dû au propriétaire');
  assert.equal(d3.commission, 0, 'commission rendue');

  // 5. Coordonnées de versement : obligatoires et vérifiées par la plateforme
  await Finance.dettes.updateMany({ entrepriseId: entId }, { $set: { eligibleLe: new Date(Date.now() - 1000) } }); // arrivée passée
  assert.equal((await api('/api/admin/finance/reversements', { method: 'POST', headers: headersAdmin, body: { entrepriseId: entId } })).status, 409, 'coordonnées non vérifiées');
  assert.equal((await api('/api/admin/revenus/beneficiaire', { method: 'PUT', headers: g, body: { type: 'mobile_money', beneficiaire: 'Ama Test', destination: 'abc' } })).status, 400);
  const benef = await api('/api/admin/revenus/beneficiaire', { method: 'PUT', headers: g, body: { type: 'mobile_money', operateur: 'Wave', beneficiaire: 'Ama Test', destination: '+225 07 00 00 00 77' } });
  assert.equal(benef.status, 200, JSON.stringify(benef.body));
  assert.equal(benef.body.data.beneficiaire.statut, 'a_verifier');
  assert.equal((await api(`/api/admin/finance/beneficiaires/${entId}`, { method: 'PUT', headers: headersAdmin, body: { valide: true } })).status, 200);

  // 6. Reversement manuel : demande → approbation → exécution → preuve → confirmation
  const versable = 33000 + 27000; // r1 (41 400 − 8 400) + r2 (30 000 − 3 000)
  const revenus = (await api('/api/admin/revenus', { headers: g })).body.data;
  assert.equal(revenus.versable, versable);
  assert.equal((await api('/api/admin/finance/apercu', { headers: g })).status, 403, 'finances de la plateforme réservées');
  assert.equal((await api('/api/admin/finance/reversements', { method: 'POST', headers: headersAdmin, body: { entrepriseId: entId, montant: versable + 1 } })).status, 409, 'pas plus que le dû');
  const po = await api('/api/admin/finance/reversements', { method: 'POST', headers: headersAdmin, body: { entrepriseId: entId } });
  assert.equal(po.status, 201, JSON.stringify(po.body));
  assert.equal(po.body.data.montant, versable);
  assert.match(po.body.data.reference, /^PO-\d{4}-\d{6}$/);
  const idPo = po.body.data.id;
  assert.equal((await api('/api/admin/finance/reversements', { method: 'POST', headers: headersAdmin, body: { entrepriseId: entId } })).status, 409, 'un seul reversement en cours');
  const agir = (body) => api(`/api/admin/finance/reversements/${idPo}`, { method: 'PUT', headers: headersAdmin, body });
  assert.equal((await agir({ action: 'executer', referenceExterne: 'WAVE-1', source: 'geniuspay' })).status, 409, 'approbation d\'abord');
  assert.equal((await agir({ action: 'approuver' })).status, 200);
  assert.equal((await agir({ action: 'executer', source: 'geniuspay' })).status, 400, 'référence obligatoire');
  const exe = await agir({ action: 'executer', referenceExterne: 'WAVE-123456', source: 'geniuspay' });
  assert.equal(exe.status, 200, JSON.stringify(exe.body));
  assert.equal((await agir({ action: 'confirmer' })).status, 409, 'preuve obligatoire');
  const preuve = Buffer.concat([Buffer.from('%PDF-1.4\n'), randomBytes(100)]).toString('base64');
  assert.equal((await api(`/api/admin/finance/reversements/${idPo}/preuve`, { method: 'POST', headers: headersAdmin, body: { contenu: preuve, nom: 'recu-wave.pdf' } })).status, 200);
  assert.equal((await fetch(`${baseUrl}/api/admin/finance/reversements/${idPo}/preuve`, { headers: headersAdmin })).status, 200);
  const conf = await agir({ action: 'confirmer' });
  assert.equal(conf.body.data.statut, 'CONFIRME');
  assert.deepEqual(conf.body.data.historique.map(h => h.statut), ['EN_ATTENTE_APPROBATION', 'APPROUVE', 'EXECUTE', 'CONFIRME']);
  assert.equal(await Ledger.solde('DETTE_PROPRIETAIRE', { entrepriseId: entId }), 0, 'plus rien dû');
  assert.ok((await Finance.listerDettes({ entrepriseId: entId })).every(d => ['VERSEE', 'SOLDEE'].includes(d.statut)));
  assert.equal((await api('/api/admin/revenus', { headers: g })).body.data.versable, 0);

  // 7. Registre : équilibré, contre-passation seulement, rapprochement
  const balance = await Ledger.balance();
  assert.equal(balance.equilibree, true);
  assert.throws(() => Ledger.valider([{ compte: 'COMMISSION_BABI', sens: 'DEBIT', montant: 10 }, { compte: 'DETTE_PROPRIETAIRE', sens: 'CREDIT', montant: 9 }]), /déséquilibrée/);
  assert.throws(() => Ledger.valider([{ compte: 'COMMISSION_BABI', sens: 'DEBIT', montant: 10.5 }, { compte: 'DETTE_PROPRIETAIRE', sens: 'CREDIT', montant: 10.5 }]), /entier/);
  const rappro = await api('/api/admin/finance/rapprochements', { method: 'POST', headers: headersAdmin, body: {} });
  assert.equal(rappro.status, 201);
  // Seule anomalie admise : le paiement en double d'un test précédent (trop-perçu réel, à rendre au client)
  assert.deepEqual(rappro.body.data.anomalies.filter(a => a.type !== 'TROP_PERCU'), [], JSON.stringify(rappro.body.data.anomalies));
  const surPlace = await Ledger.transactions.findOne({ cle: `SURPLACE:${r1.id}` });
  const contre = await api(`/api/admin/finance/registre/${surPlace._id}/contrepassation`, { method: 'POST', headers: headersAdmin, body: { motif: 'Erreur de saisie du solde' } });
  assert.equal(contre.status, 201);
  const contreTx = await Ledger.transactions.findOne({ cle: `CONTRE:${surPlace._id}` });
  assert.equal((await api(`/api/admin/finance/registre/${contreTx._id}/contrepassation`, { method: 'POST', headers: headersAdmin, body: { motif: 'pas possible' } })).status, 409);
  assert.ok(await Ledger.transactions.findOne({ _id: surPlace._id, statut: 'POSTED' }), 'l\'original reste inchangé');
  const rappro2 = (await api('/api/admin/finance/rapprochements', { method: 'POST', headers: headersAdmin, body: {} })).body.data;
  assert.ok(rappro2.anomalies.some(a => a.type === 'ECART_DETTE' && a.entrepriseId === entId), 'écart détecté');

  // 8. Webhooks tracés, rejoués comptés une fois
  const corps = JSON.stringify({ event: 'payment.success', data: { reference: 'X-INCONNU' } });
  for (let i = 0; i < 2; i++) assert.equal((await fetch(`${baseUrl}/api/paiements/geniuspay/webhook`, { method: 'POST', body: corps })).status, 401);
  await new Promise(r => setTimeout(r, 50));
  const w = await Finance.webhooks.findOne({ fournisseur: 'geniuspay', reference: 'X-INCONNU' });
  assert.equal(w.statut, 'REJETE');
  assert.equal(w.receptions, 2);

  // 9. Vue d'ensemble
  const apercu = (await api('/api/admin/finance/apercu', { headers: headersAdmin })).body.data;
  assert.ok(apercu.encaisse >= 45000 + 30000);
  assert.ok(apercu.reverse >= versable);
  assert.equal(typeof apercu.balanceEquilibree, 'boolean');
  const csv = await fetch(`${baseUrl}/api/admin/finance/registre.csv`, { headers: headersAdmin });
  assert.match(await csv.text(), /PAIEMENT_CLIENT/);
});

// Doit rester le dernier test : il confie les résidences de la plateforme à une entreprise interne
test('super admin : vue d\'ensemble de la plateforme, transfert des résidences à « BABI RESIDENCE Gestion », champs des entreprises', async () => {
  const headersAdmin = await connexionAdmin();
  const avant = (await api('/api/admin/plateforme/apercu', { headers: headersAdmin })).body.data;
  assert.ok(avant.residencesPlateforme >= 10);
  assert.equal(avant.transfertFait, false);
  const publiquesAvant = (await api('/api/residences')).body.total;

  const responsable = { prenom: 'Awa', nom: 'Gestion', email: 'gestion@babi-residence.test', telephone: '+225 07 00 00 00 55', motDePasse: randomBytes(9).toString('hex') };
  assert.equal((await api('/api/admin/plateforme/transfert', { method: 'POST', headers: headersAdmin, body: { ...responsable, motDePasse: 'court' } })).status, 400);
  const t = await api('/api/admin/plateforme/transfert', { method: 'POST', headers: headersAdmin, body: responsable });
  assert.equal(t.status, 201, JSON.stringify(t.body));
  assert.ok(t.body.data.residences >= 10);
  assert.equal((await api('/api/admin/plateforme/transfert', { method: 'POST', headers: headersAdmin, body: { ...responsable, email: 'autre@babi-residence.test' } })).status, 409, 'une seule fois');

  // Le site public ne change pas ; le super admin ne gère plus de résidences ; le responsable, si
  assert.equal((await api('/api/residences')).body.total, publiquesAvant);
  assert.equal((await api('/api/admin/residences', { headers: headersAdmin })).body.data.length, 0);
  const login = await api('/api/admin/login', { method: 'POST', body: { email: responsable.email, password: responsable.motDePasse } });
  const g = { Authorization: `Bearer ${login.body.data.token}` };
  assert.ok((await api('/api/admin/residences', { headers: g })).body.data.length >= 10);
  const etabTransfere = (await api('/api/admin/etablissement', { headers: g })).body.data;
  assert.equal(etabTransfere.nom, 'BABI RESIDENCE', 'les clients voient toujours BABI RESIDENCE');
  assert.ok(etabTransfere.telephone && etabTransfere.email, 'coordonnées en vigueur recopiées (y compris celles par défaut)');

  // Entreprise interne : pas de commission, revenu de la plateforme
  const c = await api('/api/reservations', { method: 'POST', body: nouvelleReservation({ residenceId: 1, email: 'apres-transfert@example.com', dateArrivee: jourDansNJours(400), dateDepart: jourDansNJours(403) }) });
  assert.equal(c.status, 201, JSON.stringify(c.body));
  const doc = await db.collection('reservations').findOne({ id: c.body.data.id });
  assert.equal(doc.entrepriseId, 'ent_babi_gestion');
  assert.equal(doc.conditionsFinancieres.proprePlateforme, true);
  assert.equal(doc.conditionsFinancieres.tauxCommissionPb, 0);

  // Une entreprise ne règle ni slogan ni réseaux sociaux (ce sont ceux du site)
  const etab = (await api('/api/admin/etablissement', { headers: g })).body.data;
  assert.ok(!('facebook' in etab) && !('slogan' in etab));
  await api('/api/admin/etablissement', { method: 'PUT', headers: g, body: { facebook: 'https://facebook.com/pirate', telephone: '+225 27 00 00 00 01' } });
  const Settings = require('../services/SettingsService');
  const Tenant = require('../services/Tenant');
  assert.equal(Tenant.run('ent_babi_gestion', () => Settings.etablissement().facebook), '', 'ignoré');
  assert.equal((await api('/api/admin/etablissement', { headers: g })).body.data.telephone, '+225 27 00 00 00 01');
  assert.equal((await api('/api/admin/plateforme/apercu', { headers: g })).status, 403);
  const apres = (await api('/api/admin/plateforme/apercu', { headers: headersAdmin })).body.data;
  assert.equal(apres.residencesPlateforme, 0);
  assert.equal(apres.transfertFait, true);
});

test('super admin : supprimer une entreprise en confiant ses résidences à une autre', async () => {
  const headersAdmin = await connexionAdmin();
  const mdp = randomBytes(9).toString('hex');
  const ins = await api('/api/entreprises/inscription', { method: 'POST', body: { entreprise: 'Ryder Test', prenom: 'Franck', nom: 'Test', email: 'ryder@test-transfert.ci', telephone: '+225 07 00 00 00 66', motDePasse: mdp } });
  const idRyder = ins.body.data.entreprise.id;
  await verifierEmailPartenaire('ryder@test-transfert.ci');
  assert.equal((await api('/api/admin/plateforme/entreprises/ent_babi_gestion/suppression', { method: 'POST', headers: headersAdmin, body: { vers: idRyder } })).status, 409, 'cible non validée');
  await api(`/api/admin/plateforme/entreprises/${idRyder}/statut`, { method: 'PUT', headers: headersAdmin, body: { statut: 'validee' } });
  assert.equal((await api('/api/admin/plateforme/entreprises/babi/suppression', { method: 'POST', headers: headersAdmin, body: { vers: idRyder } })).status, 409, 'jamais la plateforme');
  const avant = await db.collection('residences').countDocuments({ entrepriseId: 'ent_babi_gestion' });
  const r = await api('/api/admin/plateforme/entreprises/ent_babi_gestion/suppression', { method: 'POST', headers: headersAdmin, body: { vers: idRyder } });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.data.residences, avant);
  assert.equal(await db.collection('entreprises').countDocuments({ _id: 'ent_babi_gestion' }), 0);
  assert.equal((await api('/api/admin/login', { method: 'POST', body: { email: 'gestion@babi-residence.test', password: 'x'.repeat(12) } })).status, 401, 'compte supprimé');
  const g = { Authorization: `Bearer ${(await api('/api/admin/login', { method: 'POST', body: { email: 'ryder@test-transfert.ci', password: mdp } })).body.data.token}` };
  assert.equal((await api('/api/admin/residences', { headers: g })).body.data.length, avant, 'Ryder gère les résidences');
  assert.ok((await api('/api/residences/1')).status === 200, 'toujours publiées');
  const c = await api('/api/reservations', { method: 'POST', body: nouvelleReservation({ residenceId: 1, email: 'apres-suppression@example.com', dateArrivee: jourDansNJours(450), dateDepart: jourDansNJours(453) }) });
  assert.equal((await db.collection('reservations').findOne({ id: c.body.data.id })).conditionsFinancieres.tauxCommissionPb, 800, 'commission normale désormais');
});

test('mot de passe oublié : lien unique, valable 1 h, sessions fermées, aucun compte révélé', async (t) => {
  const emails = ReservationService.emailService;
  const envois = [];
  for (const nom of ['sendBienvenueEntreprise', 'sendNouvelleEntrepriseAdmin']) {
    const original = emails[nom];
    emails[nom] = async () => {};
    t.after(() => { emails[nom] = original; });
  }
  const originalReinit = emails.sendReinitialisationMotDePasse;
  emails.sendReinitialisationMotDePasse = async (u, jeton) => { envois.push({ email: u.email, jeton }); };
  t.after(() => { emails.sendReinitialisationMotDePasse = originalReinit; });

  const ancien = randomBytes(9).toString('hex');
  const ins = await api('/api/entreprises/inscription', { method: 'POST', body: {
    entreprise: 'Résidences Oubli', prenom: 'Awa', nom: 'Koné', email: 'awa@oubli.ci', telephone: '+225 07 00 00 00 09', motDePasse: ancien,
  } });
  assert.equal(ins.status, 201, JSON.stringify(ins.body));
  await verifierEmailPartenaire('awa@oubli.ci');
  const sessionAvant = { Authorization: `Bearer ${(await api('/api/admin/login', { method: 'POST', body: { email: 'awa@oubli.ci', password: ancien } })).body.data.token}` };
  assert.equal((await api('/api/admin/moi', { headers: sessionAvant })).status, 200);

  // Même réponse que le compte existe ou non ; un seul email, au bon compte
  const inconnu = await api('/api/entreprises/mot-de-passe/oubli', { method: 'POST', body: { email: 'personne@nulle-part.ci' } });
  const connu = await api('/api/entreprises/mot-de-passe/oubli', { method: 'POST', body: { email: 'AWA@oubli.ci' } });
  assert.equal(inconnu.status, 200);
  assert.deepEqual(connu.body, inconnu.body, 'ne révèle pas quels comptes existent');
  await new Promise(r => setImmediate(r));
  assert.equal(envois.length, 1);
  assert.equal(envois[0].email, 'awa@oubli.ci');
  const { jeton } = envois[0];

  // Seule l'empreinte est en base, et jamais exposée
  const enBase = await db.collection('utilisateurs').findOne({ email: 'awa@oubli.ci' });
  assert.ok(enBase.reinitialisation.empreinte && enBase.reinitialisation.empreinte !== jeton);
  assert.ok(!JSON.stringify(enBase).includes(jeton), 'le jeton en clair n\'est pas stocké');

  // Validations
  const nouveau = randomBytes(9).toString('hex');
  const reinit = (body) => api('/api/entreprises/mot-de-passe/reinitialisation', { method: 'POST', body });
  assert.equal((await reinit({ jeton, motDePasse: randomBytes(2).toString('hex') })).status, 400, 'trop court');
  assert.equal((await reinit({ jeton: randomBytes(32).toString('base64url'), motDePasse: nouveau })).status, 400, 'jeton inventé');
  assert.equal((await reinit({ jeton: { $ne: null }, motDePasse: nouveau })).status, 400, 'injection');

  // Réinitialisation : nouveau mot de passe actif, ancien refusé, anciennes sessions fermées
  assert.equal((await reinit({ jeton, motDePasse: nouveau })).status, 200);
  assert.equal((await api('/api/admin/login', { method: 'POST', body: { email: 'awa@oubli.ci', password: ancien } })).status, 401);
  const login = await api('/api/admin/login', { method: 'POST', body: { email: 'awa@oubli.ci', password: nouveau } });
  assert.equal(login.status, 200);
  assert.equal((await api('/api/admin/moi', { headers: sessionAvant })).status, 401, 'session ouverte avant la réinitialisation');
  assert.equal((await api('/api/admin/moi', { headers: { Authorization: `Bearer ${login.body.data.token}` } })).status, 200);

  // Usage unique
  assert.equal((await reinit({ jeton, motDePasse: randomBytes(9).toString('hex') })).status, 400);

  // Lien expiré
  await api('/api/entreprises/mot-de-passe/oubli', { method: 'POST', body: { email: 'awa@oubli.ci' } });
  await new Promise(r => setImmediate(r));
  await db.collection('utilisateurs').updateOne({ email: 'awa@oubli.ci' }, { $set: { 'reinitialisation.expireLe': new Date(Date.now() - 1000) } });
  assert.equal((await reinit({ jeton: envois[1].jeton, motDePasse: randomBytes(9).toString('hex') })).status, 400);

  const ent = await db.collection('utilisateurs').findOne({ email: 'awa@oubli.ci' });
  await db.collection('utilisateurs').deleteOne({ _id: ent._id });
  await db.collection('entreprises').deleteOne({ _id: ent.entrepriseId });
});

test('Service client : compte créé à la réservation, mot de passe via l\'email, réservation pour autrui', async (t) => {
  const ClientService = require('../services/ClientService');
  const es = ReservationService.emailService;
  const liens = [];
  const original = es.sendLienMotDePasseClient;
  es.sendLienMotDePasseClient = async (client, url) => { liens.push({ email: client.email, url }); };
  t.after(() => { es.sendLienMotDePasseClient = original; });
  const jetonDe = (url) => new URL(url, 'http://site.test').searchParams.get('mdp'); // FRONTEND_URL vide en CI : lien relatif
  const email = 'mariam@service-client.ci';
  const mdp = randomBytes(9).toString('hex');

  // 1. Réservation sans compte : compte créé en arrière-plan, sans mot de passe
  const r1 = await api('/api/reservations', { method: 'POST', body: nouvelleReservation({ email: 'Mariam@Service-Client.ci', prenom: 'Mariam', nom: 'Traoré', dateArrivee: jourDansNJours(520), dateDepart: jourDansNJours(523) }) });
  assert.equal(r1.status, 201, JSON.stringify(r1.body));
  const compte = await db.collection('clients').findOne({ email });
  assert.equal(compte.statut, 'sans_mot_de_passe');
  assert.equal(compte.prenom, 'Mariam');
  assert.equal((await db.collection('reservations').findOne({ id: r1.body.data.id })).clientId, compte._id);

  // Accès immédiat limité à cette réservation ; pas de compte connecté
  const hRef = { Authorization: `Bearer ${r1.body.data.acces}` };
  assert.deepEqual((await api('/api/client/reservations', { headers: hRef })).body.data.map(r => r.id), [r1.body.data.id]);
  assert.equal((await api('/api/client/moi', { headers: hRef })).body.data, null);

  // Pas de connexion tant que le mot de passe n'est pas choisi
  assert.equal((await api('/api/client/connexion', { method: 'POST', body: { email, motDePasse: mdp } })).status, 401);

  // 2. Lien des emails : choix du mot de passe tant que le compte n'en a pas
  const lienEmail = await ClientService.lienEspace({ email });
  assert.match(lienEmail, /\/mes-reservations\?mdp=/);
  const reponseInconnue = await api('/api/client/mot-de-passe/lien', { method: 'POST', body: { email: 'personne@nulle-part.ci' } });
  const reponseConnue = await api('/api/client/mot-de-passe/lien', { method: 'POST', body: { email } });
  assert.equal(reponseConnue.body.message, reponseInconnue.body.message, 'aucun compte révélé');
  await new Promise(r => setImmediate(r));
  assert.deepEqual(liens.map(l => l.email), [email]);

  const definir = (jeton, motDePasse) => api('/api/client/mot-de-passe', { method: 'POST', body: { jeton, motDePasse } });
  assert.equal((await definir(jetonDe(lienEmail), randomBytes(2).toString('hex'))).status, 400, 'trop court');
  assert.equal((await definir(r1.body.data.acces, mdp)).status, 400, 'un accès de réservation ne permet pas de choisir le mot de passe');
  const active = await definir(jetonDe(lienEmail), mdp);
  assert.equal(active.status, 200, JSON.stringify(active.body));
  assert.equal(active.body.data.client.prenom, 'Mariam');
  assert.equal((await db.collection('clients').findOne({ email })).statut, 'actif');
  assert.equal((await definir(jetonDe(liens[0].url), randomBytes(9).toString('hex'))).status, 400, 'les liens précédents ne servent plus');
  const lienActif = await ClientService.lienEspace({ email });
  assert.doesNotMatch(lienActif, /mdp=/, 'compte actif : lien vers la connexion');
  assert.match(lienActif, /\/mes-reservations#email=mariam%40service-client\.ci$/, 'la page ne demande que le mot de passe');

  // 3. Connexion : session de compte, toutes les réservations, profil pour pré-remplir
  assert.equal((await api('/api/client/connexion', { method: 'POST', body: { email, motDePasse: MAUVAIS_MDP } })).status, 401);
  const connexion = await api('/api/client/connexion', { method: 'POST', body: { email: 'MARIAM@service-client.ci', motDePasse: mdp } });
  assert.equal(connexion.status, 200);
  const hSession = { Authorization: `Bearer ${connexion.body.data.token}` };
  assert.equal((await api('/api/client/moi', { headers: hSession })).body.data.telephone, '0700000000');

  // 4. Réservation connectée, pour une autre personne : le compte reste celui qui réserve
  const pourAutrui = await api('/api/reservations', { method: 'POST', headers: hSession, body: nouvelleReservation({
    email: 'pirate@example.com', dateArrivee: jourDansNJours(530), dateDepart: jourDansNJours(533),
    voyageur: { prenom: 'Ibrahim', nom: 'Traoré', telephone: '0711111111' },
  }) });
  assert.equal(pourAutrui.status, 201, JSON.stringify(pourAutrui.body));
  assert.equal(pourAutrui.body.data.acces, null, 'déjà connecté');
  const doc = await db.collection('reservations').findOne({ id: pourAutrui.body.data.id });
  assert.equal(doc.client.email, email, 'réservée par le compte connecté');
  assert.equal(doc.voyageur.prenom, 'Ibrahim');
  assert.equal(await db.collection('clients').countDocuments({ email: 'pirate@example.com' }), 0);
  const miennes = (await api('/api/client/reservations', { headers: hSession })).body.data;
  assert.deepEqual(miennes.map(r => r.id).sort(), [r1.body.data.id, pourAutrui.body.data.id].sort());
  assert.equal(miennes.find(r => r.id === pourAutrui.body.data.id).voyageur.prenom, 'Ibrahim');
  assert.equal((await api('/api/reservations', { method: 'POST', body: nouvelleReservation({ dateArrivee: jourDansNJours(540), dateDepart: jourDansNJours(543), voyageur: { prenom: 'X' } }) })).status, 400);

  // 5. Quelqu'un réserve avec l'email d'un compte actif sans être connecté : rattachée, compte intact, personne connecté
  const tiers = await api('/api/reservations', { method: 'POST', body: nouvelleReservation({ email, prenom: 'Faux', nom: 'Nom', dateArrivee: jourDansNJours(550), dateDepart: jourDansNJours(553) }) });
  assert.equal(tiers.status, 201);
  assert.equal((await db.collection('clients').findOne({ email })).prenom, 'Mariam', 'compte actif inchangé');
  assert.equal((await api('/api/client/moi', { headers: { Authorization: `Bearer ${tiers.body.data.acces}` } })).body.data, null);

  // 6. Mot de passe oublié : nouveau mot de passe, anciennes sessions fermées
  await api('/api/client/mot-de-passe/lien', { method: 'POST', body: { email } });
  await new Promise(r => setImmediate(r));
  const nouveau = randomBytes(9).toString('hex');
  await new Promise(r => setTimeout(r, 5));
  assert.equal((await definir(jetonDe(liens.at(-1).url), nouveau)).status, 200);
  assert.equal((await api('/api/client/reservations', { headers: hSession })).status, 401, 'session ouverte avant');
  assert.equal((await api('/api/client/connexion', { method: 'POST', body: { email, motDePasse: nouveau } })).status, 200);

  // 7. Plateforme : liste des utilisateurs (super admin uniquement)
  const liste = await api('/api/admin/plateforme/utilisateurs?q=mariam', { headers: await connexionAdmin() });
  assert.equal(liste.status, 200);
  const ligne = liste.body.data.find(c => c.email === email);
  assert.equal(ligne.statut, 'actif');
  assert.equal(ligne.reservations, 3);
  assert.ok(!('motDePasse' in ligne));
  assert.equal((await api('/api/admin/plateforme/utilisateurs', { headers: hSession })).status, 401);
});

test('Service de notation : séjour terminé noté une fois, moyenne publique, réponse, masquage, invitation', async (t) => {
  const Avis = require('../services/AvisService');
  const AuthService = require('../services/AuthService');
  const es = ReservationService.emailService;
  const invitations = [];
  const original = es.sendInvitationAvis;
  es.sendInvitationAvis = async (r) => { invitations.push(r.id); };
  t.after(() => { es.sendInvitationAvis = original; });

  const email = 'noteur@example.com';
  // Réservations créées normalement, puis placées dans le passé (séjour terminé)
  const creer = async (decalageDepart, statut = 'confirmee') => {
    const r = await api('/api/reservations', { method: 'POST', body: nouvelleReservation({ email, prenom: 'Koffi', nom: 'Yao', dateArrivee: jourDansNJours(600 + Math.abs(decalageDepart) * 5), dateDepart: jourDansNJours(603 + Math.abs(decalageDepart) * 5) }) });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    await db.collection('reservations').updateOne({ id: r.body.data.id }, { $set: { statut, 'dates.arrivee': jourDansNJours(decalageDepart - 3), 'dates.depart': jourDansNJours(decalageDepart) } });
    return r.body.data.id;
  };
  const terminee = await creer(-1);
  const future = await creer(20);
  const ancienne = await creer(-100);
  const nonConfirmee = await creer(-2, 'en_attente');
  const aInviter = await creer(-3);
  t.after(async () => {
    const ids = [terminee, future, ancienne, nonConfirmee, aInviter];
    await db.collection('avis').deleteMany({ reservationId: { $in: ids } });
    await db.collection('reservations').deleteMany({ id: { $in: ids } });
  });

  const hTout = { Authorization: `Bearer ${AuthService.creerJetonClient(email)}` };
  const liste = (await api('/api/client/reservations', { headers: hTout })).body.data;
  assert.equal(liste.find(r => r.id === terminee).peutNoter, true);
  assert.equal(liste.find(r => r.id === future).peutNoter, false);
  assert.equal(liste.find(r => r.id === ancienne).peutNoter, false);

  const criteres = { proprete: 5, conformite: 4, accueil: 5, qualitePrix: 4 };
  const noter = (id, body, headers = hTout) => api(`/api/client/reservations/${id}/avis`, { method: 'POST', headers, body });
  assert.equal((await noter(terminee, { note: 6, criteres })).status, 400);
  assert.equal((await noter(terminee, { note: 5, criteres: { ...criteres, accueil: 0 } })).status, 400);
  assert.equal((await noter(terminee, { note: 5, criteres, commentaire: { $gt: '' } })).status, 400);
  assert.equal((await noter(future, { note: 5, criteres })).status, 409, 'séjour pas encore terminé');
  assert.equal((await noter(ancienne, { note: 5, criteres })).status, 409, 'plus de 90 jours');
  assert.equal((await noter(nonConfirmee, { note: 5, criteres })).status, 409);
  assert.equal((await noter(terminee, { note: 5, criteres }, {})).status, 401);
  const hAutre = { Authorization: `Bearer ${AuthService.creerJetonClient('autre@example.com')}` };
  assert.equal((await noter(terminee, { note: 1, criteres }, hAutre)).status, 404, 'pas sa réservation');
  const hRef = { Authorization: `Bearer ${AuthService.creerJetonClient(email, { reference: future })}` };
  assert.equal((await noter(terminee, { note: 1, criteres }, hRef)).status, 404, 'accès limité à une autre réservation');

  const ok = await noter(terminee, { note: 4, criteres, commentaire: '  Très propre, accueil chaleureux.  ' });
  assert.equal(ok.status, 201, JSON.stringify(ok.body));
  assert.equal((await noter(terminee, { note: 5, criteres })).status, 409, 'une seule fois');
  const apres = (await api('/api/client/reservations', { headers: hTout })).body.data.find(r => r.id === terminee);
  assert.equal(apres.maNote, 4);
  assert.equal(apres.peutNoter, false);

  // Fiche publique : moyenne réelle, auteur « Koffi Y. », jamais l'email
  const publics = (await api('/api/residences/1/avis')).body.data;
  const monAvis = publics.avis.find(a => a.commentaire === 'Très propre, accueil chaleureux.');
  assert.equal(monAvis.auteur, 'Koffi Y.');
  assert.ok(!JSON.stringify(publics).includes(email));
  assert.equal((await api('/api/residences/1')).body.data.note, publics.moyenne);
  assert.equal((await api('/api/residences/1')).body.data.nombreAvis, publics.nombre);
  assert.equal((await api('/api/residences/999999/avis')).status, 404);

  // Réponse du partenaire qui gère la résidence ; le super admin ne répond pas à sa place
  const residence = await db.collection('residences').findOne({ id: 1 });
  const hPartenaire = { Authorization: `Bearer ${AuthService.creerJeton('gestion@test', { entrepriseId: residence.entrepriseId, superAdmin: false })}` };
  const hAdmin = await connexionAdmin();
  const avisId = (await api('/api/admin/avis', { headers: hPartenaire })).body.data.find(a => a.reservationId === terminee).id;
  assert.equal((await api(`/api/admin/avis/${avisId}/reponse`, { method: 'PUT', headers: hAdmin, body: { texte: 'x' } })).status, 403);
  assert.equal((await api(`/api/admin/avis/${avisId}/reponse`, { method: 'PUT', headers: hPartenaire, body: { texte: 'Merci Koffi, à bientôt !' } })).status, 200);
  assert.equal((await api('/api/residences/1/avis')).body.data.avis.find(a => a.id === avisId).reponse.texte, 'Merci Koffi, à bientôt !');

  // Masquage par la plateforme : motif obligatoire, l'avis ne compte plus
  assert.equal((await api(`/api/admin/avis/${avisId}/masquage`, { method: 'PUT', headers: hPartenaire, body: { masque: true, motif: 'abusif' } })).status, 403);
  assert.equal((await api(`/api/admin/avis/${avisId}/masquage`, { method: 'PUT', headers: hAdmin, body: { masque: true } })).status, 400);
  assert.equal((await api(`/api/admin/avis/${avisId}/masquage`, { method: 'PUT', headers: hAdmin, body: { masque: true, motif: 'Propos injurieux' } })).status, 200);
  const masques = (await api('/api/residences/1/avis')).body.data;
  assert.ok(!masques.avis.some(a => a.id === avisId));
  assert.equal(masques.nombre, publics.nombre - 1);
  assert.equal((await api('/api/admin/avis', { headers: hAdmin })).body.data.find(a => a.id === avisId).masque.motif, 'Propos injurieux');
  assert.equal((await api('/api/admin/avis/pas-un-id/masquage', { method: 'PUT', headers: hAdmin, body: { masque: false } })).status, 404);

  // Invitation à noter : séjours terminés depuis moins de 7 jours, non notés, une seule fois
  await Avis.envoyerInvitations(es);
  assert.ok(invitations.includes(aInviter));
  assert.ok(!invitations.includes(terminee), 'déjà noté');
  assert.ok(!invitations.includes(ancienne) && !invitations.includes(future) && !invitations.includes(nonConfirmee));
  const nombre = invitations.length;
  await Avis.envoyerInvitations(es);
  assert.equal(invitations.length, nombre, 'pas de seconde invitation');
});

test('Clients du partenaire : voyageurs ayant réservé ses résidences, jamais ceux des autres', async (t) => {
  const AuthService = require('../services/AuthService');
  const es = ReservationService.emailService;
  for (const nom of ['sendBienvenueEntreprise', 'sendNouvelleEntrepriseAdmin']) {
    const original = es[nom];
    es[nom] = async () => {};
    t.after(() => { es[nom] = original; });
  }
  const email = 'fidele@clients-partenaire.ci';
  const ids = [];
  for (const j of [700, 710]) {
    const r = await api('/api/reservations', { method: 'POST', body: nouvelleReservation({ email, prenom: 'Aya', nom: 'Bamba', dateArrivee: jourDansNJours(j), dateDepart: jourDansNJours(j + 3) }) });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    ids.push(r.body.data.id);
  }
  await db.collection('reservations').updateOne({ id: ids[0] }, { $set: { statut: 'confirmee' } });
  t.after(() => db.collection('reservations').deleteMany({ id: { $in: ids } }));

  const residence = await db.collection('residences').findOne({ id: 1 });
  const hPartenaire = { Authorization: `Bearer ${AuthService.creerJeton('gestion@test', { entrepriseId: residence.entrepriseId, superAdmin: false })}` };
  const liste = await api('/api/admin/clients', { headers: hPartenaire });
  assert.equal(liste.status, 200);
  const aya = liste.body.data.find(c => c.email === email);
  assert.equal(aya.prenom, 'Aya');
  assert.equal(aya.reservations, 2);
  assert.equal(aya.sejours, 1);
  assert.equal(aya.prochainSejour, jourDansNJours(700));
  assert.equal(aya.detail.length, 2);

  // Un autre partenaire ne voit pas ce client ; la plateforme passe par « Utilisateurs »
  const autre = await api('/api/entreprises/inscription', { method: 'POST', body: {
    entreprise: 'Autre Partenaire', prenom: 'Ali', nom: 'Koné', email: 'ali@autre-partenaire.ci', telephone: '+225 07 00 00 00 77', motDePasse: randomBytes(9).toString('hex'),
  } });
  assert.equal(autre.status, 201, JSON.stringify(autre.body));
  t.after(async () => {
    await db.collection('utilisateurs').deleteMany({ entrepriseId: autre.body.data.entreprise.id });
    await db.collection('entreprises').deleteOne({ _id: autre.body.data.entreprise.id });
  });
  const hAutre = await verifierEmailPartenaire('ali@autre-partenaire.ci');
  assert.ok(!(await api('/api/admin/clients', { headers: hAutre })).body.data.some(c => c.email === email));
  assert.equal((await api('/api/admin/clients', { headers: await connexionAdmin() })).status, 403);
  assert.equal((await api('/api/admin/clients')).status, 401);
});

test('Comparateur : les résidences mal notées descendent, classement des partenaires pour la plateforme', async (t) => {
  const AuthService = require('../services/AuthService');
  const publiques = (await api('/api/residences')).body.data;
  assert.ok(publiques.length >= 2);
  assert.ok(publiques.every(r => typeof r.recommandation === 'number'));
  const cible = publiques[0];

  // Cinq avis à 1/5 sur la première résidence (insérés directement : séjours fictifs)
  const ids = [];
  for (let i = 0; i < 5; i += 1) {
    const { insertedId } = await db.collection('avis').insertOne({
      reservationId: `COMPARATEUR_${i}`, residenceId: cible.id, entrepriseId: cible.entrepriseId, clientEmail: `c${i}@example.com`,
      auteur: 'Test T.', note: 1, criteres: { proprete: 1, conformite: 1, accueil: 1, qualitePrix: 1 }, commentaire: '', creeLe: new Date(), reponse: null, masque: null,
    });
    ids.push(insertedId);
  }
  t.after(() => db.collection('avis').deleteMany({ _id: { $in: ids } }));

  const apres = (await api('/api/residences')).body.data;
  const r = apres.find(x => x.id === cible.id);
  assert.ok(r.recommandation < cible.recommandation, 'score en baisse');
  assert.notEqual(apres[0].id, cible.id, 'n\'est plus proposée en premier');
  for (let i = 1; i < apres.length; i += 1) assert.ok(apres[i - 1].recommandation >= apres[i].recommandation, 'catalogue trié par recommandation');
  assert.equal(r.entreprise.recommande, false);

  // Classement des partenaires (plateforme) et note dans « Entreprises »
  const hAdmin = await connexionAdmin();
  const classement = await api('/api/admin/avis/partenaires', { headers: hAdmin });
  assert.equal(classement.status, 200);
  const Tenant = require('../services/Tenant');
  assert.ok(!classement.body.data.some(e => e.id === Tenant.PRINCIPALE), 'seuls les partenaires sont classés');
  const ligne = classement.body.data.find(e => e.id === cible.entrepriseId);
  if (ligne) assert.ok(ligne.notation.nombre >= 5);
  const notes = classement.body.data.filter(e => e.notation).map(e => e.notation.moyenne);
  assert.deepEqual(notes, [...notes].sort((a, b) => b - a), 'mieux notés d\'abord');
  assert.ok((await api('/api/admin/plateforme/entreprises', { headers: hAdmin })).body.data.find(e => e.id === cible.entrepriseId).notation);
  const hPartenaire = { Authorization: `Bearer ${AuthService.creerJeton('gestion@test', { entrepriseId: cible.entrepriseId, superAdmin: false })}` };
  assert.equal((await api('/api/admin/avis/partenaires', { headers: hPartenaire })).status, 403);
});

test('vérification de l\'email des partenaires : code à 6 chiffres, essais limités, renvoi, session bloquée', async (t) => {
  const AuthService = require('../services/AuthService');
  const email = 'otp@partenaire-test.ci';
  const mdp = randomBytes(9).toString('hex');
  const ins = await api('/api/entreprises/inscription', { method: 'POST', body: { entreprise: 'OTP Test', prenom: 'Ines', nom: 'Diallo', email, telephone: '+225 07 00 00 00 55', motDePasse: mdp } });
  assert.equal(ins.status, 201, JSON.stringify(ins.body));
  const entId = ins.body.data.entreprise.id;
  t.after(async () => {
    await db.collection('utilisateurs').deleteMany({ entrepriseId: entId });
    await db.collection('entreprises').deleteOne({ _id: entId });
  });
  const code = codesVerification.get(email);
  assert.match(code, /^\d{6}$/);
  const verifier = (c) => api('/api/entreprises/verification-email', { method: 'POST', body: { email, code: c } });
  const renvoi = (e) => api('/api/entreprises/verification-email/renvoi', { method: 'POST', body: { email: e } });

  // Une session forgée pour un compte non vérifié est refusée
  const u = await db.collection('utilisateurs').findOne({ email });
  const forge = { Authorization: `Bearer ${AuthService.creerJeton(email, { entrepriseId: entId, utilisateurId: u._id, superAdmin: false })}` };
  assert.equal((await api('/api/admin/moi', { headers: forge })).status, 403);

  // Renvoi : trop tôt (429) ; adresse inconnue : même réponse qu'une adresse connue
  assert.equal((await renvoi(email)).status, 429);
  const inconnue = await renvoi('personne@nulle-part.ci');
  assert.equal(inconnue.status, 200);

  // Mauvais code, format invalide ; puis 5 essais au plus
  const faux = code === '000000' ? '111111' : '000000';
  assert.equal((await verifier('12')).status, 400);
  assert.equal((await verifier({ $ne: '' })).status, 400, 'injection');
  for (let i = 0; i < 5; i += 1) assert.equal((await verifier(faux)).status, 400);
  assert.equal((await verifier(code)).status, 429, 'trop d\'essais, même avec le bon code');

  // Nouveau code (délai de renvoi écoulé) : l'ancien ne sert plus
  await db.collection('utilisateurs').updateOne({ email }, { $set: { 'verificationEmail.envois': [new Date(Date.now() - 2 * 60 * 1000)] } });
  assert.equal((await renvoi(email)).status, 200);
  const nouveau = codesVerification.get(email);
  if (nouveau !== code) assert.equal((await verifier(code)).status, 400, 'ancien code invalide');

  // Code expiré
  await db.collection('utilisateurs').updateOne({ email }, { $set: { 'verificationEmail.expireLe': new Date(Date.now() - 1000) } });
  assert.equal((await verifier(nouveau)).status, 400);

  // Code valide : session ouverte, compte vérifié, usage unique
  await db.collection('utilisateurs').updateOne({ email }, { $set: { 'verificationEmail.envois': [new Date(Date.now() - 2 * 60 * 1000)] } });
  assert.equal((await renvoi(email)).status, 200);
  const ok = await verifier(` ${codesVerification.get(email).slice(0, 3)} ${codesVerification.get(email).slice(3)} `);
  assert.equal(ok.status, 200, JSON.stringify(ok.body));
  assert.equal(ok.body.data.utilisateur.emailVerifie, true);
  assert.equal((await api('/api/admin/moi', { headers: { Authorization: `Bearer ${ok.body.data.token}` } })).status, 200);
  assert.equal((await verifier(codesVerification.get(email))).status, 409, 'déjà vérifié');
  assert.equal((await api('/api/admin/login', { method: 'POST', body: { email, password: mdp } })).status, 200);
  const enBase = await db.collection('utilisateurs').findOne({ email });
  assert.equal(enBase.verificationEmail, undefined);

  // Les comptes créés avant la vérification d'email (sans le champ) restent utilisables
  await db.collection('utilisateurs').updateOne({ email }, { $unset: { emailVerifie: '' } });
  assert.equal((await api('/api/admin/login', { method: 'POST', body: { email, password: mdp } })).status, 200);
});

test('Booster de visibilité : campagne (objectif, audience, budget par jour), activation, ciblage, résultats, prolongation', async (t) => {
  const AuthService = require('../services/AuthService');
  const Booster = require('../services/BoosterService');
  const es = ReservationService.emailService;
  const original = es.sendAlerteFinance;
  const alertes = [];
  es.sendAlerteFinance = async (sujet) => { alertes.push(sujet); };
  t.after(async () => {
    es.sendAlerteFinance = original;
    await db.collection('boosters').deleteMany({});
    await db.collection('parametres').deleteOne({ _id: 'booster' });
    await db.collection('avis').deleteMany({ reservationId: /^BOOSTER_/ });
    await db.collection('statistiques_residences').deleteMany({});
  });

  const residence = await db.collection('residences').findOne({ id: 1 });
  const hPartenaire = { Authorization: `Bearer ${AuthService.creerJeton('gestion@test', { entrepriseId: residence.entrepriseId, superAdmin: false })}` };
  const hAdmin = await connexionAdmin();
  const publique = async () => (await api('/api/residences')).body.data.find(r => r.id === 1);

  // Réglages et résidences publiées (avec ville et quartier pour l'audience)
  const accueil = (await api('/api/admin/boosters', { headers: hPartenaire })).body.data;
  assert.equal(accueil.reglages.budgetMin, 500);
  assert.equal(accueil.reglages.budgetMax, 10000);
  assert.deepEqual(accueil.reglages.durees, [3, 7, 14, 30]);
  assert.ok(accueil.residences.find(r => r.id === 1).quartier !== undefined);
  assert.equal((await api('/api/admin/boosters', { headers: hAdmin })).status, 403);

  // Contrôles de la campagne
  const creer = (body) => api('/api/admin/boosters', { method: 'POST', headers: hPartenaire, body: { residenceId: 1, objectif: 'visites', audience: 'tout', budgetJour: 1000, duree: 7, ...body } });
  assert.equal((await creer({ duree: 10 })).status, 400);
  assert.equal((await creer({ budgetJour: 100 })).status, 400, 'sous le minimum');
  assert.equal((await creer({ budgetJour: 1250 })).status, 400, 'pas de 500');
  assert.equal((await creer({ objectif: 'likes' })).status, 400);
  assert.equal((await creer({ audience: 'monde' })).status, 400);
  assert.equal((await creer({ residenceId: 999999 })).status, 404);
  const c = await creer({ budgetJour: 2000, duree: 7 });
  assert.equal(c.status, 201, JSON.stringify(c.body));
  assert.equal(c.body.data.montant, 14000, '2 000 × 7 jours');
  assert.equal(c.body.data.statut, 'en_attente');
  assert.ok(c.body.data.bonus > 0.3 && c.body.data.bonus < 0.8, 'bonus selon le budget');
  assert.equal(Booster.bonusPour(500), 0.3);
  assert.equal(Booster.bonusPour(10000), 0.8);
  assert.equal(alertes.length, 1);
  assert.equal((await creer({})).status, 409, 'une demande en attente à la fois');
  const avant = await publique();
  assert.equal(avant.sponsorise, false);

  // Activation manuelle (plateforme), journal financier, effet partout
  const agir = (id, body, headers = hAdmin) => api(`/api/admin/plateforme/boosters/${id}`, { method: 'PUT', headers, body });
  assert.equal((await agir(c.body.data.id, { action: 'activer', moyen: 'mobile_money', reference: 'WAVE-1' }, hPartenaire)).status, 403);
  assert.equal((await agir(c.body.data.id, { action: 'activer', moyen: 'mobile_money' })).status, 400);
  const actif = await agir(c.body.data.id, { action: 'activer', moyen: 'mobile_money', reference: 'WAVE-1' });
  assert.equal(actif.body.data.statut, 'actif', JSON.stringify(actif.body));
  assert.ok(await db.collection('financial_audit_logs').findOne({ action: 'BOOSTER_ACTIVE', 'details.reference': 'WAVE-1' }));
  const pendant = await publique();
  assert.equal(pendant.sponsorise, true);
  assert.equal(pendant.boost, null, 'tout le site : appliqué côté serveur');
  assert.equal(Math.round((pendant.recommandation - avant.recommandation) * 100) / 100, c.body.data.bonus);

  // Prolongation : nouvelle campagne pendant le booster, elle commence à sa fin
  const p = await creer({ budgetJour: 500, duree: 3 });
  assert.equal(p.status, 201, JSON.stringify(p.body));
  const prolonge = (await agir(p.body.data.id, { action: 'activer', moyen: 'especes', reference: 'CAISSE-1' })).body.data;
  assert.equal(new Date(prolonge.debut).getTime(), new Date(actif.body.data.fin).getTime(), 'enchaîné après le premier');
  await db.collection('boosters').deleteOne({ reference: p.body.data.reference });

  // Résidence mal notée : « Sponsorisé » mais sans bonus
  for (let i = 0; i < 8; i += 1) {
    await db.collection('avis').insertOne({ reservationId: `BOOSTER_${i}`, residenceId: 1, entrepriseId: residence.entrepriseId, clientEmail: `b${i}@example.com`, auteur: 'Test T.', note: 1, criteres: { proprete: 1, conformite: 1, accueil: 1, qualitePrix: 1 }, commentaire: '', creeLe: new Date(), reponse: null, masque: null });
  }
  const malNotee = await publique();
  await db.collection('boosters').updateOne({ reference: c.body.data.reference }, { $set: { statut: 'arrete' } });
  assert.equal(malNotee.sponsorise, true);
  assert.equal(malNotee.recommandation, (await publique()).recommandation, 'aucun bonus sous la note minimale');
  await db.collection('avis').deleteMany({ reservationId: /^BOOSTER_/ });

  // Audience ciblée (quartier) : pas de bonus global, le site l'applique aux recherches de la zone
  if (residence.quartier) {
    const z = await creer({ audience: 'quartier', budgetJour: 10000, duree: 3 });
    assert.equal(z.body.data.cible, residence.quartier);
    await agir(z.body.data.id, { action: 'activer', moyen: 'virement', reference: 'VIR-1' });
    const cible = await publique();
    assert.equal(cible.sponsorise, false, 'pas partout');
    assert.deepEqual(cible.boost, { audience: 'quartier', cible: residence.quartier, bonus: 0.8 });
    assert.equal(cible.recommandation, avant.recommandation, 'classement général inchangé');
    await agir(z.body.data.id, { action: 'arreter', motif: 'Fin du test' });
  }

  // Statistiques d'audience et résultats du booster
  const stats = (body) => fetch(`${baseUrl}/api/residences/statistiques`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  assert.equal((await stats({ affichages: [{ id: 1, s: true }, { id: 1, s: false }, { id: 'x' }], visite: 1 })).status, 204);
  await stats({ affichages: [{ id: 1, s: true }] });
  assert.equal((await stats({ affichages: { $gt: 1 } })).status, 204, 'entrée invalide ignorée');
  const jour = new Date().toISOString().slice(0, 10);
  const st = await db.collection('statistiques_residences').findOne({ _id: `1:${jour}` });
  assert.deepEqual([st.affichages, st.affichagesSponsorises, st.visites], [3, 2, 1]);
  await db.collection('boosters').updateOne({ reference: c.body.data.reference }, { $set: { statut: 'actif', debut: new Date(Date.now() - 3600000) } });
  const mesBoosters = (await api('/api/admin/boosters', { headers: hPartenaire })).body.data.boosters;
  const res = mesBoosters.find(b => b.reference === c.body.data.reference).resultats;
  assert.equal(res.affichages, 3);
  assert.equal(res.visites, 1);
  assert.equal(typeof res.reservations, 'number');
  assert.ok((await api('/api/admin/boosters', { headers: hPartenaire })).body.data.residences.find(r => r.id === 1).affichagesJour >= 0);
  await db.collection('boosters').updateOne({ reference: c.body.data.reference }, { $set: { statut: 'arrete' } });

  // Annulation et refus
  const d2 = await creer({ duree: 30 });
  assert.equal((await api(`/api/admin/boosters/${d2.body.data.id}`, { method: 'DELETE', headers: hPartenaire })).status, 200);
  const d3 = await creer({ duree: 3 });
  assert.equal((await agir(d3.body.data.id, { action: 'refuser', motif: 'Paiement non reçu' })).body.data.statut, 'refuse');

  // Réglages de la plateforme
  const regler = (body, headers = hAdmin) => api('/api/admin/plateforme/boosters/reglages', { method: 'PUT', headers, body });
  assert.equal((await regler({ budgetMin: 1000, budgetMax: 500 })).status, 400);
  assert.equal((await regler({ budgetMin: 1000, budgetMax: 20000 }, hPartenaire)).status, 403);
  assert.equal((await regler({ budgetMin: 1000, budgetMax: 20000 })).status, 200);
  assert.equal((await api('/api/admin/boosters', { headers: hPartenaire })).body.data.reglages.budgetMin, 1000);
  assert.equal((await creer({ budgetJour: 500 })).status, 400, 'nouveau minimum');
});

test('Booster payé en ligne (GeniusPay) : activation automatique, registre, webhook, échec', async (t) => {
  const AuthService = require('../services/AuthService');
  const GeniusPay = require('../services/paiement/GeniusPayClient');
  const Booster = require('../services/BoosterService');
  const PaymentService = require('../services/paiement/PaymentService');
  const es = ReservationService.emailService;
  const original = es.sendAlerteFinance;
  es.sendAlerteFinance = async () => {};
  t.after(async () => {
    es.sendAlerteFinance = original;
    await db.collection('boosters').deleteMany({});
    await db.collection('ledger_entries').deleteMany({ type: 'BOOSTER' });
    await db.collection('ledger_transactions').deleteMany({ type: 'BOOSTER' });
  });
  let n = 0;
  const etat = {}; // reference GeniusPay → { status, amount }
  t.mock.method(GeniusPay, 'estConfigure', () => true);
  t.mock.method(GeniusPay, 'creerPaiement', async (args) => {
    n += 1;
    const reference = `GP-BST-${n}`;
    etat[reference] = { status: 'pending', amount: args.montant, metadata: args.metadata };
    return { reference, checkout_url: `https://pay.test/${reference}`, expires_at: new Date(Date.now() + 3600000).toISOString() };
  });
  t.mock.method(GeniusPay, 'lirePaiement', async (reference) => ({ reference, ...etat[reference] }));

  const residence = await db.collection('residences').findOne({ id: 1 });
  const h = { Authorization: `Bearer ${AuthService.creerJeton('gestion@test', { entrepriseId: residence.entrepriseId, superAdmin: false })}` };
  assert.equal((await api('/api/admin/boosters', { headers: h })).body.data.paiementEnLigne, true);
  const d = (await api('/api/admin/boosters', { method: 'POST', headers: h, body: { residenceId: 1, objectif: 'reservations', audience: 'tout', budgetJour: 1000, duree: 14 } })).body.data;

  // Page de paiement GeniusPay au montant du booster
  const p = await api(`/api/admin/boosters/${d.id}/paiement`, { method: 'POST', headers: h });
  assert.equal(p.status, 200, JSON.stringify(p.body));
  assert.equal(p.body.data.checkoutUrl, 'https://pay.test/GP-BST-1');
  assert.equal(etat['GP-BST-1'].amount, d.montant);
  assert.equal(etat['GP-BST-1'].metadata.booster, d.id);

  // Pas encore payé : toujours en attente
  const verifier = () => api(`/api/admin/boosters/${d.id}/paiement`, { headers: h });
  assert.equal((await verifier()).body.data.statut, 'en_attente');

  // Payé : activé seul, inscrit au registre (une seule fois), effet sur le site
  etat['GP-BST-1'].status = 'completed';
  const ok = await verifier();
  assert.equal(ok.body.data.statut, 'actif', JSON.stringify(ok.body));
  assert.equal(ok.body.data.paiement.moyen, 'geniuspay');
  assert.equal((await verifier()).body.data.statut, 'actif');
  assert.equal(await db.collection('ledger_transactions').countDocuments({ type: 'BOOSTER' }), 1, 'une seule écriture');
  const ecritures = await db.collection('ledger_entries').find({ type: 'BOOSTER' }).toArray();
  assert.deepEqual(ecritures.map(e => `${e.compte}:${e.sens}:${e.montant}`).sort(), [`FONDS_PRESTATAIRE:DEBIT:${d.montant}`, `REVENU_VISIBILITE:CREDIT:${d.montant}`]);
  assert.equal((await api('/api/residences')).body.data.find(r => r.id === 1).sponsorise, true);
  await db.collection('boosters').updateOne({ _id: new (require('mongodb').ObjectId)(d.id) }, { $set: { statut: 'arrete' } });

  // Webhook : même chemin de vérification
  const d2 = (await api('/api/admin/boosters', { method: 'POST', headers: h, body: { residenceId: 1, budgetJour: 500, duree: 7 } })).body.data;
  await api(`/api/admin/boosters/${d2.id}/paiement`, { method: 'POST', headers: h });
  etat['GP-BST-2'].status = 'completed';
  await PaymentService.traiterEvenementGeniusPay({ event: 'payment.success', data: { reference: 'GP-BST-2', metadata: { booster: d2.id } } });
  assert.equal((await db.collection('boosters').findOne({ reference: d2.reference })).statut, 'actif');
  await db.collection('boosters').updateOne({ reference: d2.reference }, { $set: { statut: 'arrete' } });

  // Paiement refusé : la demande reste en attente, nouvel essai possible ; montant insuffisant : rien
  const d3 = (await api('/api/admin/boosters', { method: 'POST', headers: h, body: { residenceId: 1, budgetJour: 500, duree: 7 } })).body.data;
  await api(`/api/admin/boosters/${d3.id}/paiement`, { method: 'POST', headers: h });
  etat['GP-BST-3'].status = 'failed';
  const refuse = (await api(`/api/admin/boosters/${d3.id}/paiement`, { headers: h })).body.data;
  assert.equal(refuse.statut, 'en_attente');
  assert.equal(refuse.paiementEnLigne.statut, 'echec');
  await api(`/api/admin/boosters/${d3.id}/paiement`, { method: 'POST', headers: h });
  Object.assign(etat['GP-BST-4'], { status: 'completed', amount: 10 });
  await Booster.verifierEnAttente();
  assert.equal((await db.collection('boosters').findOne({ reference: d3.reference })).statut, 'en_attente', 'montant insuffisant');

  // Un partenaire ne vérifie que ses propres boosters
  const hAutre = { Authorization: `Bearer ${AuthService.creerJeton('autre@test', { entrepriseId: 'babi_inexistante', superAdmin: false })}` };
  assert.notEqual((await api(`/api/admin/boosters/${d3.id}/paiement`, { headers: hAutre })).status, 200);
});
test('Booster : prolongation d\'un ancien booster (formule 15 jours) payée en ligne, enchaînée à la fin', async (t) => {
  const AuthService = require('../services/AuthService');
  const GeniusPay = require('../services/paiement/GeniusPayClient');
  const es = ReservationService.emailService;
  const original = es.sendAlerteFinance;
  es.sendAlerteFinance = async () => {};
  t.after(async () => {
    es.sendAlerteFinance = original;
    await db.collection('boosters').deleteMany({});
    await db.collection('ledger_entries').deleteMany({ type: 'BOOSTER' });
    await db.collection('ledger_transactions').deleteMany({ type: 'BOOSTER' });
  });
  const etat = {};
  t.mock.method(GeniusPay, 'estConfigure', () => true);
  t.mock.method(GeniusPay, 'creerPaiement', async (a) => { etat.ref = { status: 'pending', amount: a.montant }; return { reference: 'ref', checkout_url: 'https://pay.test/ref' }; });
  t.mock.method(GeniusPay, 'lirePaiement', async () => etat.ref);

  // Booster actif créé avec les anciennes formules : 15 jours, 9 000 FCFA, sans budget par jour
  const residence = await db.collection('residences').findOne({ id: 1 });
  const finAncien = new Date(Date.now() + 5 * 86400000);
  await db.collection('boosters').insertOne({
    reference: 'BST-ANCIEN', entrepriseId: residence.entrepriseId, residenceId: 1, residenceNom: residence.nom, duree: 15, montant: 9000,
    statut: 'actif', demandeLe: new Date(), debut: new Date(Date.now() - 10 * 86400000), fin: finAncien, paiement: { moyen: 'geniuspay', reference: 'old', montant: 9000 },
  });
  const h = { Authorization: `Bearer ${AuthService.creerJeton('gestion@test', { entrepriseId: residence.entrepriseId, superAdmin: false })}` };
  const ancien = (await api('/api/admin/boosters', { headers: h })).body.data.boosters.find(b => b.reference === 'BST-ANCIEN');
  assert.equal(ancien.budgetJour, 600, 'ancien format lu');
  assert.equal(ancien.audience, 'tout');

  // Les valeurs d'origine sont refusées (le site les ramène à 14 jours et 500 FCFA)
  const creer = (body) => api('/api/admin/boosters', { method: 'POST', headers: h, body: { residenceId: 1, objectif: 'visites', audience: 'tout', ...body } });
  assert.equal((await creer({ budgetJour: 600, duree: 15 })).status, 400);
  const p = await creer({ budgetJour: 500, duree: 14 });
  assert.equal(p.status, 201, 'prolongation possible pendant un booster actif');
  const pay = await api(`/api/admin/boosters/${p.body.data.id}/paiement`, { method: 'POST', headers: h });
  assert.equal(pay.status, 200, JSON.stringify(pay.body));
  etat.ref.status = 'completed';
  const actif = (await api(`/api/admin/boosters/${p.body.data.id}/paiement`, { headers: h })).body.data;
  assert.equal(actif.statut, 'programme', 'payé, il démarre à la fin du booster en cours');
  assert.equal(actif.prolongationDe, 'BST-ANCIEN');
  assert.equal((await api('/api/admin/boosters', { headers: h })).body.data.boosters.find(b => b.reference === p.body.data.reference).resultats, null, 'pas de résultats avant le début');
  assert.equal(new Date(actif.debut).getTime(), finAncien.getTime(), 'commence à la fin du booster en cours');
  assert.equal(Math.round((new Date(actif.fin) - new Date(actif.debut)) / 86400000), 14);
});
