/**
 * Conversion entre le format de l'API (champs en français)
 * et le format utilisé par les composants React.
 */

export const fromApiResidence = (r) => ({
  id: r.id,
  name: r.nom,
  reference: r.reference,
  type: r.typeAppartement,
  description: r.description,
  location: r.localisation,
  city: r.ville,
  neighborhood: r.quartier,
  price: r.prix,
  currency: 'FCFA',
  period: 'nuit',
  bedrooms: r.nombreChambres,
  bathrooms: r.nombreSallesDeBain,
  maxGuests: r.capacite,
  // Service de notation : moyenne des avis vérifiés (aucune note sans avis)
  rating: r.note,
  reviews: r.nombreAvis || 0,
  images: r.photos || [],
  amenities: r.equipements || [],
  active: r.actif !== false,
  // Entreprise qui propose la résidence ; sur la fiche, avec ses conditions (acompte, moyens de paiement)
  company: r.entreprise || null,
  // Vérification par la plateforme : brouillon, en_attente, a_completer, en_verification, verifiee, refusee, suspendue
  verificationStatus: r.statutVerification || null,
  available: r.disponibilite?.statut === 'disponible',
  availability: {
    status: r.disponibilite?.statut || 'disponible',
    nextAvailable: r.disponibilite?.prochaineDisponibilite || null,
    currentOccupant: r.disponibilite?.occupant || null,
    checkIn: r.disponibilite?.arrivee || null,
    checkOut: r.disponibilite?.depart || null,
    minStay: r.disponibilite?.sejourMin ?? 1,
    maxStay: r.disponibilite?.sejourMax ?? 30,
    automatic: Boolean(r.disponibilite?.automatique),
    reservationId: r.disponibilite?.reservationId || null,
  },
});

export const toApiResidence = (r) => ({
  nom: r.name,
  reference: r.reference,
  typeAppartement: r.type,
  description: r.description,
  localisation: r.location,
  ville: r.city,
  quartier: r.neighborhood,
  prix: Number(r.price),
  nombreChambres: Number(r.bedrooms),
  nombreSallesDeBain: Number(r.bathrooms),
  capacite: Number(r.maxGuests),
  note: r.rating,
  photos: r.images,
  equipements: r.amenities,
  disponibilite: r.availability && {
    statut: r.availability.status,
    sejourMin: r.availability.minStay,
    sejourMax: r.availability.maxStay,
  },
});
