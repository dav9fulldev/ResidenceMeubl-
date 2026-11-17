const db = require('../db');

/**
 * Statistiques du back-office et export des réservations.
 *
 * Règles de calcul :
 * - Revenus : réservations CONFIRMÉES uniquement. Le montant est réparti nuit par nuit
 *   (prixTotal / nombre de nuits) : un séjour du 30 mars au 2 avril compte 2 nuits
 *   en mars et 1 en avril. Le « cumul » est la somme des mois depuis janvier.
 * - Revenus prévisionnels : même calcul pour les réservations EN ATTENTE.
 * - Nombre de réservations par mois : selon le mois d'ARRIVÉE.
 * - Taux d'occupation : nuits confirmées / (résidences actives × jours du mois).
 */
const MOIS = ['Janv.', 'Févr.', 'Mars', 'Avr.', 'Mai', 'Juin', 'Juil.', 'Août', 'Sept.', 'Oct.', 'Nov.', 'Déc.'];
const JOUR_MS = 24 * 60 * 60 * 1000;

const joursDansMois = (annee, mois) => new Date(Date.UTC(annee, mois + 1, 0)).getUTCDate();
const joursDansAnnee = (annee) => ((annee % 4 === 0 && annee % 100 !== 0) || annee % 400 === 0 ? 366 : 365);

// Liste des nuits (dates UTC) d'un séjour : de l'arrivée incluse au départ exclu
function nuitsDuSejour(arrivee, depart) {
  const debut = Date.parse(`${arrivee}T00:00:00Z`);
  const fin = Date.parse(`${depart}T00:00:00Z`);
  const nuits = [];
  for (let t = debut; t < fin; t += JOUR_MS) nuits.push(new Date(t));
  return nuits;
}

const arrondi = (n) => Math.round(n);

class StatsService {
  async calculer(annee = new Date().getUTCFullYear()) {
    annee = parseInt(annee, 10);
    const [reservations, nbResidences] = await Promise.all([
      db.collection('reservations').find({}, { projection: { _id: 0 } }).toArray(),
      db.collection('residences').countDocuments({ actif: { $ne: false } }),
    ]);

    const mois = MOIS.map((libelle, i) => ({
      mois: i + 1,
      libelle,
      reservations: { confirmees: 0, enAttente: 0, annulees: 0 },
      revenus: 0,
      revenusPrevisionnels: 0,
      nuitsOccupees: 0,
      occupation: 0,
      cumul: 0,
    }));
    const parResidence = new Map();
    const annees = new Set([annee]);

    for (const r of reservations) {
      const arrivee = r.dates?.arrivee;
      const depart = r.dates?.depart;
      if (!arrivee || !depart) continue;
      annees.add(parseInt(arrivee.slice(0, 4), 10));

      // Comptage par mois d'arrivée
      if (parseInt(arrivee.slice(0, 4), 10) === annee) {
        const m = mois[parseInt(arrivee.slice(5, 7), 10) - 1];
        const cle = r.statut === 'confirmee' ? 'confirmees' : r.statut === 'annulee' ? 'annulees' : 'enAttente';
        m.reservations[cle] += 1;
      }

      if (r.statut === 'annulee') continue;

      // Répartition nuit par nuit
      const nuits = nuitsDuSejour(arrivee, depart);
      if (nuits.length === 0) continue;
      const parNuit = (Number(r.prixTotal) || 0) / nuits.length;
      const cleResidence = r.residenceId ?? r.residenceInfo?.id;
      if (r.statut === 'confirmee' && !parResidence.has(cleResidence)) {
        parResidence.set(cleResidence, {
          residenceId: cleResidence,
          nom: r.residenceInfo?.nom || `Résidence ${cleResidence}`,
          reservations: 0, nuits: 0, revenus: 0,
        });
      }
      let compteeDansAnnee = false;
      for (const nuit of nuits) {
        if (nuit.getUTCFullYear() !== annee) continue;
        const m = mois[nuit.getUTCMonth()];
        if (r.statut === 'confirmee') {
          m.revenus += parNuit;
          m.nuitsOccupees += 1;
          const res = parResidence.get(cleResidence);
          res.nuits += 1;
          res.revenus += parNuit;
          compteeDansAnnee = true;
        } else {
          m.revenusPrevisionnels += parNuit;
        }
      }
      if (compteeDansAnnee) parResidence.get(cleResidence).reservations += 1;
    }

    // Cumul, occupation, arrondis
    let cumul = 0;
    for (const m of mois) {
      cumul += m.revenus;
      m.cumul = arrondi(cumul);
      m.revenus = arrondi(m.revenus);
      m.revenusPrevisionnels = arrondi(m.revenusPrevisionnels);
      const capacite = nbResidences * joursDansMois(annee, m.mois - 1);
      m.occupation = capacite ? Math.round((m.nuitsOccupees / capacite) * 1000) / 10 : 0;
    }

    const total = (cle) => mois.reduce((s, m) => s + m.reservations[cle], 0);
    const confirmees = total('confirmees');
    const annulees = total('annulees');
    const enAttente = total('enAttente');
    const toutes = confirmees + annulees + enAttente;
    const revenusAnnee = mois.reduce((s, m) => s + m.revenus, 0);
    const nuitsAnnee = mois.reduce((s, m) => s + m.nuitsOccupees, 0);

    const maintenant = new Date();
    const anneeCourante = maintenant.getUTCFullYear() === annee;
    const moisCourant = anneeCourante ? maintenant.getUTCMonth() : null;

    return {
      annee,
      anneesDisponibles: [...annees].filter(Number.isFinite).sort((a, b) => b - a),
      nbResidences,
      resume: {
        revenusAnnee,
        revenusPrevisionnels: mois.reduce((s, m) => s + m.revenusPrevisionnels, 0),
        revenusMoisCourant: moisCourant !== null ? mois[moisCourant].revenus : null,
        revenusMoisPrecedent: moisCourant !== null && moisCourant > 0 ? mois[moisCourant - 1].revenus : null,
        moisCourant: moisCourant !== null ? moisCourant + 1 : null,
        reservations: toutes,
        confirmees,
        enAttente,
        annulees,
        tauxAnnulation: toutes ? Math.round((annulees / toutes) * 1000) / 10 : 0,
        nuitsOccupees: nuitsAnnee,
        tauxOccupation: nbResidences ? Math.round((nuitsAnnee / (nbResidences * joursDansAnnee(annee))) * 1000) / 10 : 0,
        panierMoyen: confirmees ? arrondi(revenusAnnee / confirmees) : 0,
        dureeMoyenne: confirmees ? Math.round((nuitsAnnee / confirmees) * 10) / 10 : 0,
      },
      mois,
      residences: [...parResidence.values()]
        .filter(r => r.nuits > 0)
        .map(r => ({
          ...r,
          revenus: arrondi(r.revenus),
          occupation: Math.round((r.nuits / joursDansAnnee(annee)) * 1000) / 10,
        }))
        .sort((a, b) => b.revenus - a.revenus),
    };
  }

