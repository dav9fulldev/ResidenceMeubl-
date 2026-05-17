# 🏠 Sankofart Résidence - Frontend Application

## 📋 ÉTAT DU COMPOSANT : ✅ 100% OPÉRATIONNEL
Statut : **Terminé - Prêt pour intégration et déploiement**  
Charte graphique : **Luxe & Prestige (Blanc, Noir, Doré `#d4af37`)**

---

## 🎯 Présentation et Fonctionnalités

Cette application React.js constitue l'interface vitrine et le tunnel de réservation complet pour **Sankofart Résidence**. Elle offre une expérience utilisateur fluide et immersive, adaptée à tous les types d'écrans.

### 👥 Côté Utilisateur & Visiteur
- **Catalogue Immersif** : Présentation haut de gamme de **10 résidences** avec galeries photos, équipements et localisation.
- **Vidéo d'ambiance** : Page d'accueil dynamique avec arrière-plan vidéo fluide (`video_script.mp4`).
- **Recherche & Filtres Avancés** : Recherche textuelle instantanée (nom, ville, quartier) croisée avec des filtres par prix et nombre de chambres.
- **Espace Favoris** : Sauvegarde locale et persistance des appartements préférés via `localStorage`.
- **Tunnel de Réservation Strict** : Formulaire intelligent avec pré-remplissage automatique des données de la résidence sélectionnée et module d'upload de pièce d'identité.

### 🛠️ Fonctionnalités Techniques & Administration
- **Système Hybride Intelligent** : L'application peut fonctionner de manière autonome en **Mode LOCAL** (via données statiques de secours) ou en **Mode API** connecté au serveur backend.
- **Dashboard Admin Intégré** : Espace sécurisé permettant de piloter l'état des logements et de suivre les statistiques d'occupation en temps réel.

---

## 📁 Structure du Dossier Frontend

```text
client/
├── public/
│   ├── images/               # 10 photos officielles des résidences + logos
│   ├── video_script.mp4      # Vidéo de fond de la page d'accueil
│   └── index.html            # Point d'entrée HTML principal
├── src/
│   ├── components/           # --- COMPOSANTS RÉUTILISABLES ---
│   │   ├── Header.js         # Barre de navigation principale
│   │   ├── Footer.js         # Pied de page (inclut le lien Admin)
│   │   ├── AdminPanel.js     # Panneau de gestion des données
│   │   ├── AvailabilityStatus.js # Indicateurs de disponibilité
│   │   └── ProtectedRoute.js # Sécurisation des accès sensibles
│   ├── pages/                # --- PAGES PRINCIPALES ---
│   │   ├── Home.js           # Accueil avec résidences vedettes
│   │   ├── Residences.js     # Liste complète avec filtres avancés
│   │   ├── ResidenceDetail.js# Fiche détaillée de l'appartement
│   │   ├── Reservation.js    # Formulaire de réservation et validation
│   │   ├── Favorites.js      # Gestionnaire des résidences sauvegardées
│   │   ├── AdminLogin.js     # Formulaire de connexion de l'administrateur
│   │   └── AdminDashboard.js # Tableau de bord de suivi d'activité
│   ├── context/              # --- GESTION DES ÉTATS (Context API) ---
│   │   ├── FavoritesContext.js   # État global des favoris utilisateurs
│   │   ├── ResidencesContext.js  # Gestionnaire du Mode LOCAL (Statique)
│   │   └── ResidencesContextAPI.js # Gestionnaire du Mode BACKEND (API)
│   ├── config/
│   │   └── api.js            # Configuration des URLs d'appels Axios
│   └── data/
│       └── residences.js     # Fichier source des 10 résidences de secours
├── package.json              # Dépendances et configurations scripts
└── webpack.config.js         # Serveur de développement universel pour Mac
```

---

## 🔧 Installation et Lancement Local (Mac)

1. Ouvrez votre terminal et placez-vous dans le répertoire du client :
   ```bash
   cd client
   ```

2. Installez proprement l'ensemble des modules en contournant les éventuels conflits d'architecture :
   ```bash
   npm install --legacy-peer-deps
   ```

3. Démarrez l'application sur votre serveur de développement Webpack :
   ```bash
   npm start
   ```

4. L'application s'ouvrira automatiquement à l'adresse suivante : **`http://localhost:3000`**

---

## 🔐 Accès Espace Administration

Pour accéder à l'interface de gestion durant vos tests, cliquez sur le lien **"🛠️ Administration"** situé tout en bas dans le pied de page (Footer).

- **Nom d'utilisateur** : `admin`
- **Mot de passe** : `sankofart2024`

### 📊 Grille des codes couleur de disponibilité :


| Statut | Description | Couleur de l'indicateur |
|--------|-------------|-------------------------|
| 🟢 **Disponible** | Logement libre immédiatement | Vert |
| 🔴 **Occupé** | Résidence actuellement occupée | Rouge |
| 🟡 **Réservé** | Réservation planifiée et validée | Jaune |
| 🔵 **Maintenance** | Logement indisponible (Travaux / Ménage) | Bleu |

---

## 🔒 Sécurité & Robustesse de l'Interface
- **Validation Stricte** : Formulaires propulsés par `React Hook Form` empêchant l'envoi de requêtes incomplètes ou de dates inversées.
- **Contrôle des fichiers** : Vérification stricte de l'extension et du poids des pièces d'identité chargées.
- **Routes Privées** : Protection logicielle empêchant l'accès direct aux URLs admin sans token d'authentification valide.

## 📞 Support technique & Contacts
- **Email de l'entreprise** : `contact@sankofartresidence.com`
- **Assistance Téléphonique** : `+225 27 22 49 28 90`

---
**Développé avec ❤️ pour Sankofart Résidence.**
