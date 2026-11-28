/**
 * Catalogue d'exemple pour les tests automatisés (inséré dans la base de test vide).
 * Jamais chargé en production : les résidences et leurs photos viennent de la base.
 */
module.exports = [
  {
    id: 1,
    nom: "Résidence 1",
    reference: "RES-001",
    typeAppartement: "Appartement Luxe",
    description: "Appartement moderne et luxueux au cœur du centre-ville, avec vue panoramique et tous les équipements de luxe. Idéal pour les voyageurs d'affaires et les touristes exigeants.",
    localisation: "Rue des Banques, Plateau",
    ville: "Abidjan",
    quartier: "Plateau",
    prix: 45000,
    nombreChambres: 2,
    nombreSallesDeBain: 2,
    capacite: 4,
    note: 4.8,
    photos: [
      "/images/residence1.png",
      "/images/residence1.png",
      "/images/residence1.png"
    ],
    equipements: [
      "Climatisation",
      "WiFi",
      "TV écran plat",
      "Cuisine équipée",
      "Balcon",
      "Vue ville",
      "Parking",
      "Sécurité 24h"
    ],
    disponibilite: {
      statut: "disponible",
      prochaineDisponibilite: null,
      occupant: null,
      arrivee: null,
      depart: null,
      sejourMin: 2,
      sejourMax: 30
    },
    actif: true
  },
  {
    id: 2,
    nom: "Résidence 2",
    reference: "RES-002",
    typeAppartement: "Familiale Cocody",
    description: "Spacieux appartement familial dans un quartier résidentiel calme, proche des commodités et des écoles. Parfait pour les familles en voyage.",
    localisation: "Avenue Noguès, Cocody",
    ville: "Abidjan",
    quartier: "Cocody",
    prix: 55000,
    nombreChambres: 3,
    nombreSallesDeBain: 2,
    capacite: 6,
    note: 4.6,
    photos: [
      "/images/residence2.png",
      "/images/residence2.png",
      "/images/residence2.png"
    ],
    equipements: [
      "Climatisation",
      "WiFi",
      "TV",
      "Cuisine",
      "Jardin",
      "Terrasse",
      "Parking",
      "Sécurité"
    ],
    disponibilite: {
      statut: "occupé",
      prochaineDisponibilite: "2025-01-15",
      occupant: "Famille Martin",
      arrivee: "2024-12-01",
      depart: "2025-01-15",
      sejourMin: 2,
      sejourMax: 45
    },
    actif: true
  },
  {
    id: 3,
    nom: "Résidence 3",
    reference: "RES-003",
    typeAppartement: "Studio Moderne",
    description: "Studio contemporain et fonctionnel, parfait pour les séjours courts. Design épuré et équipements modernes pour un confort optimal.",
    localisation: "Boulevard Vridi, Treichville",
    ville: "Abidjan",
    quartier: "Treichville",
    prix: 28000,
    nombreChambres: 1,
    nombreSallesDeBain: 1,
    capacite: 2,
    note: 4.4,
    photos: [
      "/images/residence3.png",
      "/images/residence3.png",
      "/images/residence3.png"
    ],
    equipements: [
      "Climatisation",
      "WiFi",
      "TV",
      "Cuisine",
      "Balcon",
      "Ascenseur",
      "Sécurité"
    ],
    disponibilite: {
      statut: "disponible",
      prochaineDisponibilite: null,
      occupant: null,
      arrivee: null,
      depart: null,
      sejourMin: 2,
      sejourMax: 15
    },
    actif: true
  },
  {
    id: 4,
    nom: "Résidence 4",
    reference: "RES-004",
    typeAppartement: "Villa Prestige",
    description: "Villa de luxe avec piscine privée et jardin tropical. Idéale pour les séjours de prestige et les événements spéciaux.",
    localisation: "Route des Jardins, Riviera",
    ville: "Abidjan",
    quartier: "Riviera",
    prix: 120000,
    nombreChambres: 4,
    nombreSallesDeBain: 3,
    capacite: 8,
    note: 4.9,
    photos: [
      "/images/residence4.png",
      "/images/residence4.png",
      "/images/residence4.png"
    ],
    equipements: [
      "Piscine",
      "Jardin",
      "Climatisation",
      "WiFi",
      "TV",
      "Cuisine",
      "Terrasse",
      "Parking",
      "Sécurité 24h",
      "Service de conciergerie"
    ],
    disponibilite: {
      statut: "réservé",
      prochaineDisponibilite: "2025-02-01",
      occupant: "M. Dupont",
      arrivee: "2024-12-20",
      depart: "2025-02-01",
      sejourMin: 2,
      sejourMax: 60
    },
    actif: true
  },
  {
    id: 5,
    nom: "Résidence 5",
    reference: "RES-005",
    typeAppartement: "Appartement Centre",
    description: "Appartement moderne au cœur du quartier des affaires, parfait pour les professionnels. Accès facile aux transports et commerces.",
    localisation: "Avenue Chardy, Plateau",
    ville: "Abidjan",
    quartier: "Plateau",
    prix: 38000,
    nombreChambres: 1,
    nombreSallesDeBain: 1,
    capacite: 2,
    note: 4.3,
    photos: [
      "/images/residence5.png",
      "/images/residence5.png",
      "/images/residence5.png"
    ],
    equipements: [
      "Climatisation",
      "WiFi",
      "TV",
      "Cuisine",
      "Balcon",
      "Ascenseur",
      "Sécurité"
    ],
    disponibilite: {
      statut: "disponible",
      prochaineDisponibilite: null,
      occupant: null,
      arrivee: null,
      depart: null,
      sejourMin: 2,
      sejourMax: 30
    },
    actif: true
  },
  {
    id: 6,
    nom: "Résidence 6",
    reference: "RES-006",
    typeAppartement: "Duplex Familial",
    description: "Duplex spacieux sur deux niveaux, idéal pour les familles nombreuses. Vue dégagée et espace de vie généreux.",
    localisation: "Rue des Ambassadeurs, Cocody",
    ville: "Abidjan",
    quartier: "Cocody",
    prix: 75000,
    nombreChambres: 3,
    nombreSallesDeBain: 2,
    capacite: 6,
    note: 4.7,
    photos: [
      "/images/residence6.png",
      "/images/residence6.png",
      "/images/residence6.png"
    ],
    equipements: [
      "Climatisation",
      "WiFi",
      "TV",
      "Cuisine",
      "Terrasse",
      "Jardin",
      "Parking",
      "Sécurité"
    ],
    disponibilite: {
      statut: "disponible",
      prochaineDisponibilite: null,
      occupant: null,
      arrivee: null,
      depart: null,
      sejourMin: 2,
      sejourMax: 90
    },
    actif: true
  },
  {
    id: 7,
    nom: "Résidence 7",
    reference: "RES-007",
    typeAppartement: "Studio Économique",
    description: "Studio simple et fonctionnel pour les petits budgets. Confort de base et emplacement central pour découvrir la ville.",
    localisation: "Boulevard Roume, Treichville",
    ville: "Abidjan",
    quartier: "Treichville",
    prix: 22000,
    nombreChambres: 1,
    nombreSallesDeBain: 1,
    capacite: 2,
    note: 4.1,
    photos: [
      "/images/residence7.png",
      "/images/residence7.png",
      "/images/residence7.png"
    ],
    equipements: [
      "Ventilateur",
      "WiFi",
      "TV",
      "Cuisine basique",
      "Sécurité"
    ],
    disponibilite: {
      statut: "maintenance",
      prochaineDisponibilite: "2025-01-20",
      occupant: null,
      arrivee: null,
      depart: null,
      sejourMin: 2,
      sejourMax: 30
    },
    actif: true
  },
  {
    id: 8,
    nom: "Résidence 8",
    reference: "RES-008",
    typeAppartement: "Appartement Vue Mer",
    description: "Appartement avec vue imprenable sur la lagune Ébrié. Balcon panoramique et ambiance zen pour des vacances reposantes.",
    localisation: "Boulevard de la Corniche, Cocody",
    ville: "Abidjan",
    quartier: "Cocody",
    prix: 65000,
    nombreChambres: 2,
    nombreSallesDeBain: 2,
    capacite: 4,
    note: 4.8,
    photos: [
      "/images/residence8.png",
      "/images/residence8.png",
      "/images/residence8.png"
    ],
    equipements: [
      "Climatisation",
      "WiFi",
      "TV",
      "Cuisine",
      "Balcon",
      "Vue mer",
      "Parking",
      "Sécurité"
    ],
    disponibilite: {
      statut: "disponible",
      prochaineDisponibilite: null,
      occupant: null,
      arrivee: null,
      depart: null,
      sejourMin: 2,
      sejourMax: 45
    },
    actif: true
  },
  {
    id: 9,
    nom: "Résidence 9",
    reference: "RES-009",
    typeAppartement: "Maison Traditionnelle",
    description: "Maison traditionnelle ivoirienne rénovée avec goût. Authenticité et modernité pour une expérience culturelle unique.",
    localisation: "Rue des Artisans, Yopougon",
    ville: "Abidjan",
    quartier: "Yopougon",
    prix: 85000,
    nombreChambres: 3,
    nombreSallesDeBain: 2,
    capacite: 6,
    note: 4.5,
    photos: [
      "/images/residence9.png",
      "/images/residence9.png",
      "/images/residence9.png"
    ],
    equipements: [
      "Climatisation",
      "WiFi",
      "TV",
      "Cuisine",
      "Jardin",
      "Terrasse",
      "Parking",
      "Sécurité",
      "Décoration traditionnelle"
    ],
    disponibilite: {
      statut: "disponible",
      prochaineDisponibilite: null,
      occupant: null,
      arrivee: null,
      depart: null,
      sejourMin: 2,
      sejourMax: 60
    },
    actif: true
  },
  {
    id: 10,
    nom: "Résidence 10",
    reference: "RES-010",
    typeAppartement: "Penthouse Luxe",
    description: "Penthouse de standing avec terrasse panoramique et vue 360° sur la ville. Équipements haut de gamme et service premium.",
    localisation: "Tour de l'Indépendance, Plateau",
    ville: "Abidjan",
    quartier: "Plateau",
    prix: 150000,
    nombreChambres: 4,
    nombreSallesDeBain: 3,
    capacite: 8,
    note: 5,
    photos: [
      "/images/residence10.png",
      "/images/residence10.png",
      "/images/residence10.png"
    ],
    equipements: [
      "Terrasse panoramique",
      "Piscine",
      "Climatisation",
      "WiFi",
      "TV",
      "Cuisine",
      "Salle de sport",
      "Parking",
      "Sécurité 24h",
      "Conciergerie",
      "Service de chambre"
    ],
    disponibilite: {
      statut: "occupé",
      prochaineDisponibilite: "2025-03-01",
      occupant: "Mme Johnson",
      arrivee: "2024-11-01",
      depart: "2025-03-01",
      sejourMin: 2,
      sejourMax: 120
    },
    actif: true
  }
];
