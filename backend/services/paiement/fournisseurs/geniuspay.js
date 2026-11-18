/**
 * GeniusPay : intégration prévue (paiements Mobile Money et cartes).
 *
 * Pour l'activer plus tard :
 *  1. écrire le client de l'API (comme PiSpiClient) et ses identifiants dans les variables d'environnement ;
 *  2. compléter ici `estConfigure`, `problemes`, `modes`, `capacites` et passer `aVenir` à false ;
 *  3. brancher le démarrage, la vérification et le remboursement du paiement dans PaymentService / RefundService.
 * Tant que `aVenir` vaut true, le moyen apparaît dans le back-office mais ne peut pas être activé.
 */
module.exports = {
  id: 'geniuspay',
  nom: 'GeniusPay',
  organisme: 'Agrégateur de paiement',
  description: 'Mobile Money et cartes bancaires via un agrégateur. Intégration prévue.',
  modes: ['Mobile Money', 'Carte bancaire'],
  capacites: { acompte: true, remboursementAutomatique: false, remboursementPartiel: false },
  aVenir: true,
  variables: [],
  problemes: () => ['Intégration en cours de développement'],
  estConfigure: () => false,
};
