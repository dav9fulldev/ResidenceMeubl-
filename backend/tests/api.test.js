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
  assert.deepEqual(corps.sender, { name: 'Sankofart Résidence', email: 'contact@exemple.com' });
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
  es.sendLienAcces = async (email) => { envois.push(['lien', email]); };
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

  // Lien par email : même réponse que l'adresse soit connue ou non
  const lienConnu = await api('/api/client/lien', { method: 'POST', body: { email } });
  const lienInconnu = await api('/api/client/lien', { method: 'POST', body: { email: 'inconnu@example.com' } });
  assert.equal(lienConnu.body.message, lienInconnu.body.message);
  assert.deepEqual(envois.filter(e => e[0] === 'lien'), [['lien', email]]);

  // Jeton « historique » (celui du lien envoyé) : toutes les réservations
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
    id, residenceId: 2, statut, prixTotal, dateCreation: new Date('2031-01-01'),
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
  assert.match(csvRes.headers.get('content-disposition'), /reservations-sankofart-2031\.csv/);
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
  assert.ok(qr.body.data.qrPayload.includes(ALIAS_PAYE), 'QR vers l\'alias Sankofart');
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
  assert.equal(vue.acompte.remboursement.statut, 'a_rembourser');
  const remb = await api(`/api/reservations/${id}/remboursement`, { method: 'PUT', headers: headersAdmin, body: { reference: 'RET-123' } });
  assert.equal(remb.status, 200);
  assert.equal(remb.body.data.remboursement.statut, 'rembourse');
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
