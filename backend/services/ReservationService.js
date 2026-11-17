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
  demandeAnnulation: null,
});

const aujourdhui = () => new Date().toISOString().slice(0, 10);

// Une demande d'annulation est possible tant que le séjour n'est pas terminé
const peutDemanderAnnulation = (r) =>
  r.statut !== 'annulee' &&
  r.dates.depart > aujourdhui() &&
  r.demandeAnnulation?.statut !== 'en_attente';

// Ce que le client voit de sa réservation (sans données internes)
const vueClient = (r) => ({
  id: r.id,
  residence: {
    id: r.residenceInfo?.id,
    nom: r.residenceInfo?.nom,
    localisation: r.residenceInfo?.localisation,
    photo: r.residenceInfo?.photos?.[0] || null,
  },
  dates: r.dates,
  nombrePersonnes: r.details?.nombrePersonnes,
  prixTotal: r.prixTotal,
  statut: r.statut,
  dateCreation: r.dateCreation,
  demandeAnnulation: r.demandeAnnulation || null,
  peutDemanderAnnulation: peutDemanderAnnulation(r),
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
      prixTotal: reservation.prixTotal,
      demandeAnnulation: reservation.demandeAnnulation || null
    }));
  }

  // ---------- Espace client (sans compte) ----------

  // Réservation dont la référence et l'email correspondent (null sinon)
  async trouverPourClient(reference, email) {
    return this.collection.findOne(
      { id: String(reference).trim(), 'client.email': String(email).trim().toLowerCase() },
      { projection: { _id: 0 } }
    );
  }

  async compterPourEmail(email) {
    return this.collection.countDocuments({ 'client.email': String(email).trim().toLowerCase() });
  }

  // Historique du client ; limité à une réservation si l'accès vient d'une référence
  async getReservationsClient({ email, ref }) {
    const filtre = { 'client.email': email, ...(ref ? { id: ref } : {}) };
    const docs = await this.collection.find(filtre, { projection: { _id: 0 } }).sort({ dateCreation: -1 }).toArray();
    return docs.map(vueClient);
  }

  /**
   * Le client demande l'annulation ; l'admin décide ensuite.
   * Retourne { reservation, emailEnvoye } ou lève une erreur explicite.
   */
  async demanderAnnulation(id, { email, ref }, motif) {
    if (ref && ref !== String(id)) {
      throw new ErreurClient('Accès non autorisé à cette réservation', 403);
    }
    const reservation = await this.collection.findOne({ id: String(id), 'client.email': email }, { projection: { _id: 0 } });
    if (!reservation) throw new ErreurClient('Réservation introuvable', 404);
    if (reservation.statut === 'annulee') throw new ErreurClient('Cette réservation est déjà annulée');
    if (reservation.demandeAnnulation?.statut === 'en_attente') {
      throw new ErreurClient('Une demande d\'annulation est déjà en cours pour cette réservation');
    }
    if (reservation.dates.depart <= aujourdhui()) {
      throw new ErreurClient('Ce séjour est terminé : il ne peut plus être annulé en ligne');
    }

    const demande = {
      statut: 'en_attente',
      motif: String(motif || '').trim().slice(0, 500),
      dateDemande: new Date(),
      reponse: null,
      dateReponse: null,
    };
    await this.collection.updateOne({ id: reservation.id }, { $set: { demandeAnnulation: demande } });
    const misAJour = { ...reservation, demandeAnnulation: demande };

    let emailEnvoye = false;
    try {
      await this.emailService.sendDemandeAnnulationAdmin(misAJour);
      emailEnvoye = true;
    } catch (emailError) {
      console.error('⚠️ Demande d\'annulation enregistrée mais admin non prévenu:', emailError.message);
    }
    return { reservation: vueClient(misAJour), emailEnvoye };
  }

  /**
   * L'admin accepte (→ réservation annulée, dates libérées) ou refuse la demande.
   * Retourne null si introuvable, sinon { reservation, emailEnvoye }.
   */
  async traiterDemandeAnnulation(id, decision, message = '') {
    if (!['accepter', 'refuser'].includes(decision)) throw new ErreurClient('Décision invalide');
    const reservation = await this.collection.findOne({ id: String(id) }, { projection: { _id: 0 } });
    if (!reservation) return null;
    if (reservation.demandeAnnulation?.statut !== 'en_attente') {
      throw new ErreurClient('Aucune demande d\'annulation en attente pour cette réservation');
    }

    const reponse = String(message || '').trim().slice(0, 500) || null;
    await this.collection.updateOne({ id: reservation.id }, {
      $set: {
        'demandeAnnulation.statut': decision === 'accepter' ? 'acceptee' : 'refusee',
        'demandeAnnulation.reponse': reponse,
        'demandeAnnulation.dateReponse': new Date(),
      },
    });

    if (decision === 'accepter') {
      // Annule, libère les dates et envoie l'email d'annulation (avec le message éventuel)
      const resultat = await this.updateReservationStatus(reservation.id, 'annulee', { message: reponse });
      return resultat;
    }

    const refusee = await this.getReservationById(reservation.id);
    let emailEnvoye = false;
    try {
      await this.emailService.sendRefusAnnulation(refusee);
      emailEnvoye = true;
    } catch (emailError) {
      console.error('⚠️ Refus enregistré mais email client non envoyé:', emailError.message);
    }
    return { reservation: refusee, emailEnvoye };
  }

  // Mettre à jour le statut d'une réservation et prévenir le client.
  // Retourne null si introuvable, sinon { reservation, emailEnvoye }.
  async updateReservationStatus(id, nouveauStatut, { message = null } = {}) {
    if (!STATUTS_VALIDES.includes(nouveauStatut)) {
      throw new Error('Statut invalide');
    }

    const avant = await this.collection.findOneAndUpdate(
      { id: String(id) },
      { $set: { statut: nouveauStatut } },
      { returnDocument: 'before', projection: { _id: 0 } }
    );
    if (!avant) return null;

    // Une annulation décidée par l'admin clôt aussi une demande du client en attente
    if (nouveauStatut === 'annulee' && avant.demandeAnnulation?.statut === 'en_attente') {
      await this.collection.updateOne({ id: avant.id }, {
        $set: { 'demandeAnnulation.statut': 'acceptee', 'demandeAnnulation.dateReponse': new Date() },
      });
    }

    const reservation = await this.collection.findOne({ id: avant.id }, { projection: { _id: 0 } });

    // Email au client seulement si le statut change vers « confirmée » ou « annulée »
    let emailEnvoye = false;
    if (avant.statut !== nouveauStatut && nouveauStatut !== 'en_attente') {
      try {
        await this.emailService.sendStatusEmail(reservation, { message });
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

// Erreur à renvoyer telle quelle au client (avec un code HTTP)
class ErreurClient extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

const service = new ReservationService();
service.ErreurClient = ErreurClient;

module.exports = service;
