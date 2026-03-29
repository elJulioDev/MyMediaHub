const CACHE_NAME = 'catbox-galeria-cache-v1';

// Lista de dominios que queremos cachear (ImageKit)
const TARGET_DOMAINS = [
    'ik.imagekit.io', 
    'cdn.jsdelivr.net' // Opcional: para cachear bootstrap/iconos también
];

self.addEventListener('install', (event) => {
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil(clients.claim());
});

self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);

    if (event.request.method !== 'GET') return;
    
    // Solo cachear assets de ImageKit y CDNs
    if (!TARGET_DOMAINS.some(domain => url.hostname.includes(domain))) return;

    // THUMBNAILS (tienen ?tr=) → Cache-first, expiración larga
    // ORIGINALES (sin ?tr= o con tr=orig) → Network-first
    const isThumbnail = url.search.includes('tr=w-') && !url.search.includes('orig-true');

    if (isThumbnail) {
        // Cache-first para thumbnails (raramente cambian)
        event.respondWith(
            caches.open(CACHE_NAME).then(cache => 
                cache.match(event.request).then(cached => {
                    if (cached) return cached;
                    return fetch(event.request).then(response => {
                        cache.put(event.request, response.clone());
                        return response;
                    });
                })
            )
        );
    } else {
        // Network-first para originales (no llenar el caché con archivos pesados)
        event.respondWith(
            fetch(event.request).catch(() => caches.match(event.request))
        );
    }
});
