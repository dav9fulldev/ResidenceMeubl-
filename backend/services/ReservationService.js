const Reservation = require('../models/Reservation');
const ResidenceService = require('./ResidenceService');
const EmailService = require('./EmailService');

/**
 * Service de gestion des réservations
 */
class ReservationService {
  constructor() {
    this.reservations = [];
    this.emailService = new EmailService();
  }

  // Créer une nouvelle réservation
  async createReservation(dataReservation) {
    try {
      // Récupérer les informations de la résidence
      const residence = ResidenceService.getResidenceById(dataReservation.residenceId);
      if (!residence) {
        throw new Error('Résidence non trouvée');
      }

      // Vérifier la disponibilité
      const disponible = ResidenceService.checkDisponibilite(
        dataReservation.residenceId,
        dataReservation.dateArrivee,
        dataReservation.dateReservation
      );

      if (!disponible) {
        throw new Error('La résidence n\'est pas disponible pour ces dates');
      }

      // Créer l'objet réservation
      const reservationData = {
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
        prixTotal: this.calculerPrixTotal(residence, dataReservation.dateArrivee, dataReservation.dateReservation)
      };

      const reservation = new Reservation(reservationData);

      // Valider la réservation
      const validation = reservation.valider();
      if (!validation.valide) {
        throw new Error(`Validation échouée: ${validation.erreurs.join(', ')}`);
      }

      // Ajouter la réservation à la liste
      this.reservations.push(reservation);

      // Envoyer l'email de confirmation
      await this.emailService.sendReservationEmail(reservation);

      return {
        success: true,
        reservation: reservation,
        message: 'Réservation créée avec succès'
      };

    } catch (error) {
      console.error('Erreur lors de la création de la réservation:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Calculer le prix total
  calculerPrixTotal(residence, dateArrivee, dateDepart) {
    const arrivee = new Date(dateArrivee);
    const depart = new Date(dateDepart);
    const nombreNuits = Math.ceil((depart - arrivee) / (1000 * 60 * 60 * 24));
    
    return residence.prix * nombreNuits;
  }

  // Obtenir une réservation par ID
  getReservationById(id) {
    return this.reservations.find(r => r.id === id);
  }

  // Obtenir toutes les réservations (pour l'admin)
  getAllReservations() {
    return this.reservations.map(reservation => ({
      id: reservation.id,
      residence: reservation.residenceInfo,
      client: reservation.client,
      dates: reservation.dates,
      statut: reservation.statut,
      dateCreation: reservation.dateCreation,
      prixTotal: reservation.prixTotal
    }));
  }

  // Mettre à jour le statut d'une réservation
  updateReservationStatus(id, nouveauStatut) {
    const reservation = this.getReservationById(id);
    if (!reservation) {
      throw new Error('Réservation non trouvée');
    }

    const statutsValides = ['en_attente', 'confirmee', 'annulee'];
    if (!statutsValides.includes(nouveauStatut)) {
      throw new Error('Statut invalide');
    }

    reservation.statut = nouveauStatut;
    return reservation;
  }

  // Obtenir les statistiques des réservations
  getReservationStats() {
    const total = this.reservations.length;
    const enAttente = this.reservations.filter(r => r.statut === 'en_attente').length;
    const confirmees = this.reservations.filter(r => r.statut === 'confirmee').length;
    const annulees = this.reservations.filter(r => r.statut === 'annulee').length;

    return {
      total,
      enAttente,
      confirmees,
      annulees
    };
  }

  // Vérifier la disponibilité d'une résidence sur une période
  checkDisponibilite(residenceId, dateArrivee, dateDepart) {
    return ResidenceService.checkDisponibilite(residenceId, dateArrivee, dateDepart);
  }
}

module.exports = new ReservationService();
