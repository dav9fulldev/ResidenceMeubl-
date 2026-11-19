const crypto = require('crypto');
const { ObjectId } = require('mongodb');
const db = require('../db');
const Tenant = require('./Tenant');

/**
 * Vérification des résidences avant publication (contre les fausses annonces).
 *
 * Chaque résidence d'une entreprise inscrite a un dossier (collection « verifications ») :
 *  - localisation déclarée (GPS) ;
 *  - justificatifs privés (bucket GridFS « justificatifs ») : pièce d'identité du gestionnaire,
 *    droit d'exploiter le logement (titre, bail, mandat, autorisation), documents de l'entreprise,
 *    facture CIE / SODECI à l'adresse ;
 *  - preuves prises sur place avec le téléphone : façade et intérieur, avec un code unique écrit
 *    sur une feuille visible, et la position GPS de la prise de vue (comparée à l'adresse déclarée).
 * La plateforme examine le dossier puis vérifie, demande des compléments, refuse ou suspend.
 * Seules les résidences « verifiee » apparaissent sur le site. Une modification de l'adresse ou
 * des photos d'une résidence vérifiée la renvoie en vérification.
 *
 * Les résidences de la plateforme (entreprise principale) sont vérifiées d'office.
 */
const STATUTS = {
  brouillon: 'Brouillon',
  en_attente: 'En attente',
  a_completer: 'À compléter',
  en_verification: 'En vérification',
  verifiee: 'Vérifiée',
  refusee: 'Refusée',
  suspendue: 'Suspendue',
};

const TYPES_DOCUMENTS = {
  identite: { libelle: 'Pièce d\'identité du gestionnaire', requis: true },
  droit: { libelle: 'Droit d\'exploiter le logement (titre de propriété, bail, mandat de gestion ou autorisation du propriétaire)', requis: true },
  entreprise: { libelle: 'Documents de l\'entreprise (RCCM, DFE)', requis: false },
  facture: { libelle: 'Facture CIE ou SODECI à l\'adresse du logement', requis: false },
};
const TYPES_PREUVES = {
  facade: { libelle: 'Façade, avec le code écrit sur une feuille', requis: true },
  interieur: { libelle: 'Une pièce intérieure, avec le code', requis: true },
};
const PHOTOS_MIN = 3;
const TAILLE_MAX = 5 * 1024 * 1024;
const DOCUMENTS_MAX = 12;
const PREUVES_MAX = 6;
const PHOTOS_MAX = 15;

// Type réel d'un fichier d'après ses premiers octets (jamais d'après le nom ou ce que déclare le navigateur)
function typeReel(buffer) {
  if (buffer.length < 12) return null;
  if (buffer.subarray(0, 4).toString('latin1') === '%PDF') return 'application/pdf';
  if (buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF) return 'image/jpeg';
  if (buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]))) return 'image/png';
  if (buffer.subarray(0, 4).toString('latin1') === 'RIFF' && buffer.subarray(8, 12).toString('latin1') === 'WEBP') return 'image/webp';
  return null;
}

// Distance en mètres entre deux points GPS (formule de haversine)
function distanceM(a, b) {
  if (!a || !b) return null;
  const R = 6371000;
  const rad = (d) => d * Math.PI / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(h)));
}

const gpsValide = (g) => g && Number.isFinite(Number(g.lat)) && Number.isFinite(Number(g.lng))
  && Math.abs(Number(g.lat)) <= 90 && Math.abs(Number(g.lng)) <= 180;
const lireGps = (g) => (gpsValide(g)
  ? { lat: Number(Number(g.lat).toFixed(6)), lng: Number(Number(g.lng).toFixed(6)), ...(Number.isFinite(Number(g.precision)) ? { precision: Math.round(Number(g.precision)) } : {}) }
  : null);

const nouveauCode = () => Array.from({ length: 6 }, () => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[crypto.randomInt(32)]).join('');
const texte = (v, max) => String(v ?? '').trim().slice(0, max);

class ErreurVerification extends Error {
  constructor(message, status = 400) { super(message); this.status = status; }
}

class VerificationService {
  get dossiers() { return db.collection('verifications'); }

  get residences() { return db.collection('residences'); }

