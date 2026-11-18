/**
 * Règles de l'acompte (fonctions pures, sans accès base de données).
 *
 * Variables d'environnement :
 *   PAIEMENT_MODE        « pispi », « simulation » ou « desactive ».
 *                        Par défaut : « pispi » si PI-SPI est configuré, sinon « desactive ».
 *                        « simulation » est réservé aux démonstrations : tout le monde peut « payer ».
 *   ACOMPTE_POURCENTAGE  pourcentage du séjour à régler (défaut 30)
 *   ACOMPTE_REMBOURSABLE_APRES_PAIEMENT_JOURS  délai (jours) après le paiement pendant lequel
 *                        l'acompte est remboursé en entier (défaut 5)
 *   ACOMPTE_REMBOURSEMENT_POURCENTAGE  part remboursée après ce délai (défaut 50)
 *   ACOMPTE_NON_REMBOURSABLE_AVANT_ARRIVEE_JOURS  plus de remboursement à moins de N jours
 *                        de l'arrivée (défaut 3)
 *   (valeurs par défaut : la page Paramètres du back-office les remplace)
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
  let m = ['pispi', 'simulation', 'desactive'].includes(demande) ? demande : (PiSpi.estConfigure() ? 'pispi' : 'desactive');
  // L'admin peut désactiver PI-SPI depuis le back-office (Paramètres > Moyens de paiement)
  if (m === 'pispi' && !Settings.moyenActif('pispi')) m = 'desactive';
  return m;
}

/**
 * Moyens de paiement proposés au client pour l'acompte.
 * PI-SPI : selon mode() ; GeniusPay : configuré et activé dans le back-office.
 */
function moyensDisponibles() {
  const moyens = [];
  if (['pispi', 'simulation'].includes(mode())) moyens.push('pispi');
  const GeniusPay = require('./GeniusPayClient');
  if (GeniusPay.estConfigure() && Settings.moyenActif('geniuspay')) moyens.push('geniuspay');
  return moyens;
}

const pourcentage = () => Settings.get('acomptePourcentage');
const pourcentageRembourse = () => Settings.get('remboursementPourcentage');
const montantRembourse = (montantAcompte, pct = pourcentageRembourse()) => (pct >= 100
  ? Number(montantAcompte) || 0
  : Math.floor((Number(montantAcompte) || 0) * pct / 100));

const JOUR = 24 * 60 * 60 * 1000;

/**
 * Politique de remboursement de l'acompte, par paliers :
 *  - annulation dans les N jours suivant le paiement (défaut 5)  → 100 %
 *  - ensuite                                                     → P % (défaut 50)
 *  - à moins de M jours de l'arrivée (défaut 3)                  → rien
 * @param r réservation ; @param date date de la demande d'annulation (défaut : maintenant)
 * Renvoie le palier applicable à cette date (pourcentage, montant) et les dates limites.
 */
function politiqueRemboursement(r, date = new Date()) {
  if (!r?.acompte?.paye || !r.acompte.payeLe) return null;
  const apresPaiement = Settings.get('remboursableApresPaiementJours');
  const avantArrivee = Settings.get('nonRemboursableAvantArriveeJours');
  const partiel = pourcentageRembourse();
  const limitePaiement = new Date(new Date(r.acompte.payeLe).getTime() + apresPaiement * JOUR);
  const limiteArrivee = new Date(Date.parse(`${r.dates.arrivee}T00:00:00Z`) - avantArrivee * JOUR);
  // Remboursement intégral jusqu'à limiteIntegral ; partiel ensuite jusqu'à limite
  const limiteIntegral = limitePaiement < limiteArrivee ? limitePaiement : limiteArrivee;
  const limite = partiel > 0 ? limiteArrivee : limiteIntegral;
  const d = new Date(date);
  let pct = 0;
  if (d < limiteIntegral) pct = 100;
  else if (d < limiteArrivee) pct = partiel;
  const remboursable = pct > 0;
  return {
    remboursable,
    integral: pct >= 100,
    pourcentage: pct,
    montant: montantRembourse(r.acompte.montant, pct),
    limiteIntegral,
    limite,
    pourcentagePartiel: partiel,
    montantPartiel: montantRembourse(r.acompte.montant, partiel),
    // Un palier partiel existe-t-il entre la fin du remboursement intégral et la limite avant l'arrivée ?
    paliers: partiel > 0 && partiel < 100 && limitePaiement < limiteArrivee,
    regle: conditionsRemboursement(),
    raison: remboursable ? null : (d >= limiteArrivee
      ? `Annulation demandée moins de ${avantArrivee} jours avant l'arrivée`
      : `Annulation demandée plus de ${apresPaiement} jours après le paiement de l'acompte`),
  };
}

