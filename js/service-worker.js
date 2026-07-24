/* =========================================================
   service-worker.js — AsiaformS PWA
   -----------------------------------------------------------
   - Precaches the app shell (HTML/CSS/JS/icons) so the
     dashboard, order form and customer page load offline.
   - Cache-first for static assets, network-first for HTML
     navigations (falls back to offline.html when there's no
     connection and nothing cached yet).
   - Bumping CACHE_VERSION below is how you ship an update —
     the page picks it up via the "New update available"
     banner wired up in js/pwa.js.
   ========================================================= */

const CACHE_VERSION = 'v1.0.0';
const CACHE_NAME = `asiaforms-cache-${CACHE_VERSION}`;

// Keep this list in sync with your actual file names. Paths are relative
// to the service worker's own scope (the site root), so this works
// unchanged on GitHub Pages project sites (e.g. /reponame/).
const APP_SHELL = [
  './',
  './index.html',
  './create-order.html',
  './order.html',
  './offline.html',
  './css/style.css',
  './js/utils.js',
  './js/storage.js',
  './js/pdf.js',
  './js/script.js',
  './js/create-order.js',
  './js/order.js',
  './js/pwa.js',
  './manifest.json',
  './assets/logo.png',
  './assets/icons/icon-192x192.png',
  './assets/icons/icon-512x512.png',
  './assets/icons/maskable-icon-192x192.png',
  './assets/icons/maskable-icon-512x512.png',
  './assets/icons/apple-touch-icon.png',
  './assets/icons/favicon.ico',
];

// Third-party CDN scripts the app depends on — cached too so PDF/QR
// generation still works offline once visited at least once online.
const CDN_ASSETS = [
  'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll([...APP_SHELL, ...CDN_ASSETS]))
      .catch((err) => console.warn('SW precache: some assets failed (offline install?)', err))
  );
  // Don't force-activate immediately — let the "New update available"
  // banner in js/pwa.js ask the user first, so an in-progress order isn't
  // interrupted mid-fill.
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Allow the page to tell a waiting worker to take over right away
// (triggered by the "Reload" button on the update banner).
self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const isNavigation = req.mode === 'navigate';

  if (isNavigation) {
    // Network-first for page loads, so reps always see the latest saved
    // data when online; fall back to cache, then the offline page.
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, copy));
          return res;
        })
        .catch(() => caches.match(req).then((cached) => cached || caches.match('./offline.html')))
    );
    return;
  }

  // Cache-first for static assets (CSS/JS/images/CDN libs) — fast repeat
  // loads, with a network fallback that also refreshes the cache.
  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req)
        .then((res) => {
          if (res && res.status === 200 && (res.type === 'basic' || res.type === 'cors')) {
            const copy = res.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(req, copy));
          }
          return res;
        })
        .catch(() => caches.match('./offline.html'));
    })
  );
});
