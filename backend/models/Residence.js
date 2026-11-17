/**
 * Modèle de données pour une résidence
 */
const STATUTS = ['disponible', 'occupé', 'réservé', 'maintenance'];

class Residence {
  constructor(data) {
    this.id = data.id;
    this.nom = data.nom;
    this.reference = data.reference;
    this.typeAppartement = data.typeAppartement;
    this.description = data.description || '';
    this.localisation = data.localisation;
    this.ville = data.ville;
    this.quartier = data.quartier;
    this.prix = data.prix;
    this.nombreChambres = data.nombreChambres;
    this.nombreSallesDeBain = data.nombreSallesDeBain || 1;
    this.capacite = data.capacite;
    this.note = data.note ?? null;
    this.photos = data.photos || [];
    this.equipements = data.equipements || [];
    this.disponibilite = {
      statut: 'disponible',
      prochaineDisponibilite: null,
      occupant: null,
      arrivee: null,
      depart: null,
      sejourMin: 1,
      sejourMax: 30,
      ...(data.disponibilite || {}),
    };
    this.actif = data.actif !== false; // Par défaut actif
  }

  // Valider les données saisies par l'administrateur
  valider() {
    const erreurs = [];
    const texteRequis = { nom: 'Nom', reference: 'Référence', typeAppartement: 'Type', localisation: 'Localisation', ville: 'Ville', quartier: 'Quartier' };

    for (const [champ, libelle] of Object.entries(texteRequis)) {
      if (!this[champ] || String(this[champ]).trim() === '') {
        erreurs.push(`${libelle} obligatoire`);
      }
    }
    if (!Number.isFinite(this.prix) || this.prix <= 0) erreurs.push('Le prix doit être un nombre positif');
    if (!Number.isInteger(this.nombreChambres) || this.nombreChambres < 1) erreurs.push('Au moins 1 chambre');
    if (!Number.isInteger(this.capacite) || this.capacite < 1) erreurs.push('Capacité d\'au moins 1 personne');
    if (!STATUTS.includes(this.disponibilite.statut)) erreurs.push('Statut de disponibilité invalide');

    return { valide: erreurs.length === 0, erreurs };
  }

  // La résidence peut-elle être réservée ? (les conflits de dates sont gérés par ReservationService)
  estReservable() {
    return this.actif && this.disponibilite.statut !== 'maintenance';
  }

  toJSON() {
    return {
      id: this.id,
      nom: this.nom,
      reference: this.reference,
      typeAppartement: this.typeAppartement,
      description: this.description,
      localisation: this.localisation,
      ville: this.ville,
      quartier: this.quartier,
      prix: this.prix,
      nombreChambres: this.nombreChambres,
      nombreSallesDeBain: this.nombreSallesDeBain,
      capacite: this.capacite,
      note: this.note,
      photos: this.photos,
      equipements: this.equipements,
      disponibilite: this.disponibilite,
      actif: this.actif,
    };
  }
}

Residence.STATUTS = STATUTS;

module.exports = Residence;
