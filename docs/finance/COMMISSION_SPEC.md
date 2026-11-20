# Commissions

- Taux en **points de base** (800 = 8 %), stocké en entier.
- `commission = arrondi(montant × taux / 10 000)` au FCFA le plus proche (0,5 au-dessus).
- Calculée **sur chaque paiement** encaissé (acompte, solde en ligne) et sur le **solde reçu sur place** (déduite ensuite des reversements).
- Taux **figé** sur la réservation à sa création (`conditionsFinancieres`). Un nouveau taux (Finances → Commission et journal) ne s'applique qu'aux réservations créées après. Les réservations antérieures au module reçoivent le taux en vigueur à leur date de création.
- Remboursement de R : commission rendue = arrondi(R × taux). BABI garde la commission sur la part non remboursée.
- Résidences de la plateforme : pas de commission (`REVENU_PLATEFORME`).

Exemple (8 %) : acompte 45 000 → commission 3 600, dû 41 400. Solde de 105 000 payé sur place → commission 8 400 déduite : dû 33 000.
