# API

Toutes les routes exigent un jeton du back-office (`Authorization: Bearer …`).

## Plateforme — `/api/admin/finance` (administrateur de la plateforme)

| Méthode | Route | Description |
|---|---|---|
| GET | `/apercu?du&au` | Indicateurs : encaissé, commissions, versable, reversements en attente, remboursé, trop-perçus, fonds par prestataire, équilibre du registre |
| GET | `/registre?type&entreprise&du&au&page` | Transactions et écritures (50 par page) |
| GET | `/registre.csv` | Export CSV (protégé contre l'injection de formules) |
| POST | `/registre/:id/contrepassation` | `{ motif }` — écritures inverses ; l'originale reste inchangée |
| GET | `/dettes?entreprise` | Sommes dues par réservation, avec statut |
| PUT | `/dettes/:reservationId/blocage` | `{ bloque, motif }` — litige |
| GET | `/entreprises` | Par entreprise : versable, en attente, coordonnées, reversement en cours |
| PUT | `/beneficiaires/:entrepriseId` | `{ valide, motif }` — vérification des coordonnées de versement |
| GET / POST | `/reversements` | Liste ; création `{ entrepriseId, montant? }` (par défaut : tout le versable) |
| PUT | `/reversements/:id` | `{ action: approuver \| rejeter \| executer \| confirmer \| echec \| annuler, motif?, referenceExterne?, source? }` |
| POST / GET | `/reversements/:id/preuve` | Preuve du virement (PDF ou image, 5 Mo) |
| GET / PUT | `/commission` | Taux en vigueur et historique ; `{ tauxPourcent }` |
| POST / GET | `/rapprochements` | `{ du?, au?, verifierPrestataire? }` |
| GET | `/webhooks` | Notifications reçues des prestataires |
| GET | `/audit` | Journal des opérations financières |

## Entreprise — `/api/admin/revenus`

| Méthode | Route | Description |
|---|---|---|
| GET | `/` | Ses sommes dues, reversements, coordonnées de versement |
| PUT | `/beneficiaire` | `{ type: mobile_money \| virement \| pispi, operateur?, beneficiaire, destination }` — repasse « à vérifier » |

## Webhooks (inchangés)

`POST /api/paiements/pispi/webhook` et `/api/paiements/geniuspay/webhook` : signature vérifiée, notification tracée dans `payment_webhooks`, puis relecture de l'état chez le prestataire.
