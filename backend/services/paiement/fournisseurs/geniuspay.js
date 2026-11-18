const GeniusPay = require('../GeniusPayClient');

/**
 * GeniusPay : page de paiement hébergée (Wave, Orange Money, MTN, Moov, carte bancaire).
 * Pas d'API de remboursement : un acompte GeniusPay à rendre est signalé « à rembourser »
 * dans le back-office et se rembourse depuis le tableau de bord GeniusPay.
 */
module.exports = {
  id: 'geniuspay',
  nom: 'GeniusPay',
  organisme: 'Agrégateur de paiement',
  description: 'Le client est redirigé vers une page de paiement sécurisée GeniusPay et choisit Wave, Orange Money, MTN, Moov ou sa carte bancaire.',
  modes: ['Wave', 'Orange Money', 'MTN MoMo', 'Moov Money', 'Carte bancaire'],
  capacites: { acompte: true, remboursementAutomatique: false, remboursementPartiel: false },
  aVenir: false,
  variables: ['GENIUSPAY_API_KEY', 'GENIUSPAY_API_SECRET', 'GENIUSPAY_WEBHOOK_SECRET'],
  problemes: () => GeniusPay.problemesConfiguration(),
  estConfigure: () => GeniusPay.estConfigure(),
  environnement: () => GeniusPay.environnement,
};
