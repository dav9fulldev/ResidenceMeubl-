const Residence = require('../models/Residence');
const db = require('../db');

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

class ErreurValidation extends Error {}

// Version publique : jamais le nom de l'occupant (donnée personnelle réservée à l'admin)
const publique = (residence) => {
  const { occupant, reservationId, ...disponibilite } = residence.disponibilite;
  return { ...residence, disponibilite };
};

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
    const docs = await this.collection.find(ACTIVES, SANS_ID_MONGO).sort({ id: 1 }).toArray();
    return (await this.avecStatutReel(docs)).map(publique);
  }

  // Toutes les résidences, y compris inactives (admin)
  async getAllResidencesAdmin() {
    const docs = await this.collection.find({}, SANS_ID_MONGO).sort({ id: 1 }).toArray();
    return this.avecStatutReel(docs);
  }

  // Obtenir une résidence active par ID (version publique)
  async getResidenceById(id) {
    const doc = await this.collection.findOne({ id: parseInt(id), ...ACTIVES }, SANS_ID_MONGO);
    return doc ? publique((await this.avecStatutReel([doc]))[0]) : null;
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
    return this.collection.distinct('typeAppartement', ACTIVES);
  }

  async getVilles() {
    return this.collection.distinct('ville', ACTIVES);
  }

  async getQuartiersByVille(ville) {
    return this.collection.distinct('quartier', { ville: String(ville), ...ACTIVES });
  }

  // La résidence existe-t-elle et peut-elle être réservée ? (hors conflits de dates)
  async checkDisponibilite(residenceId) {
    const doc = await this.collection.findOne({ id: parseInt(residenceId) }, SANS_ID_MONGO);
    return Boolean(doc && new Residence(doc).estReservable());
  }

  // ---------- Administration ----------

  async createResidence(data) {
    const residence = new Residence({ ...choisirChamps(data), id: 0 });

    const validation = residence.valider();
    if (!validation.valide) {
      throw new ErreurValidation(validation.erreurs.join(', '));
    }
    if (await this.collection.findOne({ reference: residence.reference })) {
      throw new ErreurValidation('Cette référence existe déjà');
    }

    residence.id = await db.nextId('residences');
    await this.collection.insertOne(residence.toJSON());
    return residence.toJSON();
  }

  async updateResidence(id, data) {
    const doc = await this.collection.findOne({ id: parseInt(id) }, SANS_ID_MONGO);
    if (!doc) return null;

    const actuelle = new Residence(doc).toJSON();
    const changements = choisirChamps(data);
    if (changements.disponibilite) {
      changements.disponibilite = { ...actuelle.disponibilite, ...changements.disponibilite };
    }

    const residence = new Residence({ ...actuelle, ...changements, id: actuelle.id });
    const validation = residence.valider();
    if (!validation.valide) {
      throw new ErreurValidation(validation.erreurs.join(', '));
    }
    if (residence.reference !== actuelle.reference &&
        await this.collection.findOne({ reference: residence.reference })) {
      throw new ErreurValidation('Cette référence existe déjà');
    }

    await this.collection.replaceOne({ id: actuelle.id }, residence.toJSON());
    return (await this.avecStatutReel([residence.toJSON()]))[0];
  }

  // Changer le statut affiché (disponible, occupé, réservé, maintenance)
  async updateStatut(id, statut, details = {}) {
    if (!Residence.STATUTS.includes(statut)) {
      throw new ErreurValidation('Statut invalide');
    }
    // « Disponible » ne peut pas masquer une réservation confirmée : il faut l'annuler
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
    const result = await this.collection.deleteOne({ id: parseInt(id) });
    return result.deletedCount === 1;
  }
}

const service = new ResidenceService();
service.ErreurValidation = ErreurValidation;

module.exports = service;
