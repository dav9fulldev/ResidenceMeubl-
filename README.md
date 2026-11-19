# BABI RESIDENCE

*Réservez. Séjournez. Profitez.*

Plateforme de réservation de résidences meublées à Abidjan, **ouverte aux entreprises de gestion** : chaque gestionnaire crée le compte de son entreprise, publie ses résidences sur le site commun et gère ses réservations et ses paiements depuis son propre espace. Site vitrine, réservation en ligne, paiement de l'acompte et du solde (PI-SPI, GeniusPay), recherche intelligente par IA, à l'écrit comme à la voix.

| | |
|---|---|
| **Site** | React 19, React Router 7, Webpack 5 — déployé sur **Vercel** |
| **API** | Node.js, Express 4, MongoDB (driver officiel) — déployée sur **Render** |
| **Base de données** | MongoDB **Atlas** |
| **Paiements** | **PI-SPI** (BCEAO) et **GeniusPay** (Wave, Orange Money, MTN, Moov, carte) |
| **Emails** | API **Brevo** (SMTP Gmail en local) |
| **IA** | Voyage AI `voyage-4-lite` + reconnaissance vocale du navigateur |
| **Qualité et sécurité** | Tests automatisés, CodeQL, OWASP Dependency-Check, OWASP ZAP, Dependabot, Vercel Analytics |

Mise en ligne : voir [DEPLOIEMENT.md](DEPLOIEMENT.md).

---

## Fonctionnalités

### Pour les clients
- **Accueil** : recherche par dates, nombre de personnes et quartier ; résidences disponibles mises en avant.
- **Catalogue** filtré par la disponibilité réelle sur les dates choisies.
- **Recherche intelligente** : « une villa avec jardin pour une famille de 6, moins de 90 000 FCFA ». Les critères chiffrés sont compris, les résidences classées par pertinence (français et anglais). **Recherche vocale** par le bouton micro.
- **Fiche résidence** : mosaïque de photos et visionneuse, équipements avec icônes, carte de réservation avec dates et total, « Vous aimerez aussi ».
- **Réservation en 3 étapes** (séjour, coordonnées, vérification) avec récapitulatif : total, acompte, « 0 FCFA à payer maintenant ».
- **Paiement de l'acompte** après confirmation par l'équipe, au choix :
  - **Mobile Money ou carte** via GeniusPay (page de paiement sécurisée) ;
  - **application bancaire** via PI-SPI (QR code ou demande de paiement).
- **Solde du séjour** : en ligne depuis « Mes réservations » (mêmes moyens) ou sur place à l'arrivée ; rappel par email 3 jours avant l'arrivée.
- **Mes réservations, sans compte** (email + référence, ou lien reçu par email) : suivi, paiement, **demande d'annulation**, nettoyage de l'historique.
- **Remboursement de l'acompte par paliers** (réglables) : 100 % dans les 5 jours suivant le paiement, puis 50 %, rien à moins de 3 jours de l'arrivée.
- **Favoris** enregistrés dans le navigateur.

### Pour les entreprises de gestion (`/admin`)
- **Inscription** sur `/admin/inscription` (lien « Vous gérez des résidences ? Publiez-les » en pied de page) : nom de l'entreprise, gestionnaire, email, mot de passe.
- L'entreprise est **vérifiée par la plateforme** : en attendant, le gestionnaire prépare ses résidences, ses règles d'acompte et ses moyens de paiement ; rien n'est visible sur le site.
- Chaque entreprise ne voit **que ses données** : résidences, réservations, calendrier, statistiques, paramètres.
- **Paiements sur son propre compte** : l'entreprise saisit ses clés GeniusPay et/ou PI-SPI (chiffrées) et déclare ses propres adresses de webhook. Sans moyen actif, ses clients règlent sur place.
- Emails aux clients au nom de l'entreprise (les réponses lui parviennent) ; alertes à son adresse.
- Sur le site, chaque fiche indique « Proposé par … » et applique les règles d'acompte de l'entreprise.
- **Chaque résidence est vérifiée avant publication** (contre les fausses annonces) : photos de l'annonce téléversées, position GPS, justificatifs privés (pièce d'identité, droit d'exploiter le logement : titre, bail, mandat ou autorisation du propriétaire), photos prises sur place avec un code unique et géolocalisées. La plateforme vérifie, demande des compléments, refuse ou suspend. Changer l'adresse, les photos ou les justificatifs d'une résidence vérifiée la renvoie en vérification.