  /** Migration : résidences de la plateforme vérifiées d'office, les autres en brouillon. */
  async initialiser() {
    await Promise.all([
      this.residences.updateMany({ statutVerification: { $exists: false }, entrepriseId: Tenant.PRINCIPALE }, { $set: { statutVerification: 'verifiee' } }),
      this.residences.updateMany({ statutVerification: { $exists: false } }, { $set: { statutVerification: 'brouillon' } }),
    ]);
  }

  /** Statut initial d'une nouvelle résidence. */
  statutInitial() {
    return Tenant.estPrincipale() ? 'verifiee' : 'brouillon';
  }

  // ---------- Dossier (gestionnaire, limité à son entreprise) ----------

  /** Résidence de l'entreprise courante (back-office) ou de n'importe quelle entreprise (plateforme). */
  async residence(id, { plateforme = false } = {}) {
    const filtre = { id: { $eq: parseInt(id, 10) }, ...(plateforme ? {} : Tenant.filtre()) };
    const r = await this.residences.findOne(filtre, { projection: { _id: 0 } });
    if (!r) throw new ErreurVerification('Résidence introuvable', 404);
    return r;
  }

  async dossierBrut(residence) {
    let d = await this.dossiers.findOne({ _id: residence.id });
    if (!d) {
      d = { _id: residence.id, entrepriseId: residence.entrepriseId, code: nouveauCode(), gps: null, documents: [], preuves: [], historique: [], creeLe: new Date() };
      await this.dossiers.updateOne({ _id: residence.id }, { $setOnInsert: d }, { upsert: true });
      d = await this.dossiers.findOne({ _id: residence.id });
    }
    return d;
  }

  /** Ce qui manque pour pouvoir soumettre le dossier. */
  manquants(residence, d) {
    const m = [];
    if (!d.gps) m.push('Position GPS du logement');
    for (const [type, t] of Object.entries(TYPES_DOCUMENTS)) if (t.requis && !d.documents.some(x => x.type === type)) m.push(t.libelle);
    for (const [type, t] of Object.entries(TYPES_PREUVES)) if (t.requis && !d.preuves.some(x => x.type === type)) m.push(`Photo sur place : ${t.libelle.toLowerCase()}`);
    if ((residence.photos || []).length < PHOTOS_MIN) m.push(`Au moins ${PHOTOS_MIN} photos de l'annonce`);
    return m;
  }

  vue(residence, d, { plateforme = false } = {}) {
    const statut = residence.statutVerification || 'brouillon';
    return {
      residence: {
        id: residence.id, nom: residence.nom, reference: residence.reference, localisation: residence.localisation,
        ville: residence.ville, quartier: residence.quartier, prix: residence.prix, photos: residence.photos || [],
        entrepriseId: residence.entrepriseId,
        ...(plateforme ? { entreprise: require('./EntrepriseService').nom(residence.entrepriseId) } : {}),
      },
      statut,
      libelle: STATUTS[statut] || statut,
      modifiable: !['en_verification', 'suspendue'].includes(statut),
      code: d.code,
      gps: d.gps,
      documents: d.documents,
      preuves: d.preuves.map(p => ({ ...p, distanceM: distanceM(d.gps, p.gps) })),
      historique: d.historique,
      motif: d.motif || null,
      soumiseLe: d.soumiseLe || null,
      manquants: this.manquants(residence, d),
      types: { documents: TYPES_DOCUMENTS, preuves: TYPES_PREUVES },
      photosMin: PHOTOS_MIN,
    };
  }

  async dossier(id, options = {}) {
    const r = await this.residence(id, options);
    return this.vue(r, await this.dossierBrut(r), options);
  }

  verifierModifiable(residence) {
    if (Tenant.estPrincipale() && residence.entrepriseId === Tenant.PRINCIPALE) return;
    const s = residence.statutVerification;
    if (s === 'en_verification') throw new ErreurVerification('Le dossier est en cours d\'examen : attendez la décision de BABI RESIDENCE', 409);
    if (s === 'suspendue') throw new ErreurVerification('Cette résidence est suspendue : contactez BABI RESIDENCE', 409);
  }

  async enregistrerGps(id, gps) {
    const r = await this.residence(id);
    this.verifierModifiable(r);
    const g = lireGps(gps);
    if (!g) throw new ErreurVerification('Coordonnées GPS invalides');
    await this.dossierBrut(r);
    await this.dossiers.updateOne({ _id: r.id }, { $set: { gps: { lat: g.lat, lng: g.lng } } });
    await this.apresChangementSensible(r, 'Position GPS modifiée');
    return this.dossier(id);
  }

