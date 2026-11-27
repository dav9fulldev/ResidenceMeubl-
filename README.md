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

### Pour les voyageurs (utilisateurs de la plateforme, clients des partenaires)
- **Accueil** : recherche par dates, nombre de personnes et quartier ; résidences disponibles mises en avant.
- **Catalogue** filtré par la disponibilité réelle sur les dates choisies.
- **Recherche intelligente** : « une villa avec jardin pour une famille de 6, moins de 90 000 FCFA ». Les critères chiffrés sont compris, les résidences classées par pertinence (français et anglais). **Recherche vocale** par le bouton micro.
- **Fiche résidence** : mosaïque de photos et visionneuse, équipements avec icônes, carte de réservation avec dates et total, « Vous aimerez aussi ».
- **Réservation en 3 étapes** (séjour, coordonnées, vérification) avec récapitulatif : total, acompte, « 0 FCFA à payer maintenant ».
- **Paiement de l'acompte** après confirmation par l'équipe, au choix :
  - **Mobile Money ou carte** via GeniusPay (page de paiement sécurisée) ;
  - **application bancaire** via PI-SPI (QR code ou demande de paiement).
- **Solde du séjour** : en ligne depuis « Mes réservations » (mêmes moyens) ou sur place à l'arrivée ; rappel par email 3 jours avant l'arrivée.
- **Service client : un compte sans inscription.** La première réservation crée le compte du voyageur en arrière-plan. Le bouton « Suivre ma réservation » de ses emails lui fait choisir un mot de passe (nouveau + confirmation) ; ensuite il se connecte avec email + mot de passe, et la session reste ouverte 30 jours sur l'appareil (voir *Service client* plus bas).
- **Réservation pour une autre personne** : connecté, le voyageur retrouve ses coordonnées pré-remplies ; la case « Je réserve pour une autre personne » ajoute le nom et le téléphone de la personne qui séjourne. La réservation reste dans son espace.
- **Mes réservations** : suivi, paiement, **demande d'annulation**, nettoyage de l'historique. Aucun formulaire de connexion pour le public : le client y arrive par sa session ou par les liens de ses emails ; session expirée, il ne saisit que son mot de passe.
- **Notation des séjours (avis vérifiés)** : après son départ, le voyageur note la résidence (1 à 5 étoiles, propreté, conformité à l'annonce, accueil, rapport qualité-prix, commentaire). La fiche affiche la vraie moyenne et les avis ; un email l'invite à noter le lendemain du départ.
- **Remboursement de l'acompte par paliers** (réglables) : 100 % dans les 5 jours suivant le paiement, puis 50 %, rien à moins de 3 jours de l'arrivée.
- **Favoris** enregistrés dans le navigateur.

### Pour les entreprises de gestion (`/admin`)
- **Inscription** sur `/admin/inscription` (lien « Vous gérez des résidences ? Publiez-les » en pied de page) : nom de l'entreprise, gestionnaire, email, mot de passe.
- **Vérification de l'email** : après l'inscription, un **code à 6 chiffres** est envoyé par email (valable 15 minutes, 5 essais, un renvoi par minute et 5 par heure, seule son empreinte est stockée). Sans ce code, pas d'accès à l'espace partenaire ni de validation possible par la plateforme ; une connexion avant vérification renvoie un nouveau code. Les comptes créés avant cette étape restent utilisables.
- **Équipe (plusieurs comptes par entreprise)** : page « Équipe ». Le **propriétaire** invite ses collaborateurs par email (lien valable 7 jours, à usage unique, seule son empreinte est stockée) ; l'invité choisit son mot de passe sur `/admin/invitation` et arrive directement dans l'espace de l'entreprise. Deux rôles : **propriétaire** (tout, y compris l'équipe et le compte de reversement) et **gestionnaire** (résidences, réservations, calendrier, clients, avis, visibilité). Une entreprise garde toujours au moins un propriétaire ; un membre retiré perd l'accès immédiatement. Les invitations en attente ne reçoivent pas les emails de l'entreprise.
- L'entreprise est **vérifiée par la plateforme** : en attendant, le gestionnaire prépare ses résidences, ses règles d'acompte et ses moyens de paiement ; rien n'est visible sur le site.
- Chaque entreprise ne voit **que ses données** : résidences, réservations, calendrier, statistiques, paramètres.
- **Clients** : les voyageurs qui ont réservé ses résidences (séjours, montant, dernier et prochain séjour, coordonnées), construits à partir de ses seules réservations.
- **Mot de passe oublié** : lien « Mot de passe oublié ? » sur la page de connexion, lien de réinitialisation envoyé par email (voir *Mot de passe oublié* plus bas).
- **Paiements encaissés par la plateforme** : la part de l'entreprise (montant moins la commission de 8 %) lui est reversée 24 h après l'arrivée du client, sur le compte qu'elle déclare dans *Revenus* (vérifié par la plateforme).
- Emails aux clients au nom de l'entreprise (les réponses lui parviennent) ; alertes à son adresse.
- Sur le site, chaque fiche indique « Proposé par … » et applique les règles d'acompte de l'entreprise.
- **Chaque résidence est vérifiée avant publication** (contre les fausses annonces) : photos de l'annonce téléversées, position GPS, justificatifs privés (pièce d'identité, droit d'exploiter le logement : titre, bail, mandat ou autorisation du propriétaire), photos prises sur place avec un code unique et géolocalisées. La plateforme vérifie, demande des compléments, refuse ou suspend. Changer l'adresse, les photos ou les justificatifs d'une résidence vérifiée la renvoie en vérification.

