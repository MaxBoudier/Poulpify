const CACHE_NAME = 'poulpify-v' + Date.now(); // Cache unique à chaque déploiement
const ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  '/manifest.json',
  '/poulpify_logo.png'
];

// Installation : Mise en cache des assets de base
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE);
    })
  );
  self.skipWaiting(); // Force le nouveau SW à prendre le contrôle immédiatement
});

// Activation : Nettoyage des anciens caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.filter((name) => name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      );
    })
  );
  return self.clients.claim(); // Prend le contrôle des pages immédiatement
});

// Stratégie de Fetch : Network First pour le HTML, Cache First pour le reste
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Pour le HTML ou la racine, on tente toujours le réseau d'abord
  if (event.request.mode === 'navigate' || url.pathname === '/' || url.pathname.endsWith('.html')) {
    event.respondWith(
      fetch(event.request)
        .catch(() => caches.match('/index.html')) // Fallback sur le cache si hors-ligne
    );
    return;
  }

  // Pour les autres assets (images, js, css), on utilise le cache d'abord
  event.respondWith(
    caches.match(event.request).then((response) => {
      return response || fetch(event.request);
    })
  );
});
