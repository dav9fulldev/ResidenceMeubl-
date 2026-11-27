const Residence = require('../models/Residence');
const db = require('../db');
const Tenant = require('./Tenant');
const EntrepriseService = require('./EntrepriseService');

// Champs modifiables par l'administrateur
const CHAMPS_EDITABLES = [
  'nom', 'reference', 'typeAppartement', 'description', 'localisation', 'ville', 'quartier',
  'prix', 'nombreChambres', 'nombreSallesDeBain', 'capacite', 'note', 'photos', 'equipements',
  'disponibilite', 'actif',
];

const choisirChamps = (data) => {
  const resultat = {};
  for (const champ of CHAMPS_EDITABLES) {
    if (data[champ] !== undefined) resultat[champ] = data[champ];
  }
  return resultat;
};

const SANS_ID_MONGO = { projection: { _id: 0 } };
const ACTIVES = { actif: { $ne: false } };
// Site public : résidences actives des entreprises validées uniquement
const PUBLIQUES = () => ({ ...ACTIVES, entrepriseId: { $in: EntrepriseService.validees() }, statutVerification: 'verifiee' });

class ErreurValidation extends Error {}

// Version publique : jamais le nom de l'occupant (donnée personnelle réservée à l'admin)
const publique = (residence) => {
  const { occupant, reservationId, ...disponibilite } = residence.disponibilite;
  return {
    ...residence,
    disponibilite,
    entreprise: { id: residence.entrepriseId, nom: EntrepriseService.nom(residence.entrepriseId) },
  };
};

/**
 * Service de notation et comparateur.
 *  - note affichée = moyenne des avis de la résidence ; aucune note sans avis ;
 *  - recommandation = 60 % note de la résidence + 40 % note de son partenaire (toutes ses
 *    résidences), chacune pondérée par le nombre d'avis (moyenne bayésienne : peu d'avis, score
 *    proche de la valeur neutre). Le catalogue est trié par recommandation : les résidences des
 *    partenaires les mieux notés sont proposées en premier.
 *  - partenaire recommandé : au moins 5 avis et 4,5 de moyenne.
 */
const NOTE_NEUTRE = 4;
const POIDS_NEUTRE = 3;
const bayes = (r) => (r ? (POIDS_NEUTRE * NOTE_NEUTRE + r.nombre * r.moyenne) / (POIDS_NEUTRE + r.nombre) : NOTE_NEUTRE);
async function avecNotes(residences) {
  const Avis = require('./AvisService');
  const Booster = require('./BoosterService');
  const [resumes, partenaires, boostees] = await Promise.all([Avis.resumes(residences.map(r => r.id)), Avis.parEntreprise(), Booster.actifs()]);
  return residences.map((r) => {
    const n = resumes.get(r.id);
    const p = partenaires.get(r.entrepriseId);
    // Booster de visibilité : bonus selon le budget, refusé à une résidence mal notée ; mention « Sponsorisé ».
    // Audience « tout le site » : appliqué ici, partout. Audience quartier / ville : le site l'applique
    // seulement aux recherches de cette zone (champ boost).
    const b = boostees.get(r.id);
    const bonus = b && bayes(n) >= Booster.NOTE_MINIMALE ? b.bonus : 0;
    const partout = Boolean(b && b.audience === 'tout');
    return {
      ...r,
      note: n?.moyenne ?? null,
      nombreAvis: n?.nombre || 0,
      sponsorise: partout,
      boost: b && !partout ? { audience: b.audience, cible: b.cible, bonus } : null,
      recommandation: Math.round((0.6 * bayes(n) + 0.4 * bayes(p) + (partout ? bonus : 0)) * 1000) / 1000,
      entreprise: { ...r.entreprise, note: p?.moyenne ?? null, nombreAvis: p?.nombre || 0, recommande: Boolean(p && p.nombre >= 5 && p.moyenne >= 4.5) },
    };
  });
}

/** Conditions de réservation propres à l'entreprise d'une résidence (acompte, moyens de paiement). */
const conditionsEntreprise = (entrepriseId) => Tenant.run(entrepriseId, () => {
  const Settings = require('./SettingsService');
  return {
    moyensPaiement: require('./paiement/fournisseurs').actifs().map(m => ({ id: m.id, nom: m.nom, modes: m.modes })),
    acompte: {
      pourcentage: Settings.get('acomptePourcentage'),
      remboursementPourcentage: Settings.get('remboursementPourcentage'),
      integralJours: Settings.get('remboursableApresPaiementJours'),
      avantArriveeJours: Settings.get('nonRemboursableAvantArriveeJours'),
    },
    contact: (({ telephone, whatsapp, email }) => ({ telephone, whatsapp, email }))(Settings.etablissement({ publique: true })),
  };
});

const aujourdhui = () => new Date().toISOString().slice(0, 10);

/**
 * Calcule le statut affiché à partir des réservations confirmées :
 *  - séjour confirmé en cours  → « occupé »
 *  - séjour confirmé à venir   → « réservé » (le plus proche)
 * Un statut posé à la main par l'admin (autre que « disponible ») reste prioritaire.
 */
