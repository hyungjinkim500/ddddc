const CACHE_NAME = 'pix-cache-v1';
const STATIC_ASSETS = [
    '/',
    '/index.html',
    '/post.html',
    '/explore.html',
    '/mypage.html',
    '/notification.html',
    '/about.html',
    '/nav.js',
    '/auth.js',
    '/firebase-config.js',
    '/pix_logo_nobackground.png'
];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS))
    );
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keys) =>
            Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
        )
    );
    self.clients.claim();
});

self.addEventListener('fetch', (event) => {
    if (event.request.method !== 'GET') return;
    event.respondWith(
        fetch(event.request)
            .then((res) => {
                const clone = res.clone();
                caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
                return res;
            })
            .catch(() => caches.match(event.request))
    );
});