### Pour l'administrateur de la plateforme
Connexion avec les identifiants `ADMIN_USERNAME` / `ADMIN_PASSWORD`. Il **ne gère pas de résidences** : son espace ne contient que la plateforme.

| Page | Contenu |
|---|---|
| Vue d'ensemble | Entreprises à valider, résidences à vérifier, signalements, réservations, encaissements et sommes à reverser |
| Entreprises | Inscriptions : validation, refus, suspension (le gestionnaire est prévenu par email) |
| Utilisateurs | Voyageurs inscrits automatiquement à leur première réservation : compte avec ou sans mot de passe, réservations |
| Avis | Notes des voyageurs sur toutes les résidences ; masquage motivé d'un avis abusif |
| Vérifications | Dossiers des résidences (photos sur place, distance GPS, justificatifs, points à contrôler), décisions, signalements des visiteurs |
| Finances | Encaissements, commissions, sommes dues, reversements manuels avec preuve, registre comptable, rapprochement |
| Paramètres | Identité du site, coordonnées et réseaux sociaux du pied de page, email des alertes, moyens de paiement |

Les résidences de BABI RESIDENCE elle-même sont gérées par l'entreprise interne **BABI RESIDENCE Gestion** (sans commission), avec son propre compte responsable : à créer une fois depuis la vue d'ensemble (« Créer le compte et transférer »).

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
- Cloisonnement des entreprises : chaque requête du back-office est limitée aux données de l'entreprise du compte ; mots de passe hachés (scrypt) ; encaissement centralisé avec registre financier immuable (voir docs/finance).
- Paiements validés uniquement après relecture auprès du prestataire ; webhooks signés (HMAC) et horodatés.
- Validation stricte des entrées, taille des requêtes limitée, en-têtes de sécurité et politique de contenu (CSP) sur le site et l'API.
- Statistiques de visite sans le back-office ni les paramètres d'adresse (les liens « Mes réservations » contiennent une clé d'accès personnelle).
- Identifiants et clés uniquement dans les variables d'environnement.

### Service client (comptes des utilisateurs)

> **Vocabulaire.** Les **clients** de BABI RESIDENCE sont les **partenaires** (entreprises qui publient leurs résidences). Les voyageurs qui réservent sont des **utilisateurs** de la plateforme, et les **clients des partenaires**. « Service client » est le nom du module qui gère leurs comptes.

```
Visiteur          Site                                   API                                       MongoDB
────────          ────                                   ───                                       ───────
navigue      ──►  pages publiques (aucune connexion)
réserve      ──►  /reservation                     ──►   POST /api/reservations             ──►   clients : compte créé
                                                         compte connecté ? il réserve               « sans_mot_de_passe »
                                                         sinon coordonnées saisies                 reservations : clientId,
                                                         ◄── accès à cette seule réservation         voyageur (si autrui)
email        ◄──  « Suivre ma réservation »              lien ?mdp=… (jeton signé, 7 jours)
clique       ──►  /mes-reservations?mdp=…          ──►   POST /api/client/mot-de-passe      ──►   statut « actif »,
                  nouveau + confirmation                 ◄── session 30 jours                       motDePasseLe = maintenant
revient      ──►  /mes-reservations                ──►   POST /api/client/connexion
                  ou /reservation (pré-rempli)           GET  /api/client/moi
```

