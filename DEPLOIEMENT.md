# 🚀 Déploiement : backend sur Render, frontend sur Vercel

Ce guide met en ligne une version de démonstration complète :

```
Navigateur ──► Vercel (site React) ──► Render (API Express) ──► MongoDB Atlas
                                              ├──► Gmail (emails)
                                              └──► Voyage AI (recherche intelligente)
```

Durée : environ 30 minutes. Faites les étapes **dans l'ordre** : le frontend a besoin de l'adresse du backend, et le backend a besoin de l'adresse du frontend.

---

## 0. Avant de commencer

- [ ] Le code est poussé sur GitHub.
- [ ] Vous avez sous la main, **sans les partager** : l'URL MongoDB (`MONGODB_URI`), la clé Brevo (étape 1 bis), la clé Voyage AI, et les identifiants admin choisis.
- [ ] Un compte [Render](https://render.com) et un compte [Vercel](https://vercel.com), connectés à GitHub.

---

## 1. MongoDB Atlas : autoriser Render

Render (offre gratuite) n'a pas d'adresse IP fixe. Pour la démo :

1. Atlas → **Security → Network Access → + Add IP Address**.
2. Cliquez sur **Allow Access from Anywhere** (`0.0.0.0/0`), commentaire « Render démo », puis **Confirm**.

> 🔒 La base reste protégée par l'utilisateur `sankofart_app` et son mot de passe. Pour la production définitive, préférez un hébergement à IP fixe (offre payante de Render ou votre serveur Hostinger) et n'autorisez que cette IP.

---

## 1 bis. Emails : créer une clé Brevo (gratuit)

Render (offre gratuite) **bloque l'envoi d'emails par SMTP** : Gmail échoue avec `Connection timeout`. Les emails passent donc par l'API de [Brevo](https://www.brevo.com) (gratuit jusqu'à 300 emails par jour).

1. Créez un compte Brevo.
2. **Senders, domains & dedicated IPs → Senders → Add a sender** : ajoutez l'adresse qui enverra les emails (par exemple votre Gmail) et validez-la via l'email reçu.
3. **SMTP & API → API keys → Generate a new API key**. Copiez-la : elle servira pour `BREVO_API_KEY`.

> Pour une meilleure délivrabilité (moins de spams), utilisez plus tard une adresse de votre domaine (`contact@sankofartresidence.com`) et authentifiez le domaine dans Brevo.

---

## 2. Backend sur Render

1. Render → **New → Blueprint** → choisissez le dépôt GitHub.
   Render lit le fichier [`render.yaml`](render.yaml) et prépare le service `sankofart-api` (dossier `backend`, Node, offre gratuite, région Francfort).
2. Render demande les variables marquées « à saisir ». Remplissez-les :

   | Variable | Valeur |
   |---|---|
   | `MONGODB_URI` | l'URL Atlas avec l'utilisateur `sankofart_app` |
   | `FRONTEND_URL` | provisoirement `https://sankofartresidence.com` (on ajoutera l'adresse Vercel à l'étape 4) |
   | `BREVO_API_KEY` | la clé Brevo (étape 1 bis) |
   | `EMAIL_FROM` | l'adresse validée comme expéditeur dans Brevo |
   | `EMAIL_USER` | l'adresse qui reçoit les nouvelles réservations (admin) |
   | `ADMIN_USERNAME` / `ADMIN_PASSWORD` | les identifiants de l'espace admin (mot de passe long et unique) |
   | `VOYAGE_API_KEY` | la clé Atlas « AI Model APIs » (laisser vide = recherche par mots-clés) |

   `ADMIN_TOKEN_SECRET` est généré automatiquement par Render, et `CLIENT_IP_HEADER=cf-connecting-ip` est déjà défini : il permet d'appliquer les limites anti-spam à chaque visiteur (Render passe par Cloudflare).
3. **Apply** / **Create**. Le premier déploiement prend 2 à 4 minutes.
4. Vérifiez : ouvrez `https://<votre-service>.onrender.com/health`. Vous devez voir `"success": true`.
   Dans **Logs**, vous devez lire `🗄️ Connecté à MongoDB`, `🧠 Recherche intelligente : Voyage AI` et `📧 Emails : API Brevo`.

<details>
<summary>Sans Blueprint (configuration manuelle)</summary>

Render → **New → Web Service** → dépôt GitHub, puis :
- Root Directory : `backend`
- Build Command : `npm ci --omit=dev`
- Start Command : `npm start`
- Health Check Path : `/health`
- Variables : celles du tableau ci-dessus, plus `NODE_ENV=production`, `CLIENT_IP_HEADER=cf-connecting-ip` et `ADMIN_TOKEN_SECRET` (générer avec `openssl rand -hex 32`).
</details>

---

## 3. Frontend sur Vercel

