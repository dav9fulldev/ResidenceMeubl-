/**
 * Règles de l'acompte (fonctions pures, sans accès base de données).
 *
 * Variables d'environnement :
 *   PAIEMENT_MODE        « pispi », « simulation » ou « desactive ».
 *                        Par défaut : « pispi » si PI-SPI est configuré, sinon « desactive ».
 *                        « simulation » est réservé aux démonstrations : tout le monde peut « payer ».
 *   ACOMPTE_POURCENTAGE  pourcentage du séjour à régler (défaut 30)
 *   ACOMPTE_REMBOURSABLE_APRES_PAIEMENT_JOURS  délai (jours) après le paiement pendant lequel
 *                        une annulation est remboursée (défaut 5)
 *   ACOMPTE_NON_REMBOURSABLE_AVANT_ARRIVEE_JOURS  plus de remboursement à moins de N jours
 *                        de l'arrivée (défaut 3)
 *   PISPI_APP_URL        lien « Ouvrir l'application » montré après l'envoi d'une demande
 *                        (sandbox : https://client.simulateurs.pi-bceao.com). Vide = pas de bouton.
 */
const PiSpi = require('./PiSpiClient');
const Settings = require('../SettingsService');

const DUREE_QR_MS = 15 * 60 * 1000;      // durée de validité d'un QR affiché
// La banque garde la demande valable ~3 mois (sandbox) : on la suit pendant 7 jours
const DUREE_DEMANDE_MS = 7 * 24 * 60 * 60 * 1000;
const MARGE_VERIFICATION_MS = 3 * 60 * 1000; // on vérifie encore un peu après l'expiration

function mode() {
  const demande = (process.env.PAIEMENT_MODE || '').trim().toLowerCase();
  if (['pispi', 'simulation', 'desactive'].includes(demande)) return demande;
  return PiSpi.estConfigure() ? 'pispi' : 'desactive';
}

const pourcentage = () => Settings.get('acomptePourcentage');
const pourcentageRembourse = () => Settings.get('remboursementPourcentage');
const montantRembourse = (montantAcompte) => Math.floor((Number(montantAcompte) || 0) * pourcentageRembourse() / 100);

const JOUR = 24 * 60 * 60 * 1000;

/**
 * Politique de remboursement de l'acompte (100 % ou rien, le retour PI-SPI étant intégral) :
 * remboursable si l'annulation est demandée à la fois
 *  - dans les N jours suivant le paiement (défaut 5)
 *  - et au moins M jours avant l'arrivée (défaut 3)
 * @param r réservation ; @param date date de la demande d'annulation (défaut : maintenant)
 */
function politiqueRemboursement(r, date = new Date()) {
  if (!r?.acompte?.paye || !r.acompte.payeLe) return null;
  const apresPaiement = Settings.get('remboursableApresPaiementJours');
  const avantArrivee = Settings.get('nonRemboursableAvantArriveeJours');
  const limitePaiement = new Date(new Date(r.acompte.payeLe).getTime() + apresPaiement * JOUR);
  const limiteArrivee = new Date(Date.parse(`${r.dates.arrivee}T00:00:00Z`) - avantArrivee * JOUR);
  const limite = limitePaiement < limiteArrivee ? limitePaiement : limiteArrivee;
  const remboursable = new Date(date) < limite && pourcentageRembourse() > 0;
  return {
    remboursable,
    limite,
    pourcentage: pourcentageRembourse(),
    montant: montantRembourse(r.acompte.montant),
    regle: `Acompte remboursable si l'annulation est demandée dans les ${apresPaiement} jours suivant le paiement et au moins ${avantArrivee} jours avant l'arrivée.`,
    raison: remboursable ? null : (limite === limiteArrivee
      ? `Annulation demandée moins de ${avantArrivee} jours avant l'arrivée`
      : `Annulation demandée plus de ${apresPaiement} jours après le paiement de l'acompte`),
  };
}

const montantAcompte = (prixTotal) => Math.ceil((Number(prixTotal) || 0) * pourcentage() / 100);

const aujourdhui = () => new Date().toISOString().slice(0, 10);

// Paiement en cours (non expiré) d'une réservation
function paiementEnCours(r) {
  const maintenant = Date.now();
  return (r.paiements || []).find(p => p.statut === 'en_attente' && new Date(p.expireLe).getTime() > maintenant) || null;
}

/**
 * État de l'acompte tel que le client et l'admin le voient.
 */
function etatAcompte(r) {
  const paye = Boolean(r.acompte?.paye);
  const montant = paye ? r.acompte.montant : montantAcompte(r.prixTotal);
  const enCours = paiementEnCours(r);
  const possible = mode() !== 'desactive'
    && r.statut === 'confirmee'
    && !paye
    && r.dates?.depart > aujourdhui()
    && r.demandeAnnulation?.statut !== 'en_attente';
  return {
    mode: mode(),
    pourcentage: paye ? r.acompte.pourcentage ?? pourcentage() : pourcentage(),
    montant,
    paye,
    payeLe: paye ? r.acompte.payeLe : null,
    methode: paye ? r.acompte.methode : null,
    possible,
    // Évaluée à la date de la demande d'annulation en cours, sinon à aujourd'hui
    politique: politiqueRemboursement(r, r.demandeAnnulation?.statut === 'en_attente' ? r.demandeAnnulation.dateDemande : new Date()),
    conditions: pourcentageRembourse() > 0
      ? `En cas d'annulation, ${pourcentageRembourse()} % de l'acompte est remboursé si la demande est faite dans les ${Settings.get('remboursableApresPaiementJours')} jours suivant le paiement et au moins ${Settings.get('nonRemboursableAvantArriveeJours')} jours avant l'arrivée.`
      : 'Acompte non remboursable en cas d\'annulation.',
    appUrl: /^https:\/\//.test((process.env.PISPI_APP_URL || '').trim()) ? process.env.PISPI_APP_URL.trim() : null,
    enCours: enCours ? { txId: enCours.txId, methode: enCours.methode, expireLe: enCours.expireLe } : null,
    doublons: (r.paiements || []).filter(p => p.statut === 'doublon').map(p => ({ txId: p.txId, montant: p.montant, payeLe: p.payeLe })),
  };
}

// Référence unique (txId / referenceLabel du QR) : 25 caractères max, [A-Z0-9]
function genererTxId() {
  const alea = Array.from({ length: 6 }, () => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[Math.floor(Math.random() * 32)]).join('');
  return `SKF${Date.now().toString(36).toUpperCase()}${alea}`;
}

module.exports = {
  politiqueRemboursement,
  pourcentageRembourse,
  montantRembourse,
  mode, pourcentage, montantAcompte, etatAcompte, paiementEnCours, genererTxId,
  DUREE_QR_MS, DUREE_DEMANDE_MS, MARGE_VERIFICATION_MS,
};