| Fichier | Rôle |
|---|---|
| `backend/services/ClientService.js` | Comptes : création en arrière-plan, liens, mot de passe, connexion, liste pour la plateforme |
| `backend/routes/client.js` | `/connexion`, `/mot-de-passe`, `/mot-de-passe/lien`, `/moi`, réservations du client |
| `backend/routes/reservations.js` | Réservation par le compte connecté ou création du compte ; voyageur différent |
| `backend/middleware/requireClient.js` | Session de compte (fermée si le mot de passe change) ou accès à une réservation |
| `client/src/pages/MesReservations.js` | Aucun formulaire pour le public : réservations si session ; choix du mot de passe (lien `?mdp=`) ; mot de passe seul si l'email est connu (appareil ou lien `#email=`) ; sinon invitation à découvrir les résidences |
| `client/src/pages/Reservation.js` | Pré-remplissage si connecté, « Je réserve pour une autre personne » |
| `client/src/pages/AdminClientsPage.js` | Partenaire : ses **clients** (voyageurs ayant réservé ses résidences) ; `GET /api/admin/clients`, refusé à la plateforme |
| `client/src/pages/AdminUtilisateursPage.js` | Super admin : liste des **utilisateurs** (les voyageurs ; clients des partenaires), statut du compte, nombre de réservations |

Règles :
1. **Le mot de passe ne se choisit que depuis un lien reçu par email** : connaître l'email de quelqu'un ne suffit pas pour s'approprier son compte.
2. **Un lien ne sert plus dès que le mot de passe a changé** : le jeton porte sa date de création, rien n'est stocké.
3. **Aucun pré-remplissage à partir d'un email** : seulement pour le compte connecté sur l'appareil.
4. **Réserver avec l'email d'un compte ne connecte personne** : la réservation est rattachée au compte, dont les coordonnées ne changent pas ; la personne n'accède qu'à cette réservation.
5. **Même réponse que le compte existe ou non** pour les demandes de lien ; tentatives limitées (10 par 15 minutes).
6. **Changer de mot de passe ferme les sessions ouvertes avant.**
7. **Rien de visible pour le public** : « Mes réservations » n'apparaît dans le menu et le pied de page que sur l'appareil d'un client qui a une session (après une réservation, une connexion ou le lien d'un email). La page reste accessible par ces liens.

### Service de notation (avis des voyageurs)

```
Séjour terminé ──► email « Comment s'est passé votre séjour ? » (tâche horaire, une fois, jusqu'à 7 jours après le départ)
               ──► Mes réservations : « Noter mon séjour » ──► POST /api/client/reservations/:id/avis ──► collection avis
Fiche résidence ◄── GET /api/residences/:id/avis (moyenne, critères, avis visibles, réponses)
Partenaire     ──► Avis : réponse publique      PUT /api/admin/avis/:id/reponse
Super admin    ──► Avis : masquer (motif)       PUT /api/admin/avis/:id/masquage
```

| Règle | Détail |
|---|---|
| Avis vérifiés | Seule une réservation **confirmée**, au **séjour terminé**, peut être notée, par la personne qui y a accès (compte ou référence) |
| Une fois | Un avis par réservation (index unique), non modifiable |
| Délai | Jusqu'à 90 jours après le départ |
| Contenu | Note globale et 4 critères de 1 à 5 ; commentaire facultatif (1000 caractères) |
| Confidentialité | Affiché sous « Prénom I. » ; jamais l'email ni le nom complet |
| Moyenne | Calculée sur les avis visibles ; une résidence sans avis n'affiche pas de note |
| Modération | Le partenaire répond (réponse publique, modifiable) ; le super admin masque un avis abusif avec un motif, l'avis reste en base |

Fichiers : `backend/services/AvisService.js`, `client/src/components/Avis.js`, `client/src/pages/AdminAvisPage.js`.

