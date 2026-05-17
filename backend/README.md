# 🏠 Sankofart Résidence - API Backend

## 📋 Description

API backend pour le site de réservation de Sankofart Résidence. Cette API permet de gérer les résidences, les réservations et l'envoi automatique d'emails.

## 🚀 Fonctionnalités

### ✅ Résidences
- Liste des résidences disponibles
- Détails complets d'une résidence
- Recherche et filtres avancés
- Vérification de disponibilité

### ✅ Réservations
- Création de réservations
- Validation des données
- Calcul automatique des prix
- Gestion des statuts

### ✅ Emails
- Envoi automatique à l'administrateur
- Confirmation au client
- Templates HTML professionnels

### ✅ Sécurité
- Rate limiting anti-spam
- Validation des données
- CORS configuré
- Gestion des erreurs

## 🛠️ Technologies

- **Node.js** - Runtime JavaScript
- **Express.js** - Framework web
- **Nodemailer** - Envoi d'emails
- **Morgan** - Logging des requêtes
- **Express Rate Limit** - Protection anti-spam

## 📦 Installation

### 1. Cloner le projet
```bash
git clone <repository-url>
cd sankofart-residence-backend
```

### 2. Installer les dépendances
```bash
npm install
```

### 3. Configuration des variables d'environnement
Créer un fichier `.env` à la racine du projet :

```env
# Configuration Email Gmail
EMAIL_USER=votre_email@gmail.com
EMAIL_PASS=votre_app_password_gmail

# Configuration du serveur
PORT=5000

# Configuration CORS (URL du frontend)
FRONTEND_URL=https://sankofartresidence.com

# Configuration reCAPTCHA (optionnel)
RECAPTCHA_SECRET_KEY=votre_cle_secrete_recaptcha
```

### 4. Configuration Gmail
1. Aller dans les paramètres de votre compte Gmail
2. Activer l'authentification à 2 facteurs
3. Générer un "Mot de passe d'application"
4. Utiliser ce mot de passe dans `EMAIL_PASS`

### 5. Démarrer le serveur
```bash
# Mode développement
npm run dev

# Mode production
npm start
```

## 📚 API Endpoints

### 🏠 Résidences

#### GET `/api/residences`
Récupérer toutes les résidences
```json
{
  "success": true,
  "data": [...],
  "total": 4
}
```

#### GET `/api/residences/:id`
Récupérer une résidence par ID
```json
{
  "success": true,
  "data": {
    "id": 1,
    "nom": "Appartement Luxe Cocody",
    "reference": "ALC001",
    "localisation": "Cocody, Abidjan",
    "prix": 45000,
    "nombreChambres": 2,
    "photos": [...],
    "equipements": [...],
    "amenities": [...]
  }
}
```

#### POST `/api/residences/search`
Rechercher des résidences avec filtres
```json
{
  "recherche": "Cocody",
  "prixMin": 30000,
  "prixMax": 50000,
  "nombreChambres": 2,
  "typeAppartement": "Appartement"
}
```

#### GET `/api/residences/types`
Obtenir tous les types d'appartements

#### GET `/api/residences/villes`
Obtenir toutes les villes disponibles

#### GET `/api/residences/quartiers/:ville`
Obtenir les quartiers d'une ville

#### POST `/api/residences/check-disponibilite`
Vérifier la disponibilité d'une résidence
```json
{
  "residenceId": 1,
  "dateArrivee": "2024-01-15",
  "dateDepart": "2024-01-20"
}
```

### 📅 Réservations

#### POST `/api/reservations`
Créer une nouvelle réservation
```json
{
  "residenceId": 1,
  "nom": "Dupont",
  "prenom": "Jean",
  "email": "jean.dupont@email.com",
  "telephone": "+225070123456",
  "dateArrivee": "2024-01-15",
  "dateDepart": "2024-01-20",
  "nombrePersonnes": 2,
  "notes": "Arrivée en soirée"
}
```

