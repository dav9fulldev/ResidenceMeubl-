# 🏠 Sankofart Résidence — Frontend

Site React de Sankofart Résidence : vitrine, recherche intelligente (texte et voix), réservation et espace d'administration. Charte graphique : blanc, noir et doré `#d4af37`.

Déploiement : voir [../DEPLOIEMENT.md](../DEPLOIEMENT.md) (Vercel).

---

## ⚙️ Configuration

Copier [`.env.example`](.env.example) en `.env` :

```env
REACT_APP_API_URL=http://localhost:5001/api
```

La variable est intégrée **au moment du build** par Webpack : après l'avoir modifiée sur Vercel, il faut redéployer.

```bash
npm install
npm start          # http://localhost:3001 (autre port : PORT=3002 npm start)
npm run build      # production → dist/
```

---

## 🧭 Pages

| Route | Page |
|---|---|
| `/` | Accueil (vidéo d'ambiance, résidences mises en avant) |
| `/residences` | Catalogue, filtres classiques et **recherche intelligente** (texte + micro) |
| `/residence/:id` | Fiche : galerie, statut, équipements, « Vous aimerez aussi » |
| `/reservation?residence=:id` | Formulaire de réservation |
| `/favorites` | Favoris (enregistrés dans le navigateur) |
| `/admin/login` → `/admin/dashboard` | Espace admin : réservations (confirmer / annuler) et gestion des résidences |

---

## 🧩 Fichiers clés

```text
client/
├── vercel.json                     # Build Vercel + redirection des routes vers index.html
├── webpack.config.js               # Lit .env, injecte REACT_APP_API_URL, copie public/ au build
└── src/
    ├── config/
    │   ├── api.js                  # Adresses de l'API, requêtes, jeton admin (sessionStorage)
    │   └── mappers.js              # Conversion format API (français) ↔ composants
    ├── context/
    │   ├── ResidencesContext.js    # Données, réservation, recherche IA, actions admin
    │   └── FavoritesContext.js
    ├── hooks/useVoiceInput.js      # Dictée vocale (Web Speech API)
    ├── components/
    │   ├── SmartSearch.js          # Recherche intelligente + micro
    │   ├── SimilarResidences.js    # « Vous aimerez aussi »
    │   ├── AvailabilityStatus.js   # Statut d'une résidence (sans nom d'occupant)
    │   ├── AdminReservations.js    # Réservations dans le tableau de bord
    │   └── AdminPanel.js           # Gestion des résidences
    ├── pages/                      # Home, Residences, ResidenceDetail, Reservation, Favorites, Admin…
    └── data/residences.js          # Catalogue de secours si l'API est injoignable
```

---

## 🔌 Comportement si l'API est injoignable

Le site affiche le catalogue de secours (`src/data/residences.js`) en lecture seule : la navigation reste possible, mais la réservation, la recherche intelligente et l'administration sont désactivées avec un message explicite. Sur Render (offre gratuite), cela peut arriver pendant les 30 à 60 secondes de réveil du serveur.

---

## 🎙️ Recherche vocale

Le bouton micro utilise la reconnaissance vocale du navigateur (gratuite, sans clé) :
- disponible sur Chrome, Edge et Safari ; masqué automatiquement ailleurs (Firefox) ;
- nécessite **HTTPS** en ligne (fourni par Vercel) ; `localhost` est autorisé en développement ;
- sur Chrome, la voix est transcrite par les serveurs de Google (indiqué dans l'infobulle du bouton).