  // ---------- Export CSV (ouvrable dans Excel) ----------

  async exporterCsv(annee = null) {
    const filtre = annee ? { 'dates.arrivee': { $gte: `${annee}-01-01`, $lte: `${annee}-12-31` } } : {};
    const reservations = await db.collection('reservations')
      .find(filtre, { projection: { _id: 0 } })
      .sort({ 'dates.arrivee': 1 })
      .toArray();

    const STATUTS = { en_attente: 'En attente', confirmee: 'Confirmée', annulee: 'Annulée' };
    const DEMANDES = { en_attente: 'En attente', acceptee: 'Acceptée', refusee: 'Refusée' };
    const date = (d) => (d ? new Date(d).toLocaleDateString('fr-FR') : '');

    const entetes = [
      'Référence', 'Reçue le', 'Statut', 'Résidence', 'Réf. résidence', 'Client', 'Email', 'Téléphone',
      'Arrivée', 'Départ', 'Nuits', 'Personnes', 'Montant (FCFA)', 'Demande d\'annulation', 'Motif', 'Notes',
    ];
    const lignes = reservations.map(r => [
      r.id,
      date(r.dateCreation),
      STATUTS[r.statut] || r.statut,
      r.residenceInfo?.nom,
      r.residenceInfo?.reference,
      `${r.client?.prenom || ''} ${r.client?.nom || ''}`.trim(),
      r.client?.email,
      r.client?.telephone,
      date(r.dates?.arrivee),
      date(r.dates?.depart),
      nuitsDuSejour(r.dates?.arrivee, r.dates?.depart).length,
      r.details?.nombrePersonnes,
      Number(r.prixTotal) || 0,
      r.demandeAnnulation ? DEMANDES[r.demandeAnnulation.statut] || '' : '',
      r.demandeAnnulation?.motif || '',
      r.notes || '',
    ]);

    // « ; » et BOM UTF-8 : Excel français ouvre le fichier directement avec les accents
    return '﻿' + [entetes, ...lignes].map(l => l.map(celluleCsv).join(';')).join('\r\n') + '\r\n';
  }
}

// Échappement CSV + protection contre l'injection de formules (=, +, -, @)
function celluleCsv(valeur) {
  if (valeur === null || valeur === undefined) return '';
  if (typeof valeur === 'number') return String(valeur);
  let texte = String(valeur);
  if (/^[=+\-@\t\r]/.test(texte)) texte = `'${texte}`;
  if (/[";\r\n]/.test(texte)) texte = `"${texte.replace(/"/g, '""')}"`;
  return texte;
}

const service = new StatsService();
service.nuitsDuSejour = nuitsDuSejour;
service.celluleCsv = celluleCsv;
module.exports = service;
