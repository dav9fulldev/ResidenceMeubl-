/* Initialisation avant l'affichage (fichier séparé : la politique de sécurité interdit les scripts inline) */
// Manifeste : le back-office (/admin) s'installe comme une application à part
(function () {
  var admin = location.pathname.indexOf('/admin') === 0;
  if (admin) {
    var robots = document.createElement('meta');
    robots.name = 'robots';
    robots.content = 'noindex, nofollow';
    document.head.appendChild(robots);
  }
  var link = document.createElement('link');
  link.rel = 'manifest';
  link.href = admin ? '/admin/manifest.webmanifest' : '/manifest.json';
  document.head.appendChild(link);
  var titre = document.createElement('meta');
  titre.name = 'apple-mobile-web-app-title';
  titre.content = admin ? 'BABI Admin' : 'BABI RESIDENCE';
  document.head.appendChild(titre);
  // Service worker du back-office (permet l'installation dès la page de connexion)
  if (admin && 'serviceWorker' in navigator) {
    navigator.serviceWorker.register('/admin/sw.js', { scope: '/admin/' }).catch(function () {});
  }
})();

// Appliquer le thème avant l'affichage (évite un flash blanc en mode sombre)
(function () {
  var theme = null;
  try { theme = localStorage.getItem('theme'); } catch (e) {}
  if (theme !== 'light' && theme !== 'dark') {
    theme = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  document.documentElement.setAttribute('data-theme', theme);
})();
