const { MongoClient, GridFSBucket } = require('mongodb');
const catalogueInitial = require('./data/residences');

/**
 * Connexion MongoDB (Atlas en production).
 * Variables : MONGODB_URI (obligatoire), MONGODB_DB (optionnel, défaut « sankofart »).
 */
let client = null;
let db = null;

async function connect(uri = process.env.MONGODB_URI, dbName = process.env.MONGODB_DB || 'sankofart') {
  if (!uri) {
    throw new Error('MONGODB_URI manquant : ajoutez l\'URL de connexion MongoDB dans backend/.env');
  }

  client = new MongoClient(uri);
  await client.connect();
  db = client.db(dbName);

  await Promise.all([
    db.collection('residences').createIndex({ id: 1 }, { unique: true }),
    db.collection('reservations').createIndex({ id: 1 }, { unique: true }),
    db.collection('reservations').createIndex({ residenceId: 1, statut: 1 }),
    db.collection('reservations').createIndex({ entrepriseId: 1, dateCreation: -1 }),
    db.collection('residence_embeddings').createIndex({ residenceId: 1 }, { unique: true }),
    db.collection('utilisateurs').createIndex({ email: 1 }, { unique: true }),
    db.collection('clients').createIndex({ email: 1 }, { unique: true }),
    db.collection('avis').createIndex({ reservationId: 1 }, { unique: true }),
    db.collection('avis').createIndex({ residenceId: 1, creeLe: -1 }),
    db.collection('avis').createIndex({ entrepriseId: 1, creeLe: -1 }),
    db.collection('reservations').createIndex({ 'client.email': 1 }),
    db.collection('utilisateurs').createIndex({ entrepriseId: 1 }),
    db.collection('verifications').createIndex({ statut: 1, soumiseLe: 1 }),
    db.collection('signalements').createIndex({ traite: 1, creeLe: -1 }),
  ]);

  await seedResidences();
  // Multi-entreprises : entreprise principale et rattachement des données existantes
  await require('./services/EntrepriseService').initialiser();
  await require('./services/VerificationService').initialiser();
  // Module financier : index, règle de commission initiale, reprise des paiements déjà encaissés
  await require('./services/finance').initialiser();
  // Une référence de résidence est unique au sein de chaque entreprise (plus sur toute la plateforme)
  const residences = db.collection('residences');
  if (await residences.indexExists('reference_1').catch(() => false)) await residences.dropIndex('reference_1');
  await residences.createIndex({ entrepriseId: 1, reference: 1 }, { unique: true });
  return db;
}

// Au premier démarrage, insérer le catalogue initial si la collection est vide
async function seedResidences() {
  const residences = db.collection('residences');
  if (await residences.estimatedDocumentCount() > 0) return;

  await residences.insertMany(catalogueInitial.map(r => structuredClone(r)));
  const maxId = Math.max(0, ...catalogueInitial.map(r => r.id));
  await db.collection('counters').updateOne(
    { _id: 'residences' },
    { $max: { seq: maxId } },
    { upsert: true }
  );
  console.log(`🌱 Catalogue initial inséré (${catalogueInitial.length} résidences)`);
}

// Prochain identifiant numérique (atomique)
async function nextId(name) {
  const result = await db.collection('counters').findOneAndUpdate(
    { _id: name },
    { $inc: { seq: 1 } },
    { upsert: true, returnDocument: 'after' }
  );
  return result.seq;
}

function collection(name) {
  if (!db) throw new Error('Base de données non connectée');
  return db.collection(name);
}

/**
 * Exécute fn(session) dans une transaction multi-documents (tout ou rien).
 * Exige un replica set : c'est le cas de MongoDB Atlas (et des tests, MongoMemoryReplSet).
 */
async function transaction(fn) {
  if (!client) throw new Error('Base de données non connectée');
  const session = client.startSession();
  try {
    let resultat;
    await session.withTransaction(async () => { resultat = await fn(session); });
    return resultat;
  } finally {
    await session.endSession();
  }
}

// Stockage de fichiers dans MongoDB (GridFS) : « photos » (publiques), « justificatifs » (privés)
function bucket(name) {
  if (!db) throw new Error('Base de données non connectée');
  return new GridFSBucket(db, { bucketName: name });
}

async function close() {
  if (client) await client.close();
  client = null;
  db = null;
}

module.exports = { connect, close, collection, bucket, nextId, transaction };