1. Vercel → **Add New → Project** → importez le dépôt.
2. **Root Directory** : `client` (bouton *Edit*). Framework : *Other*.
   Le fichier [`client/vercel.json`](client/vercel.json) règle le build (`npm run build` → `dist`) et la navigation entre les pages.
3. **Environment Variables** :

   | Variable | Valeur |
   |---|---|
   | `REACT_APP_API_URL` | `https://<votre-service>.onrender.com/api` (**avec** `/api`, **sans** `/` final) |

4. **Deploy**. Notez l'adresse obtenue, par exemple `https://sankofart-residence.vercel.app`.

> ⚠️ `REACT_APP_API_URL` est intégrée au moment du build. Si vous la modifiez plus tard, relancez un déploiement (**Deployments → … → Redeploy**).

---

## 4. Relier les deux (CORS)

Le backend n'accepte que les sites autorisés. Sur Render → service → **Environment** :

```
FRONTEND_URL=https://sankofart-residence.vercel.app,https://sankofartresidence.com,https://www.sankofartresidence.com
```

(plusieurs adresses séparées par des virgules, sans `/` final). Enregistrez : Render redémarre le service.

---

## 5. Vérification avant la démo

- [ ] La page **Résidences** affiche les 10 résidences (et non un catalogue hors ligne).
- [ ] La **recherche intelligente** affiche le badge « ✨ Classement par IA ».
- [ ] Le **micro** fonctionne (Chrome, Edge ou Safari ; le site est en HTTPS sur Vercel).
- [ ] Une **réservation de test** arrive dans le tableau de bord `/admin/login` et les emails sont reçus.
- [ ] **Confirmer** la réservation envoie l'email au client et passe la résidence en « Réservé ».
- [ ] Recharger une page comme `/residence/3` fonctionne (pas d'erreur 404).
- [ ] **Mes réservations** : email + référence affichent la réservation ; « Demander l'annulation » fait apparaître la demande dans le tableau de bord (filtre « Demandes d'annulation »).

---

## 🎤 Conseils pour une démo réussie

- **Réveillez le serveur avant le rendez-vous.** Sur l'offre gratuite, Render met le backend en veille après 15 minutes sans visite ; le premier chargement prend alors 30 à 60 secondes. Ouvrez `https://<votre-service>.onrender.com/health` **2 minutes avant** la démo.
  Pour éviter la veille en permanence : un service de surveillance gratuit (ex. UptimeRobot) qui appelle `/health` toutes les 10 minutes, ou l'offre payante de Render.
- **Levez la limite de Voyage AI.** Sans moyen de paiement, la recherche intelligente est limitée à 3 requêtes par minute (au-delà, le site bascule en recherche par mots-clés). Ajouter une carte dans Atlas → **Billing** lève cette limite ; les 200 millions de jetons gratuits de `voyage-4-lite` restent utilisés en premier.
- **Scénario conseillé** : recherche vocale (« une villa pour une famille de six avec jardin ») → fiche résidence et « Vous aimerez aussi » → réservation → tableau de bord admin → confirmation → email reçu par le « client ».
- **Après la démo**, annulez les réservations de test depuis le tableau de bord pour libérer les dates.

---

## 🆘 Problèmes fréquents

| Symptôme | Cause probable | Solution |
|---|---|---|
| Le site affiche « catalogue hors ligne » ou les réservations sont impossibles | Backend en veille ou `REACT_APP_API_URL` incorrecte | Ouvrir `/health` sur Render ; vérifier la variable sur Vercel puis **Redeploy** |
| Erreur « Origine non autorisée » (console du navigateur) | Adresse Vercel absente de `FRONTEND_URL` | Étape 4 |
| Render : `Impossible de se connecter à MongoDB` | IP Render non autorisée dans Atlas ou mot de passe erroné | Étape 1 ; vérifier `MONGODB_URI` |
| Logs Render : `Connection timeout` à l'envoi des emails | Render gratuit bloque le SMTP | Définir `BREVO_API_KEY` et `EMAIL_FROM` (étape 1 bis) |
| Logs : `Brevo 400 … sender` | Adresse `EMAIL_FROM` non validée dans Brevo | Brevo → Senders → valider l'adresse |
| En local : « email non envoyé » | `EMAIL_PASS` n'est pas un mot de passe d'application | Recréer un mot de passe d'application Google |
| Logs Render : toutes les requêtes viennent d'IP `10.x.x.x`, réservations refusées « trop de réservations » | `CLIENT_IP_HEADER` absent | Ajouter `CLIENT_IP_HEADER=cf-connecting-ip` dans Render → Environment |
| Badge « Recherche par mots-clés » au lieu de « Classement par IA » | Limite Voyage atteinte ou clé absente | Ajouter un moyen de paiement Atlas ; vérifier `VOYAGE_API_KEY` |
| Erreur 404 en rechargeant une page | `vercel.json` non pris en compte | Vérifier que le *Root Directory* Vercel est bien `client` |
