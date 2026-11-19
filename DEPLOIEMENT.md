# Déploiement : API sur Render, site sur Vercel

```
Navigateur ──► Vercel (site React) ──► Render (API Express) ──► MongoDB Atlas
                                              ├──► Brevo (emails)
                                              ├──► PI-SPI / BCEAO (acompte, solde, remboursements)
                                              ├──► GeniusPay (Mobile Money, carte)
                                              └──► Voyage AI (recherche intelligente)
```

Faites les étapes **dans l'ordre** : le site a besoin de l'adresse de l'API, et l'API a besoin de l'adresse du site.

---

## 0. Avant de commencer

- [ ] Le code est sur GitHub (branche `main`).
- [ ] Vous avez sous la main, **sans les partager** : l'URL MongoDB, la clé Brevo, la clé Voyage AI, les identifiants PI-SPI et GeniusPay, et les identifiants admin choisis.
- [ ] Un compte [Render](https://render.com) et un compte [Vercel](https://vercel.com), connectés à GitHub.

---

## 1. MongoDB Atlas : autoriser Render

Render (offre gratuite) n'a pas d'adresse IP fixe : Atlas → **Security → Network Access → + Add IP Address → Allow Access from Anywhere** (`0.0.0.0/0`).

> La base reste protégée par son utilisateur et son mot de passe. Avec une IP fixe (offre payante), n'autorisez que celle-ci.

---

## 2. Emails : clé Brevo (gratuit)

Render gratuit **bloque le SMTP** : les emails passent par l'API [Brevo](https://www.brevo.com) (300 emails par jour gratuits).

1. **Senders, domains & dedicated IPs → Senders → Add a sender** : ajoutez et validez l'adresse d'envoi.
2. **SMTP & API → API keys → Generate a new API key** : c'est `BREVO_API_KEY` (commence par `xkeysib-`, pas la clé SMTP).

---

## 3. API sur Render

1. Render → **New → Blueprint** → choisissez le dépôt. Render lit [`render.yaml`](render.yaml).
2. Remplissez les variables demandées :

   | Variable | Valeur |
   |---|---|
   | `MONGODB_URI` | URL Atlas |
   | `FRONTEND_URL` | adresse du site, ex. `https://residencemeublee.vercel.app` (plusieurs adresses séparées par des virgules) |
   | `BREVO_API_KEY` / `EMAIL_FROM` | clé Brevo et adresse d'envoi validée |
   | `EMAIL_USER` | adresse de secours pour les alertes (l'adresse principale se règle dans *Paramètres → Emails*) |
   | `ADMIN_USERNAME` / `ADMIN_PASSWORD` | identifiants du back-office : **pas** `admin`, mot de passe d'au moins 20 caractères aléatoires (`openssl rand -base64 24`) |
   | `VOYAGE_API_KEY` | clé Atlas *AI Model APIs* (vide = recherche par mots-clés) |
   | `PISPI_*` | voir étape 5 |
   | `GENIUSPAY_*` | voir étape 6 |

   `ADMIN_TOKEN_SECRET` et `CLES_CHIFFREMENT` sont générés par Render ; `CLIENT_IP_HEADER=cf-connecting-ip` est déjà défini (limites anti-spam par visiteur).

   > **Service déjà en ligne** : ajoutez à la main `CLES_CHIFFREMENT` (*Environment → Add*, valeur `openssl rand -hex 32`) **avant** que la première entreprise saisisse ses clés de paiement, puis ne la changez plus.
3. Vérifiez `https://<service>.onrender.com/health` → `"success": true`. Dans **Logs** : `Connecté à MongoDB`, `Emails : API Brevo`, et la ligne `Paiement de l'acompte : …` qui liste les moyens actifs.

---

## 4. Site sur Vercel

1. Vercel → **Add New → Project** → dépôt, **Root Directory : `client`**, Framework : *Other*.
2. Variable : `REACT_APP_API_URL` = `https://<service>.onrender.com/api` (avec `/api`, sans `/` final). Elle est intégrée au build : après modification, **Redeploy**.
3. [`client/vercel.json`](client/vercel.json) règle le build, la navigation et les **en-têtes de sécurité** (CSP, anti-iframe). Si l'adresse de l'API change, mettez aussi à jour `connect-src` dans ce fichier.
4. **Analytics** : Vercel → projet → **Analyse → Activer**. Les visites du back-office ne sont pas comptées.

Ajoutez ensuite l'adresse Vercel à `FRONTEND_URL` sur Render (CORS).

---

## 5. Paiements PI-SPI (BCEAO)

Portail : [developer.pispi.bceao.int](https://developer.pispi.bceao.int).

| Variable | Où la trouver |
|---|---|
| `PISPI_BASE_URL`, `PISPI_TOKEN_URL` | *Credentials* (sandbox : `https://no-mtls.piz.simulateurs.pi-bceao.com`) |
| `PISPI_PARTICIPANT_CODE` | code participant, préfixe des routes (ex. `CIC999`) |
| `PISPI_CLIENT_ID`, `PISPI_CLIENT_SECRET`, `PISPI_API_KEY` | *Credentials* — trois valeurs **différentes** |
| `PISPI_PAYEE_ALIAS` | *Alias des comptes* : adresse de paiement du compte qui encaisse |
| `PISPI_SCOPES` | `piz/demande_paiement.write piz/demande_paiement.read piz/paiement.read piz/retour_fonds.write piz/paiement.write` |
| `PISPI_WEBHOOK_SECRET` | affiché une seule fois à la création du webhook |
| `PISPI_APP_URL` | lien « Ouvrir l'application » (sandbox : `https://client.simulateurs.pi-bceao.com`) |

**Webhook** à déclarer : `https://<service>.onrender.com/api/paiements/pispi/webhook` (adresse affichée aussi dans *Paramètres → Moyens de paiement*).

`piz/retour_fonds.write` sert au remboursement intégral, `piz/paiement.write` au remboursement partiel.

---

## 6. Paiements GeniusPay

Tableau de bord : [geniuspay.ci](https://geniuspay.ci) → *Intégrations*.

| Variable | Valeur |
|---|---|
| `GENIUSPAY_API_KEY` | clé publique (`pk_sandbox_…` en test, `pk_live_…` en production) |
| `GENIUSPAY_API_SECRET` | clé secrète (`sk_…`), du **même** environnement |
| `GENIUSPAY_WEBHOOK_SECRET` | secret (`whsec_…`) **du webhook** créé ci-dessous |

1. *Intégrations → Webhooks* : créez un webhook vers `https://<service>.onrender.com/api/paiements/geniuspay/webhook`, évènements `payment.success`, `payment.failed`, `payment.cancelled`, `payment.expired`. Copiez son secret dans `GENIUSPAY_WEBHOOK_SECRET`, puis cliquez **Tester**.
2. Back-office → *Paramètres → Moyens de paiement* : activez GeniusPay (désactivé par défaut). Le badge « Test (sandbox) » s'affiche tant que les clés sont celles de test.
3. **Passage en production** : remplacez les trois valeurs par celles de l'onglet *Production* (le webhook de production a son propre secret).

GeniusPay n'offre pas d'API de remboursement : un acompte ou un solde GeniusPay à rendre apparaît « À rembourser » dans le back-office, à rembourser depuis le tableau de bord GeniusPay puis à marquer comme fait.

---

## 7. Entreprises de gestion

- Les gestionnaires s'inscrivent sur `https://<site>/admin/inscription`. Vous recevez un email « Nouvelle entreprise à valider » (adresse des alertes de la plateforme).
- Back-office (identifiants `ADMIN_*`) → **Entreprises** : **Valider** rend leurs résidences visibles ; **Suspendre** les masque et ferme leur espace.
- Chaque entreprise saisit ses propres clés GeniusPay / PI-SPI dans *Paramètres → Moyens de paiement* et déclare **ses** adresses de webhook (affichées sur la même page, de la forme `…/api/paiements/geniuspay/webhook/<entreprise>`). L'argent arrive sur son compte.
- Au premier démarrage, les résidences et réservations existantes sont rattachées à l'entreprise principale **BABI RESIDENCE** : rien ne change pour elles.

---

## 8. Réglages dans le back-office

Après la mise en ligne, dans `/admin` → **Paramètres** :
- **Établissement** et **Coordonnées et réseaux** : nom, téléphone, WhatsApp, adresses des réseaux sociaux (affichés dans le pied de page et les emails).
- **Acompte et remboursements** : pourcentage d'acompte et paliers de remboursement.
- **Emails** : adresse qui reçoit les alertes.
- **Moyens de paiement** : activation de PI-SPI et GeniusPay.

Les valeurs réglées ici remplacent les variables d'environnement correspondantes (`ACOMPTE_*`, `ADMIN_EMAIL`).

---

## 9. Sécurité continue (GitHub)

| Outil | Quand | Où voir les résultats |
|---|---|---|
| Tests + compilation (`ci.yml`) | chaque PR et chaque fusion | onglet de la PR |
| CodeQL | chaque PR + chaque lundi | *Security → Code scanning* |
| OWASP Dependency-Check | chaque PR + chaque lundi ; bloque à partir d'un score CVSS de 7 | *Security → Code scanning* et rapport HTML dans *Actions* |
| OWASP ZAP (analyse passive) | chaque lundi, ou *Actions → Run workflow* | rapport dans *Actions* |
| Dependabot | chaque lundi (npm), chaque mois (actions) | PR ouvertes automatiquement |

Secret GitHub requis : **`NVD_API_KEY`** (*Settings → Secrets and variables → Actions*), clé gratuite demandée sur [nvd.nist.gov](https://nvd.nist.gov/developers/request-an-api-key) puis **activée** via le lien reçu par email.

---

## 10. Vérification après mise en ligne

- [ ] L'accueil affiche les résidences ; la recherche par dates fonctionne.
- [ ] Une réservation de test arrive dans `/admin` et les emails sont reçus.
- [ ] Confirmer la réservation envoie l'email au client avec le bouton de paiement.
- [ ] L'acompte se paie (GeniusPay et/ou PI-SPI) et passe « Payé » dans le back-office.
- [ ] Le solde se paie en ligne, ou s'enregistre « reçu sur place ».
- [ ] Recharger `/residence/3` fonctionne (pas de 404).
- [ ] Une inscription de test sur `/admin/inscription` apparaît dans **Entreprises** ; une fois validée, sa résidence est visible avec « Proposé par … ».

---

## Conseils

- **Veille de Render** : sur l'offre gratuite, l'API s'endort après 15 minutes ; la première visite attend 30 à 50 secondes. Solutions : offre Starter de Render, ou un service de surveillance gratuit (UptimeRobot) qui appelle `/health` toutes les 10 minutes.
- **Limite de Voyage AI** : sans moyen de paiement dans Atlas, 3 requêtes par minute (au-delà, recherche par mots-clés).

---

## Problèmes fréquents

| Symptôme | Cause probable | Solution |
|---|---|---|
| « Catalogue hors ligne », réservations impossibles | API en veille ou `REACT_APP_API_URL` incorrecte | Ouvrir `/health` ; vérifier la variable sur Vercel puis **Redeploy** |
| Logs Render : « Origine non autorisée (CORS) » | Adresse du site absente de `FRONTEND_URL` | Ajouter l'adresse. Les adresses de prévisualisation Vercel (`residencemeublee-xxxx.vercel.app`) sont refusées volontairement |
| Site : requêtes bloquées dans la console (« Content Security Policy ») | Adresse de l'API différente de `connect-src` | Mettre à jour `client/vercel.json` |
| Logs : `Connection timeout` (emails) | SMTP bloqué par Render | Définir `BREVO_API_KEY` et `EMAIL_FROM` |
| Logs : `Brevo 401` | Clé SMTP au lieu de la clé API | Utiliser une clé `xkeysib-…` |
| PI-SPI : `invalid_client` | Même valeur dans les trois identifiants | Recopier `CLIENT_ID`, `CLIENT_SECRET` et `API_KEY` séparément |
| PI-SPI : 403 « Invalid key=value » | `PISPI_PARTICIPANT_CODE` manquant | Le renseigner (ex. `CIC999`) |
| Remboursement partiel PI-SPI refusé | Scope `piz/paiement.write` absent | L'ajouter à `PISPI_SCOPES` |
| GeniusPay : webhooks en échec (401) | `GENIUSPAY_WEBHOOK_SECRET` d'un autre webhook | Copier le secret du webhook `…/geniuspay/webhook` |
| GeniusPay : le client ne revient pas sur le site | `FRONTEND_URL` incorrecte | Y mettre l'adresse publique du site (ou définir `PUBLIC_SITE_URL`) |
| Dependency-Check : « Error updating the NVD Data » | Clé NVD absente ou non activée | Activer la clé via l'email du NVD, recopier le secret `NVD_API_KEY` |
| Une PR Dependabot casse le site | Mise à jour majeure incompatible | Ne pas fusionner ; commenter `@dependabot ignore this major version` |
