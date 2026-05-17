/**
 * Modèle de données pour une résidence
 */
class Residence {
  constructor(data) {
    this.id = data.id;
    this.nom = data.nom;
    this.reference = data.reference;
    this.localisation = data.localisation;
    this.ville = data.ville;
    this.quartier = data.quartier;
    this.prix = data.prix;
    this.nombreChambres = data.nombreChambres;
    this.typeAppartement = data.typeAppartement;
    this.description = data.description;
    this.equipements = data.equipements || [];
    this.photos = data.photos || [];
    this.disponibilites = data.disponibilites || [];
    this.amenities = data.amenities || [];
    this.surface = data.surface;
    this.capacite = data.capacite;
    this.actif = data.actif !== false; // Par défaut actif
  }

  // Méthode pour vérifier la disponibilité sur une période
  estDisponible(dateArrivee, dateDepart) {
    if (!this.disponibilites || this.disponibilites.length === 0) {
      return true; // Si pas de disponibilités définies, considérer comme disponible
    }

    const arrivee = new Date(dateArrivee);
    const depart = new Date(dateDepart);

    // Vérifier s'il y a un conflit avec les réservations existantes
    return !this.disponibilites.some(reservation => {
      const resaArrivee = new Date(reservation.dateArrivee);
      const resaDepart = new Date(reservation.dateDepart);
      
      // Vérifier s'il y a un chevauchement
      return (arrivee < resaDepart && depart > resaArrivee);
    });
  }

  // Méthode pour obtenir les informations de base
  getInfoBasique() {
    return {
      id: this.id,
      nom: this.nom,
      reference: this.reference,
      localisation: this.localisation,
      ville: this.ville,
      quartier: this.quartier,
      prix: this.prix,
      nombreChambres: this.nombreChambres,
      typeAppartement: this.typeAppartement,
      photos: this.photos.slice(0, 3), // Seulement les 3 premières photos
      surface: this.surface,
      capacite: this.capacite
    };
  }

  // Méthode pour obtenir les informations complètes
  getInfoComplete() {
    return {
      ...this.getInfoBasique(),
      description: this.description,
      equipements: this.equipements,
      photos: this.photos,
      disponibilites: this.disponibilites,
      amenities: this.amenities
    };
  }
}

module.exports = Residence;