  /** Décode un fichier envoyé en base64 et vérifie son type réel et sa taille. */
  decoder(contenu, typesAutorises) {
    const brut = String(contenu || '').replace(/^data:[^;,]*;base64,/, '');
    if (!brut || brut.length > Math.ceil(TAILLE_MAX * 4 / 3) + 8) throw new ErreurVerification('Fichier absent ou trop lourd (5 Mo maximum)');
    const buffer = Buffer.from(brut, 'base64');
    if (buffer.length > TAILLE_MAX) throw new ErreurVerification('Fichier trop lourd (5 Mo maximum)');
    const mime = typeReel(buffer);
    if (!mime || !typesAutorises.includes(mime)) {
      throw new ErreurVerification(typesAutorises.includes('application/pdf') ? 'Format accepté : PDF, JPEG, PNG ou WebP' : 'Format accepté : JPEG, PNG ou WebP');
    }
    return { buffer, mime };
  }

  async stocker(nomBucket, buffer, mime, metadata) {
    const flux = db.bucket(nomBucket).openUploadStream(`${metadata.residenceId}-${Date.now()}`, { metadata: { ...metadata, mime } });
    await new Promise((ok, ko) => flux.on('error', ko).on('finish', ok).end(buffer));
    return flux.id.toString();
  }

  async supprimerFichier(nomBucket, id) {
    try { await db.bucket(nomBucket).delete(new ObjectId(String(id))); } catch { /* déjà supprimé */ }
  }

  async ajouterDocument(id, { type, nom, contenu } = {}) {
    const r = await this.residence(id);
    this.verifierModifiable(r);
    if (!TYPES_DOCUMENTS[type]) throw new ErreurVerification('Type de document invalide');
    const d = await this.dossierBrut(r);
    if (d.documents.length >= DOCUMENTS_MAX) throw new ErreurVerification(`${DOCUMENTS_MAX} documents au maximum`);
    const { buffer, mime } = this.decoder(contenu, ['application/pdf', 'image/jpeg', 'image/png', 'image/webp']);
    const fichier = await this.stocker('justificatifs', buffer, mime, { residenceId: r.id, entrepriseId: r.entrepriseId, type });
    const doc = { id: fichier, type, nom: texte(nom, 120) || TYPES_DOCUMENTS[type].libelle, mime, taille: buffer.length, ajouteLe: new Date() };
    await this.dossiers.updateOne({ _id: r.id }, { $push: { documents: doc } });
    await this.apresChangementSensible(r, 'Justificatif ajouté');
    return this.dossier(id);
  }

  async ajouterPreuve(id, { type, contenu, gps } = {}) {
    const r = await this.residence(id);
    this.verifierModifiable(r);
    if (!TYPES_PREUVES[type]) throw new ErreurVerification('Type de photo invalide');
    const d = await this.dossierBrut(r);
    if (d.preuves.length >= PREUVES_MAX) throw new ErreurVerification(`${PREUVES_MAX} photos sur place au maximum`);
    const { buffer, mime } = this.decoder(contenu, ['image/jpeg', 'image/png', 'image/webp']);
    const fichier = await this.stocker('justificatifs', buffer, mime, { residenceId: r.id, entrepriseId: r.entrepriseId, type });
    const preuve = { id: fichier, type, mime, taille: buffer.length, gps: lireGps(gps), ajouteLe: new Date() };
    await this.dossiers.updateOne({ _id: r.id }, { $push: { preuves: preuve } });
    await this.apresChangementSensible(r, 'Photo sur place ajoutée');
    return this.dossier(id);
  }

  async retirerFichier(id, fichierId) {
    const r = await this.residence(id);
    this.verifierModifiable(r);
    const d = await this.dossierBrut(r);
    const present = [...d.documents, ...d.preuves].some(x => x.id === String(fichierId));
    if (!present) throw new ErreurVerification('Fichier introuvable', 404);
    await this.dossiers.updateOne({ _id: r.id }, { $pull: { documents: { id: String(fichierId) }, preuves: { id: String(fichierId) } } });
    await this.supprimerFichier('justificatifs', fichierId);
    await this.apresChangementSensible(r, 'Justificatif retiré');
    return this.dossier(id);
  }

