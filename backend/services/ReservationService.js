const Reservation = require('../models/Reservation');
const ResidenceService = require('./ResidenceService');
const EmailService = require('./EmailService');
const db = require('../db');

const STATUTS_VALIDES = ['en_attente', 'confirmee', 'annulee'];
const FORMAT_DATE = /^\d{4}-\d{2}-\d{2}$/;

// Champs enregistrés en base pour une réservation
const versDocument = (reservation) => ({
  id: reservation.id,
  residenceId: reservation.residenceId,
  residenceInfo: reservation.residenceInfo,
  client: reservation.client,
  dates: reservation.dates,
  details: reservation.details,
  statut: reservation.statut,
  dateCreation: reservation.dateCreation,
  notes: reservation.notes,
  prixTotal: reservation.prixTotal,
});

/**
 * Service de gestion des réservations (stockage MongoDB, collection « reservations »)
 */
class ReservationService {
  constructor() {
    this.emailService = new EmailService();
  }

  get collection() {
    return db.collection('reservations');
  }

  // Créer une nouvelle réservation
  async createReservation(dataReservation) {
    try {
      const { residenceId, dateArrivee, dateDepart } = dataReservation;

      // Dates au format AAAA-MM-JJ (permet de comparer les dates en base comme du texte)
      if (!FORMAT_DATE.test(dateArrivee) || !FORMAT_DATE.test(dateDepart)) {
        throw new Error('Les dates doivent être au format AAAA-MM-JJ');
      }

      const residence = await ResidenceService.getResidenceById(residenceId);
      if (!residence) {
        throw new Error('Résidence non trouvée');
      }

      if (!(await this.checkDisponibilite(residenceId, dateArrivee, dateDepart))) {
        throw new Error('La résidence n\'est pas disponible pour ces dates');
      }

      // Capacité et durée de séjour
      if (dataReservation.nombrePersonnes > residence.capacite) {
        throw new Error(`Cette résidence accueille au maximum ${residence.capacite} personnes`);
      }
      const nuits = this.calculerNombreNuits(dateArrivee, dateDepart);
      const { sejourMin, sejourMax } = residence.disponibilite;
      if (nuits < sejourMin || nuits > sejourMax) {
        throw new Error(`La durée du séjour doit être comprise entre ${sejourMin} et ${sejourMax} nuits`);
      }

      const reservation = new Reservation({
        ...dataReservation,
        residenceInfo: {
          id: residence.id,
          nom: residence.nom,
          reference: residence.reference,
          localisation: residence.localisation,
          ville: residence.ville,
          quartier: residence.quartier,
          photos: residence.photos
        },
        prixTotal: residence.prix * nuits
      });

      const validation = reservation.valider();
      if (!validation.valide) {
        throw new Error(`Validation échouée: ${validation.erreurs.join(', ')}`);
      }

      await this.collection.insertOne(versDocument(reservation));

      // Envoyer les emails : un échec d'envoi ne doit pas annuler la réservation
      let emailEnvoye = false;
      try {
        await this.emailService.sendReservationEmail(reservation);
        emailEnvoye = true;
      } catch (emailError) {
        console.error('⚠️ Réservation enregistrée mais email non envoyé:', emailError.message);
      }

      return {
        success: true,
        reservation,
        emailEnvoye,
        message: 'Réservation créée avec succès'
      };

    } catch (error) {
      console.error('Erreur lors de la création de la réservation:', error.message);
      return {
        success: false,
        error: error.message
      };
    }
  }

  calculerNombreNuits(dateArrivee, dateDepart) {
    return Math.round((new Date(dateDepart) - new Date(dateArrivee)) / (1000 * 60 * 60 * 24));
  }

  // Obtenir une réservation par ID
  async getReservationById(id) {
    return this.collection.findOne({ id: String(id) }, { projection: { _id: 0 } });
  }

  // Obtenir toutes les réservations, les plus récentes d'abord (pour l'admin)
  async getAllReservations() {
    const reservations = await this.collection
      .find({}, { projection: { _id: 0 } })
      .sort({ dateCreation: -1 })
      .toArray();

    return reservations.map(reservation => ({
      id: reservation.id,
      residence: reservation.residenceInfo,
      client: reservation.client,
      dates: reservation.dates,
      details: reservation.details,
      notes: reservation.notes,
      statut: reservation.statut,
      dateCreation: reservation.dateCreation,
      prixTotal: reservation.prixTotal
    }));
  }

  // Mettre à jour le statut d'une réservation et prévenir le client.
  // Retourne null si introuvable, sinon { reservation, emailEnvoye }.
  async updateReservationStatus(id, nouveauStatut) {
    if (!STATUTS_VALIDES.includes(nouveauStatut)) {
      throw new Error('Statut invalide');
    }

    const avant = await this.collection.findOneAndUpdate(
      { id: String(id) },
      { $set: { statut: nouveauStatut } },
      { returnDocument: 'before', projection: { _id: 0 } }
    );
    if (!avant) return null;

    const reservation = { ...avant, statut: nouveauStatut };

    // Email au client seulement si le statut change vers « confirmée » ou « annulée »
    let emailEnvoye = false;
    if (avant.statut !== nouveauStatut && nouveauStatut !== 'en_attente') {
      try {
        await this.emailService.sendStatusEmail(reservation);
        emailEnvoye = true;
      } catch (emailError) {
        console.error('⚠️ Statut mis à jour mais email client non envoyé:', emailError.message);
      }
    }

    return { reservation, emailEnvoye };
  }

  // Obtenir les statistiques des réservations
  async getReservationStats() {
    const groupes = await this.collection
      .aggregate([{ $group: { _id: '$statut', total: { $sum: 1 } } }])
      .toArray();
    const compte = (statut) => groupes.find(g => g._id === statut)?.total || 0;

    return {
      total: groupes.reduce((somme, g) => somme + g.total, 0),
      enAttente: compte('en_attente'),
      confirmees: compte('confirmee'),
      annulees: compte('annulee')
    };
  }

  // La résidence doit être réservable et aucune réservation non annulée ne doit chevaucher les dates
  // (dates AAAA-MM-JJ : la comparaison de textes suit l'ordre chronologique)
  async checkDisponibilite(residenceId, dateArrivee, dateDepart) {
    if (!(await ResidenceService.checkDisponibilite(residenceId))) {
      return false;
    }

    const conflit = await this.collection.findOne({
      residenceId: parseInt(residenceId),
      statut: { $ne: 'annulee' },
      'dates.arrivee': { $lt: String(dateDepart) },
      'dates.depart': { $gt: String(dateArrivee) },
    });

    return !conflit;
  }
}

module.exports = new ReservationService();
