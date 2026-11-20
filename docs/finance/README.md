# Module financier — BABI RESIDENCE

La plateforme **encaisse tous les paiements** des clients (acompte et solde) sur ses comptes PI-SPI et GeniusPay, prélève sa **commission** (8 % par défaut), et **reverse à la main** la part de chaque entreprise **24 h après l'arrivée** du client.

| Document | Contenu |
|---|---|
| [ARCHITECTURE.md](ARCHITECTURE.md) | Composants, fichiers, flux ([schéma](architecture.png)) |
| [DECISIONS.md](DECISIONS.md) | Décisions prises et écarts avec la spécification initiale |
| [DATA_MODEL.md](DATA_MODEL.md) | Collections MongoDB, index, plan de comptes |
| [API_SPEC.md](API_SPEC.md) | Routes de l'API |
| [PAYMENT_FLOW.md](PAYMENT_FLOW.md) | Cycle de vie d'un paiement ([schéma](cycle-de-vie.png)) |
| [COMMISSION_SPEC.md](COMMISSION_SPEC.md) | Calcul et historique des commissions |
| [PAYOUT_SPEC.md](PAYOUT_SPEC.md) | Sommes dues et reversements manuels |
| [REFUND_SPEC.md](REFUND_SPEC.md) | Remboursements et effet comptable |
| [RECONCILIATION_SPEC.md](RECONCILIATION_SPEC.md) | Rapprochement et anomalies |
| [SECURITY.md](SECURITY.md) | Contrôles, droits, conformité |
| [TEST_PLAN.md](TEST_PLAN.md) | Scénarios couverts par les tests automatisés |

> Avant la mise en production réelle : valider avec GeniusPay les **reversements (cash-out)** vers les entreprises, et avec un juriste le cadre de l'**encaissement pour compte de tiers** (réglementation BCEAO / UEMOA). Faire relire le plan de comptes par un expert-comptable (frais des prestataires, taxes).