**Comparateur : les partenaires les mieux notés d'abord.**
- **Note d'un partenaire** = moyenne des avis visibles sur toutes ses résidences (`AvisService.parEntreprise`).
- **Score de recommandation** d'une résidence = 60 % sa note + 40 % la note de son partenaire, chacune en *moyenne bayésienne* : `(3 × 4 + n × moyenne) / (3 + n)`. Avec peu d'avis, le score reste proche de 4 (neutre) : un seul 5/5 ne dépasse pas 40 avis à 4,7, et une résidence sans avis n'est ni pénalisée ni favorisée.
- Le **catalogue** (`GET /api/residences`) est trié par ce score ; l'accueil met en avant les résidences disponibles dans cet ordre.
- **« Partenaire recommandé »** (badge sur les cartes et la fiche) : au moins 5 avis et 4,5 de moyenne.
- **Plateforme** : la page *Avis* classe les partenaires en cartes (rang, moyenne, nombre d'avis et de résidences notées, critères) ; *Entreprises* affiche la note de chacun.
- **Booster de visibilité** (parcours inspiré du « Booster la publication » de Facebook) : le partenaire crée une campagne en étapes : **résidence** → **objectif** (plus de visites de la fiche, ou plus de réservations) → **audience** (tout le site, ou seulement les voyageurs qui cherchent dans le quartier / la ville de la résidence) → **budget par jour** (bornes réglées par la plateforme, par pas de 500 FCFA) et **durée** (3, 7, 14 ou 30 jours), avec une **estimation des affichages et des visites** → récapitulatif et **aperçu de l'annonce** → paiement (**GeniusPay** : Mobile Money ou carte, activation automatique et écriture `FONDS_PRESTATAIRE` → `REVENU_VISIBILITE` ; ou virement / espèces activé par le super admin). Bonus de classement de **+0,3 à +0,8** selon le budget (refusé sous une note pondérée de 3), mention **« Sponsorisé »** là où le booster s'applique. **Résultats** par booster : affichages (comptés quand une annonce est visible à l'écran), visites de la fiche, taux de clic, réservations et coût par résultat ; **« Prolonger »** enchaîne un nouveau booster à la fin du précédent (statut « Programmé » jusqu'à son début). **Emails automatiques** aux comptes actifs de l'entreprise : **reçu** à l'activation (aussi imprimable depuis la page Visibilité, bouton « Reçu »), **rappel 2 jours avant la fin** (1 jour pour un booster de 3 jours) avec les résultats et un lien « Prolonger », sauf si une prolongation est déjà programmée, puis **bilan** à la fin de la campagne ; chaque email part une seule fois, et un envoi en échec est réessayé l'heure suivante. `backend/services/BoosterService.js`, `client/src/utils/booster.js`, `client/src/utils/statistiques.js`.

### Mot de passe oublié (partenaires)

```
Partenaire             Site (React)                       API (Express)                               MongoDB
──────────             ────────────                       ─────────────                               ───────
« Mot de passe   ──►  /admin/mot-de-passe          ──►  POST /api/entreprises/mot-de-passe/oubli  ──►  utilisateurs.reinitialisation
  oublié ? »          (saisie de l'email)               jeton aléatoire 32 octets                      { empreinte SHA-256, expireLe +1 h }
                                                         réponse identique, compte connu ou non
                                                                │
Email reçu  ◄──────────────────────────────────────────  EmailService.sendReinitialisationMotDePasse
(lien ?jeton=…)

Clique le lien   ──►  /admin/mot-de-passe?jeton=…  ──►  POST /api/entreprises/                  ──►  en une seule opération :
                      (nouveau mot de passe)            mot-de-passe/reinitialisation                 nouveau mot de passe (scrypt),
                                                                                                      sessionsInvalideesLe = maintenant,
                                                                                                      jeton supprimé

Ancienne session ──►  page du back-office      ──►  requireAdmin : iat du jeton < sessionsInvalideesLe → 401
```

| Couche | Fichier | Rôle |
|---|---|---|
| Page | `client/src/pages/AdminMotDePasse.js` | Sans jeton : demande de l'email ; avec `?jeton=` : choix du nouveau mot de passe |
| Page | `client/src/pages/AdminLogin.js` | Lien « Mot de passe oublié ? » |
| Routes | `backend/routes/entreprises.js` | `/mot-de-passe/oubli` et `/mot-de-passe/reinitialisation` (publiques, 5 demandes / 15 min) |
| Logique | `backend/services/EntrepriseService.js` | `demanderReinitialisation()` et `reinitialiserMotDePasse()` |
| Email | `backend/services/EmailService.js` | `sendReinitialisationMotDePasse()` au nom de BABI RESIDENCE |
| Sessions | `backend/services/AuthService.js`, `backend/middleware/requireAdmin.js` | Date de création (`iat`) dans le jeton ; sessions ouvertes avant la réinitialisation refusées |

Protections :
1. **Aucun compte révélé** : même réponse que l'email existe ou non.
2. **Jeton jamais stocké en clair** : seule son empreinte SHA-256 est en base ; une fuite de la base est inutile.
3. **Valable 1 heure.**
4. **Usage unique** : le jeton est supprimé dans la même opération que le changement de mot de passe.
5. **Sessions fermées** : les sessions ouvertes avant la réinitialisation ne valent plus rien (un voleur d'accès est déconnecté).
6. **Demandes limitées** : 5 par 15 minutes et par visiteur (pas d'envoi d'emails en masse ni d'essais de jetons).

Le super-administrateur n'est pas concerné : son mot de passe est la variable `ADMIN_PASSWORD` sur Render.

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
- [docs/finance/](docs/finance/README.md) — module financier : encaissement, commission, reversements, registre
- [.github/SECURITY.md](.github/SECURITY.md) — signaler une faille de sécurité

---

Développé par David YAO.
