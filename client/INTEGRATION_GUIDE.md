# 🔗 Guide d'intégration Backend + Frontend

Ce guide vous explique comment basculer entre le mode **Local** (données en mémoire) et le mode **Backend API** (données depuis le serveur).

---

## 🎯 **Modes disponibles**

### **Mode 1 : Local (ACTUEL)**
- Données stockées dans `src/data/residences.js`
- Gestion d'état avec `ResidencesContext`
- Pas besoin du backend
- Données perdues au rechargement (sauf localStorage)

✅ **Utilise** : `src/context/ResidencesContext.js`

### **Mode 2 : Backend API (PRODUCTION)**
- Données depuis l'API backend
- Synchronisation en temps réel
- Persistance complète
- Envoi d'emails automatique

✅ **Utilise** : `src/context/ResidencesContextAPI.js`

---

## 🚀 **Comment basculer vers le mode Backend**

### **Étape 1 : Démarrer le Backend**

```bash
# Aller dans le dossier backend
cd ../SankofartRési_backend

# Installer les dépendances (si pas encore fait)
npm install

# Créer le fichier .env (voir ENV_SETUP.md)
# Copier le contenu depuis env.example

# Démarrer le serveur
npm start
```

Le backend sera disponible sur `http://localhost:5000`

### **Étape 2 : Modifier le Frontend**

Dans `src/App.js`, remplacer l'import :

```javascript
// ❌ Mode Local (ACTUEL)
import { ResidencesProvider } from './context/ResidencesContext';

// ✅ Mode Backend API (PRODUCTION)
import { ResidencesProvider } from './context/ResidencesContextAPI';
```

### **Étape 3 : Créer le fichier .env (Frontend)**

Créer un fichier `.env` à la racine du projet frontend :

```env
REACT_APP_API_URL=http://localhost:5000/api
```

### **Étape 4 : Redémarrer le Frontend**

```bash
# Arrêter le serveur (Ctrl+C)
# Redémarrer
npm start
```

---

## 📊 **Différences Backend vs Frontend**

### **Mapping des propriétés**

| Backend (API)        | Frontend           |
|---------------------|--------------------|
| `nom`               | `name`             |
| `typeAppartement`   | `type`             |
| `localisation`      | `location`         |
| `prix`              | `price`            |
| `nombreChambres`    | `bedrooms`         |
| `photos`            | `images`           |
| `equipements`       | `amenities`        |
| `availability`      | `availability`     |

Le Context API `ResidencesContextAPI` gère automatiquement cette conversion.

---

## 🔐 **Authentification Admin**

### **Mode Local**
- Username: `admin`
- Password: `sankofart2024`
- Stocké dans `localStorage`

### **Mode Backend**
- Username: `admin`
- Password: `sankofart2024`
- Token JWT stocké dans `localStorage`
- Endpoint: `POST /api/admin/login`

---

## 🛠️ **Endpoints API disponibles**

### **Résidences**
- `GET /api/residences` - Liste toutes les résidences
- `GET /api/residences/:id` - Détails d'une résidence
- `POST /api/residences/search` - Recherche avec filtres

### **Réservations**
- `POST /api/reservations` - Créer une réservation
- `GET /api/reservations/:id` - Détails d'une réservation
- `GET /api/reservations` - Liste toutes les réservations (admin)

### **Admin**
- `POST /api/admin/login` - Connexion admin
- `POST /api/admin/logout` - Déconnexion admin
- `GET /api/admin/stats` - Statistiques globales
- `PUT /api/admin/residences/:id/status` - Changer le statut
- `PUT /api/admin/residences/:id` - Mettre à jour une résidence
- `GET /api/admin/residences` - Toutes les résidences (y compris inactives)

### **Santé**
- `GET /health` - État de l'API

---

## 🧪 **Tester l'intégration**

### **1. Tester l'API (Backend seul)**

```bash
# Vérifier que l'API fonctionne
curl http://localhost:5000/health

# Obtenir les résidences
curl http://localhost:5000/api/residences

# Login admin
curl -X POST http://localhost:5000/api/admin/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"sankofart2024"}'
```

### **2. Tester l'intégration complète**

1. Démarrer le backend (`npm start` dans SankofartRési_backend)
2. Démarrer le frontend (`npm start` dans sankofart-residence-frontend)
3. Ouvrir `http://localhost:3000`
4. Se connecter en admin (lien en bas du footer)
5. Changer le statut d'une résidence
6. Vérifier que le changement apparaît sur la page d'accueil

---

## ⚠️ **Problèmes courants**

### **CORS Error**
**Problème** : `Access to fetch at 'http://localhost:5000/api/residences' from origin 'http://localhost:3000' has been blocked by CORS policy`

**Solution** : Le backend a déjà la configuration CORS. Vérifiez que le backend est bien démarré.

### **Les images ne s'affichent pas**
**Problème** : Les URLs d'images du backend pointent vers `http://localhost:3000/images/`

**Solution** : 
- En développement, les images sont servies par le frontend (dossier `public/images`)
- Le backend référence ces URLs pour que le frontend puisse les afficher
- En production, il faudra servir les images depuis un CDN ou le backend lui-même

### **Les données ne se synchronisent pas**
**Problème** : Les changements dans l'admin ne s'affichent pas

**Solution** : 
- Vérifiez que vous utilisez bien `ResidencesContextAPI` et pas `ResidencesContext`
- Vérifiez les logs de la console (F12)
- Rafraîchissez la page

---

## 📝 **Recommandations**

### **Pour le Développement Local**
✅ Utiliser le mode Local (`ResidencesContext`)
- Plus rapide
- Pas besoin du backend
- Parfait pour tester l'UI

### **Pour les Tests d'Intégration**
✅ Utiliser le mode Backend (`ResidencesContextAPI`)
- Tester les appels API
- Vérifier l'envoi d'emails
- Tester la synchronisation

### **Pour la Production**
✅ **OBLIGATOIRE** : Mode Backend (`ResidencesContextAPI`)
- Base de données persistante
- Emails de confirmation
- Gestion multi-utilisateurs
- Authentification JWT

---

## 🔄 **Migration Progressive**

Vous pouvez basculer entre les deux modes à tout moment :

1. **Développer une nouvelle feature** → Mode Local
2. **Tester l'intégration** → Mode Backend
3. **Déployer** → Mode Backend obligatoire

Le fichier `ResidencesContextAPI.js` a un fallback automatique : si le backend est inaccessible, il bascule sur les données locales.

---

## 💡 **Prochaines Étapes**

Pour une production complète, il faudrait :

1. **Base de données** : MySQL/PostgreSQL au lieu des données en mémoire
2. **JWT complet** : Remplacer l'authentification basique par des tokens JWT
3. **Upload d'images** : Permettre l'upload d'images via l'admin
4. **Logs** : Ajouter un système de logs complet
5. **Tests** : Tests unitaires et d'intégration
6. **Déploiement** : Backend sur Render/Railway, Frontend sur Vercel/Netlify

---

**Besoin d'aide ?** Consultez les fichiers :
- `src/config/api.js` - Configuration des endpoints
- `ENV_SETUP.md` - Configuration du backend
- `README.md` - Documentation du backend