const appliquerReservations = (residence, reservationsConfirmees) => {
  if (residence.disponibilite.statut !== 'disponible') return residence;

  const jour = aujourdhui();
  const sejours = reservationsConfirmees
    .filter(r => r.residenceId === residence.id && r.dates.depart > jour)
    .sort((a, b) => a.dates.arrivee.localeCompare(b.dates.arrivee));
  if (sejours.length === 0) return residence;

  const enCours = sejours.find(r => r.dates.arrivee <= jour);
  const sejour = enCours || sejours[0];

  return {
    ...residence,
    disponibilite: {
      ...residence.disponibilite,
      statut: enCours ? 'occupé' : 'réservé',
      occupant: `${sejour.client.prenom} ${sejour.client.nom}`,
      arrivee: sejour.dates.arrivee,
      depart: sejour.dates.depart,
      prochaineDisponibilite: sejour.dates.depart,
      automatique: true, // calculé depuis les réservations, pas posé à la main
      reservationId: sejour.id, // pour l'admin : réservation à annuler pour libérer
    },
  };
};

/**
 * Service de gestion des résidences (stockage MongoDB, collection « residences »)
 */
class ResidenceService {
  get collection() {
    return db.collection('residences');
  }

  // Réservations confirmées pas encore terminées
  async reservationsConfirmees(filtre = {}) {
    return db.collection('reservations')
      .find({ ...filtre, statut: 'confirmee', 'dates.depart': { $gt: aujourdhui() } }, SANS_ID_MONGO)
      .toArray();
  }

  async avecStatutReel(docs) {
    const confirmees = await this.reservationsConfirmees(
      docs.length === 1 ? { residenceId: docs[0].id } : {}
    );
    return docs.map(d => appliquerReservations(new Residence(d).toJSON(), confirmees));
  }

  // Résidences visibles sur le site public
  async getAllResidences() {
    const docs = await this.collection.find(PUBLIQUES(), SANS_ID_MONGO).sort({ id: 1 }).toArray();
    // Comparateur : les résidences des partenaires les mieux notés d'abord
    return (await avecNotes((await this.avecStatutReel(docs)).map(publique)))
      .sort((x, y) => y.recommandation - x.recommandation || x.id - y.id);
  }

  // Toutes les résidences de l'entreprise, y compris inactives (admin)
  async getAllResidencesAdmin() {
    const docs = await this.collection.find(Tenant.filtre(), SANS_ID_MONGO).sort({ id: 1 }).toArray();
    return this.avecStatutReel(docs);
  }

  // Obtenir une résidence active par ID (version publique)
  async getResidenceById(id) {
    const doc = await this.collection.findOne({ id: parseInt(id), ...PUBLIQUES() }, SANS_ID_MONGO);
    return doc ? (await avecNotes([publique((await this.avecStatutReel([doc]))[0])]))[0] : null;
  }

  // Fiche publique complète : résidence + conditions de l'entreprise qui la propose
  async getResidencePublique(id) {
    const residence = await this.getResidenceById(id);
    if (!residence) return null;
    return { ...residence, entreprise: { ...residence.entreprise, ...conditionsEntreprise(residence.entrepriseId) } };
  }

  // Rechercher des résidences (filtrage en mémoire : le catalogue est petit)
  async searchResidences(criteres = {}) {
    let resultats = await this.getAllResidences();

    if (criteres.recherche) {
      const recherche = String(criteres.recherche).toLowerCase();
      resultats = resultats.filter(r =>
        [r.nom, r.ville, r.quartier, r.localisation, r.typeAppartement]
          .some(v => v && v.toLowerCase().includes(recherche))
      );
    }
    if (criteres.prixMin !== undefined) resultats = resultats.filter(r => r.prix >= Number(criteres.prixMin));
    if (criteres.prixMax !== undefined) resultats = resultats.filter(r => r.prix <= Number(criteres.prixMax));
    if (criteres.nombreChambres) resultats = resultats.filter(r => r.nombreChambres >= Number(criteres.nombreChambres));
    if (criteres.typeAppartement) resultats = resultats.filter(r => r.typeAppartement === criteres.typeAppartement);
    if (criteres.localisation) {
      const loc = String(criteres.localisation).toLowerCase();
      resultats = resultats.filter(r => r.ville.toLowerCase().includes(loc) || r.quartier.toLowerCase().includes(loc));
    }

    return resultats;
  }

  async getTypesAppartements() {
    return this.collection.distinct('typeAppartement', PUBLIQUES());
  }

  async getVilles() {
    return this.collection.distinct('ville', PUBLIQUES());
  }

  async getQuartiersByVille(ville) {
    return this.collection.distinct('quartier', { ville: String(ville), ...PUBLIQUES() });
  }

  // La résidence existe-t-elle et peut-elle être réservée ? (hors conflits de dates)
  async checkDisponibilite(residenceId) {
    const doc = await this.collection.findOne({ id: parseInt(residenceId) }, SANS_ID_MONGO);
    return Boolean(doc && new Residence(doc).estReservable());
  }

