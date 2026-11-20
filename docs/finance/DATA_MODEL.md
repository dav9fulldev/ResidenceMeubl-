# Modèle de données (MongoDB)

MongoDB doit fonctionner en **replica set** (MongoDB Atlas : oui ; tests : `MongoMemoryReplSet`) pour les transactions multi-documents.

## Plan de comptes

| Compte | Nature | Détail par |
|---|---|---|
| `FONDS_PRESTATAIRE` | actif : fonds encaissés chez le prestataire | `fournisseur` (pispi, geniuspay, simulation, autre) |
| `DETTE_PROPRIETAIRE` | passif : dû aux entreprises (négatif : l'entreprise doit une commission) | `entrepriseId` |
| `COMMISSION_BABI` | produit | |
| `REVENU_PLATEFORME` | produit : séjours des résidences de la plateforme | |
| `TROP_PERCU_CLIENT` | passif : paiements reçus en double, à rendre | |

## Collections

| Collection | Contenu | Index |
|---|---|---|
| `ledger_transactions` | `reference` (LED-AAAA-NNNNNN), `cle` (idempotence), `type`, `libelle`, `reservationId`, `entrepriseId`, `montant`, `devise`, `statut`, `par`, `meta`, `creeLe` | `cle` unique, `reference` unique, `reservationId`, `entrepriseId+creeLe`, `type+creeLe` |
| `ledger_entries` | `transactionId`, `compte`, `sens` (DEBIT/CREDIT), `montant` (entier), `entrepriseId`, `fournisseur`, `reservationId` | `transactionId`, `compte+entrepriseId`, `reservationId` |
| `commission_rules` | `tauxPb` (points de base : 800 = 8 %), `actifDepuis`, `par` | `actifDepuis` |
| `commissions` | par réservation : `brut`, `commission`, `tauxPb`, `regleId` | `_id` = réservation |
| `owner_payables` | par réservation : `brut`, `commission`, `rembourse`, `du`, `verse`, `eligibleLe`, `bloque` | `entrepriseId+eligibleLe` |
| `owner_payout_methods` | par entreprise : `type`, `operateur`, `beneficiaire`, `destination`, `statut` (a_verifier / verifie / refuse) | `_id` = entreprise |
| `payouts` | `reference` (PO-AAAA-NNNNNN), `entrepriseId`, `montant`, `statut`, `beneficiaire` (copie), `allocations`, `referenceExterne`, `source`, `preuve`, `historique` | `reference` unique, `entrepriseId+statut` |
| `payment_webhooks` | `fournisseur`, `evenementId`, `reference`, `signatureValide`, `statut`, `receptions`, `corps` (8 ko, signature valide uniquement) | `fournisseur+evenementId` unique |
| `reconciliations` | `periode`, `totaux`, `anomalies`, `statut` | `creeLe` |
| `financial_audit_logs` | `par`, `action`, `details`, `le` | `le` |

Sur la réservation : `conditionsFinancieres` (`tauxCommissionPb`, `regleId`, `proprePlateforme`, `figeesLe`), et les paiements dans `paiements[]`.

Statut d'une somme due (calculé) : `EN_ATTENTE` (avant arrivée + 24 h), `ELIGIBLE`, `PARTIELLEMENT_VERSEE`, `VERSEE`, `SOLDEE`, `A_DEDUIRE` (commission due), `BLOQUEE` (annulation demandée, entreprise suspendue), `LITIGE` (bloquée par la plateforme).
