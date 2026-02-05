/**
 * dBwatch PWA - Service Worker (Stage 5: Polish & Integration)
 * Handles caching, offline functionality, and update management
 */

const CACHE_VERSION = 'v2.1';
const CACHE_NAME = `dbwatch-${CACHE_VERSION}`;

// Assets to cache on install (paths relative to root where sw.js now lives)
const STATIC_ASSETS = [
    './',
    './index.html',
    './src/styles.css',
    './src/app.js',
    './manifest.json',
    // Media assets (static background only - animations handle visual states)
    './media/background_image_0.png',
    './media/state_1.json',
    './media/state_2.json',
    './media/state_3.json',
    './media/state_4.json',
    './media/state_5.json',
    './media/transition_1_2.json',
    './media/transition_2_3.json',
    './media/transition_3_4.json',
    './media/transition_4_5.json',
    // Icons
    './icons/icon-48x48.png',
    './icons/icon-72x72.png',
    './icons/icon-96x96.png',
    './icons/icon-128x128.png',
    './icons/icon-144x144.png',
    './icons/icon-152x152.png',
    './icons/icon-192x192.png',
    './icons/icon-256x256.png',
    './icons/icon-384x384.png',
    './icons/icon-512x512.png'
];

// ===========================================
// Install Event - Cache Static Assets
// ===========================================
self.addEventListener('install', (event) => {
    console.log('[SW] Installing service worker...');
    
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => {
                console.log('[SW] Caching static assets...');
                return cache.addAll(STATIC_ASSETS);
            })
            .then(() => {
                console.log('[SW] Static assets cached successfully');
                // Skip waiting to activate immediately
                return self.skipWaiting();
            })
            .catch((error) => {
                console.error('[SW] Failed to cache static assets:', error);
            })
    );
});

// ===========================================
// Activate Event - Clean Up Old Caches
// ===========================================
self.addEventListener('activate', (event) => {
    console.log('[SW] Activating service worker...');
    
    event.waitUntil(
        caches.keys()
            .then((cacheNames) => {
                return Promise.all(
                    cacheNames
                        .filter((cacheName) => cacheName !== CACHE_NAME)
                        .map((cacheName) => {
                            console.log('[SW] Deleting old cache:', cacheName);
                            return caches.delete(cacheName);
                        })
                );
            })
            .then(() => {
                console.log('[SW] Service Worker activated, claiming clients...');
                return self.clients.claim();
            })
    );
});

// ===========================================
// Fetch Event - Cache-First Strategy
// ===========================================
self.addEventListener('fetch', (event) => {
    const request = event.request;
    
    // Skip cross-origin requests
    if (!request.url.startsWith(self.location.origin)) {
        return;
    }
    
    event.respondWith(
        caches.match(request)
            .then((cachedResponse) => {
                if (cachedResponse) {
                    // Return cached response
                    console.log('[SW] Serving from cache:', request.url);
                    return cachedResponse;
                }
                
                // Fetch from network
                console.log('[SW] Fetching from network:', request.url);
                return fetch(request)
                    .then((networkResponse) => {
                        // Don't cache non-successful responses
                        if (!networkResponse || networkResponse.status !== 200 || networkResponse.type !== 'basic') {
                            return networkResponse;
                        }
                        
                        // Clone the response for caching
                        const responseToCache = networkResponse.clone();
                        
                        caches.open(CACHE_NAME)
                            .then((cache) => {
                                cache.put(request, responseToCache);
                            });
                        
                        return networkResponse;
                    })
                    .catch((error) => {
                        console.error('[SW] Fetch failed:', error);
                        
                        // Return offline fallback for HTML pages
                        if (request.headers.get('Accept').includes('text/html')) {
                            return caches.match('./index.html');
                        }
                        
                        return new Response('Offline', {
                            status: 503,
                            statusText: 'Service Unavailable'
                        });
                    });
            })
    );
});

// ===========================================
// Message Event - Handle Updates
// ===========================================
self.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'SKIP_WAITING') {
        console.log('[SW] Skip waiting requested');
        self.skipWaiting();
    }
});
