const db = require('../db');

/**
 * Résumé de la semaine envoyé aux partenaires, le lundi à partir de 8 h (heure d'Abidjan = UTC) :
 * réservations reçues, demandes à traiter, arrivées des 7 prochains jours, taux d'occupation,
 * avis reçus (et sans réponse), fréquentation des annonces et boosters en cours.
 *
 *  - une fois par entreprise et par semaine (collection resumes_hebdo, clé « entreprise:lundi ») ;
 *  - aux comptes actifs de l'entreprise qui ne l'ont pas désactivé (preferences.resumeHebdo === false) ;
 *  - rien n'est envoyé à une entreprise sans résidence publiée.
 */
const JOUR_MS = 86400000;
const jour = (d) => d.toISOString().slice(0, 10);

/** Lundi 00:00 UTC de la semaine de `d`. */
const lundi = (d) => {
  const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  return new Date(x.getTime() - ((x.getUTCDay() + 6) % 7) * JOUR_MS);
};

/** Nuits d'un séjour [arrivee, depart) comprises dans [debut, fin) (dates AAAA-MM-JJ). */
const nuitsDans = (arrivee, depart, debut, fin) => {
  const a = Math.max(Date.parse(arrivee), Date.parse(debut));
  const b = Math.min(Date.parse(depart), Date.parse(fin));
  return b > a ? Math.round((b - a) / JOUR_MS) : 0;
};

const ResumeService = {
  lundi,

  get envois() { return db.collection('resumes_hebdo'); },

  /** Chiffres de la semaine écoulée [debut, fin) pour une entreprise ; null si elle n'a aucune résidence publiée. */
  async calculer(entrepriseId, fin) {
    const debut = new Date(fin.getTime() - 7 * JOUR_MS);
    const [jDebut, jFin, jDans7] = [jour(debut), jour(fin), jour(new Date(fin.getTime() + 7 * JOUR_MS))];
    const residences = await db.collection('residences').find(
      { entrepriseId, actif: { $ne: false }, statutVerification: 'verifiee' },
      { projection: { id: 1, nom: 1 } }
    ).toArray();
    if (!residences.length) return null;
    const ids = residences.map(r => Number(r.id));
    const reservations = db.collection('reservations');

    const [recues, aTraiter, sejours, arrivees, avis, sansReponse, stats, boosters] = await Promise.all([
      reservations.find({ entrepriseId, dateCreation: { $gte: debut, $lt: fin }, statut: { $ne: 'annulee' } }, { projection: { prixTotal: 1 } }).toArray(),
      reservations.countDocuments({ entrepriseId, statut: 'en_attente', 'dates.arrivee': { $gte: jFin } }),
      reservations.find({ entrepriseId, statut: 'confirmee', 'dates.arrivee': { $lt: jFin }, 'dates.depart': { $gt: jDebut } }, { projection: { dates: 1 } }).toArray(),
      reservations.find({ entrepriseId, statut: 'confirmee', 'dates.arrivee': { $gte: jFin, $lt: jDans7 } }, { projection: { _id: 0, id: 1, dates: 1, residenceInfo: 1, client: 1, voyageur: 1 } }).sort({ 'dates.arrivee': 1 }).toArray(),
      db.collection('avis').find({ entrepriseId, creeLe: { $gte: debut, $lt: fin }, masque: { $ne: true } }, { projection: { note: 1 } }).toArray(),
      db.collection('avis').countDocuments({ entrepriseId, masque: { $ne: true }, reponse: { $exists: false } }),
      db.collection('statistiques_residences').aggregate([
        { $match: { residenceId: { $in: ids }, jour: { $gte: jDebut, $lt: jFin } } },
        { $group: { _id: null, affichages: { $sum: '$affichages' }, visites: { $sum: '$visites' } } },
      ]).toArray(),
      db.collection('boosters').find({ entrepriseId, statut: 'actif', debut: { $lte: fin }, fin: { $gt: fin } }, { projection: { residenceNom: 1, fin: 1 } }).toArray(),
    ]);

    const nuits = sejours.reduce((t, r) => t + nuitsDans(r.dates.arrivee, r.dates.depart, jDebut, jFin), 0);
    return {
      debut, fin,
      residences: residences.length,
      reservations: recues.length,
      montant: recues.reduce((t, r) => t + (Number(r.prixTotal) || 0), 0),
      aTraiter,
      occupation: Math.round((Math.min(nuits, residences.length * 7) / (residences.length * 7)) * 100),
      arrivees: arrivees.map(r => ({
        id: r.id, arrivee: r.dates.arrivee, depart: r.dates.depart, residence: r.residenceInfo?.nom || '',
        voyageur: [(r.voyageur || r.client)?.prenom, (r.voyageur || r.client)?.nom].filter(Boolean).join(' '),
      })),
      avis: avis.length,
      noteMoyenne: avis.length ? Math.round((avis.reduce((t, a) => t + a.note, 0) / avis.length) * 10) / 10 : null,
      avisSansReponse: sansReponse,
      affichages: stats[0]?.affichages || 0,
      visites: stats[0]?.visites || 0,
      boosters: boosters.map(b => ({ residence: b.residenceNom, fin: b.fin })),
    };
  },

  /**
   * Envoie les résumés de la semaine (le lundi à partir de 8 h). Retourne le nombre d'entreprises prévenues.
   * `force` : envoie quel que soit le jour (tests).
   */
  async envoyer({ emails = require('./ReservationService').emailService, maintenant = new Date(), force = false } = {}) {
    if (!emails?.sendResumeHebdo) return 0;
    if (!force && (maintenant.getUTCDay() !== 1 || maintenant.getUTCHours() < 8)) return 0;
    const fin = lundi(maintenant);
    const EntrepriseService = require('./EntrepriseService');
    const entreprises = await db.collection('entreprises').find({ statut: 'validee' }, { projection: { nom: 1 } }).toArray();
    let envoyes = 0;
    for (const e of entreprises) {
      const cle = `${e._id}:${jour(fin)}`;
      if (await this.envois.findOne({ _id: cle })) continue;
      const chiffres = await this.calculer(e._id, fin);
      const membres = (await EntrepriseService.gestionnaires(e._id)).filter(u => u.preferences?.resumeHebdo !== false);
      if (!chiffres || !membres.length) continue;
      // Réserver l'envoi (une seule fois, même avec plusieurs serveurs)
      try {
        await this.envois.insertOne({ _id: cle, entrepriseId: e._id, semaine: jour(fin), creeLe: new Date() });
      } catch (error) {
        if (error.code === 11000) continue;
        throw error;
      }
      try {
        await emails.sendResumeHebdo({ id: e._id, nom: e.nom }, chiffres, membres);
        envoyes += 1;
      } catch (error) {
        console.error('⚠️ Résumé de la semaine non envoyé (%s) :', e._id, String(error?.message).replace(/\n|\r/g, ''));
        await this.envois.deleteOne({ _id: cle });
      }
    }
    return envoyes;
  },
};

module.exports = ResumeService;
