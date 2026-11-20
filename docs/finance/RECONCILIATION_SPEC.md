# Rapprochement

Lancé depuis *Finances → Rapprochement* (période facultative). Ne corrige rien : signale.

| Anomalie | Signification |
|---|---|
| `PAIEMENT_NON_COMPTABILISE` | Paiement payé sur une réservation, absent du registre |
| `COMPTABILISE_SANS_PAIEMENT` | Écriture de paiement sans paiement payé |
| `ECART_MONTANT` | Montants différents |
| `ECART_DETTE` | Sommes dues d'une entreprise ≠ solde de son compte |
| `BALANCE_DESEQUILIBREE` | Débits ≠ crédits |
| `TROP_PERCU` | Paiements en double non rendus |
| `ECART_PRESTATAIRE` / `INVERIFIABLE` | (option) état ou montant différent chez PI-SPI / GeniusPay |

Au démarrage du serveur, une **reprise** comptabilise les paiements et remboursements déjà enregistrés sur les réservations (idempotente).
Les soldes `FONDS_PRESTATAIRE` sont des montants **comptabilisés** : comparez-les aux relevés GeniusPay et PI-SPI.