  /** Flux d'un justificatif : réservé à l'entreprise de la résidence et à la plateforme. */
  async lireFichier(id, fichierId, { plateforme = false } = {}) {
    const r = await this.residence(id, { plateforme });
    const d = await this.dossierBrut(r);
    const f = [...d.documents, ...d.preuves].find(x => x.id === String(fichierId));
    if (!f) throw new ErreurVerification('Fichier introuvable', 404);
    return { flux: db.bucket('justificatifs').openDownloadStream(new ObjectId(f.id)), mime: f.mime, nom: f.nom || `${f.type}.${f.mime.split('/')[1]}` };
  }

  async journaliser(residenceId, statut, par, motif = null) {
    await this.dossiers.updateOne({ _id: residenceId }, { $push: { historique: { $each: [{ statut, par, motif, le: new Date() }], $slice: -50 } } }, { upsert: true });
  }

  /**
   * Une modification sensible (adresse, photos, justificatifs, GPS) d'une résidence déjà vérifiée
   * ou en attente la renvoie en vérification : elle disparaît du site jusqu'à la nouvelle décision.
   */
  async apresChangementSensible(residence, raison) {
    if (residence.entrepriseId === Tenant.PRINCIPALE) return;
    if (!['verifiee', 'refusee'].includes(residence.statutVerification)) return;
    const nouveau = residence.statutVerification === 'verifiee' ? 'en_attente' : residence.statutVerification;
    if (nouveau === residence.statutVerification) return;
    await this.residences.updateOne({ id: residence.id }, { $set: { statutVerification: nouveau } });
    await this.dossiers.updateOne({ _id: residence.id }, { $set: { soumiseLe: new Date() } });
    await this.journaliser(residence.id, nouveau, 'systeme', `${raison} : nouvelle vérification nécessaire`);
    residence.statutVerification = nouveau;
    this.prevenirPlateforme(residence, 'modification').catch(() => {});
  }

  async soumettre(id) {
    const r = await this.residence(id);
    if (r.entrepriseId === Tenant.PRINCIPALE) throw new ErreurVerification('Les résidences de la plateforme sont vérifiées d\'office', 409);
    if (!['brouillon', 'a_completer', 'refusee'].includes(r.statutVerification)) {
      throw new ErreurVerification(r.statutVerification === 'verifiee' ? 'Cette résidence est déjà vérifiée' : 'Le dossier est déjà envoyé', 409);
    }
    const d = await this.dossierBrut(r);
    const manquants = this.manquants(r, d);
    if (manquants.length) throw new ErreurVerification(`Dossier incomplet : ${manquants.join(' ; ')}`);
    await this.residences.updateOne({ id: r.id }, { $set: { statutVerification: 'en_attente' } });
    await this.dossiers.updateOne({ _id: r.id }, { $set: { soumiseLe: new Date(), motif: null } });
    await this.journaliser(r.id, 'en_attente', 'gestionnaire');
    this.prevenirPlateforme({ ...r, statutVerification: 'en_attente' }, 'soumission').catch(() => {});
    return this.dossier(id);
  }

  /** Résidence supprimée : dossier, justificatifs et photos téléversées effacés. */
  async nettoyer(residence) {
    const d = await this.dossiers.findOne({ _id: residence.id });
    for (const f of [...(d?.documents || []), ...(d?.preuves || [])]) await this.supprimerFichier('justificatifs', f.id);
    for (const url of residence.photos || []) {
      const m = /\/api\/photos\/([0-9a-f]{24})$/.exec(url);
      if (m) await this.supprimerFichier('photos', m[1]);
    }
    await this.dossiers.deleteOne({ _id: residence.id });
  }

  // ---------- Photos de l'annonce (publiques) ----------

  async ajouterPhoto(id, contenu, baseUrl) {
    const r = await this.residence(id);
    this.verifierModifiable(r);
    if ((r.photos || []).length >= PHOTOS_MAX) throw new ErreurVerification(`${PHOTOS_MAX} photos au maximum`);
    const { buffer, mime } = this.decoder(contenu, ['image/jpeg', 'image/png', 'image/webp']);
    const fichier = await this.stocker('photos', buffer, mime, { residenceId: r.id, entrepriseId: r.entrepriseId });
    const url = `${baseUrl}/api/photos/${fichier}`;
    await this.residences.updateOne({ id: r.id }, { $push: { photos: url } });
    await this.apresChangementSensible(r, 'Photo de l\'annonce ajoutée');
    return url;
  }