  // ---------- Administration ----------

  async createResidence(data) {
    const entrepriseId = Tenant.courante();
    const champs = choisirChamps(data);
    // Une entreprise ajoute ses photos par téléversement (vérifiées), jamais par adresse libre
    if (!Tenant.estPrincipale()) champs.photos = [];
    const residence = new Residence({ ...champs, id: 0, entrepriseId, statutVerification: require('./VerificationService').statutInitial() });

    const validation = residence.valider();
    if (!validation.valide) {
      throw new ErreurValidation(validation.erreurs.join(', '));
    }
    if (await this.collection.findOne({ entrepriseId, reference: { $eq: String(residence.reference) } })) {
      throw new ErreurValidation('Cette référence existe déjà');
    }

    residence.id = await db.nextId('residences');
    await this.collection.insertOne(residence.toJSON());
    return residence.toJSON();
  }

  async updateResidence(id, data) {
    const doc = await this.collection.findOne({ id: parseInt(id), ...Tenant.filtre() }, SANS_ID_MONGO);
    if (!doc) return null;

    const actuelle = new Residence(doc).toJSON();
    const changements = choisirChamps(data);
    // Entreprise : les photos ne peuvent qu'être retirées ou réordonnées (ajout = téléversement vérifié)
    if (changements.photos !== undefined && actuelle.entrepriseId !== Tenant.PRINCIPALE) {
      changements.photos = Array.isArray(changements.photos) ? changements.photos.filter(p => actuelle.photos.includes(p)) : actuelle.photos;
    }
    if (changements.disponibilite) {
      changements.disponibilite = { ...actuelle.disponibilite, ...changements.disponibilite };
    }

    const residence = new Residence({ ...actuelle, ...changements, id: actuelle.id, entrepriseId: actuelle.entrepriseId });
    const validation = residence.valider();
    if (!validation.valide) {
      throw new ErreurValidation(validation.erreurs.join(', '));
    }
    if (residence.reference !== actuelle.reference &&
        await this.collection.findOne({ entrepriseId: actuelle.entrepriseId, reference: { $eq: String(residence.reference) } })) {
      throw new ErreurValidation('Cette référence existe déjà');
    }

    await this.collection.replaceOne({ id: actuelle.id, entrepriseId: actuelle.entrepriseId }, residence.toJSON());
    // Adresse ou photos modifiées : nouvelle vérification avant de réapparaître sur le site
    const sensible = ['localisation', 'ville', 'quartier'].some(k => residence[k] !== actuelle[k])
      || JSON.stringify(residence.photos) !== JSON.stringify(actuelle.photos);
    if (sensible) {
      const doc2 = residence.toJSON();
      await require('./VerificationService').apresChangementSensible(doc2, 'Adresse ou photos modifiées');
      residence.statutVerification = doc2.statutVerification;
    }
    return (await this.avecStatutReel([residence.toJSON()]))[0];
  }

  // Changer le statut affiché (disponible, occupé, réservé, maintenance)
  async updateStatut(id, statut, details = {}) {
    if (!Residence.STATUTS.includes(statut)) {
      throw new ErreurValidation('Statut invalide');
    }
    // « Disponible » ne peut pas masquer une réservation confirmée : il faut l'annuler
    if (!(await this.collection.findOne({ id: parseInt(id), ...Tenant.filtre() }, { projection: { _id: 1 } }))) return null;
    if (statut === 'disponible') {
      const [bloquante] = await this.reservationsConfirmees({ residenceId: parseInt(id) });
      if (bloquante) {
        const date = (d) => new Date(d).toLocaleDateString('fr-FR');
        throw new ErreurValidation(
          `Cette résidence est réservée par ${bloquante.client.prenom} ${bloquante.client.nom} ` +
          `du ${date(bloquante.dates.arrivee)} au ${date(bloquante.dates.depart)} (réf. ${bloquante.id}). ` +
          'Elle sera libérée si le client demande l\'annulation depuis « Mes réservations » et que vous l\'acceptez.'
        );
      }
    }
    const libre = statut === 'disponible' || statut === 'maintenance';
    return this.updateResidence(id, {
      disponibilite: {
        statut,
        occupant: libre ? null : details.occupant || null,
        arrivee: libre ? null : details.arrivee || null,
        depart: libre ? null : details.depart || null,
        prochaineDisponibilite: statut === 'disponible' ? null : details.prochaineDisponibilite || details.depart || null,
      },
    });
  }

  async deleteResidence(id) {
    const doc = await this.collection.findOneAndDelete({ id: parseInt(id), ...Tenant.filtre() }, SANS_ID_MONGO);
    if (!doc) return false;
    await require('./VerificationService').nettoyer(doc).catch(e => console.error('⚠️ Nettoyage des fichiers :', e.message));
    return true;
  }
}

const service = new ResidenceService();
service.ErreurValidation = ErreurValidation;

module.exports = service;
