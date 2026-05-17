# 🏠 Sankofart Résidence - Projet Complet (Monorepo)

## 📋 ÉTAT DU PROJET : ✅ TERMINÉ & SÉCURISÉ
Statut : **100% Opérationnel - Prêt pour développement et déploiement**
Intégration continue : **Analyse de sécurité automatisée avec GitHub Actions (CodeQL)**

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
- **Backend** : Node.js, Express.js, Nodemailer, Morgan, Express Rate Limit, Cors, Dotenv.
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

Créez un fichier `.env` dans le dossier `backend` et ajoutez-y vos accès :
```env
PORT=5001
FRONTEND_URL=http://localhost:3000
EMAIL_USER=votre_email@gmail.com
EMAIL_PASS=votre_mot_de_passe_d_application_gmail
```
*Note : Sur macOS, le port `5001` est utilisé pour éviter les conflits système avec AirPlay (port 5000).*

Démarrez le serveur :
```bash
npm run dev
```
Le serveur backend s'exécute sur : `http://localhost:5001`

### 3. Configuration et Lancement du Frontend
Allez dans le dossier `client` :
```bash
cd ../client
npm install --legacy-peer-deps
```

Démarrez le serveur de développement React :
```bash
npm start
```
L'application frontend s'ouvre automatiquement sur : `http://localhost:3000`

---

## 📚 Endpoints Clés de l'API (Port 5001)

### 🏠 Résidences
- `GET /api/residences` : Récupère la liste de toutes les résidences.
- `GET /api/residences/:id` : Détails complets d'une résidence par son identifiant.
- `POST /api/residences/search` : Recherche multicritères (Prix, Localisation, Chambres).
- `POST /api/residences/check-disponibilite` : Vérifie les conflits de dates pour une réservation.

### 📅 Réservations
- `POST /api/reservations` : Soumet une demande de réservation et déclenche l'envoi d'emails.
- `PUT /api/reservations/:id/status` : Permet à l'administrateur de modifier le statut (`confirmee`, `annulee`).

### 🏥 Surveillance (Healthcheck)
- `GET /health` : Retourne l'état de santé opérationnel de l'API.

---

## 🔒 Sécurité et Bonnes Pratiques
- **Rate Limiting** : Restriction fixée à 100 requêtes globales par tranche de 15 minutes et bridée à 3 créations de réservations par IP pour faire barrage aux bots.
- **CORS** : Filtrage strict restreignant l'accès aux seules adresses définies dans les variables d'environnement (`FRONTEND_URL`).
- **CodeQL** : Scan automatique de vulnérabilités (failles de sécurité, fuites de mémoire) exécuté par GitHub à chaque commit poussé sur la branche principale.

---

**Développé avec ❤️ pour les Résidence.**
