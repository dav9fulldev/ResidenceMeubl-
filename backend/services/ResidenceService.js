const Residence = require('../models/Residence');

/**
 * Service de gestion des résidences
 */
class ResidenceService {
  constructor() {
    // Données d'exemple pour les résidences
    this.residences = [
      {
        id: 1,
        nom: "Appartement Luxe Cocody",
        reference: "ALC001",
        localisation: "Cocody, Abidjan",
        ville: "Abidjan",
        quartier: "Cocody",
        prix: 45000,
        nombreChambres: 2,
        typeAppartement: "Appartement",
        description: "Magnifique appartement moderne dans un quartier résidentiel calme de Cocody. Idéal pour les voyageurs d'affaires et les familles.",
        equipements: ["Climatisation", "WiFi", "Cuisine équipée", "Balcon", "Parking"],
        photos: [
          "https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?w=800",
          "https://images.unsplash.com/photo-1560448204-603b3fc33ddc?w=800",
          "https://images.unsplash.com/photo-1560448204-5b7a1a0b0b0b?w=800"
        ],
        amenities: ["Piscine", "Gym", "Sécurité 24/7", "Conciergerie"],
        surface: 85,
        capacite: 4,
        actif: true
      },
      {
        id: 2,
        nom: "Villa Premium Yopougon",
        reference: "VPY002",
        localisation: "Yopougon, Abidjan",
        ville: "Abidjan",
        quartier: "Yopougon",
        prix: 65000,
        nombreChambres: 3,
        typeAppartement: "Villa",
        description: "Superbe villa avec jardin privatif dans le quartier animé de Yopougon. Parfait pour les séjours en famille.",
        equipements: ["Climatisation", "WiFi", "Cuisine équipée", "Jardin", "Terrasse", "Parking privé"],
        photos: [
          "https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?w=800",
          "https://images.unsplash.com/photo-1560448204-603b3fc33ddc?w=800"
        ],
        amenities: ["Jardin privatif", "Terrasse", "Sécurité", "Ménage"],
        surface: 120,
        capacite: 6,
        actif: true
      },
      {
        id: 3,
        nom: "Studio Moderne Plateau",
        reference: "SMP003",
        localisation: "Plateau, Abidjan",
        ville: "Abidjan",
        quartier: "Plateau",
        prix: 28000,
        nombreChambres: 1,
        typeAppartement: "Studio",
        description: "Studio moderne et fonctionnel au cœur du Plateau, à proximité des commerces et des transports.",
        equipements: ["Climatisation", "WiFi", "Cuisine équipée", "Balcon"],
        photos: [
          "https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?w=800"
        ],
        amenities: ["Sécurité", "Ascenseur", "Ménage"],
        surface: 45,
        capacite: 2,
        actif: true
      },
      {
        id: 4,
        nom: "Appartement Familial Marcory",
        reference: "AFM004",
        localisation: "Marcory, Abidjan",
        ville: "Abidjan",
        quartier: "Marcory",
        prix: 52000,
        nombreChambres: 3,
        typeAppartement: "Appartement",
        description: "Grand appartement familial dans le quartier résidentiel de Marcory. Idéal pour les longs séjours.",
        equipements: ["Climatisation", "WiFi", "Cuisine équipée", "Balcon", "Parking", "Cave"],
        photos: [
          "https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?w=800",
          "https://images.unsplash.com/photo-1560448204-603b3fc33ddc?w=800"
        ],
        amenities: ["Piscine", "Gym", "Sécurité", "Ménage", "Conciergerie"],
        surface: 110,
        capacite: 6,
        actif: true
      }
    ];
  }

  // Obtenir toutes les résidences actives
  getAllResidences() {
    return this.residences
      .filter(residence => residence.actif)
      .map(residence => new Residence(residence).getInfoBasique());
  }

  // Obtenir une résidence par ID
  getResidenceById(id) {
    const residence = this.residences.find(r => r.id === parseInt(id) && r.actif);
    return residence ? new Residence(residence).getInfoComplete() : null;
  }

  // Rechercher des résidences
  searchResidences(criteres) {
    let resultats = this.residences.filter(residence => residence.actif);

    // Recherche par nom, ville ou quartier
    if (criteres.recherche) {
      const recherche = criteres.recherche.toLowerCase();
      resultats = resultats.filter(residence => 
        residence.nom.toLowerCase().includes(recherche) ||
        residence.ville.toLowerCase().includes(recherche) ||
        residence.quartier.toLowerCase().includes(recherche)
      );
    }

    // Filtre par prix
    if (criteres.prixMin !== undefined) {
      resultats = resultats.filter(residence => residence.prix >= criteres.prixMin);
    }
    if (criteres.prixMax !== undefined) {
      resultats = resultats.filter(residence => residence.prix <= criteres.prixMax);
    }

    // Filtre par nombre de chambres
    if (criteres.nombreChambres) {
      resultats = resultats.filter(residence => residence.nombreChambres >= criteres.nombreChambres);
    }

    // Filtre par type d'appartement
    if (criteres.typeAppartement) {
      resultats = resultats.filter(residence => residence.typeAppartement === criteres.typeAppartement);
    }

    // Filtre par localisation
    if (criteres.localisation) {
      resultats = resultats.filter(residence => 
        residence.ville.toLowerCase().includes(criteres.localisation.toLowerCase()) ||
        residence.quartier.toLowerCase().includes(criteres.localisation.toLowerCase())
      );
    }

    return resultats.map(residence => new Residence(residence).getInfoBasique());
  }

  // Obtenir les types d'appartements disponibles
  getTypesAppartements() {
    const types = [...new Set(this.residences.map(r => r.typeAppartement))];
    return types;
  }

  // Obtenir les villes disponibles
  getVilles() {
    const villes = [...new Set(this.residences.map(r => r.ville))];
    return villes;
  }

  // Obtenir les quartiers par ville
  getQuartiersByVille(ville) {
    const quartiers = this.residences
      .filter(r => r.ville === ville && r.actif)
      .map(r => r.quartier);
    return [...new Set(quartiers)];
  }

  // Vérifier la disponibilité d'une résidence
  checkDisponibilite(residenceId, dateArrivee, dateDepart) {
    const residence = this.getResidenceById(residenceId);
    if (!residence) return false;
    
    return new Residence(residence).estDisponible(dateArrivee, dateDepart);
  }
}

module.exports = new ResidenceService();
