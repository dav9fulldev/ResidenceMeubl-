# 🔧 GUIDE TECHNIQUE & ARCHITECTURE D'INTÉGRATION

## 📋 Statut de l'Intégration : ✅ 100% Validé et Testé
Ce document centralise toutes les notes d'intégration, les architectures de données, le mapping et les étapes clés pour exploiter ou faire évoluer le système hybride de **Sankofart Résidence**.

---

## 🎯 Le Système Hybride (Deux Modes Disponibles)

L'application intègre un mécanisme de repli (*Fallback*) intelligent permettant de commuter entre deux configurations distinctes :

### 🔹 Mode A : LOCAL (Mode de Développement)
- **Activité** : Mode par défaut.
- **Principe** : L'application s'exécute de façon autonome en s'appuyant sur les données statiques internes (`src/data/residences.js`) et enregistre les favoris dans le `localStorage`.
- **Avantages** : Démarrage instantané sans dépendance serveur, idéal pour le travail d'interface.

### 🔹 Mode B : API BACKEND (Mode de Production)
- **Principe** : L'application communique en temps réel avec l'API Express, active la persistance globale, sécurise l'espace admin et gère les envois réels d'emails.
- **Activation** : 
  1. Ouvrez le fichier `src/App.js`.
  2. Modifiez l'import du fournisseur de contexte :
     ```javascript
     // Remplacer :
     import { ResidencesProvider } from './context/ResidencesContext';
     // Par :
     import { ResidencesProvider } from './context/ResidencesContextAPI';
     ```
  3. Assurez-vous de disposer d'un fichier `.env` à la racine de `client/` avec la variable :
     ```env
     REACT_APP_API_URL=http://localhost:5001/api
     ```

---

## 🔄 Mapping Automatique des Données (Data Layer)

Pour assurer une compatibilité transparente entre les deux modes, le fichier `ResidencesContextAPI.js` opère une conversion de structure automatique à la réception des charges utiles de l'API :


| Champ API Backend | Propriété Composant Frontend |
|-------------------|------------------------------|
| `nom`             | `name`                       |
| `typeAppartement` | `type`                       |
| `localisation`    | `location`                   |
| `ville`           | `city`                       |
| `quartier`        | `neighborhood`               |
| `prix`            | `price`                      |
| `nombreChambres`  | `bedrooms`                   |
| `photos`          | `images`                     |
| `equipements`     | `amenities`                  |

---

## 🛠️ Modifications d'Architecture Apportées

### 1. Structure de l'API Backend
- `data/residences.js` : Base de stockage à plat modélisant les 10 résidences, leurs équipements et leurs états d'occupation.
- `models/Residence.js` : Ajout des méthodes utilitaires `updateAvailability()` et `isAvailableNow()`.
- `routes/admin.js` : Implémentation des endpoints d'administration sécurisés (Connexion, déconnexion, mise à jour des fiches et modification des statuts).
- `server.js` : Montage du routeur d'administration sur le préfixe `/api/admin`.

### 2. Endpoints d'API Documentés (Port 5001)
- `GET /health` : Diagnostic d'état de l'API (`{"success":true, "message":"Opérationnel"}`).
- `GET /api/residences` : Liste publique des logements.
- `POST /api/residences/search` : Moteur de recherche à filtres croisés.
- `POST /api/reservations` : Création de réservations et routage des emails.
- `POST /api/admin/login` : Authentification admin (`{"username": "admin", "password": "sankofart2024"}`).
- `PUT /api/admin/residences/:id/status` : Mutation des états (*disponible, occupé, réservé, maintenance*).

---

## ⚠️ Points de Vigilance Importants pour la Production

Avant d'envisager une mise en production sur des serveurs distants, quatre chantiers majeurs doivent être finalisés :

1. **Persistance de Données**
   - *Actuellement* : Les données sont stockées en mémoire volatile dans un fichier JS.
   - *Production* : Connecter un ORM (Sequelize, Prisma) couplé à une base de données MySQL ou PostgreSQL.

2. **Hébergement des Médias (Images & Vidéos)**
   - *Actuellement* : Le backend renvoie des adresses pointant vers le dossier `public/images/` du serveur local.
   - *Production* : Externaliser l'hébergement des images et de la vidéo d'accueil sur un service de stockage Cloud (AWS S3, Cloudinary) ou via un CDN dédié.

3. **Sécurisation des Sessions Admin**
   - *Actuellement* : Authentification par comparaison simple de chaînes de caractères.
   - *Production* : Finaliser le middleware d'analyse des tokens JWT avec gestion de l'expiration et clés de rafraîchissement.

4. **Serveur de Messagerie**
   - *Actuellement* : Configuration Nodemailer prête pour un environnement de test Gmail.
   - *Production* : Renseigner les variables d'environnement de production (`EMAIL_USER`, `EMAIL_PASS`) avec un compte d'expédition dédié.

---
**Développé avec ❤️ pour les Résidences.**
