/**
 * Règles de l'acompte (fonctions pures, sans accès base de données).
 *
 * Variables d'environnement :
 *   PAIEMENT_MODE        « pispi », « simulation » ou « desactive ».
 *                        Par défaut : « pispi » si PI-SPI est configuré, sinon « desactive ».
 *                        « simulation » est réservé aux démonstrations : tout le monde peut « payer ».
 *   ACOMPTE_POURCENTAGE  pourcentage du séjour à régler (défaut 30)
 */
const PiSpi = require('./PiSpiClient');

const DUREE_QR_MS = 15 * 60 * 1000;      // durée de validité d'un QR affiché
const DUREE_DEMANDE_MS = 5 * 60 * 1000;  // délai laissé au client pour valider dans sa banque
const MARGE_VERIFICATION_MS = 3 * 60 * 1000; // on vérifie encore un peu après l'expiration

function mode() {
  const demande = (process.env.PAIEMENT_MODE || '').trim().toLowerCase();
  if (['pispi', 'simulation', 'desactive'].includes(demande)) return demande;
  return PiSpi.estConfigure() ? 'pispi' : 'desactive';
}

function pourcentage() {
  const p = Number(process.env.ACOMPTE_POURCENTAGE);
  return Number.isFinite(p) && p >= 1 && p <= 100 ? p : 30;
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
    enCours: enCours ? { txId: enCours.txId, methode: enCours.methode, expireLe: enCours.expireLe } : null,
  };
}

// Référence unique (txId / referenceLabel du QR) : 25 caractères max, [A-Z0-9]
function genererTxId() {
  const alea = Array.from({ length: 6 }, () => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[Math.floor(Math.random() * 32)]).join('');
  return `SKF${Date.now().toString(36).toUpperCase()}${alea}`;
}

module.exports = {
  mode, pourcentage, montantAcompte, etatAcompte, paiementEnCours, genererTxId,
  DUREE_QR_MS, DUREE_DEMANDE_MS, MARGE_VERIFICATION_MS,
};