### Pour l'administrateur de la plateforme
Connexion avec les identifiants `ADMIN_USERNAME` / `ADMIN_PASSWORD`. Il gère les résidences de BABI RESIDENCE comme une entreprise, et dispose en plus de la page **Entreprises** : liste des inscriptions, **validation**, refus, suspension (le gestionnaire est prévenu par email). Et de la page **Vérifications** : dossiers des résidences à examiner (photos sur place avec distance à l'adresse déclarée, justificatifs, liste de points à contrôler), décisions, et **signalements** des visiteurs (« Signaler cette annonce » sur chaque fiche).

### Le back-office
Il n'est pas indexé par les moteurs de recherche ; on y accède par **`/admin`** ou par l'application **BABI Admin** installable (ordinateur et téléphone).

| Page | Contenu |
|---|---|
| Vue d'ensemble | Revenus du mois, taux d'occupation, éléments à traiter, acomptes encaissés, activité récente, revenus par mois, résidences les plus rentables |
| Réservations | Tableau filtrable, recherche, panneau de détail ; confirmer, refuser, traiter une annulation, relancer un remboursement, enregistrer un **solde reçu sur place** |
| Calendrier | Disponibilités de toutes les résidences jour par jour ; maintenance et durées de séjour |
| Résidences | Ajout, modification, suppression, maintenance en un clic |
| Statistiques | Chiffre d'affaires, cumul, occupation, panier moyen, classement ; **export Excel (CSV)** |
| Paramètres | Établissement, coordonnées et réseaux sociaux, règles d'acompte et de remboursement, email des alertes, **moyens de paiement** (clés et activation de PI-SPI et GeniusPay), mon compte (mot de passe) |
| Entreprises | *Plateforme uniquement* : inscriptions à valider, entreprises validées et suspendues |

Les statuts « Réservé » / « Occupé » des résidences se calculent automatiquement à partir des réservations confirmées.

### Sécurité et confidentialité
- Coordonnées des clients jamais exposées publiquement ; lecture d'une réservation réservée à l'admin.
- Jetons signés distincts pour le back-office (8 h) et les clients ; limitation des tentatives (connexion, inscription, accès client, paiement, réservation).
- Cloisonnement des entreprises : chaque requête du back-office est limitée aux données de l'entreprise du compte ; mots de passe hachés (scrypt) ; clés de paiement des entreprises chiffrées (AES-256-GCM), jamais réaffichées.
- Paiements validés uniquement après relecture auprès du prestataire ; webhooks signés (HMAC) et horodatés.
- Validation stricte des entrées, taille des requêtes limitée, en-têtes de sécurité et politique de contenu (CSP) sur le site et l'API.
- Statistiques de visite sans le back-office ni les paramètres d'adresse (les liens « Mes réservations » contiennent une clé d'accès personnelle).
- Identifiants et clés uniquement dans les variables d'environnement.

---

## Structure

```text
RESIDENCE/
├── .github/
│   ├── workflows/
│   │   ├── ci.yml                    # Tests de l'API + compilation du site
│   │   ├── codeql-analysis.yml       # Analyse du code (SAST)
│   │   ├── dependency-check.yml      # OWASP Dependency-Check (failles des dépendances)
│   │   └── zap-baseline.yml          # OWASP ZAP, analyse passive hebdomadaire de la production
│   ├── dependabot.yml                # Mises à jour automatiques des dépendances
│   └── dependency-check-suppressions.xml
├── .zap/rules.tsv                    # Faux positifs acceptés par ZAP
├── render.yaml                       # Configuration Render (API)
├── DEPLOIEMENT.md                    # Mise en ligne Render + Vercel
├── backend/                          # API Express → backend/README.md
└── client/                           # Site React → client/README.md
```

---

## Lancer le projet en local

Prérequis : **Node.js 20.19 ou plus récent**, un cluster MongoDB Atlas (gratuit) et votre IP autorisée dans *Atlas → Network Access*.

**1. API** (terminal 1)
```bash
cd backend
npm install
cp .env.example .env      # puis remplir les valeurs (voir backend/README.md)
npm run dev               # http://localhost:5001
```
Au premier démarrage, les 10 résidences du catalogue sont insérées dans la base. Pour tester les paiements sans prestataire : `PAIEMENT_MODE=simulation`.

**2. Site** (terminal 2)
```bash
cd client
npm install
cp .env.example .env      # REACT_APP_API_URL=http://localhost:5001/api
npm start                 # http://localhost:3001
```

**3. Tests**
```bash
cd backend && npm test    # MongoDB en mémoire, aucun appel aux prestataires
```

> **macOS et iCloud** : si le projet est dans `Documents` synchronisé avec iCloud, iCloud peut vider des fichiers de `node_modules` et bloquer Node. Supprimez `node_modules` puis relancez `npm install`.

---

## Contribuer

1. Partir de `main` à jour : `git checkout main && git pull`, puis créer une branche.
2. Ouvrir une PR vers `main` : les tests, la compilation, CodeQL et Dependency-Check s'exécutent.
3. **Ne fusionner que si toutes les vérifications sont au vert.** Une croix rouge sur « Backend - tests » ou « Frontend - build » signifie que le site ne fonctionnera plus.
4. PR de Dependabot : fusionner les mises à jour mineures au vert ; les versions majeures d'Express et de Babel sont ignorées (migrations à planifier).

---

## Documentation

- [DEPLOIEMENT.md](DEPLOIEMENT.md) — mise en ligne, prestataires de paiement, sécurité continue, dépannage
- [backend/README.md](backend/README.md) — variables d'environnement, routes de l'API, fonctionnement des paiements
- [client/README.md](client/README.md) — pages, charte graphique, fichiers clés
- [.github/SECURITY.md](.github/SECURITY.md) — signaler une faille de sécurité

---

Développé par David YAO.
