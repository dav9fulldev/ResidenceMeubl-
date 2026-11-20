# Plan de test

Tests automatisés : `cd backend && npm test` (MongoDB en mémoire, replica set).

| Scénario | Couvert |
|---|---|
| Paiement réussi (simulation PI-SPI), écriture équilibrée, commission 8 % | ✅ |
| Notification ou traitement rejoué : une seule écriture | ✅ |
| Notification à signature invalide : rejetée et tracée, rejeux comptés | ✅ |
| Paiement en double : trop-perçu comptabilisé | ✅ (reprise) |
| Nouveau taux : n'affecte pas les anciennes réservations | ✅ |
| Solde sur place : commission déduite | ✅ |
| Remboursement intégral : commission rendue, plus rien dû | ✅ |
| Coordonnées de versement : format, vérification obligatoire | ✅ |
| Reversement : montant > dû refusé, un seul en cours, ordre des étapes, référence et preuve obligatoires | ✅ |
| Après reversement : dette nulle, statuts « versée » | ✅ |
| Transaction déséquilibrée, montant non entier : refusés | ✅ |
| Contre-passation : l'originale reste inchangée ; pas de contre-passation d'une contre-passation | ✅ |
| Rapprochement : conforme, puis écart détecté après correction manuelle | ✅ |
| Cloisonnement : une entreprise n'accède pas aux finances de la plateforme | ✅ |
| Paiement GeniusPay réel, PI-SPI réel | ⏳ en bac à sable, manuellement |
| Remboursement partiel, échec de reversement, double validation | ⏳ à ajouter |
