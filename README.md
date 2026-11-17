# 🏠 Sankofart Résidence

Plateforme de réservation de résidences meublées à Abidjan : site vitrine, réservation en ligne, espace d'administration et **recherche intelligente par IA, à l'écrit comme à la voix**.

| | |
|---|---|
| **Frontend** | React 19, Webpack, React Router, React Hook Form — déployé sur **Vercel** |
| **Backend** | Node.js, Express, MongoDB (driver officiel), Nodemailer — déployé sur **Render** |
| **Base de données** | MongoDB **Atlas** |
| **IA** | Voyage AI `voyage-4-lite` (via Atlas AI Model APIs) + reconnaissance vocale du navigateur |
| **Qualité** | Tests automatisés (`node:test` + MongoDB en mémoire), CI GitHub Actions, analyse CodeQL |

👉 **Mise en ligne : voir [DEPLOIEMENT.md](DEPLOIEMENT.md).**

---

## ✨ Fonctionnalités

### Pour les clients
- **Catalogue** de résidences avec photos, équipements, statut en temps réel (disponible, réservé, occupé, maintenance).
- **Recherche intelligente** : « une villa avec jardin pour une famille de 6, moins de 90 000 FCFA ». Le site comprend les critères chiffrés (personnes, chambres, budget) et classe les résidences par pertinence. Fonctionne en français et en anglais.
- **Recherche vocale** : bouton micro, le texte s'écrit en direct et la recherche se lance à la fin de la phrase (Chrome, Edge, Safari).
- **« Vous aimerez aussi »** : 3 résidences comparables sur chaque fiche.
- **Réservation en ligne** : contrôle des dates déjà prises, de la capacité et de la durée de séjour ; référence et montant affichés ; email d'accusé de réception.
- **Mes réservations, sans compte** : avec l'email et la référence, ou via un lien reçu par email, le client voit l'historique de ses réservations et peut **demander une annulation**.
- **Favoris** enregistrés dans le navigateur.

### Pour l'administrateur (`/admin`)
Le back-office n'est lié nulle part sur le site public : on y accède par l'adresse **`/admin`** (à mettre en favori) ou par l'application **Sankofart Admin** installée sur ordinateur / téléphone. Les pages `/admin` ne sont pas indexées par les moteurs de recherche.

- Connexion vérifiée par le serveur (jeton signé valable 8 h, tentatives limitées).
- **Réservations** : liste filtrable, confirmation ou annulation → email automatique au client.
- **Statistiques** : chiffre d'affaires de l'année et du mois (avec évolution), revenus par mois, chiffre d'affaires cumulé, réservations par mois, taux d'occupation, panier moyen, classement des résidences ; **export Excel (CSV)**.
- **Demandes d'annulation** des clients : acceptation (dates libérées) ou refus avec message, email au client dans les deux cas.
- **Résidences** : ajout, modification, suppression, mise en maintenance.
- Le statut « Réservé » / « Occupé » se met à jour **automatiquement** à partir des réservations confirmées.

### Sécurité et confidentialité
- Le nom des clients n'est **jamais** visible côté public (filtré par le serveur).
- Identifiants et clés uniquement dans les variables d'environnement, jamais dans le code.
- Limitation des requêtes (anti-spam, anti force brute, protection du quota IA), CORS restreint, échappement HTML des emails.

---

## 📁 Structure

```text
RESIDENCE/
├── .github/workflows/
│   ├── ci.yml                  # Tests backend + build frontend à chaque push
│   └── codeql-analysis.yml     # Analyse de sécurité
├── render.yaml                 # Configuration Render (backend)
├── DEPLOIEMENT.md              # Guide de mise en ligne Render + Vercel
├── backend/                    # API Express → voir backend/README.md
└── client/                     # Site React → voir client/README.md
```

---

## 🚀 Lancer le projet en local

Prérequis : **Node.js 20.19 ou plus récent**, un cluster MongoDB Atlas (gratuit) et votre IP autorisée dans *Atlas → Network Access*.

**1. Backend** (terminal 1)
```bash
cd backend
npm install
cp .env.example .env      # puis remplir les valeurs (voir backend/README.md)
npm run dev               # http://localhost:5001
```
Au premier démarrage, les 10 résidences du catalogue sont insérées dans la base.

**2. Frontend** (terminal 2)
```bash
cd client
npm install
cp .env.example .env      # REACT_APP_API_URL=http://localhost:5001/api
npm start                 # http://localhost:3001
```

**3. Tests**
```bash
cd backend && npm test
```

> 💡 **macOS + iCloud** : si le projet est dans `Documents` synchronisé avec iCloud, iCloud peut vider des fichiers de `node_modules` et bloquer Node. Supprimez `node_modules` puis relancez `npm install`, ou déplacez le projet hors de `Documents`.

---

## 📚 Documentation

- [DEPLOIEMENT.md](DEPLOIEMENT.md) — mise en ligne Render + Vercel, conseils de démo, dépannage
- [backend/README.md](backend/README.md) — variables d'environnement, routes de l'API, architecture
- [client/README.md](client/README.md) — structure du frontend, configuration, composants clés

---

**Développé par David YAO.**
