/**
 * Script de test simple pour l'API Sankofart Résidence
 * Exécuter avec: node test-api.js
 */

const axios = require('axios');

const BASE_URL = 'http://localhost:5000';

async function testAPI() {
  console.log('🧪 Test de l\'API Sankofart Résidence\n');

  try {
    // Test 1: Route de santé
    console.log('1️⃣ Test de la route de santé...');
    const healthResponse = await axios.get(`${BASE_URL}/health`);
    console.log('✅ Santé:', healthResponse.data.message);

    // Test 2: Route racine
    console.log('\n2️⃣ Test de la route racine...');
    const rootResponse = await axios.get(`${BASE_URL}/`);
    console.log('✅ Racine:', rootResponse.data.message);

    // Test 3: Liste des résidences
    console.log('\n3️⃣ Test de la liste des résidences...');
    const residencesResponse = await axios.get(`${BASE_URL}/api/residences`);
    console.log(`✅ Résidences trouvées: ${residencesResponse.data.total}`);

    // Test 4: Détails d'une résidence
    if (residencesResponse.data.total > 0) {
      console.log('\n4️⃣ Test des détails d\'une résidence...');
      const residenceId = residencesResponse.data.data[0].id;
      const detailResponse = await axios.get(`${BASE_URL}/api/residences/${residenceId}`);
      console.log(`✅ Résidence ${residenceId}:`, detailResponse.data.data.nom);
    }

    // Test 5: Types d'appartements
    console.log('\n5️⃣ Test des types d\'appartements...');
    const typesResponse = await axios.get(`${BASE_URL}/api/residences/types`);
    console.log('✅ Types:', typesResponse.data.data.join(', '));

    // Test 6: Villes
    console.log('\n6️⃣ Test des villes...');
    const villesResponse = await axios.get(`${BASE_URL}/api/residences/villes`);
    console.log('✅ Villes:', villesResponse.data.data.join(', '));

    // Test 7: Recherche
    console.log('\n7️⃣ Test de la recherche...');
    const searchResponse = await axios.post(`${BASE_URL}/api/residences/search`, {
      recherche: 'Cocody'
    });
    console.log(`✅ Recherche "Cocody": ${searchResponse.data.total} résultats`);

    // Test 8: Vérification de disponibilité
    if (residencesResponse.data.total > 0) {
      console.log('\n8️⃣ Test de vérification de disponibilité...');
      const checkResponse = await axios.post(`${BASE_URL}/api/residences/check-disponibilite`, {
        residenceId: residencesResponse.data.data[0].id,
        dateArrivee: '2024-02-01',
        dateDepart: '2024-02-05'
      });
      console.log(`✅ Disponibilité: ${checkResponse.data.data.disponible ? 'Oui' : 'Non'}`);
    }

    console.log('\n🎉 Tous les tests sont passés avec succès !');
    console.log('\n📋 Résumé des endpoints testés:');
    console.log('   - GET /health');
    console.log('   - GET /');
    console.log('   - GET /api/residences');
    console.log('   - GET /api/residences/:id');
    console.log('   - GET /api/residences/types');
    console.log('   - GET /api/residences/villes');
    console.log('   - POST /api/residences/search');
    console.log('   - POST /api/residences/check-disponibilite');

  } catch (error) {
    console.error('\n❌ Erreur lors du test:', error.message);
    
    if (error.code === 'ECONNREFUSED') {
      console.log('\n💡 Assurez-vous que le serveur est démarré avec: npm start');
    }
    
    if (error.response) {
      console.log('📊 Détails de l\'erreur:', error.response.data);
    }
  }
}

// Exécuter les tests
testAPI();
