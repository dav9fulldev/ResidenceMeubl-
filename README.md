# 🏠 Résidences Meublé - Projet Complet (Monorepo)

## 📋 ÉTAT DU PROJET
- ✅ Frontend branché sur l'API (catalogue, réservations, administration)
- ✅ Connexion admin vérifiée côté serveur (jeton signé), routes admin protégées
- ✅ Tests automatisés du backend + build du frontend dans la CI (GitHub Actions) + analyse CodeQL
- ✅ Données enregistrées dans **MongoDB Atlas** (le catalogue initial est inséré automatiquement au premier démarrage)
- ✨ **Recherche intelligente** en langage naturel et suggestions « Vous aimerez aussi » (Voyage AI via Atlas), avec repli automatique sur la recherche par mots-clés

---

## 🎯 Présentation et Réalisations

Ce dépôt unique (Monorepo) regroupe l'ensemble de l'écosystème de **Sankofart Résidence**, un système complet de réservation d'hôtels et de résidences meublées en Côte d'Ivoire.

### ✅ FRONTEND (React.js)
- Application complète intégrant la liste des résidences.
- Système de réservation en ligne avec validation stricte des formulaires.
- Gestion locale des favoris via `localStorage`.
- Panel d'administration pour la gestion des statuts de réservation.
- Design moderne, responsive avec arrière-plan vidéo fluide.
- Filtres de recherche multicritères avancés.

### ✅ BACKEND (Node.js + Express)
- API REST robuste et structurée.
- Gestion des résidences avec statuts dynamiques (*disponible, occupé, réservé, maintenance*).
- Notifications automatisées par emails professionnels via **Nodemailer** (Admin & Client).
- Sécurité renforcée : Protection anti-spam (**Rate Limiting**) et contrôle d'accès **CORS**.

---

## 📁 Structure du Projet (Monorepo)

```text
SANKOFART-RESIDENCE/
├── .github/
│   └── workflows/
│       ├── ci.yml                # Tests backend + build frontend
│       └── codeql-analysis.yml   # Analyse de sécurité automatisée
├── client/                      # --- DOSSIER FRONTEND ---
│   ├── public/                  # Fichiers publics (index.html, icônes)
│   ├── src/                     # Code source React (Composants, pages, styles)
│   ├── package.json             # Dépendances Frontend
│   └── webpack.config.js        # Configuration du serveur Mac / Webpack
└── backend/                     # --- DOSSIER BACKEND ---
    ├── models/                  # Structures de données
    ├── routes/                  # Endpoints de l'API REST
    ├── services/                # Logique métier et EmailService
    ├── server.js                # Point d'entrée de l'API Express
    └── package.json             # Dépendances Backend
```

---

## 🛠️ Technologies Utilisées

- **Frontend** : React 19, Webpack, Webpack Dev Server, Babel, React Router DOM, React Hook Form, React Icons.
- **Backend** : Node.js, Express.js, MongoDB, Nodemailer, Morgan, Express Rate Limit, Cors, Dotenv.
- **Sécurité & CI/CD** : GitHub Actions, CodeQL Semantic Code Analysis.

---

## 🚀 Installation et Lancement du Projet

### 1. Configuration initiale
Clonez le dépôt, puis ouvrez deux terminaux distincts pour lancer simultanément les deux environnements.

### 2. Configuration et Lancement du Backend
Allez dans le dossier `backend` :
```bash
cd backend
npm install
```

Copiez `backend/.env.example` en `backend/.env` et remplissez les valeurs :
```env
PORT=5001
FRONTEND_URL=http://localhost:3001
EMAIL_USER=votre_email@gmail.com
EMAIL_PASS=votre_mot_de_passe_d_application_gmail
ADMIN_USERNAME=admin
ADMIN_PASSWORD=un_mot_de_passe_long_et_unique
ADMIN_TOKEN_SECRET=   # générer avec : openssl rand -hex 32
MONGODB_URI=mongodb+srv://...   # Atlas : Cluster0 > Connect > Drivers
VOYAGE_API_KEY=                 # optionnel — Atlas > AI Model APIs (recherche intelligente)
```
*Note : Sur macOS, le port `5001` est utilisé pour éviter les conflits système avec AirPlay (port 5000).*

Démarrez le serveur :
```bash
npm run dev
```
Le serveur backend s'exécute sur : `http://localhost:5001`

Lancer les tests :
```bash
npm test
```

### 3. Configuration et Lancement du Frontend
Allez dans le dossier `client` :
```bash
cd ../client
npm install
cp .env.example .env   # REACT_APP_API_URL=http://localhost:5001/api
```

> **Déploiement Vercel** : définir `REACT_APP_API_URL` (URL publique du backend + `/api`) dans *Settings → Environment Variables*, puis redéployer.

Démarrez le serveur de développement React :
```bash
npm start
```
L'application frontend s'ouvre automatiquement sur : `http://localhost:3001` (autre port : `PORT=3002 npm start`)

---

## 📚 Endpoints Clés de l'API (Port 5001)

### 🏠 Résidences
- `GET /api/residences` : Récupère la liste de toutes les résidences.
- `GET /api/residences/:id` : Détails complets d'une résidence par son identifiant.
- `POST /api/residences/search` : Recherche multicritères (Prix, Localisation, Chambres).
- `POST /api/residences/check-disponibilite` : Vérifie les conflits de dates pour une réservation.

- `POST /api/residences/recherche-ia` : `{ question }` en langage naturel → critères compris (personnes, chambres, budget) + résidences classées par pertinence.
- `GET /api/residences/:id/similaires` : 3 résidences proches (« Vous aimerez aussi »).

### 📅 Réservations
- `POST /api/reservations` : Soumet une demande de réservation (vérifie dates, capacité, durée) et envoie les emails.
- `GET /api/reservations/:id` : Détail d'une réservation par sa référence.
- `GET /api/reservations` 🔒 : Liste des réservations.
- `GET /api/reservations/stats` 🔒 : Statistiques.
- `PUT /api/reservations/:id/status` 🔒 : Modifier le statut (`en_attente`, `confirmee`, `annulee`). Une réservation annulée libère les dates.

### 🛠️ Administration
- `POST /api/admin/login` : `{ username, password }` → `{ token }` (valable 8 h).
- `GET / POST /api/admin/residences` 🔒 : Lister (y compris inactives) / ajouter.
- `PUT / DELETE /api/admin/residences/:id` 🔒 : Modifier / supprimer.
- `PUT /api/admin/residences/:id/status` 🔒 : `{ statut, details }` — `disponible`, `occupé`, `réservé`, `maintenance` (une résidence en maintenance n'est plus réservable).

🔒 = en-tête `Authorization: Bearer <token>` obligatoire.

### 🏥 Surveillance (Healthcheck)
- `GET /health` : Retourne l'état de santé opérationnel de l'API.

---

## 🔒 Sécurité et Bonnes Pratiques
- **Rate Limiting** : 100 requêtes globales par 15 minutes, 3 créations de réservations et 10 tentatives de connexion admin par IP.
- **Authentification admin** : identifiants dans les variables d'environnement du serveur, jamais dans le code du frontend.
- **CORS** : Filtrage strict restreignant l'accès aux seules adresses définies dans les variables d'environnement (`FRONTEND_URL`).
- **CodeQL** : Scan automatique de vulnérabilités (failles de sécurité, fuites de mémoire) exécuté par GitHub à chaque commit poussé sur la branche principale.

---

**Développé avec ❤️ pour les Résidence.**
