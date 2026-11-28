/**
 * Migration : photos des résidences encore servies comme fichiers du site (/images/residenceN.png)
 * → téléversées en base (GridFS, bucket « photos ») et servies par l'API (/api/photos/:id),
 * comme les photos ajoutées par les partenaires. Les doublons d'une même résidence ne sont gardés qu'une fois.
 * Retire aussi l'ancienne note figée (« note ») : la note affichée vient des avis vérifiés.
 *
 * À blanc (rien n'est modifié) :
 *   node scripts/migrer-photos-statiques.js --api https://votre-api.onrender.com
 * Pour de bon :
 *   node scripts/migrer-photos-statiques.js --api https://votre-api.onrender.com --appliquer
 *
 * Idempotent : une résidence sans chemin « /images/… » n'est pas touchée.
 */
require('dotenv').config({ quiet: true });
const fs = require('fs');
const path = require('path');
const { MongoClient, GridFSBucket } = require('mongodb');

const arg = (nom) => { const i = process.argv.indexOf(nom); return i > -1 ? process.argv[i + 1] : null; };
const appliquer = process.argv.includes('--appliquer');
const api = (arg('--api') || '').replace(/\/$/, '');
const dossier = path.resolve(__dirname, '..', '..', 'client', 'public');
const MIME = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp' };

(async () => {
  if (!/^https:\/\/[\w.-]+$/.test(api)) throw new Error('Indiquez l\'adresse publique de l\'API : --api https://…');
  const client = new MongoClient(process.env.MONGODB_URI);
  await client.connect();
  const db = client.db(process.env.MONGODB_DB || 'sankofart');
  const bucket = new GridFSBucket(db, { bucketName: 'photos' });
  console.log(`Base « ${db.databaseName} » · ${appliquer ? 'APPLICATION' : 'à blanc (ajoutez --appliquer pour enregistrer)'}`);

  const residences = await db.collection('residences').find({ photos: { $elemMatch: { $regex: '^/images/' } } }).toArray();
  if (!residences.length) console.log('Rien à migrer.');
  for (const r of residences) {
    const nouvelles = [];
    for (const p of [...new Set(r.photos)]) {
      if (!p.startsWith('/images/')) { nouvelles.push(p); continue; }
      const fichier = path.join(dossier, path.normalize(p).replace(/^[/\\]+/, ''));
      if (!fichier.startsWith(dossier) || !fs.existsSync(fichier)) throw new Error(`Fichier introuvable pour la résidence ${r.id} : ${p}`);
      const mime = MIME[path.extname(fichier).toLowerCase()];
      if (!mime) throw new Error(`Format non pris en charge : ${p}`);
      if (!appliquer) { nouvelles.push(`${api}/api/photos/<nouvel identifiant>`); continue; }
      const flux = bucket.openUploadStream(`${r.id}-${Date.now()}`, { metadata: { residenceId: r.id, entrepriseId: r.entrepriseId, mime, migreDe: p } });
      await new Promise((ok, ko) => flux.on('error', ko).on('finish', ok).end(fs.readFileSync(fichier)));
      nouvelles.push(`${api}/api/photos/${flux.id.toString()}`);
    }
    console.log(`#${r.id} ${r.nom} : ${r.photos.length} chemin(s) → ${nouvelles.length} photo(s) en base`);
    if (appliquer) {
      await db.collection('residences').updateOne({ _id: r._id }, { $set: { photos: nouvelles }, $unset: { note: '' } });
    }
  }
  if (appliquer) {
    const notes = await db.collection('residences').updateMany({ note: { $exists: true } }, { $unset: { note: '' } });
    if (notes.modifiedCount) console.log(`Notes figées retirées : ${notes.modifiedCount}`);
  }
  await client.close();
})().catch(e => { console.error('Échec :', e.message); process.exit(1); });
