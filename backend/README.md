# Sankofart Résidence — API

API Express : résidences, réservations, paiements (PI-SPI, GeniusPay), remboursements, emails, back-office et recherche intelligente. Données dans MongoDB Atlas.

Déploiement : voir [../DEPLOIEMENT.md](../DEPLOIEMENT.md) (Render).

---

## Variables d'environnement

Copier [`.env.example`](.env.example) en `.env`. Ne jamais commiter `.env`.

### Général
| Variable | Obligatoire | Description |
|---|---|---|
| `MONGODB_URI` | oui | URL de connexion Atlas. Le serveur refuse de démarrer sans. |
| `MONGODB_DB` | | Nom de la base (défaut : `sankofart`). |
| `PORT` | | Port d'écoute (défaut : `5001`, fourni par Render). |
| `NODE_ENV` | | `production` sur Render : HSTS activé, `localhost` refusé par CORS. |
| `FRONTEND_URL` | oui | Adresse(s) du site autorisée(s) par CORS, séparées par des virgules. La première adresse `https` sert aussi aux liens des emails et au retour après paiement. |
| `PUBLIC_SITE_URL` | | Adresse de retour après un paiement GeniusPay, si différente de `FRONTEND_URL`. |
| `CLIENT_IP_HEADER` | oui sur Render | En-tête de la vraie IP du visiteur : `cf-connecting-ip`. |
| `TRUST_PROXY` | | Nombre de relais devant l'API (défaut : 1). |

