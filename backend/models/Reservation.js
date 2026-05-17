/**
 * Modèle de données pour une réservation
 */
class Reservation {
  constructor(data) {
    this.id = data.id || this.generateId();
    this.residenceId = data.residenceId;
    this.residenceInfo = data.residenceInfo; // Informations de la résidence
    this.client = {
      nom: data.nom,
      prenom: data.prenom,
      email: data.email,
      telephone: data.telephone
    };
    this.dates = {
      arrivee: data.dateArrivee,
      depart: data.dateDepart
    };
    this.details = {
      nombrePersonnes: data.nombrePersonnes,
      pieceIdentite: data.pieceIdentite || null
    };
    this.statut = data.statut || 'en_attente'; // en_attente, confirmee, annulee
    this.dateCreation = data.dateCreation || new Date();
    this.notes = data.notes || '';
    this.prixTotal = data.prixTotal;
  }

  // Générer un ID unique
  generateId() {
    return 'RES_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
  }

  // Valider les données de la réservation
  valider() {
    const erreurs = [];

    // Validation des informations client
    if (!this.client.nom || this.client.nom.trim().length < 2) {
      erreurs.push('Le nom doit contenir au moins 2 caractères');
    }
    if (!this.client.prenom || this.client.prenom.trim().length < 2) {
      erreurs.push('Le prénom doit contenir au moins 2 caractères');
    }
    if (!this.client.email || !this.isValidEmail(this.client.email)) {
      erreurs.push('Email invalide');
    }
    if (!this.client.telephone || this.client.telephone.trim().length < 8) {
      erreurs.push('Numéro de téléphone invalide');
    }

    // Validation des dates
    if (!this.dates.arrivee || !this.dates.depart) {
      erreurs.push('Les dates d\'arrivée et de départ sont obligatoires');
    } else {
      const arrivee = new Date(this.dates.arrivee);
      const depart = new Date(this.dates.depart);
      const aujourdhui = new Date();
      aujourdhui.setHours(0, 0, 0, 0);

      if (arrivee < aujourdhui) {
        erreurs.push('La date d\'arrivée ne peut pas être dans le passé');
      }
      if (depart <= arrivee) {
        erreurs.push('La date de départ doit être postérieure à la date d\'arrivée');
      }
    }

    // Validation du nombre de personnes
    if (!this.details.nombrePersonnes || this.details.nombrePersonnes < 1) {
      erreurs.push('Le nombre de personnes doit être au moins de 1');
    }

    // Validation de la résidence
    if (!this.residenceId) {
      erreurs.push('L\'identifiant de la résidence est obligatoire');
    }

    return {
      valide: erreurs.length === 0,
      erreurs: erreurs
    };
  }

  // Valider le format email
  isValidEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  // Obtenir les informations pour l'email
  getInfoEmail() {
    return {
      id: this.id,
      residence: this.residenceInfo,
      client: this.client,
      dates: this.dates,
      details: this.details,
      prixTotal: this.prixTotal,
      dateCreation: this.dateCreation
    };
  }

  // Obtenir le statut en français
  getStatutFrancais() {
    const statuts = {
      'en_attente': 'En attente',
      'confirmee': 'Confirmée',
      'annulee': 'Annulée'
    };
    return statuts[this.statut] || this.statut;
  }
}

module.exports = Reservation;
