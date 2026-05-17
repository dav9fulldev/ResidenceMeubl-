# Sankofart Résidence - Frontend

Site vitrine moderne pour présenter les résidences meublées de Sankofart Résidence, permettant aux visiteurs de consulter les appartements disponibles, de filtrer/rechercher et d'effectuer des réservations en ligne.

## 🏠 Fonctionnalités

### Côté utilisateur
- **Consultation** : Liste des résidences avec photos, description, prix, localisation
- **Recherche & Filtres** : Par nom, ville, quartier, prix, nombre de chambres
- **Détails** : Page détaillée d'un appartement (images, équipements, disponibilités)
- **Réservation stricte** : Formulaire avec validation et pré-remplissage automatique
- **Favoris** : Sauvegarde locale des résidences préférées
- **Design responsive** : Mobile, tablette, desktop

### Fonctionnalités techniques
- Gestion des favoris avec localStorage
- Formulaire de réservation avec validation stricte
- Pré-remplissage automatique des informations de résidence
- Navigation intuitive et recherche avancée
- Design sobre et professionnel (blanc, doré, noir)

## 🚀 Technologies utilisées

- **React.js** 19.1.1
- **React Router** pour la navigation
- **React Hook Form** pour la gestion des formulaires
- **React Icons** pour les icônes
- **CSS3** avec design responsive
- **LocalStorage** pour la persistance des favoris

## 📁 Structure du projet

```
src/
├── components/          # Composants réutilisables
│   ├── Header.js       # Navigation principale
│   └── Footer.js       # Pied de page
├── context/            # Contextes React
│   └── FavoritesContext.js  # Gestion des favoris
├── data/               # Données statiques
│   └── residences.js   # Liste des résidences
├── pages/              # Pages de l'application
│   ├── Home.js         # Page d'accueil
│   ├── Residences.js   # Liste des résidences
│   ├── ResidenceDetail.js  # Détail d'une résidence
│   ├── Reservation.js  # Formulaire de réservation
│   └── Favorites.js    # Page des favoris
└── App.js              # Composant principal
```

## 🎨 Design

Le design suit les spécifications du document technique :
- **Couleurs** : Blanc, doré (#d4af37), noir (#1a1a1a)
- **Style** : Sobre et professionnel, reflétant le luxe et le confort
- **Responsive** : Adapté à tous les écrans
- **UX** : Interface intuitive avec navigation rapide

## 🔧 Installation et démarrage

1. **Cloner le projet**
   ```bash
   git clone [url-du-repo]
   cd sankofart-residence-frontend
   ```

2. **Installer les dépendances**
   ```bash
   npm install
   ```

3. **Démarrer le serveur de développement**
   ```bash
   npm start
   ```

4. **Ouvrir dans le navigateur**
   ```
   http://localhost:3000
   ```

## 📱 Pages disponibles

- **/** - Page d'accueil avec résidences vedettes
- **/residences** - Liste complète avec recherche et filtres
- **/residence/:id** - Détail d'une résidence
- **/reservation** - Formulaire de réservation
- **/favorites** - Résidences sauvegardées

## 🎯 Fonctionnalités clés

### Système de réservation
- Formulaire strict avec validation
- Pré-remplissage automatique des informations de résidence
- Validation des dates et champs obligatoires
- Upload de pièce d'identité

### Gestion des favoris
- Ajout/retrait de résidences
- Persistance locale (localStorage)
- Interface intuitive pour la gestion

### Recherche et filtres
- Recherche textuelle (nom, ville, quartier)
- Filtres par prix, nombre de chambres, ville
- Interface de filtrage avancée

## 🔒 Sécurité

- Validation stricte des formulaires
- Protection contre les injections
- Validation des types de fichiers
- Gestion sécurisée des données

## 📱 Responsive Design

- **Mobile** : Interface optimisée pour petits écrans
- **Tablette** : Adaptation des grilles et composants
- **Desktop** : Expérience complète avec toutes les fonctionnalités

## 🚀 Déploiement

Le projet est configuré pour être déployé sur :
- **Netlify** (recommandé)
- **Vercel**
- **Heroku**
- **VPS** classique

## 📞 Contact

Pour toute question ou support :
- **Email** : contact@sankofartresidence.com
- **Téléphone** : +225 27 22 49 28 90

## 📄 Licence

Ce projet est développé pour Sankofart Résidence. Tous droits réservés.

---

**Développé avec ❤️ pour votre confort**
