// ============================================================
// sw.js — Service Worker for Travel Ops PWA
// Caches core assets for offline shell + stale-while-revalidate
// ============================================================

const CACHE_NAME = 'travel-ops-v1';
const CORE_ASSETS = [
    '/frontend/index.html',
    '/frontend/css/style.css',
    '/frontend/css/dashboard.css',
    '/frontend/js/supabase-config.js',
    '/frontend/js/auth.js',
    '/frontend/js/dashboard.js',
    '/frontend/manifest.json',
];

// Install: cache core shell
self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => cache.addAll(CORE_ASSETS))
            .then(() => self.skipWaiting())
    );
});

// Activate: clean old caches
self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys().then(keys =>
            Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
        ).then(() => self.clients.claim())
    );
});

// Fetch: network-first for API calls, stale-while-revalidate for assets
self.addEventListener('fetch', event => {
    const url = new URL(event.request.url);

    // Skip non-GET and Supabase / external API calls
    if (event.request.method !== 'GET') return;
    if (url.hostname.includes('supabase') || url.hostname.includes('workers.dev') || url.hostname.includes('cdn.jsdelivr')) return;

    event.respondWith(
        caches.match(event.request).then(cached => {
            const fetchPromise = fetch(event.request).then(response => {
                if (response.ok) {
                    const clone = response.clone();
                    caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
                }
                return response;
            }).catch(() => cached);

            return cached || fetchPromise;
        })
    );
});
