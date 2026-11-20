# BABI RESIDENCE — Site

Site React : vitrine, recherche (dates, texte, voix), réservation, paiement en ligne, espace client et back-office installable.

Déploiement : voir [../DEPLOIEMENT.md](../DEPLOIEMENT.md) (Vercel).

---

## Configuration

```env
REACT_APP_API_URL=http://localhost:5001/api
```

Intégrée **au moment du build** : après modification sur Vercel, redéployer.

```bash
npm install
npm start          # http://localhost:3001
npm run build      # production → dist/
```

---

## Charte graphique

Définie par des variables CSS dans [`src/App.css`](src/App.css), en mode clair et sombre :

| Rôle | Couleur |
|---|---|
| Fond ivoire | `#F7F5F0` |
| Bleu nuit (boutons, menu du back-office, logo) | `#12284C` |
| Or (accents, logo) | `#E0A526` |
| Texte | `#343A40` |

Polices : *Playfair Display* pour les titres du site, *Inter* pour le texte, le logo et tout le back-office.

Logo : composant [`LogoBabi`](src/components/LogoBabi.js) (le bleu nuit suit le mode sombre), fichiers `public/images/logo-babi.svg` et `logo-babi-clair.svg`, icônes dans `public/icons/`. Vidéo d'accueil : `public/videos/hero-desktop.mp4` et `hero-mobile.mp4`.

---

## Pages

| Route | Page |
|---|---|
| `/` | Accueil : recherche par dates / personnes / quartier, résidences disponibles |
| `/residences` | Catalogue, filtres, recherche intelligente (texte + micro) ; filtré par disponibilité si des dates sont choisies |
| `/residence/:id` | Fiche : mosaïque et visionneuse, équipements, réservation avec dates |
| `/reservation?residence=:id` | Réservation en 3 étapes avec récapitulatif |
| `/mes-reservations` | Espace client : suivi, paiement de l'acompte et du solde, annulation |
| `/favorites` | Favoris (navigateur) |
| `/devenir-partenaire` | Page des partenaires (bouton « Devenir partenaire » de l'en-tête) : créer un compte ou accéder à l'espace partenaire |
| `/admin/inscription` | Création du compte d'une entreprise de gestion (validée ensuite par la plateforme) |
| `/admin/*` | Back-office de l'entreprise connectée : vue d'ensemble, réservations, calendrier, résidences, statistiques, paramètres ; **entreprises** pour l'administrateur de la plateforme |
| autre | Page 404 |

Les pages sont **chargées à la demande** : l'accueil ne télécharge ni le back-office ni le paiement.

---

## Fichiers clés

```text
client/
├── vercel.json                   # Build, navigation et en-têtes de sécurité (CSP)
├── webpack.config.js             # Injecte REACT_APP_API_URL, découpe le code par page
├── public/
│   ├── init.js                   # Thème et manifeste avant affichage (pas de script inline : CSP)
│   ├── images/paiement/          # Logos PI-SPI et GeniusPay
│   └── admin/                    # Manifeste et service worker de l'application BABI Admin
└── src/
    ├── App.js                    # Routes, chargement à la demande, Vercel Analytics (filtré)
    ├── config/api.js             # Adresses de l'API et requêtes
    ├── context/ResidencesContext.js  # Catalogue public sur le site, résidences de l'entreprise dans le back-office
    ├── context/CompteContext.js      # Compte connecté et son entreprise (statut, droits)
    ├── hooks/                    # useEtablissement, useVoiceInput, useTheme, useAdminReservations…
    ├── components/
    │   ├── ResidenceCard.js      # Carte de résidence commune
    │   ├── PaiementAcompte.js    # Paiement de l'acompte ou du solde (GeniusPay, PI-SPI)
    │   ├── SmartSearch.js        # Recherche intelligente + micro
    │   ├── ErrorBoundary.js      # Message au lieu d'une page blanche
    │   └── admin/                # AdminLayout, MoyensPaiement, graphiques
    └── pages/                    # Home, Residences, ResidenceDetail, Reservation, MesReservations, Admin…
```

---

## À savoir

- **Statistiques de visite** (Vercel Analytics) : le back-office n'est jamais compté et les paramètres d'adresse sont retirés (les liens « Mes réservations » contiennent la clé d'accès du client).
- **API injoignable** : le site affiche un catalogue de secours en lecture seule ; réservation, paiement et back-office sont désactivés avec un message.
- **Recherche vocale** : Chrome, Edge et Safari, en HTTPS ; masquée ailleurs.
- **CSP** : tout script ou appel réseau vers une autre adresse est bloqué. Ajouter un service externe demande de mettre à jour `vercel.json`.