function conditionsRemboursement() {
  const apresPaiement = Settings.get('remboursableApresPaiementJours');
  const avantArrivee = Settings.get('nonRemboursableAvantArriveeJours');
  const partiel = pourcentageRembourse();
  const suite = partiel >= 100 ? 'puis toujours en entier'
    : partiel > 0 ? `puis à ${partiel} %` : 'puis plus du tout';
  return `En cas d'annulation, l'acompte est remboursé en entier si la demande est faite dans les ${apresPaiement} jours suivant le paiement, ${suite} ; aucun remboursement à moins de ${avantArrivee} jours de l'arrivée.`;
}

const montantAcompte = (prixTotal) => Math.ceil((Number(prixTotal) || 0) * pourcentage() / 100);

const aujourdhui = () => new Date().toISOString().slice(0, 10);

// Paiement en cours (non expiré) d'une réservation, pour l'acompte ou le solde
function paiementEnCours(r, objet = 'acompte') {
  const maintenant = Date.now();
  return (r.paiements || []).find(p => (p.objet || 'acompte') === objet && p.statut === 'en_attente' && new Date(p.expireLe).getTime() > maintenant) || null;
}

const MOYENS_SUR_PLACE = { especes: 'Espèces', mobile_money: 'Mobile Money', carte: 'Carte bancaire', virement: 'Virement', autre: 'Autre' };

/**
 * Solde du séjour (prix total − acompte) : payable en ligne une fois l'acompte réglé,
 * ou sur place à l'arrivée (enregistré par l'admin).
 */
function etatSolde(r) {
  const prix = Number(r.prixTotal) || 0;
  const acomptePaye = Boolean(r.acompte?.paye);
  const montantAcompteRegle = acomptePaye ? Number(r.acompte.montant) || 0 : montantAcompte(prix);
  const montant = Math.max(0, prix - montantAcompteRegle);
  const s = r.solde || {};
  const paye = Boolean(s.paye);
  const enCours = paiementEnCours(r, 'solde');
  const moyens = moyensDisponibles();
  const possible = moyens.length > 0
    && acomptePaye
    && !paye
    && montant > 0
    && r.statut === 'confirmee'
    && r.dates?.depart > aujourdhui()
    && r.demandeAnnulation?.statut !== 'en_attente';
  return {
    mode: mode(),
    montant: paye ? Number(s.montant) || montant : montant,
    paye,
    payeLe: paye ? s.payeLe : null,
    enLigne: paye ? Boolean(s.enLigne) : null,
    methode: paye ? s.methode || null : null,
    moyenSurPlace: paye && !s.enLigne ? s.moyen || null : null,
    libelleMoyen: paye && !s.enLigne ? MOYENS_SUR_PLACE[s.moyen] || 'Sur place' : null,
    reference: paye ? s.reference || s.txId || null : null,
    // Payable en ligne ; sinon à régler à l'arrivée
    possible,
    aRegler: acomptePaye && !paye && montant > 0 && r.statut === 'confirmee',
    moyens,
    appUrl: /^https:\/\//.test((process.env.PISPI_APP_URL || '').trim()) ? process.env.PISPI_APP_URL.trim() : null,
    enCours: enCours ? { txId: enCours.txId, methode: enCours.methode, expireLe: enCours.expireLe, checkoutUrl: enCours.checkoutUrl || null } : null,
    remboursement: s.remboursement || null,
  };
}

/**
 * État de l'acompte tel que le client et l'admin le voient.
 */
function etatAcompte(r) {
  const paye = Boolean(r.acompte?.paye);
  const montant = paye ? r.acompte.montant : montantAcompte(r.prixTotal);
  const enCours = paiementEnCours(r);
  const moyens = moyensDisponibles();
  const possible = moyens.length > 0
    && r.statut === 'confirmee'
    && !paye
    && r.dates?.depart > aujourdhui()
    && r.demandeAnnulation?.statut !== 'en_attente';
  return {
    mode: mode(),
    moyens,
    pourcentage: paye ? r.acompte.pourcentage ?? pourcentage() : pourcentage(),
    montant,
    paye,
    payeLe: paye ? r.acompte.payeLe : null,
    methode: paye ? r.acompte.methode : null,
    possible,
    // Évaluée à la date de la demande d'annulation en cours, sinon à aujourd'hui
    politique: politiqueRemboursement(r, r.demandeAnnulation?.statut === 'en_attente' ? r.demandeAnnulation.dateDemande : new Date()),
    conditions: conditionsRemboursement(),
    appUrl: /^https:\/\//.test((process.env.PISPI_APP_URL || '').trim()) ? process.env.PISPI_APP_URL.trim() : null,
    enCours: enCours ? { txId: enCours.txId, methode: enCours.methode, expireLe: enCours.expireLe, checkoutUrl: enCours.checkoutUrl || null } : null,
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
  conditionsRemboursement,
  pourcentageRembourse,
  montantRembourse,
  mode, moyensDisponibles, pourcentage, montantAcompte, etatAcompte, etatSolde, paiementEnCours, MOYENS_SUR_PLACE, genererTxId,
  DUREE_QR_MS, DUREE_DEMANDE_MS, MARGE_VERIFICATION_MS,
};
