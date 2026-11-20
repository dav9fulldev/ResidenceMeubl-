# Décisions

| # | Décision | Date |
|---|---|---|
| 1 | La plateforme encaisse **tous** les paiements ; les clés saisies par les entreprises ne sont plus utilisées | 20/11/2026 |
| 2 | Acompte à la confirmation, solde avant l'arrivée (en ligne) ou sur place | existant |
| 3 | Commission par réservation, 8 % par défaut, réglable ; taux figé à la création de la réservation | 20/11/2026 |
| 4 | Somme due versable **24 h après l'arrivée prévue** ; reversement **manuel** | 20/11/2026 |
| 5 | Montants en **FCFA entiers** ; commission arrondie au FCFA le plus proche | 20/11/2026 |
| 6 | Registre immuable : correction par contre-passation uniquement | 20/11/2026 |
| 7 | Les résidences de la plateforme ne paient pas de commission (revenu propre) | 20/11/2026 |
| 8 | Remboursement : la commission est rendue au prorata du montant remboursé (BABI garde sa commission sur la part conservée) | 20/11/2026 |
| 9 | Solde reçu **sur place** par l'entreprise : la commission est due et déduite du prochain reversement | 20/11/2026 |

## Écarts avec la spécification initiale (19/11/2026)

| Spécification | Réalisation | Raison |
|---|---|---|
| Collections `payment_intents` et `payment_attempts` | Tableau `reservation.paiements[]` (chaque tentative : `txId` unique, prestataire, montant, statut, expiration) | Existant, déjà idempotent ; le registre référence le `txId` |
| Statuts anglais (`PENDING`, `SUCCEEDED`…) | Statuts existants (`en_attente`, `paye`, `refuse`, `expire`, `doublon`) pour les paiements ; statuts du registre et des reversements en majuscules | Pas de migration des réservations existantes |
| Routes `/api/payments`, `/api/payouts`… | `/api/admin/finance/…` (plateforme) et `/api/admin/revenus/…` (entreprise) | Cohérence avec l'API existante et ses contrôles d'accès |
| Rôles `FINANCE_ADMIN`, `FINANCE_VALIDATOR`, `FINANCE_AUDITOR` | Un seul compte administrateur de plateforme | À ajouter quand plusieurs personnes géreront les finances |
| Double validation des gros reversements | Variable `FINANCE_SEUIL_DOUBLE_VALIDATION` (désactivée par défaut) : au-delà, la confirmation doit venir d'une autre personne que l'exécution | Nécessite plusieurs comptes administrateurs |
| Rapprochement avec les relevés des prestataires | Revérification transaction par transaction via l'API (100 au plus par lancement) | Pas d'API de relevé utilisée ; import de relevés à prévoir |
| Reversements automatiques (PI-SPI Disbursement, GeniusPay Cashout) | Manuels : le virement est fait hors du site, puis enregistré | Décision 4 ; à automatiser plus tard |
