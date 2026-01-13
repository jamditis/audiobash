/**
 * AudioBash Remote - Service Worker
 * Provides offline PWA support with cache-first strategy
 */

const CACHE_NAME = 'audiobash-remote-v1';

// Files to cache for offline support
const CACHE_FILES = [
  '/remote/',
  '/remote/index.html',
  '/remote/css/styles.css',
  '/remote/js/app.js',
  '/remote/js/websocket.js',
  '/remote/js/voice.js',
  '/remote/js/terminal.js',
  'https://cdn.jsdelivr.net/npm/@xterm/xterm@5.5.0/lib/xterm.min.js',
  'https://cdn.jsdelivr.net/npm/@xterm/xterm@5.5.0/css/xterm.css',
  'https://cdn.jsdelivr.net/npm/@xterm/addon-fit@0.10.0/lib/addon-fit.min.js',
];

/**
 * Install event - cache all required files
 */
self.addEventListener('install', (event) => {
  console.log('[ServiceWorker] Installing...');

  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('[ServiceWorker] Caching app files');
        return cache.addAll(CACHE_FILES);
      })
      .then(() => {
        console.log('[ServiceWorker] Installed successfully');
        return self.skipWaiting();
      })
      .catch((err) => {
        console.error('[ServiceWorker] Installation failed:', err);
      })
  );
});

/**
 * Activate event - clean up old caches
 */
self.addEventListener('activate', (event) => {
  console.log('[ServiceWorker] Activating...');

  event.waitUntil(
    caches.keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames.map((cacheName) => {
            if (cacheName !== CACHE_NAME) {
              console.log('[ServiceWorker] Deleting old cache:', cacheName);
              return caches.delete(cacheName);
            }
          })
        );
      })
      .then(() => {
        console.log('[ServiceWorker] Activated successfully');
        return self.clients.claim();
      })
  );
});

/**
 * Fetch event - cache-first strategy for cached files, network-first for others
 */
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Only handle GET requests
  if (request.method !== 'GET') {
    return;
  }

  // Skip WebSocket connections
  if (url.protocol === 'ws:' || url.protocol === 'wss:') {
    return;
  }

  event.respondWith(
    caches.match(request)
      .then((cachedResponse) => {
        if (cachedResponse) {
          // Cache hit - return cached response
          console.log('[ServiceWorker] Serving from cache:', url.pathname);
          return cachedResponse;
        }

        // Not in cache - fetch from network
        console.log('[ServiceWorker] Fetching from network:', url.pathname);
        return fetch(request)
          .then((response) => {
            // Don't cache if not successful
            if (!response || response.status !== 200 || response.type === 'error') {
              return response;
            }

            // Clone the response (can only be consumed once)
            const responseToCache = response.clone();

            // Cache the new response for future use
            caches.open(CACHE_NAME)
              .then((cache) => {
                cache.put(request, responseToCache);
              });

            return response;
          })
          .catch((err) => {
            console.error('[ServiceWorker] Fetch failed:', err);
            // Return offline page if available
            return caches.match('/remote/index.html');
          });
      })
  );
});