### Accès administrateur
| Variable | Obligatoire | Description |
|---|---|---|
| `ADMIN_USERNAME` / `ADMIN_PASSWORD` | oui | Identifiants du back-office (identifiant non trivial, mot de passe d'au moins 20 caractères aléatoires). |
| `ADMIN_TOKEN_SECRET` | oui en production | Clé de signature des jetons (`openssl rand -hex 32`). |

### Emails
| Variable | Obligatoire | Description |
|---|---|---|
| `BREVO_API_KEY` | oui sur Render | API Brevo (HTTPS) ; prioritaire sur le SMTP. |
| `EMAIL_FROM` | | Expéditeur (validé dans Brevo). |
| `EMAIL_USER` / `EMAIL_PASS` | en local | Compte Gmail et mot de passe d'application (SMTP). |
| `ADMIN_EMAIL` | | Destinataire des alertes, si non réglé dans *Paramètres → Emails*. |

### Paiements
| Variable | Description |
|---|---|
| `PAIEMENT_MODE` | `pispi` (défaut si configuré), `simulation` (démonstrations, aucun argent ne circule) ou `desactive`. |
| `PISPI_BASE_URL`, `PISPI_TOKEN_URL`, `PISPI_PARTICIPANT_CODE` | Adresses et code participant PI-SPI. |
| `PISPI_CLIENT_ID`, `PISPI_CLIENT_SECRET`, `PISPI_API_KEY` | Identifiants OAuth2 et clé d'API PI-SPI. |
| `PISPI_SCOPES` | Scopes, dont `piz/retour_fonds.write` (remboursement intégral) et `piz/paiement.write` (remboursement partiel). |
| `PISPI_PAYEE_ALIAS` | Adresse de paiement du compte qui encaisse. |
| `PISPI_WEBHOOK_SECRET` | Secret des webhooks PI-SPI (en-tête `X-Signature`). |
| `PISPI_APP_URL`, `PISPI_PAYS` | Lien « Ouvrir l'application » ; pays du QR code (défaut `CI`). |
| `GENIUSPAY_API_KEY`, `GENIUSPAY_API_SECRET` | Clés GeniusPay (`pk_…` / `sk_…`) ; le préfixe choisit sandbox ou production. |
| `GENIUSPAY_WEBHOOK_SECRET` | Secret (`whsec_…`) du webhook GeniusPay. |
| `GENIUSPAY_BASE_URL` | Défaut : `https://geniuspay.ci/api/v1/merchant`. |
| `ACOMPTE_POURCENTAGE`, `ACOMPTE_REMBOURSABLE_APRES_PAIEMENT_JOURS`, `ACOMPTE_REMBOURSEMENT_POURCENTAGE`, `ACOMPTE_NON_REMBOURSABLE_AVANT_ARRIVEE_JOURS` | Valeurs par défaut (30 %, 5 jours, 50 %, 3 jours). Les réglages du back-office les remplacent. |

### Recherche intelligente
| Variable | Description |
|---|---|
| `VOYAGE_API_KEY` | Clé Atlas *AI Model APIs* ; sans elle, recherche par mots-clés. |
| `VOYAGE_MODEL`, `VOYAGE_API_URL` | Défauts : `voyage-4-lite`, `https://ai.mongodb.com/v1`. |

---

## Commandes

```bash
npm install
npm run dev     # développement
npm start       # production
npm test        # tests : MongoDB en mémoire, prestataires simulés (aucun crédit consommé)
```

---

## Routes de l'API

Réponses au format `{ success, data?, message? }`. 🔒 = jeton admin, 👤 = jeton client (`Authorization: Bearer <jeton>`) ; l'un n'ouvre jamais les routes de l'autre.

### Public
| Méthode | Route | Description |
|---|---|---|
| GET | `/api/residences` | Résidences actives avec statut calculé (sans occupant) |
| GET | `/api/residences/:id`, `/:id/similaires` | Détail ; 3 résidences proches |
| GET | `/api/residences/disponibles?arrivee&depart` | Identifiants des résidences libres sur la période |
| POST | `/api/residences/recherche-ia` | `{ question }` → critères compris et résultats classés |
| POST | `/api/residences/search`, `/check-disponibilite` | Filtres classiques ; disponibilité d'une résidence |
| GET | `/api/residences/types`, `/villes`, `/quartiers/:ville` | Listes pour les filtres |
| POST | `/api/reservations` | Demande de réservation (entrées validées : types, formats, longueurs) |
| GET | `/api/etablissement` | Identité publique, moyens de paiement actifs, règles d'acompte |

### Espace client (sans compte)
| Méthode | Route | Description |
|---|---|---|
| POST | `/api/client/acces` | `{ email, reference }` → jeton limité à cette réservation (24 h) |
| POST | `/api/client/lien` | `{ email }` → lien vers tout l'historique, envoyé par email |
| GET 👤 | `/api/client/reservations` | Historique, avec état de l'acompte et du solde |
| POST 👤 | `/api/client/reservations/:id/annulation` | Demande d'annulation |
| POST 👤 | `/api/client/reservations/masquer` | Retirer des réservations terminées de l'historique |
| POST 👤 | `/api/client/reservations/:id/acompte` | Démarre un paiement : `{ methode: qr \| demande \| geniuspay, objet: acompte \| solde, payeurAlias? }` |
| GET 👤 | `/api/client/reservations/:id/acompte/:txId` | Suivi du paiement (relu auprès du prestataire) |
| POST 👤 | `/api/client/reservations/:id/acompte/:txId/simuler` | Mode `simulation` uniquement |

### Réservations (admin)
| Méthode | Route | Description |
|---|---|---|
| GET 🔒 | `/api/reservations`, `/api/reservations/:id`, `/api/reservations/stats` | Liste, détail, totaux |
| PUT 🔒 | `/api/reservations/:id/status` | Confirmer ou refuser (annulation d'une réservation confirmée : uniquement sur demande du client) |
| PUT 🔒 | `/api/reservations/:id/annulation` | `{ decision: accepter \| refuser, message? }` |
| POST 🔒 | `/api/reservations/:id/remboursement/relancer` | Relance (ou geste commercial) du remboursement de l'acompte |
| PUT 🔒 | `/api/reservations/:id/remboursement` | Acompte remboursé hors ligne |
| PUT 🔒 | `/api/reservations/:id/solde` | Solde reçu sur place : `{ moyen: especes \| mobile_money \| carte \| virement \| autre, reference? }` |
| PUT 🔒 | `/api/reservations/:id/solde/remboursement` | Solde d'un séjour annulé rendu au client |

### Administration
| Méthode | Route | Description |
|---|---|---|
| POST | `/api/admin/login` | `{ username, password }` → jeton (8 h ; 10 tentatives / 15 min) |
| GET / POST 🔒 | `/api/admin/residences` | Lister / créer |
| PUT / DELETE 🔒 | `/api/admin/residences/:id` | Modifier / supprimer |
| PUT 🔒 | `/api/admin/residences/:id/status` | Statut manuel (maintenance…) |
| GET 🔒 | `/api/admin/statistiques?annee=` | Statistiques de l'année |
| GET 🔒 | `/api/admin/export/reservations.csv?annee=` | Export CSV pour Excel |
| GET / PUT 🔒 | `/api/admin/parametres` | Règles d'acompte et de remboursement |
| GET / PUT 🔒 | `/api/admin/etablissement` | Identité, coordonnées, réseaux, email des alertes |
| GET 🔒 | `/api/admin/paiements/moyens` | Moyens de paiement : configurés, activés, adresses des webhooks |
| PUT 🔒 | `/api/admin/paiements/moyens/:id` | `{ actif }` — activer / désactiver un moyen |

### Webhooks et divers
| Méthode | Route | Description |
|---|---|---|
| POST | `/api/paiements/pispi/webhook` | Signé `X-Signature` (HMAC-SHA256 du corps) |
| POST | `/api/paiements/geniuspay/webhook` | Signé `X-Webhook-Signature` + `X-Webhook-Timestamp` (HMAC-SHA256 de `timestamp.corps`, ±5 min) |
| GET | `/health` | État du service |

---

## Fonctionnement

**Réservation.** Demande → confirmation par l'admin → acompte payable en ligne. Une réservation est refusée si une autre, non annulée, chevauche les dates (arriver le jour d'un départ est autorisé).

**Paiements.** Un même circuit sert à l'acompte et au solde (champ `objet` du paiement). Un paiement n'est jamais validé sur la seule foi d'un webhook ou du navigateur : le serveur relit son état auprès du prestataire (PI-SPI `IRREVOCABLE`, GeniusPay `completed` avec le bon montant). Une vérification périodique prend le relais si un webhook se perd. Un second paiement pour une même échéance est signalé comme doublon à rembourser.

**Moyens de paiement** ([`services/paiement/fournisseurs/`](services/paiement/fournisseurs/)) : un module par prestataire (nom, modes, capacités, état de configuration). Ajouter un prestataire = créer son module et l'ajouter au registre ; il apparaît alors dans *Paramètres → Moyens de paiement*.

**Remboursement de l'acompte** (paliers réglables) : 100 % dans les N jours suivant le paiement (retour de fonds PI-SPI), puis P % (paiement sortant PI-SPI), rien à moins de M jours de l'arrivée. GeniusPay n'ayant pas d'API de remboursement, ses remboursements sont marqués « à rembourser » pour l'équipe.

**Solde.** Payable en ligne une fois l'acompte réglé, ou enregistré sur place par l'admin. Rappel par email une seule fois, 3 jours avant l'arrivée. Si un séjour entièrement payé est annulé, le solde est marqué « à rendre ».

**Emails** ([`services/EmailService.js`](services/EmailService.js)) : gabarit unique et sobre ; le texte s'adapte au moyen de paiement utilisé (référence, mode de remboursement).

**Statut des résidences.** Calculé à chaque lecture depuis les réservations confirmées (« occupé », « réservé ») sauf statut posé à la main ; « maintenance » bloque les réservations.

**Recherche intelligente** ([`services/SmartSearchService.js`](services/SmartSearchService.js)) : critères chiffrés extraits de la phrase, classement par similarité de sens (vecteurs Voyage AI stockés dans `residence_embeddings`), repli par mots-clés si Voyage est indisponible.

**Sécurité.** En-têtes de sécurité et CSP sur toutes les réponses, `X-Powered-By` masqué, requêtes limitées à 100 ko (2 Mo pour `/api/admin`), validation stricte des entrées, comparaisons de jetons en temps constant.

**Collections MongoDB** : `residences`, `reservations`, `residence_embeddings`, `counters`, `parametres` (documents `acompte`, `etablissement`, `paiement`).

---

## Structure

```text
backend/
├── server.js                  # Express : en-têtes, CORS, limites, webhooks, routes, minuteries
├── db.js                      # Connexion MongoDB, index, catalogue initial
├── middleware/                # requireAdmin, requireClient, clientIp
├── models/                    # Residence, Reservation
├── routes/                    # residences, reservations, client, admin
├── services/
│   ├── ReservationService.js  # Réservations, disponibilité, annulations, solde, rappels
│   ├── ResidenceService.js    # Résidences et statut calculé
│   ├── SettingsService.js     # Paramètres du back-office (acompte, établissement, moyens actifs)
│   ├── EmailService.js        # Emails (Brevo / SMTP)
│   ├── AuthService.js         # Jetons signés admin et client
│   ├── StatsService.js        # Statistiques et export CSV
│   ├── AIService.js, SmartSearchService.js
│   └── paiement/
│       ├── acompte.js         # Règles : acompte, solde, politique de remboursement
│       ├── PaymentService.js  # Démarrage, vérification, webhooks, suivi périodique
│       ├── RefundService.js   # Remboursements PI-SPI
│       ├── PiSpiClient.js, GeniusPayClient.js
│       └── fournisseurs/      # Registre des moyens de paiement (pispi, geniuspay)
└── tests/api.test.js          # Tests de bout en bout de l'API
```
