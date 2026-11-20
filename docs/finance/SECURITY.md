# Sécurité

- Finances de la plateforme : administrateur de la plateforme uniquement. Entreprise : ses propres sommes dues et reversements, jamais ceux des autres.
- Paiement confirmé uniquement après relecture chez le prestataire ; webhooks signés (HMAC), horodatés (GeniusPay), tracés, rejeux comptés une fois.
- Registre immuable, transactions équilibrées, montants entiers, clés d'idempotence uniques.
- Preuves de virement privées (GridFS), type réel contrôlé, 5 Mo.
- Coordonnées de versement vérifiées par la plateforme avant tout reversement ; toute modification les revérifie.
- Journal d'audit de chaque action financière.
- Export CSV protégé contre l'injection de formules.
- Clés des prestataires : variables d'environnement de la plateforme uniquement.
- À faire : comptes administrateurs multiples et rôles financiers (validation à deux), sauvegardes Atlas planifiées, avis juridique sur l'encaissement pour compte de tiers.
