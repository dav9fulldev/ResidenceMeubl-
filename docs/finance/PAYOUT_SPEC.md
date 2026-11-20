# Reversements

## Sommes dues
Créées à chaque paiement confirmé (une par réservation, cumulée). Versables **24 h après l'arrivée prévue** (14 h + 24 h), sauf annulation en cours, entreprise suspendue ou litige.

## Coordonnées de versement
Saisies par l'entreprise (*Revenus*) : Mobile Money, virement ou PI-SPI, au nom de l'entreprise ou de son gérant. Toute modification les repasse **à vérifier** et alerte la plateforme. Aucun reversement sans coordonnées vérifiées.

## Étapes
| Étape | Qui | Effet |
|---|---|---|
| Préparer | plateforme | montant ≤ versable ; répartition : d'abord les commissions à déduire, puis les sommes les plus anciennes ; un seul reversement en cours par entreprise |
| Approuver | plateforme | |
| Exécuter | plateforme, après le virement hors du site | référence obligatoire, source des fonds ; sommes dues revérifiées ; écriture `REVERSEMENT_PROPRIETAIRE` |
| Joindre la preuve | plateforme | PDF ou image |
| Confirmer | plateforme | preuve obligatoire ; au-delà de `FINANCE_SEUIL_DOUBLE_VALIDATION`, une autre personne que l'exécutant |
| Rejeter / annuler | plateforme | avant exécution |
| Échec | plateforme | contre-passation, sommes de nouveau dues |
