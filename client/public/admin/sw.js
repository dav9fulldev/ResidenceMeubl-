/* Service worker du back-office Sankofart (portée /admin/).
 * Rend l'application installable et affiche une page claire hors connexion.
 * Aucune donnée n'est mise en cache : le back-office affiche toujours l'état réel. */
const PAGE_HORS_LIGNE = `<!doctype html><html lang="fr"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>Hors connexion</title>
<style>body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;
font-family:-apple-system,system-ui,sans-serif;background:#0f1117;color:#ecedf0;text-align:center;padding:24px}
h1{color:#f5d77a;font-size:22px}button{margin-top:16px;padding:12px 22px;border:0;border-radius:10px;
background:#d4af37;color:#1a1a2e;font-weight:700;font-size:16px}</style></head>
<body><div><h1>Pas de connexion internet</h1><p>Le back-office Sankofart a besoin d'internet pour afficher les réservations à jour.</p>
<button onclick="location.reload()">Réessayer</button></div></body></html>`;

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('fetch', (event) => {
  if (event.request.mode !== 'navigate') return; // le reste passe directement au réseau
  event.respondWith(
    fetch(event.request).catch(() => new Response(PAGE_HORS_LIGNE, {
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    }))
  );
});