#### GET `/api/reservations/:id`
Récupérer une réservation par ID

#### GET `/api/reservations`
Récupérer toutes les réservations (admin)

#### PUT `/api/reservations/:id/status`
Mettre à jour le statut d'une réservation
```json
{
  "statut": "confirmee"
}
```

#### GET `/api/reservations/stats`
Obtenir les statistiques des réservations

#### POST `/api/reservations/check-disponibilite`
Vérifier la disponibilité (même endpoint que résidences)

### 🏥 Santé

#### GET `/health`
Vérifier l'état de l'API
```json
{
  "success": true,
  "message": "Sankofart Résidence API - Opérationnel",
  "timestamp": "2024-01-01T00:00:00.000Z",
  "version": "1.0.0"
}
```

## 🔒 Sécurité

### Rate Limiting
- **Global** : 100 requêtes par IP toutes les 15 minutes
- **Réservations** : 3 réservations par IP toutes les 15 minutes

### CORS
- Origines autorisées configurées
- Support des credentials
- Blocage des origines non autorisées

### Validation
- Validation stricte des données de réservation
- Vérification des champs obligatoires
- Validation des formats (email, dates)

## 📧 Configuration Email

### Templates
- **Email Admin** : Notification détaillée avec toutes les informations
- **Email Client** : Confirmation avec récapitulatif de la réservation

### Format
- HTML responsive
- Design professionnel
- Informations structurées
- Photos de la résidence

## 🚀 Déploiement

### Variables d'environnement requises
- `EMAIL_USER` : Email Gmail
- `EMAIL_PASS` : App Password Gmail
- `PORT` : Port du serveur (optionnel)
- `FRONTEND_URL` : URL du frontend

### Plateformes recommandées
- **Render** : Déploiement gratuit et simple
- **Railway** : Déploiement automatique
- **Heroku** : Plateforme robuste
- **VPS** : Contrôle total

## 🧪 Tests

### Tester l'API
```bash
# Vérifier la santé de l'API
curl http://localhost:5000/health

# Lister les résidences
curl http://localhost:5000/api/residences

# Tester la recherche
curl -X POST http://localhost:5000/api/residences/search \
  -H "Content-Type: application/json" \
  -d '{"recherche": "Cocody"}'
```

### Tester les emails
1. Configurer les variables d'environnement
2. Créer une réservation de test
3. Vérifier la réception des emails

## 📝 Structure du Projet

```
sankofart-residence-backend/
├── models/                 # Modèles de données
│   ├── Residence.js       # Modèle résidence
│   └── Reservation.js     # Modèle réservation
├── services/              # Services métier
│   ├── ResidenceService.js    # Gestion des résidences
│   ├── ReservationService.js  # Gestion des réservations
│   └── EmailService.js        # Envoi d'emails
├── routes/                # Routes de l'API
│   ├── residences.js      # Routes résidences
│   └── reservations.js    # Routes réservations
├── server.js              # Serveur principal
├── package.json           # Dépendances
├── env.example            # Variables d'environnement
└── README.md              # Documentation
```

## 🔧 Développement

### Scripts disponibles
```bash
npm start          # Démarrer en production
npm run dev        # Démarrer en développement (nodemon)
npm test           # Lancer les tests
```

### Ajouter une nouvelle résidence
Modifier le fichier `services/ResidenceService.js` et ajouter dans le tableau `residences`.

### Personnaliser les emails
Modifier les méthodes `generateAdminEmailHTML` et `generateClientEmailHTML` dans `services/EmailService.js`.

## 📞 Support

Pour toute question ou problème :
- **Email** : [votre-email@domain.com]
- **Documentation** : Consultez ce README
- **Issues** : Créez une issue sur le repository

## 📄 Licence

Ce projet est sous licence ISC.

---

**Développé avec ❤️ pour Sankofart Résidence**