  async retirerPhoto(id, url) {
    const r = await this.residence(id);
    this.verifierModifiable(r);
    if (!(r.photos || []).includes(url)) throw new ErreurVerification('Photo introuvable', 404);
    await this.residences.updateOne({ id: r.id }, { $pull: { photos: url } });
    const m = /\/api\/photos\/([0-9a-f]{24})$/.exec(url);
    if (m) await this.supprimerFichier('photos', m[1]);
    await this.apresChangementSensible(r, 'Photo de l\'annonce retirée');
  }

  async lirePhoto(fichierId) {
    if (!/^[0-9a-f]{24}$/.test(String(fichierId))) return null;
    const _id = new ObjectId(String(fichierId));
    const f = await db.collection('photos.files').findOne({ _id });
    if (!f) return null;
    return { flux: db.bucket('photos').openDownloadStream(_id), mime: f.metadata?.mime || 'image/jpeg' };
  }

  // ---------- Plateforme ----------

  async lister({ statut } = {}) {
    const filtre = statut && STATUTS[statut] ? { statutVerification: statut } : { statutVerification: { $in: ['en_attente', 'en_verification', 'a_completer'] } };
    const [residences, signalements] = await Promise.all([
      this.residences.find({ ...filtre, entrepriseId: { $ne: Tenant.PRINCIPALE } }, { projection: { _id: 0, id: 1, nom: 1, reference: 1, quartier: 1, ville: 1, photos: 1, entrepriseId: 1, statutVerification: 1 } }).toArray(),
      db.collection('signalements').aggregate([{ $match: { traite: false } }, { $group: { _id: '$residenceId', total: { $sum: 1 } } }]).toArray(),
    ]);
    const dossiers = await this.dossiers.find({ _id: { $in: residences.map(r => r.id) } }, { projection: { soumiseLe: 1 } }).toArray();
    const EntrepriseService = require('./EntrepriseService');
    return residences.map(r => ({
      id: r.id, nom: r.nom, reference: r.reference, quartier: r.quartier, ville: r.ville, photo: r.photos?.[0] || null,
      entreprise: EntrepriseService.nom(r.entrepriseId), statut: r.statutVerification, libelle: STATUTS[r.statutVerification],
      soumiseLe: dossiers.find(d => d._id === r.id)?.soumiseLe || null,
      signalements: signalements.find(s => s._id === r.id)?.total || 0,
    })).sort((a, b) => new Date(a.soumiseLe || 0) - new Date(b.soumiseLe || 0));
  }

  async compteurs() {
    const [aExaminer, signalements] = await Promise.all([
      this.residences.countDocuments({ statutVerification: { $in: ['en_attente', 'en_verification'] }, entrepriseId: { $ne: Tenant.PRINCIPALE } }),
      db.collection('signalements').countDocuments({ traite: false }),
    ]);
    return { aExaminer, signalements };
  }

  /** Décision de la plateforme. actions : examiner, verifier, completer, refuser, suspendre, retablir */
  async decider(id, action, motif = '') {
    const TRANSITIONS = {
      examiner: { de: ['en_attente'], vers: 'en_verification' },
      verifier: { de: ['en_attente', 'en_verification', 'a_completer'], vers: 'verifiee' },
      completer: { de: ['en_attente', 'en_verification'], vers: 'a_completer', motifRequis: true },
      refuser: { de: ['en_attente', 'en_verification', 'a_completer'], vers: 'refusee', motifRequis: true },
      suspendre: { de: ['verifiee', 'en_attente', 'en_verification', 'a_completer'], vers: 'suspendue', motifRequis: true },
      retablir: { de: ['suspendue'], vers: 'verifiee' },
    };
    const t = TRANSITIONS[action];
    if (!t) throw new ErreurVerification('Action invalide');
    const r = await this.residence(id, { plateforme: true });
    if (r.entrepriseId === Tenant.PRINCIPALE) throw new ErreurVerification('Les résidences de la plateforme sont vérifiées d\'office', 409);
    if (!t.de.includes(r.statutVerification)) throw new ErreurVerification(`Action impossible : la résidence est « ${STATUTS[r.statutVerification]} »`, 409);
    const m = texte(motif, 500);
    if (t.motifRequis && m.length < 5) throw new ErreurVerification('Indiquez le motif au gestionnaire (5 caractères au moins)');
    await this.residences.updateOne({ id: r.id, statutVerification: r.statutVerification }, { $set: { statutVerification: t.vers } });
    await this.dossierBrut(r);
    await this.dossiers.updateOne({ _id: r.id }, { $set: { motif: m || null, decideLe: new Date() } });
    await this.journaliser(r.id, t.vers, 'plateforme', m || null);
    if (action !== 'examiner') this.prevenirGestionnaire({ ...r, statutVerification: t.vers }, m).catch(e => console.error('⚠️ Email de vérification non envoyé :', e.message));
    require('./SmartSearchService').synchroniserEnFond();
    return this.dossier(id, { plateforme: true });
  }

