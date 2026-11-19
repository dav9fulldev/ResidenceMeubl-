# Politique de sécurité

BABI RESIDENCE est une plateforme de réservation de résidences meublées : elle traite des données de clients (nom, email, téléphone) et des paiements (PI-SPI, GeniusPay). Nous prenons au sérieux tout signalement de faille.

*English below.*

## Versions concernées

| Version | Prise en charge |
|---|---|
| Branche `main` (production : site Vercel et API Render) | ✅ |
| Autres branches, anciens commits | ❌ |

## Signaler une faille

**N'ouvrez pas d'issue publique** et n'en parlez pas publiquement avant sa correction.

Utilisez le signalement privé de GitHub : onglet **Sécurité et qualité → Avis → Signaler une vulnérabilité**
([lien direct](https://github.com/dav9fulldev/ResidenceMeubl-/security/advisories/new)).
Seuls les responsables du projet voient votre rapport.

Merci d'indiquer :
- la partie touchée (site public, espace « Mes réservations », back-office `/admin`, API, paiements, webhooks) ;
- les étapes pour reproduire, avec les requêtes ou captures utiles ;
- l'impact possible (accès à des données, paiement, prise de contrôle d'un compte…) ;
- si possible, une proposition de correction.

## Délais

| Étape | Délai visé |
|---|---|
| Accusé de réception | 3 jours ouvrés |
| Première évaluation (gravité, confirmation) | 7 jours ouvrés |
| Correction d'une faille critique ou élevée | 30 jours au plus |

Nous vous tenons informé de l'avancement et, si vous le souhaitez, nous vous citons dans l'avis publié après la correction.

## Règles pour les tests

Autorisé, avec vos propres comptes et données :
- tester l'API et le site de manière raisonnable (quelques requêtes, pas d'automatisation massive) ;
- créer un compte entreprise de test sur `/admin/inscription` (indiquez « TEST » dans son nom).

Interdit :
- accéder, modifier ou supprimer des données qui ne sont pas les vôtres (arrêtez-vous dès la preuve obtenue) ;
- déni de service, tests de charge, envoi massif d'emails ou de réservations ;
- effectuer de vrais paiements, ou tester les systèmes de PI-SPI, GeniusPay, Vercel, Render ou MongoDB Atlas (signalez-leur directement) ;
- ingénierie sociale, hameçonnage, accès physique.

Les recherches menées de bonne foi dans ce cadre ne feront l'objet d'aucune poursuite de notre part.

## Hors périmètre

- Rapports issus d'outils automatiques sans démonstration d'un impact réel.
- Absence d'un en-tête de sécurité sans conséquence exploitable.
- Comptes ou clés de **démonstration** (« sandbox ») publiés volontairement dans la documentation.
- Failles des services tiers eux-mêmes.

## Mesures en place

Analyse du code (CodeQL), des dépendances (OWASP Dependency-Check, Dependabot), détection de secrets (GitGuardian), analyse passive hebdomadaire de la production (OWASP ZAP), en-têtes de sécurité et CSP, mots de passe hachés (scrypt), clés de paiement des entreprises chiffrées (AES-256-GCM), cloisonnement des données entre entreprises.

---

# Security Policy (English)

**Do not open public issues for security problems.** Report privately through GitHub: **Security → Advisories → Report a vulnerability** ([direct link](https://github.com/dav9fulldev/ResidenceMeubl-/security/advisories/new)).

Only the `main` branch (production) is supported. We aim to acknowledge reports within 3 business days, assess them within 7, and fix critical or high issues within 30 days.

Good-faith research is welcome as long as you only use your own accounts and data, stop as soon as you have proof, and avoid denial of service, mass requests, real payments, social engineering, and testing third-party providers (PI-SPI, GeniusPay, Vercel, Render, MongoDB Atlas).
