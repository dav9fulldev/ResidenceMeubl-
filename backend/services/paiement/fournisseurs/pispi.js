const PiSpi = require('../PiSpiClient');

/**
 * PI-SPI (BCEAO) : QR code et demande de paiement, remboursement automatique.
 * L'intégration complète vit dans PiSpiClient, PaymentService et RefundService.
 */
module.exports = {
  id: 'pispi',
  nom: 'PI-SPI',
  organisme: 'BCEAO',
  logo: '/images/paiement/pispi.png',
  description: 'Paiement instantané interopérable de l\'UEMOA : le client paie depuis l\'application de sa banque ou de son portefeuille.',
  modes: ['QR code', 'Demande de paiement'],
  capacites: { acompte: true, remboursementAutomatique: true, remboursementPartiel: true },
  aVenir: false,
  variables: ['PISPI_BASE_URL', 'PISPI_CLIENT_ID', 'PISPI_CLIENT_SECRET', 'PISPI_API_KEY', 'PISPI_PAYEE_ALIAS', 'PISPI_WEBHOOK_SECRET'],
  problemes: () => PiSpi.problemesConfiguration(),
  estConfigure: () => PiSpi.estConfigure(),
};
