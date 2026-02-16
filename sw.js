const CACHE_NAME = 'stock-radar-v2';
const urlsToCache = [
    './',
    './index.html',
    './app-cloud.js',
    './auth.js',
    './config.js',
    './manifest.json',
    './logo.png'
];

// Install — cache les fichiers essentiels
self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME).then(cache => {
            return cache.addAll(urlsToCache).catch(err => {
                console.warn('Cache partiel:', err);
            });
        })
    );
    self.skipWaiting();
});

// Activate — nettoyer les anciens caches
self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys().then(names =>
            Promise.all(names.filter(n => n !== CACHE_NAME).map(n => caches.delete(n)))
        )
    );
    self.clients.claim();
});

// Fetch — network first, fallback to cache
self.addEventListener('fetch', event => {
    // Skip non-GET requests and Supabase API calls
    if (event.request.method !== 'GET') return;
    if (event.request.url.includes('supabase.co')) return;
    if (event.request.url.includes('cdn.jsdelivr.net')) return;
    if (event.request.url.includes('cdnjs.cloudflare.com')) return;

    event.respondWith(
        fetch(event.request)
            .then(response => {
                // Cache la réponse réseau
                if (response.status === 200) {
                    const clone = response.clone();
                    caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
                }
                return response;
            })
            .catch(() => caches.match(event.request))
    );
});
