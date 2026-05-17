# 🚀 Guide de Déploiement - Sankofart Résidence API

## 📋 Prérequis

- Compte GitHub avec le code source
- Compte sur la plateforme de déploiement choisie
- Variables d'environnement configurées

## 🌐 Plateformes de Déploiement Recommandées

### 1. Render (Recommandé - Gratuit)

#### Configuration
1. **Connecter le repository GitHub**
2. **Configuration du build**
   ```bash
   Build Command: npm install
   Start Command: npm start
   ```

#### Variables d'environnement
```env
EMAIL_USER=votre_email@gmail.com
EMAIL_PASS=votre_app_password_gmail
FRONTEND_URL=https://sankofartresidence.com
NODE_ENV=production
```

#### Avantages
- ✅ Déploiement gratuit
- ✅ Déploiement automatique
- ✅ SSL automatique
- ✅ Facile à configurer

### 2. Railway

#### Configuration
1. **Connecter le repository GitHub**
2. **Variables d'environnement** : Même configuration que Render

#### Avantages
- ✅ Déploiement très rapide
- ✅ Intégration GitHub parfaite
- ✅ Monitoring intégré

### 3. Heroku

#### Configuration
1. **Installer Heroku CLI**
2. **Créer l'application**
   ```bash
   heroku create sankofart-residence-api
   ```

3. **Configurer les variables**
   ```bash
   heroku config:set EMAIL_USER=votre_email@gmail.com
   heroku config:set EMAIL_PASS=votre_app_password_gmail
   heroku config:set FRONTEND_URL=https://sankofartresidence.com
   heroku config:set NODE_ENV=production
   ```

4. **Déployer**
   ```bash
   git push heroku main
   ```

#### Avantages
- ✅ Plateforme robuste et stable
- ✅ Nombreux add-ons disponibles
- ✅ Documentation excellente

### 4. VPS (Contrôle Total)

#### Configuration
1. **Installer Node.js et PM2**
   ```bash
   curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
   sudo apt-get install -y nodejs
   sudo npm install -g pm2
   ```

2. **Cloner le projet**
   ```bash
   git clone <repository-url>
   cd sankofart-residence-backend
   npm install
   ```

3. **Configurer PM2**
   ```bash
   pm2 start server.js --name "sankofart-api"
   pm2 startup
   pm2 save
   ```

4. **Configurer Nginx (optionnel)**
   ```nginx
   server {
       listen 80;
       server_name api.sankofartresidence.com;
       
       location / {
           proxy_pass http://localhost:5000;
           proxy_http_version 1.1;
           proxy_set_header Upgrade $http_upgrade;
           proxy_set_header Connection 'upgrade';
           proxy_set_header Host $host;
           proxy_cache_bypass $http_upgrade;
       }
   }
   ```

#### Avantages
- ✅ Contrôle total
- ✅ Coût réduit sur le long terme
- ✅ Performance maximale

## 🔧 Configuration des Variables d'Environnement

### Variables Requises
```env
# Email Gmail
EMAIL_USER=votre_email@gmail.com
EMAIL_PASS=votre_app_password_gmail

# Configuration du serveur
PORT=5000
NODE_ENV=production

# CORS
FRONTEND_URL=https://sankofartresidence.com

# Sécurité (optionnel)
RECAPTCHA_SECRET_KEY=votre_cle_recaptcha
```

### Configuration Gmail
1. Aller dans les paramètres de votre compte Gmail
2. Activer l'authentification à 2 facteurs
3. Générer un "Mot de passe d'application"
4. Utiliser ce mot de passe dans `EMAIL_PASS`

## 📱 Configuration du Frontend

### Variables à configurer dans le frontend
```javascript
// .env du frontend
REACT_APP_API_URL=https://votre-api.herokuapp.com
REACT_APP_SITE_NAME=Sankofart Résidence
```

### Mise à jour des URLs
- Remplacer toutes les références à `localhost:5000`
- Utiliser la variable d'environnement `REACT_APP_API_URL`

## 🔒 Sécurité en Production

### 1. Rate Limiting
- ✅ Déjà configuré dans le code
- ✅ Limite globale : 100 requêtes/15min
- ✅ Limite réservations : 3/15min

### 2. CORS
- ✅ Configuré pour les origines autorisées
- ✅ Blocage des origines non autorisées

### 3. Validation
- ✅ Validation stricte des données
- ✅ Protection contre les injections

### 4. HTTPS
- ✅ Obligatoire en production
- ✅ SSL automatique sur la plupart des plateformes

## 📊 Monitoring et Logs

### 1. Logs d'Application
- ✅ Morgan pour les requêtes HTTP
- ✅ Logs d'erreur détaillés
- ✅ Timestamps automatiques

### 2. Monitoring
- ✅ Route `/health` pour vérifier l'état
- ✅ Métriques de base disponibles

### 3. Alertes
- ✅ Erreurs loggées automatiquement
- ✅ Notifications par email en cas d'échec

## 🧪 Tests Post-Déploiement

### 1. Vérifier la santé de l'API
```bash
curl https://votre-api.herokuapp.com/health
```

### 2. Tester les résidences
```bash
curl https://votre-api.herokuapp.com/api/residences
```

### 3. Tester une réservation
```bash
curl -X POST https://votre-api.herokuapp.com/api/reservations \
  -H "Content-Type: application/json" \
  -d '{
    "residenceId": 1,
    "nom": "Test",
    "prenom": "User",
    "email": "test@example.com",
    "telephone": "+225070123456",
    "dateArrivee": "2024-02-01",
    "dateDepart": "2024-02-05",
    "nombrePersonnes": 2
  }'
```

## 🚨 Dépannage

### Problèmes Courants

#### 1. Erreur de connexion email
- ✅ Vérifier `EMAIL_USER` et `EMAIL_PASS`
- ✅ Vérifier l'authentification à 2 facteurs Gmail
- ✅ Tester avec un email de test

#### 2. Erreurs CORS
- ✅ Vérifier `FRONTEND_URL`
- ✅ Ajouter l'URL du frontend dans les origines autorisées

#### 3. Erreurs de port
- ✅ Laisser la plateforme gérer le port automatiquement
- ✅ Ne pas définir `PORT` sauf si nécessaire

#### 4. Erreurs de build
- ✅ Vérifier que `package.json` est à jour
- ✅ Vérifier les dépendances

## 📈 Optimisations

### 1. Performance
- ✅ Compression des réponses
- ✅ Cache des données statiques
- ✅ Optimisation des requêtes

### 2. Scalabilité
- ✅ Architecture modulaire
- ✅ Services séparés
- ✅ Base de données prête pour l'avenir

### 3. Maintenance
- ✅ Logs structurés
- ✅ Gestion d'erreurs centralisée
- ✅ Documentation complète

## 🎯 Prochaines Étapes

### Phase 1 : Déploiement Backend ✅
- [x] API développée
- [x] Tests créés
- [x] Documentation complète

### Phase 2 : Déploiement Frontend
- [ ] Développer le frontend React
- [ ] Intégrer avec l'API
- [ ] Déployer sur Vercel/Netlify

### Phase 3 : Production
- [ ] Tests de charge
- [ ] Monitoring avancé
- [ ] Sauvegarde des données

---

**🚀 Votre API est prête pour le déploiement !**

Pour toute question, consultez le README principal ou créez une issue sur GitHub.
