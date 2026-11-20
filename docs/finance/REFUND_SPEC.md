# Remboursements

- Déclenchés par l'acceptation d'une demande d'annulation (politique : 100 % dans les 5 jours suivant le paiement, puis 50 %, rien à moins de 3 jours de l'arrivée — réglable par entreprise).
- **PI-SPI** : automatique (retour de fonds ou paiement sortant). **GeniusPay** : pas d'API ; « à rembourser » depuis le tableau de bord GeniusPay de la plateforme, puis marqué remboursé.
- Écriture au moment où le remboursement est **effectué** (statut `rembourse`), dans la même transaction : `REMBOURSEMENT_CLIENT` = crédit `FONDS_PRESTATAIRE`, débits `COMMISSION_BABI` (au prorata) et `DETTE_PROPRIETAIRE`.
- Le montant remboursé ne dépasse jamais le montant payé (calculé depuis l'acompte payé).
- Solde payé sur place puis rendu par l'entreprise : commission rendue (`ANNULATION_COMMISSION`).
- Idempotent : un même remboursement n'est jamais comptabilisé deux fois.
