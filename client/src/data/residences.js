// Images des résidences (vraies images)
const residence1 = '/images/residence1.jpg';
const residence2 = '/images/residence2.jpg';
const residence3 = '/images/residence3.jpg';
const residence4 = '/images/residence4.jpg';
const residence5 = '/images/residence5.jpg';
const residence6 = '/images/residence6.jpg';
const residence7 = '/images/residence7.jpg';
const residence8 = '/images/residence8.jpg';
const residence9 = '/images/residence9.jpg';
const residence10 = '/images/residence10.jpg';

export const residences = [
  {
    id: 1,
    name: "Résidence 1",
    reference: "RES-001",
    type: "Appartement Luxe",
    description: "Appartement moderne et luxueux au cœur du centre-ville, avec vue panoramique et tous les équipements de luxe. Idéal pour les voyageurs d'affaires et les touristes exigeants.",
    location: "Rue des Banques, Plateau",
    city: "Abidjan",
    neighborhood: "Plateau",
    price: 45000,
    currency: "FCFA",
    period: "nuit",
    bedrooms: 2,
    bathrooms: 2,
    maxGuests: 4,
    rating: 4.8,
    available: true,
    images: [residence1, residence1, residence1],
    amenities: ["Climatisation", "WiFi", "TV écran plat", "Cuisine équipée", "Balcon", "Vue ville", "Parking", "Sécurité 24h"],
    availability: {
      status: "disponible",
      nextAvailable: null,
      currentOccupant: null,
      checkIn: null,
      checkOut: null,
      minStay: 1,
      maxStay: 30
    }
  },
  {
    id: 2,
    name: "Résidence 2",
    reference: "RES-002",
    type: "Familiale Cocody",
    description: "Spacieux appartement familial dans un quartier résidentiel calme, proche des commodités et des écoles. Parfait pour les familles en voyage.",
    location: "Avenue Noguès, Cocody",
    city: "Abidjan",
    neighborhood: "Cocody",
    price: 55000,
    currency: "FCFA",
    period: "nuit",
    bedrooms: 3,
    bathrooms: 2,
    maxGuests: 6,
    rating: 4.6,
    available: false,
    images: [residence2, residence2, residence2],
    amenities: ["Climatisation", "WiFi", "TV", "Cuisine", "Jardin", "Terrasse", "Parking", "Sécurité"],
    availability: {
      status: "occupé",
      nextAvailable: "2025-01-15",
      currentOccupant: "Famille Martin",
      checkIn: "2024-12-01",
      checkOut: "2025-01-15",
      minStay: 7,
      maxStay: 45
    }
  },
  {
    id: 3,
    name: "Résidence 3",
    reference: "RES-003",
    type: "Studio Moderne",
    description: "Studio contemporain et fonctionnel, parfait pour les séjours courts. Design épuré et équipements modernes pour un confort optimal.",
    location: "Boulevard Vridi, Treichville",
    city: "Abidjan",
    neighborhood: "Treichville",
    price: 28000,
    currency: "FCFA",
    period: "nuit",
    bedrooms: 1,
    bathrooms: 1,
    maxGuests: 2,
    rating: 4.4,
    available: true,
    images: [residence3, residence3, residence3],
    amenities: ["Climatisation", "WiFi", "TV", "Cuisine", "Balcon", "Ascenseur", "Sécurité"],
    availability: {
      status: "disponible",
      nextAvailable: null,
      currentOccupant: null,
      checkIn: null,
      checkOut: null,
      minStay: 1,
      maxStay: 15
    }
  },
  {
    id: 4,
    name: "Résidence 4",
    reference: "RES-004",
    type: "Villa Prestige",
    description: "Villa de luxe avec piscine privée et jardin tropical. Idéale pour les séjours de prestige et les événements spéciaux.",
    location: "Route des Jardins, Riviera",
    city: "Abidjan",
    neighborhood: "Riviera",
    price: 120000,
    currency: "FCFA",
    period: "nuit",
    bedrooms: 4,
    bathrooms: 3,
    maxGuests: 8,
    rating: 4.9,
    available: false,
    images: [residence4, residence4, residence4],
    amenities: ["Piscine", "Jardin", "Climatisation", "WiFi", "TV", "Cuisine", "Terrasse", "Parking", "Sécurité 24h", "Service de conciergerie"],
    availability: {
      status: "réservé",
      nextAvailable: "2025-02-01",
      currentOccupant: "M. Dupont",
      checkIn: "2024-12-20",
      checkOut: "2025-02-01",
      minStay: 14,
      maxStay: 60
    }
  },
  {
    id: 5,
    name: "Résidence 5",
    reference: "RES-005",
    type: "Appartement Centre",
    description: "Appartement moderne au cœur du quartier des affaires, parfait pour les professionnels. Accès facile aux transports et commerces.",
    location: "Avenue Chardy, Plateau",
    city: "Abidjan",
    neighborhood: "Plateau",
    price: 38000,
    currency: "FCFA",
    period: "nuit",
    bedrooms: 1,
    bathrooms: 1,
    maxGuests: 2,
    rating: 4.3,
    available: true,
    images: [residence5, residence5, residence5],
    amenities: ["Climatisation", "WiFi", "TV", "Cuisine", "Balcon", "Ascenseur", "Sécurité"],
    availability: {
      status: "disponible",
      nextAvailable: null,
      currentOccupant: null,
      checkIn: null,
      checkOut: null,
      minStay: 1,
      maxStay: 30
    }
  },
  {
    id: 6,
    name: "Résidence 6",
    reference: "RES-006",
    type: "Duplex Familial",
    description: "Duplex spacieux sur deux niveaux, idéal pour les familles nombreuses. Vue dégagée et espace de vie généreux.",
    location: "Rue des Ambassadeurs, Cocody",
    city: "Abidjan",
    neighborhood: "Cocody",
    price: 75000,
    currency: "FCFA",
    period: "nuit",
    bedrooms: 3,
    bathrooms: 2,
    maxGuests: 6,
    rating: 4.7,
    available: true,
    images: [residence6, residence6, residence6],
    amenities: ["Climatisation", "WiFi", "TV", "Cuisine", "Terrasse", "Jardin", "Parking", "Sécurité"],
    availability: {
      status: "disponible",
      nextAvailable: null,
      currentOccupant: null,
      checkIn: null,
      checkOut: null,
      minStay: 3,
      maxStay: 90
    }
  },
  {
    id: 7,
    name: "Résidence 7",
    reference: "RES-007",
    type: "Studio Économique",
    description: "Studio simple et fonctionnel pour les petits budgets. Confort de base et emplacement central pour découvrir la ville.",
    location: "Boulevard Roume, Treichville",
    city: "Abidjan",
    neighborhood: "Treichville",
    price: 22000,
    currency: "FCFA",
    period: "nuit",
    bedrooms: 1,
    bathrooms: 1,
    maxGuests: 2,
    rating: 4.1,
    available: false,
    images: [residence7, residence7, residence7],
    amenities: ["Ventilateur", "WiFi", "TV", "Cuisine basique", "Sécurité"],
    availability: {
      status: "maintenance",
      nextAvailable: "2025-01-20",
      currentOccupant: null,
      checkIn: null,
      checkOut: null,
      minStay: 1,
      maxStay: 30
    }
  },
  {
    id: 8,
    name: "Résidence 8",
    reference: "RES-008",
    type: "Appartement Vue Mer",
    description: "Appartement avec vue imprenable sur la lagune Ébrié. Balcon panoramique et ambiance zen pour des vacances reposantes.",
    location: "Boulevard de la Corniche, Cocody",
    city: "Abidjan",
    neighborhood: "Cocody",
    price: 65000,
    currency: "FCFA",
    period: "nuit",
    bedrooms: 2,
    bathrooms: 2,
    maxGuests: 4,
    rating: 4.8,
    available: true,
    images: [residence8, residence8, residence8],
    amenities: ["Climatisation", "WiFi", "TV", "Cuisine", "Balcon", "Vue mer", "Parking", "Sécurité"],
    availability: {
      status: "disponible",
      nextAvailable: null,
      currentOccupant: null,
      checkIn: null,
      checkOut: null,
      minStay: 2,
      maxStay: 45
    }
  },
  {
    id: 9,
    name: "Résidence 9",
    reference: "RES-009",
    type: "Maison Traditionnelle",
    description: "Maison traditionnelle ivoirienne rénovée avec goût. Authenticité et modernité pour une expérience culturelle unique.",
    location: "Rue des Artisans, Yopougon",
    city: "Abidjan",
    neighborhood: "Yopougon",
    price: 85000,
    currency: "FCFA",
    period: "nuit",
    bedrooms: 3,
    bathrooms: 2,
    maxGuests: 6,
    rating: 4.5,
    available: true,
    images: [residence9, residence9, residence9],
    amenities: ["Climatisation", "WiFi", "TV", "Cuisine", "Jardin", "Terrasse", "Parking", "Sécurité", "Décoration traditionnelle"],
    availability: {
      status: "disponible",
      nextAvailable: null,
      currentOccupant: null,
      checkIn: null,
      checkOut: null,
      minStay: 7,
      maxStay: 60
    }
  },
  {
    id: 10,
    name: "Résidence 10",
    reference: "RES-010",
    type: "Penthouse Luxe",
    description: "Penthouse de standing avec terrasse panoramique et vue 360° sur la ville. Équipements haut de gamme et service premium.",
    location: "Tour de l'Indépendance, Plateau",
    city: "Abidjan",
    neighborhood: "Plateau",
    price: 150000,
    currency: "FCFA",
    period: "nuit",
    bedrooms: 4,
    bathrooms: 3,
    maxGuests: 8,
    rating: 5.0,
    available: false,
    images: [residence10, residence10, residence10],
    amenities: ["Terrasse panoramique", "Piscine", "Climatisation", "WiFi", "TV", "Cuisine", "Salle de sport", "Parking", "Sécurité 24h", "Conciergerie", "Service de chambre"],
    availability: {
      status: "occupé",
      nextAvailable: "2025-03-01",
      currentOccupant: "Mme Johnson",
      checkIn: "2024-11-01",
      checkOut: "2025-03-01",
      minStay: 30,
      maxStay: 120
    }
  }
];

// Fonction pour récupérer une résidence par ID
export const getResidenceById = (id) => {
  return residences.find(residence => residence.id === parseInt(id));
};

// Fonction pour rechercher des résidences
export const searchResidences = (query, filters = {}) => {
  let results = [...residences];

  // Recherche par nom, ville ou quartier
  if (query) {
    const searchTerm = query.toLowerCase();
    results = results.filter(residence => 
      residence.name.toLowerCase().includes(searchTerm) ||
      residence.city.toLowerCase().includes(searchTerm) ||
      residence.neighborhood.toLowerCase().includes(searchTerm)
    );
  }

  // Filtres
  if (filters.priceMin !== undefined) {
    results = results.filter(residence => residence.price >= filters.priceMin);
  }
  if (filters.priceMax !== undefined) {
    results = results.filter(residence => residence.price <= filters.priceMax);
  }
  if (filters.bedrooms) {
    results = results.filter(residence => residence.bedrooms >= filters.bedrooms);
  }
  if (filters.city) {
    results = results.filter(residence => residence.city === filters.city);
  }
  if (filters.availability) {
    results = results.filter(residence => residence.availability.status === filters.availability);
  }

  return results;
};