  // ---------- Signalements des clients ----------

  async signaler(residenceId, { motif, message, email } = {}) {
    const MOTIFS = ['fausse_annonce', 'photos_trompeuses', 'adresse', 'paiement_hors_plateforme', 'autre'];
    if (!MOTIFS.includes(motif)) throw new ErreurVerification('Motif invalide');
    const r = await this.residences.findOne({ id: { $eq: parseInt(residenceId, 10) } }, { projection: { _id: 0, id: 1, nom: 1, entrepriseId: 1 } });
    if (!r) throw new ErreurVerification('Résidence introuvable', 404);
    const mail = texte(email, 254).toLowerCase();
    const s = {
      residenceId: r.id, entrepriseId: r.entrepriseId, motif, message: texte(message, 1000),
      email: /^[^\s@<>]+@[^\s@<>.]+(?:\.[^\s@<>.]+)*\.[^\s@<>.]{2,}$/.test(mail) ? mail : null,
      creeLe: new Date(), traite: false,
    };
    await db.collection('signalements').insertOne(s);
    this.prevenirPlateforme({ ...r }, 'signalement', s).catch(() => {});
    return true;
  }

  async signalements({ tous = false } = {}) {
    const liste = await db.collection('signalements').find(tous ? {} : { traite: false }).sort({ creeLe: -1 }).limit(200).toArray();
    const EntrepriseService = require('./EntrepriseService');
    const noms = new Map((await this.residences.find({ id: { $in: liste.map(s => s.residenceId) } }, { projection: { id: 1, nom: 1, statutVerification: 1 } }).toArray()).map(r => [r.id, r]));
    return liste.map(s => ({
      id: s._id.toString(), residenceId: s.residenceId, residence: noms.get(s.residenceId)?.nom || '—',
      statutResidence: noms.get(s.residenceId)?.statutVerification || null,
      entreprise: EntrepriseService.nom(s.entrepriseId), motif: s.motif, message: s.message, email: s.email, creeLe: s.creeLe, traite: s.traite,
    }));
  }

  async traiterSignalement(id) {
    if (!/^[0-9a-f]{24}$/.test(String(id))) throw new ErreurVerification('Signalement introuvable', 404);
    const res = await db.collection('signalements').updateOne({ _id: new ObjectId(String(id)) }, { $set: { traite: true, traiteLe: new Date() } });
    if (!res.matchedCount) throw new ErreurVerification('Signalement introuvable', 404);
  }

  // ---------- Emails ----------

  async prevenirPlateforme(residence, evenement, signalement = null) {
    const emails = require('./ReservationService').emailService;
    if (emails?.sendAlerteVerification) await emails.sendAlerteVerification(residence, evenement, signalement);
  }

  async prevenirGestionnaire(residence, motif) {
    const emails = require('./ReservationService').emailService;
    const gestionnaires = await require('./EntrepriseService').gestionnaires(residence.entrepriseId);
    if (emails?.sendDecisionVerification) await emails.sendDecisionVerification(residence, motif, gestionnaires);
  }
}

const service = new VerificationService();
service.ErreurVerification = ErreurVerification;
service.STATUTS = STATUTS;
service.distanceM = distanceM;
service.typeReel = typeReel;
module.exports = service;
