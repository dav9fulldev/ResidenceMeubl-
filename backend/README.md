# 🏠 Sankofart Résidence — API backend

API Express qui gère les résidences, les réservations, l'administration, les emails et la recherche intelligente. Les données sont stockées dans MongoDB Atlas.

Déploiement : voir [../DEPLOIEMENT.md](../DEPLOIEMENT.md) (Render).

---

## ⚙️ Variables d'environnement

Copier [`.env.example`](.env.example) en `.env`. Ne jamais commiter `.env`.

| Variable | Obligatoire | Description |
|---|---|---|
| `MONGODB_URI` | ✅ | URL de connexion Atlas (*Cluster0 → Connect → Drivers*). Le serveur refuse de démarrer sans. |
| `MONGODB_DB` | | Nom de la base (défaut : `sankofart`). |
| `PORT` | | Port d'écoute (défaut : `5001`, fourni automatiquement par Render). |
| `FRONTEND_URL` | ✅ | Adresse(s) du site autorisée(s) par CORS, séparées par des virgules. `localhost:3000/3001` sont toujours autorisés. |
| `EMAIL_USER` / `EMAIL_PASS` | ✅ | Compte Gmail et **mot de passe d'application** (16 lettres). |
| `ADMIN_USERNAME` / `ADMIN_PASSWORD` | ✅ | Identifiants de l'espace admin. |
| `ADMIN_TOKEN_SECRET` | ✅ en production | Clé de signature des jetons admin (`openssl rand -hex 32`). Sans elle, une clé temporaire est utilisée et les admins sont déconnectés à chaque redémarrage. |
| `CLIENT_IP_HEADER` | ✅ sur Render | En-tête contenant la vraie IP du visiteur, pour les limites anti-spam : `cf-connecting-ip` sur Render. À ne définir que derrière un relais qui écrase cet en-tête (Cloudflare). |
| `VOYAGE_API_KEY` | | Clé Atlas *AI Model APIs*. Sans elle, la recherche intelligente fonctionne en mode mots-clés. |
| `VOYAGE_MODEL` | | Défaut : `voyage-4-lite`. |
| `VOYAGE_API_URL` | | Défaut : `https://ai.mongodb.com/v1` (`https://api.voyageai.com/v1` pour une clé créée sur voyageai.com). |

---

## 🧪 Commandes

```bash
npm install     # dépendances
npm run dev     # développement (redémarre à chaque modification)
npm start       # production
npm test        # tests (MongoDB lancé en mémoire, aucune connexion à Atlas ni à Voyage)
```

---

## 📚 Routes de l'API

Toutes les réponses ont la forme `{ success, data?, message? }`. 🔒 = en-tête `Authorization: Bearer <jeton>` obligatoire (obtenu via `/api/admin/login`).

### Résidences
| Méthode | Route | Description |
|---|---|---|
| GET | `/api/residences` | Résidences actives avec leur statut calculé (sans nom d'occupant) |
| GET | `/api/residences/:id` | Détail d'une résidence |
| GET | `/api/residences/:id/similaires` | 3 résidences proches (« Vous aimerez aussi ») |
| POST | `/api/residences/recherche-ia` | `{ question }` → `{ mode, criteres, resultats, suggestions }` |
| POST | `/api/residences/search` | Filtres : `recherche`, `prixMin`, `prixMax`, `nombreChambres`, `typeAppartement`, `localisation` |
| POST | `/api/residences/check-disponibilite` | `{ residenceId, dateArrivee, dateDepart }` |
| GET | `/api/residences/types`, `/villes`, `/quartiers/:ville` | Listes pour les filtres |

### Réservations
| Méthode | Route | Description |
|---|---|---|
| POST | `/api/reservations` | Crée une réservation (dates `AAAA-MM-JJ`) ; contrôle dates prises, capacité, durée ; envoie les emails |
| GET | `/api/reservations/:id` | Détail par référence |
| GET 🔒 | `/api/reservations` | Liste (plus récentes d'abord) |
| GET 🔒 | `/api/reservations/stats` | Totaux par statut |
| PUT 🔒 | `/api/reservations/:id/status` | `{ statut: en_attente | confirmee | annulee }` → email au client si le statut change |

### Administration
| Méthode | Route | Description |
|---|---|---|
| POST | `/api/admin/login` | `{ username, password }` → `{ token }` (8 h, 10 tentatives / 15 min) |
| GET / POST 🔒 | `/api/admin/residences` | Lister (avec occupants) / créer |
| PUT / DELETE 🔒 | `/api/admin/residences/:id` | Modifier / supprimer |
| PUT 🔒 | `/api/admin/residences/:id/status` | `{ statut, details }` — statut posé à la main (prioritaire sur le calcul automatique) |

### Divers
`GET /health` — état du service (utilisé par Render).

---

## 🧠 Fonctionnement

**Statut des résidences.** Si l'admin n'a pas posé de statut à la main, le statut est calculé à chaque lecture : une réservation **confirmée** en cours donne « occupé », une réservation confirmée à venir donne « réservé ». « Maintenance » bloque toute réservation.

**Disponibilité.** Une réservation est refusée si une autre réservation non annulée chevauche ses dates (on peut arriver le jour du départ précédent).

**Recherche intelligente** ([`services/SmartSearchService.js`](services/SmartSearchService.js)) :
1. Les critères chiffrés sont extraits de la phrase (personnes, chambres, budget, y compris « cinquante mille ») et appliqués strictement.
2. Les résidences sont classées par similarité de sens entre la question et leur description, grâce aux vecteurs Voyage AI.
3. Si Voyage est indisponible (clé absente, limite atteinte, panne), le classement se fait par mots-clés : le site reste fonctionnel.

Les vecteurs des résidences sont stockés dans la collection `residence_embeddings` et recalculés automatiquement au démarrage et après chaque modification admin, uniquement pour les résidences dont le texte a changé. Le calcul de similarité se fait dans le serveur, ce qui convient jusqu'à quelques milliers de résidences ; au-delà, passer à un index Atlas Vector Search.

**Collections MongoDB** : `residences`, `reservations`, `residence_embeddings`, `counters`.

---

## 📁 Structure

```text
backend/
├── server.js                 # Point d'entrée Express (CORS, limites, routes)
├── db.js                     # Connexion MongoDB, index, catalogue initial
├── data/residences.js        # Catalogue inséré au premier démarrage
├── middleware/requireAdmin.js
├── models/                   # Residence, Reservation (validation)
├── routes/                   # residences, reservations, admin
├── services/
│   ├── ResidenceService.js   # Résidences + statut calculé
│   ├── ReservationService.js # Réservations, disponibilité, statuts
│   ├── EmailService.js       # Emails HTML (admin, client, confirmation/annulation)
│   ├── AuthService.js        # Jetons admin signés (HMAC)
│   ├── AIService.js          # Appels Voyage AI
│   └── SmartSearchService.js # Recherche intelligente et suggestions
└── tests/api.test.js         # Tests de bout en bout de l'API
```
