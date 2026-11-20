/**
 * Clés des prestataires de paiement (PI-SPI, GeniusPay).
 *
 * Encaissement centralisé : la plateforme BABI RESIDENCE encaisse TOUS les paiements avec ses
 * propres clés (variables d'environnement), quelle que soit l'entreprise qui propose la résidence.
 * Le module financier (services/finance) répartit ensuite chaque paiement entre la commission
 * de la plateforme et la somme due au propriétaire, reversée manuellement après l'arrivée.
 *
 * Les clés que des entreprises avaient pu enregistrer (collection « cles_paiement ») ne sont plus lues.
 */
class ErreurCles extends Error {
  constructor(message, status = 400) { super(message); this.status = status; }
}

const Cles = {
  /** Valeur d'un réglage de paiement : toujours celle de la plateforme. */
  lire(nom) {
    return process.env[nom] || '';
  },

  /** Fermé : les entreprises ne saisissent plus de clés. */
  async enregistrer() {
    throw new ErreurCles('Les paiements sont encaissés par BABI RESIDENCE : les clés de paiement se règlent sur le serveur de la plateforme', 409);
  },

  async charger() {},
  ErreurCles,
};

module.exports = Cles;
